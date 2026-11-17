import Foundation
import MultipeerConnectivity
import Observation

/// The booth link: phones talking directly to each other, with no router and
/// no internet (MultipeerConnectivity: peer-to-peer WiFi and Bluetooth).
///
/// Nothing connects until staff ask for it on the Booth screen. A phone
/// starts out working on its own. `host()` makes it the main phone, which
/// advertises; another phone lists the main phones nearby and `join(_:)`s the
/// one staff tap. `leave()` undoes either. A till comes back to the main
/// phone it chose after the app closes or the link drops, and to no other.
///
/// A till asks the main phone for each ticket number and sends it every
/// change, keeping each one saved until the main phone answers "got it". The
/// main phone saves the change on its own upload list, applies it, and sends
/// every till the ticket's new state. See docs/offline-event-plan.md, step 4.
@MainActor
@Observable
final class BoothSync: NSObject {
    static let shared = BoothSync()

    /// What this phone is doing at the booth. The saved choice lives in
    /// `TillSettings`; this copy is what makes screens redraw when it changes.
    private(set) var role: BoothRole
    /// Till: the main phone this phone chose, connected or not.
    private(set) var joinedBooth: NearbyBooth?
    /// The main phones found nearby while the Booth screen is open on a phone
    /// working on its own, by name.
    private(set) var nearbyBooths: [NearbyBooth] = []

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
    /// What a main phone advertises so a till can tell it from another main
    /// phone with the same name, and find it again after it is renamed.
    private static let idKey = "id"
    private static let numberTimeoutSeconds: UInt64 = 5
    /// How often a till that hasn't reached the main phone starts looking
    /// afresh. A main phone that stops and restarts advertising under the same
    /// peer id (a role switch, a relaunch) may never be reported again.
    private static let searchRestartSeconds: UInt64 = 10
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
    @ObservationIgnored private var searchTask: Task<Void, Never>?
    /// The main phones the browser reports now, behind `nearbyBooths`.
    @ObservationIgnored private var foundBooths: [MCPeerID: NearbyBooth] = [:]
    @ObservationIgnored private var isBoothScreenOpen = false

    private override init() {
        peerID = Self.loadPeerID()
        sendList = Self.load(TillSendList.self, key: Self.sendListKey) ?? TillSendList()
        received = Self.load(ReceivedChanges.self, key: Self.receivedKey) ?? ReceivedChanges(day: Self.today())
        role = TillSettings.role
        joinedBooth = TillSettings.joinedBooth
        super.init()
    }

    // MARK: - Choosing what this phone does

    /// Makes this the main phone: other phones can connect to it, and it
    /// numbers, prints and uploads for all of them.
    func host() {
        setRole(.main, joining: nil)
    }

    /// Connects to the main phone staff picked. From then on this phone gets
    /// its numbers from it and sends it every change, and comes back to it by
    /// itself after the app was closed or the link dropped, until `leave()`.
    func join(_ booth: NearbyBooth) {
        setRole(.till, joining: booth)
    }

    /// Stops being the main phone, or disconnects from it: this phone works
    /// on its own again, with its own internet. Changes the main phone hadn't
    /// confirmed go on this phone's upload list (`takeOverUnsentChanges`).
    func leave() {
        setRole(.standalone, joining: nil)
    }

    private func setRole(_ newRole: BoothRole, joining booth: NearbyBooth?) {
        // The chosen main phone first: a till without one reads as standalone.
        TillSettings.joinedBooth = booth
        TillSettings.role = newRole
        TicketStore.shared.start()
        start()
        ActivityLog.shared.info(.sync, "Booth role changed", ["role": newRole.rawValue, "mainPhone": booth?.name ?? ""])
    }

    // MARK: - Main phones nearby

    /// The Booth screen is open: a phone working on its own lists the main
    /// phones nearby, so staff can pick one to connect to.
    func startLookingForBooths() {
        isBoothScreenOpen = true
        if runningRole == .standalone, browser == nil { startBrowsing() }
    }

