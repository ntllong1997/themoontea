import Foundation
import MultipeerConnectivity
import Observation

/// The booth link: phones talking directly to each other, with no router and
/// no internet (MultipeerConnectivity: peer-to-peer WiFi and Bluetooth).
///
/// The main phone advertises; tills find it and connect. A till asks the main
/// phone for each ticket number and sends it every change, keeping each one
/// saved until the main phone answers "got it". The main phone saves the
/// change on its own upload list, applies it, and sends every till the
/// ticket's new state. See docs/offline-event-plan.md, step 4.
@MainActor
@Observable
final class BoothSync: NSObject {
    static let shared = BoothSync()

    /// Main: the tills connected now, by name.
    private(set) var connectedTills: [String] = []
    /// Till: the main phone's name while connected.
    private(set) var mainPhoneName: String?
    /// Till: changes the main phone hasn't confirmed yet.
    private(set) var sendList: TillSendList
    var pendingEntries: [OutboxEntry] { sendList.entries }
    var isConnectedToMain: Bool { mainPeer != nil }

    private static let serviceType = "moontea-booth"
    private static let roleKey = "role"
    private static let numberTimeoutSeconds: UInt64 = 5
    private static let sendListKey = "boothSendList"
    private static let receivedKey = "boothReceivedChanges"
    private static let peerIDKey = "boothPeerID"

    @ObservationIgnored private var peerID: MCPeerID
    @ObservationIgnored private var session: MCSession?
    @ObservationIgnored private var advertiser: MCNearbyServiceAdvertiser?
    @ObservationIgnored private var browser: MCNearbyServiceBrowser?
    @ObservationIgnored private var mainPeer: MCPeerID?
    /// Till: the main phone it invited. A booth link is one group, so a till
    /// also sees other tills connect; only this peer is the main phone.
    @ObservationIgnored private var invitedMain: MCPeerID?
    @ObservationIgnored private var tillNames: [MCPeerID: String] = [:]
    @ObservationIgnored private var numberWaiters: [UUID: CheckedContinuation<Int, Error>] = [:]
    @ObservationIgnored private var received: ReceivedChanges
    @ObservationIgnored private var runningRole: BoothRole?

    private override init() {
        peerID = Self.loadPeerID()
        sendList = Self.load(TillSendList.self, key: Self.sendListKey) ?? TillSendList()
        received = Self.load(ReceivedChanges.self, key: Self.receivedKey) ?? ReceivedChanges(day: Self.today())
        super.init()
    }

    // MARK: - Starting and stopping

    /// Starts the link for this phone's role, or stops it for a standalone
    /// phone. Called at launch, on returning to the foreground (iOS drops the
    /// link in the background) and when the role changes.
    func start() {
        let role = TillSettings.role
        stop()
        runningRole = role
        TicketStore.shared.onTicketChanged = nil
        TicketStore.shared.onHistoryReplaced = nil
        if role != .till { takeOverUnsentChanges() }

        switch role {
        case .standalone:
            return
        case .main:
            let session = makeSession()
            let advertiser = MCNearbyServiceAdvertiser(peer: peerID, discoveryInfo: [Self.roleKey: BoothRole.main.rawValue], serviceType: Self.serviceType)
            advertiser.delegate = self
            advertiser.startAdvertisingPeer()
            self.session = session
            self.advertiser = advertiser
            // Print hub: a new ticket from a till or the website prints here.
            TicketStore.shared.onTicketChanged = { [weak self] number, rows in
                self?.broadcast(.ticket(orderNumber: number, rows: rows))
                ReceiptPrinter.printIfNew(orderNumber: number)
            }
            TicketStore.shared.onHistoryReplaced = { [weak self] in
                self?.broadcast(.snapshot(rows: TicketStore.shared.allRows))
                // Website pre-orders that came in while the link to Supabase was down.
                for ticket in TicketStore.shared.history { ReceiptPrinter.printIfNew(orderNumber: ticket.orderNumber) }
            }
        case .till:
            session = makeSession()
            let browser = MCNearbyServiceBrowser(peer: peerID, serviceType: Self.serviceType)
            browser.delegate = self
            browser.startBrowsingForPeers()
            self.browser = browser
        }
        ActivityLog.shared.info(.sync, "Booth link started", ["role": role.rawValue])
    }

    /// Back in the foreground: restart the link if the background dropped it.
    /// Not on every activation, or pulling down Control Center on the main
    /// phone would disconnect every till.
    func resume() {
        guard session == nil else { return }
        start()
    }

    func stop() {
        runningRole = nil
        advertiser?.stopAdvertisingPeer()
        browser?.stopBrowsingForPeers()
        session?.disconnect()
        advertiser = nil
        browser = nil
        session = nil
        mainPeer = nil
        invitedMain = nil
        mainPhoneName = nil
        tillNames = [:]
        connectedTills = []
        failNumberWaiters()
    }

    private func makeSession() -> MCSession {
        let session = MCSession(peer: peerID, securityIdentity: nil, encryptionPreference: .required)
        session.delegate = self
        return session
    }

    // MARK: - Till side

    /// Saves the change until the main phone confirms it, and sends it now if
    /// the main phone is connected (otherwise on reconnecting).
    func sendToMain(_ entry: OutboxEntry) {
        sendList.add(entry)
        saveSendList()
        if let mainPeer { send(.change(entry), to: [mainPeer]) }
    }

    func requestPrint(orderNumber: Int) {
        guard let mainPeer else { return }
        send(.printRequest(orderNumber: orderNumber), to: [mainPeer])
    }

    func requestNumber(for orderUUID: UUID) async throws -> Int {
        guard let mainPeer else { throw TicketNumbers.Failure.mainPhoneNotConnected }
        let timeout = Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.numberTimeoutSeconds * 1_000_000_000)
            self?.resumeNumberWaiter(orderUUID, with: .failure(TicketNumbers.Failure.mainPhoneNotConnected))
        }
        defer { timeout.cancel() }
        return try await withCheckedThrowingContinuation { continuation in
            numberWaiters[orderUUID] = continuation
            send(.numberRequest(orderUUID: orderUUID), to: [mainPeer])
        }
    }

    private func resumeNumberWaiter(_ orderUUID: UUID, with result: Result<Int, Error>) {
        numberWaiters.removeValue(forKey: orderUUID)?.resume(with: result)
    }

    private func failNumberWaiters() {
        for orderUUID in Array(numberWaiters.keys) {
            resumeNumberWaiter(orderUUID, with: .failure(TicketNumbers.Failure.mainPhoneNotConnected))
        }
    }

    private func connectedToMain(_ peer: MCPeerID) {
        mainPeer = peer
        mainPhoneName = peer.displayName
        send(.hello(tillName: TillSettings.name), to: [peer])
        // Anything not confirmed before the link dropped, oldest first. The
        // main phone skips what it already has.
        for entry in sendList.entries { send(.change(entry), to: [peer]) }
        ActivityLog.shared.info(.sync, "Connected to main phone", ["main": peer.displayName, "unsent": sendList.entries.count])
    }

    private func handleOnTill(_ message: BoothMessage) {
        switch message {
        case .number(let orderUUID, let number):
            resumeNumberWaiter(orderUUID, with: .success(number))
        case .numberUnavailable(let orderUUID, let reason):
            resumeNumberWaiter(orderUUID, with: .failure(TicketNumbers.Failure.mainPhoneCantNumber(reason)))
        case .received(let entryID):
            sendList.confirm(entryID)
            saveSendList()
        case .snapshot(let rows):
            TicketStore.shared.replaceAll(with: rows)
        case .ticket(let orderNumber, let rows):
            TicketStore.shared.replaceTicket(orderNumber: orderNumber, rows: rows)
        case .hello, .numberRequest, .change, .printRequest:
            break
        }
    }

    /// A former till's changes the main phone never confirmed go on this
    /// phone's own upload list, so they still reach Supabase. Uploads are safe
    /// to repeat, so it doesn't matter if the old main phone had them too.
    private func takeOverUnsentChanges() {
        guard !sendList.entries.isEmpty else { return }
        ActivityLog.shared.info(.sync, "Uploading changes the main phone never confirmed", ["count": sendList.entries.count])
        for entry in sendList.entries { OrderOutbox.shared.enqueue(entry) }
        sendList = TillSendList()
        saveSendList()
    }

    // MARK: - Main side

    private func handleOnMain(_ message: BoothMessage, from peer: MCPeerID) {
        switch message {
        case .hello(let tillName):
            tillNames[peer] = tillName
            refreshConnectedTills()
            send(.snapshot(rows: TicketStore.shared.allRows), to: [peer])
        case .numberRequest(let orderUUID):
            Task {
                do {
                    let number = try await BoothCounter.shared.number(for: orderUUID)
                    send(.number(orderUUID: orderUUID, number: number), to: [peer])
                } catch {
                    let reason = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                    send(.numberUnavailable(orderUUID: orderUUID, reason: reason), to: [peer])
                }
            }
        case .change(let entry):
            rollReceivedOverIfNewDay()
            if received.markNew(entry.id) {
                // Saved on this phone's upload list before answering, so
                // "got it" means the main phone owns the upload now.
                TicketStore.shared.submit(entry)
                saveReceived()
            }
            send(.received(entryID: entry.id), to: [peer])
        case .printRequest(let orderNumber):
            guard let ticket = TicketStore.shared.history.first(where: { $0.orderNumber == orderNumber }) else { return }
            ActivityLog.shared.info(.printer, "Reprint for a till", ["order": orderNumber, "till": tillNames[peer] ?? peer.displayName])
            Task { await ReceiptPrinter.printReceipt(for: ticket) }
        case .number, .numberUnavailable, .received, .snapshot, .ticket:
            break
        }
    }

    private func broadcast(_ message: BoothMessage) {
        guard let session, !session.connectedPeers.isEmpty else { return }
        send(message, to: session.connectedPeers)
    }

    private func refreshConnectedTills() {
        let peers = session?.connectedPeers ?? []
        connectedTills = peers.map { tillNames[$0] ?? $0.displayName }.sorted()
    }

    // MARK: - Sending and receiving

    private func send(_ message: BoothMessage, to peers: [MCPeerID]) {
        guard let session, !peers.isEmpty else { return }
        do {
            try session.send(message.encoded(), toPeers: peers, with: .reliable)
        } catch {
            print("[booth] send failed: \(error)")
        }
    }

    fileprivate func peer(_ peer: MCPeerID, changedTo state: MCSessionState) {
        switch runningRole {
        case .main:
            if state != .connected { tillNames.removeValue(forKey: peer) }
            refreshConnectedTills()
        case .till:
            guard peer == invitedMain else { return }
            if state == .connected, mainPeer == nil {
                connectedToMain(peer)
            } else if state == .notConnected {
                let wasConnected = mainPeer != nil
                mainPeer = nil
                invitedMain = nil
                mainPhoneName = nil
                failNumberWaiters()
                if wasConnected {
                    ActivityLog.shared.warning(.sync, "Main phone disconnected", ["main": peer.displayName])
                }
                lookForMainAgain()
            }
        case .standalone, nil:
            break
        }
    }

    fileprivate func receive(_ data: Data, from peer: MCPeerID) {
        guard let message = try? BoothMessage.decode(data) else {
            print("[booth] unreadable message from \(peer.displayName)")
            return
        }
        switch runningRole {
        case .main: handleOnMain(message, from: peer)
        case .till: handleOnTill(message)
        case .standalone, nil: break
        }
    }

    fileprivate func found(_ peer: MCPeerID, info: [String: String]?) {
        guard runningRole == .till, invitedMain == nil, let browser, let session,
              info?[Self.roleKey] == BoothRole.main.rawValue else { return }
        invitedMain = peer
        browser.invitePeer(peer, to: session, withContext: nil, timeout: 10)
    }

    /// The browser reports a peer only once, so after a failed invitation or a
    /// dropped link it has to look again to find the main phone.
    private func lookForMainAgain() {
        guard runningRole == .till, let browser else { return }
        browser.stopBrowsingForPeers()
        browser.startBrowsingForPeers()
    }

    fileprivate func invited(by peer: MCPeerID, reply: (Bool, MCSession?) -> Void) {
        guard runningRole == .main, let session else {
            reply(false, nil)
            return
        }
        reply(true, session)
    }

    // MARK: - Saving

    private func saveSendList() { Self.save(sendList, key: Self.sendListKey) }
    private func saveReceived() { Self.save(received, key: Self.receivedKey) }

    private func rollReceivedOverIfNewDay() {
        let today = Self.today()
        guard received.day != today else { return }
        received = ReceivedChanges(day: today)
        saveReceived()
    }

    private static func today() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    private static func save<T: Encodable>(_ value: T, key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    private static func load<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    /// The same peer id every launch, so other phones don't see a ghost copy
    /// of this one after the app restarts.
    private static func loadPeerID() -> MCPeerID {
        if let data = UserDefaults.standard.data(forKey: peerIDKey),
           let saved = try? NSKeyedUnarchiver.unarchivedObject(ofClass: MCPeerID.self, from: data) {
            return saved
        }
        let name = String(TillSettings.name.prefix(60))
        let peer = MCPeerID(displayName: name.isEmpty ? "MoonTea" : name)
        if let data = try? NSKeyedArchiver.archivedData(withRootObject: peer, requiringSecureCoding: true) {
            UserDefaults.standard.set(data, forKey: peerIDKey)
        }
        return peer
    }

    /// A renamed till gets a new peer id carrying the new name.
    func tillNameChanged() {
        UserDefaults.standard.removeObject(forKey: Self.peerIDKey)
        peerID = Self.loadPeerID()
        start()
    }
}