    /// The Booth screen closed: a phone working on its own stops looking. A
    /// till keeps its browser, which is how it finds its main phone.
    func stopLookingForBooths() {
        isBoothScreenOpen = false
        guard runningRole != .till else { return }
        browser?.delegate = nil
        browser?.stopBrowsingForPeers()
        browser = nil
        forgetFoundBooths()
    }

    private func startBrowsing() {
        let browser = MCNearbyServiceBrowser(peer: peerID, serviceType: Self.serviceType)
        browser.delegate = self
        browser.startBrowsingForPeers()
        self.browser = browser
    }

    private func forgetFoundBooths() {
        foundBooths = [:]
        if !nearbyBooths.isEmpty { nearbyBooths = [] }
    }

    private func refreshNearbyBooths() {
        // Two reports of one main phone (it restarted) show once.
        let booths = Set(foundBooths.values).sorted { ($0.name, $0.id) < ($1.name, $1.id) }
        if booths != nearbyBooths { nearbyBooths = booths }
    }

    // MARK: - Starting and stopping

    /// Starts the link for this phone's role, or stops it for a standalone
    /// phone. Called at launch, on returning to the foreground (iOS drops the
    /// link in the background) and when the role changes.
    func start() {
        let role = TillSettings.role
        stop()
        runningRole = role
        if self.role != role { self.role = role }
        let chosen = role == .till ? TillSettings.joinedBooth : nil
        if joinedBooth != chosen { joinedBooth = chosen }
        TicketStore.shared.onTicketChanged = nil
        TicketStore.shared.onHistoryReplaced = nil
        if role != .till { takeOverUnsentChanges() }
        // Only the main phone numbers the website's orders.
        if role == .main {
            WebsiteNumberRequests.shared.start()
        } else {
            WebsiteNumberRequests.shared.stop()
        }

        switch role {
        case .standalone:
            // No booth link, but the website's orders still print here.
            TicketStore.shared.onTicketChanged = { number, _ in
                ReceiptPrinter.printIfNew(orderNumber: number)
            }
            TicketStore.shared.onHistoryReplaced = { Self.printMissedTickets() }
            // Nothing is linked, but the Booth screen may be listing the
            // main phones nearby.
            if isBoothScreenOpen { startBrowsing() }
            return
        case .main:
            let session = makeSession()
            let advertiser = MCNearbyServiceAdvertiser(
                peer: peerID,
                discoveryInfo: [Self.roleKey: BoothRole.main.rawValue, Self.idKey: ActivityLog.shared.deviceIdentifier],
                serviceType: Self.serviceType
            )
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
                Self.printMissedTickets()
            }
        case .till:
            session = makeSession()
            startBrowsing()
            keepLookingForMain()
        }
        ActivityLog.shared.info(.sync, "Booth link started", ["role": role.rawValue])
    }

    /// Website pre-orders that came in while the link to Supabase was down.
    private static func printMissedTickets() {
        for ticket in TicketStore.shared.history { ReceiptPrinter.printIfNew(orderNumber: ticket.orderNumber) }
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
        searchTask?.cancel()
        searchTask = nil
        // Detach before tearing down: a stopped session still reports its
        // peers dropping, and those late reports must not reach the next
        // session (they'd drop a till's fresh link to the same main phone).
        advertiser?.delegate = nil
        browser?.delegate = nil
        session?.delegate = nil
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
        forgetFoundBooths()
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
        // Follow a rename, so "Looking for …" names the phone as it is now.
        if let joined = joinedBooth, joined.name != peer.displayName {
            let renamed = NearbyBooth(id: joined.id, name: peer.displayName)
            TillSettings.joinedBooth = renamed
            joinedBooth = renamed
        }
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
            if state == .connected {
                ActivityLog.shared.info(.sync, "Till connected", ["till": peer.displayName])
            } else if state == .notConnected {
                ActivityLog.shared.warning(.sync, "Till disconnected", ["till": tillNames[peer] ?? peer.displayName])
            }
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

    /// A main phone is in range. A till invites it only if it is the one
    /// staff chose; a phone working on its own just lists it.
    fileprivate func found(_ peer: MCPeerID, info: [String: String]?) {
        guard info?[Self.roleKey] == BoothRole.main.rawValue else { return }
        // A main phone on an older build advertises no id: its name stands in.
        let booth = NearbyBooth(id: info?[Self.idKey] ?? peer.displayName, name: peer.displayName)
        switch runningRole {
        case .till:
            guard invitedMain == nil, let browser, let session, booth.id == joinedBooth?.id else { return }
            invitedMain = peer
            browser.invitePeer(peer, to: session, withContext: nil, timeout: 10)
        case .standalone:
            foundBooths[peer] = booth
            refreshNearbyBooths()
        case .main, nil:
            break
        }
    }

    /// The browser reports a peer only once, so after a failed invitation or a
    /// dropped link it has to look again to find the main phone.
    private func lookForMainAgain() {
        guard runningRole == .till, let browser else { return }
        browser.stopBrowsingForPeers()
        browser.startBrowsingForPeers()
    }

    /// The main phone went away before the invitation was answered: forget it,
    /// so a main phone found next (or this one coming back) gets invited.
    fileprivate func lost(_ peer: MCPeerID) {
        if foundBooths.removeValue(forKey: peer) != nil { refreshNearbyBooths() }
        guard runningRole == .till, peer == invitedMain, mainPeer == nil else { return }
        invitedMain = nil
        lookForMainAgain()
    }

    /// Till: while the main phone isn't connected, look again every few
    /// seconds. The first miss is logged, since a phone that never finds the
    /// main phone usually has Local Network access turned off.
    private func keepLookingForMain() {
        searchTask = Task { [weak self] in
            var hasWarned = false
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: Self.searchRestartSeconds * 1_000_000_000)
                guard let self, !Task.isCancelled else { return }
                guard self.mainPeer == nil else { continue }
                if !hasWarned {
                    hasWarned = true
                    ActivityLog.shared.warning(.sync, "Main phone not found yet", [
                        "hint": "Both phones need the app open, WiFi and Bluetooth on, and Settings → MoonTea → Local Network on",
                    ])
                }
                // An invitation in flight answers (or times out) on its own.
                if self.invitedMain == nil { self.lookForMainAgain() }
            }
        }
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
// Called on MultipeerConnectivity's own queues; each hops to the main actor
// and drops reports from a session or browser a role switch already replaced.

extension BoothSync {
    fileprivate func isCurrent(_ source: ObjectIdentifier, _ current: AnyObject?) -> Bool {
        current.map(ObjectIdentifier.init) == source
    }
}

extension BoothSync: MCSessionDelegate {
    nonisolated func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        let source = ObjectIdentifier(session)
        Task { @MainActor in
            guard self.isCurrent(source, self.session) else { return }
            self.peer(peerID, changedTo: state)
        }
    }

    nonisolated func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        let source = ObjectIdentifier(session)
        Task { @MainActor in
            guard self.isCurrent(source, self.session) else { return }
            self.receive(data, from: peerID)
        }
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
        let source = ObjectIdentifier(browser)
        Task { @MainActor in
            guard self.isCurrent(source, self.browser) else { return }
            self.found(peerID, info: info)
        }
    }

    nonisolated func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        let source = ObjectIdentifier(browser)
        Task { @MainActor in
            guard self.isCurrent(source, self.browser) else { return }
            self.lost(peerID)
        }
    }

    nonisolated func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
        Task { @MainActor in
            ActivityLog.shared.error(.sync, "Till couldn't look for the main phone", ["error": error])
        }
    }
}