// MARK: - MultipeerConnectivity delegates
//
// Called on MultipeerConnectivity's own queues; each hops to the main actor.

extension BoothSync: MCSessionDelegate {
    nonisolated func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        Task { @MainActor in self.peer(peerID, changedTo: state) }
    }

    nonisolated func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        Task { @MainActor in self.receive(data, from: peerID) }
    }

    nonisolated func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
    nonisolated func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    nonisolated func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}

extension BoothSync: MCNearbyServiceAdvertiserDelegate {
    nonisolated func advertiser(
        _ advertiser: MCNearbyServiceAdvertiser,
        didReceiveInvitationFromPeer peerID: MCPeerID,
        withContext context: Data?,
        invitationHandler: @escaping (Bool, MCSession?) -> Void
    ) {
        nonisolated(unsafe) let handler = invitationHandler
        Task { @MainActor in self.invited(by: peerID, reply: handler) }
    }

    nonisolated func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
        Task { @MainActor in
            ActivityLog.shared.error(.sync, "Main phone couldn't start the booth link", ["error": error])
        }
    }
}

extension BoothSync: MCNearbyServiceBrowserDelegate {
    nonisolated func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        Task { @MainActor in self.found(peerID, info: info) }
    }

    nonisolated func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {}

    nonisolated func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
        Task { @MainActor in
            ActivityLog.shared.error(.sync, "Till couldn't look for the main phone", ["error": error])
        }
    }
}
