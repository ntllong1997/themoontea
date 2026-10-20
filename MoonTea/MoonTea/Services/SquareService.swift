import Foundation
import os
import UIKit
import CoreLocation
import CoreBluetooth
import SquareMobilePaymentsSDK

@MainActor
@Observable
final class SquareService: NSObject {
    static let shared = SquareService()

    enum ConnectionState: Equatable {
        case notConfigured, unauthorized, disconnected, connecting, ready
    }

    enum ChargeResult {
        case success(transactionID: String)
        case cancelled
        case failure(String)
    }

    var connectionState: ConnectionState = .notConfigured
    var connectedReaderName: String = ""
    var lastError: String = ""
    var readerUnavailableReason: String = ""
    /// A physical reader is paired with this phone, connected or not —
    /// tells "reader dropped off" apart from "this phone has no reader".
    private(set) var hasPairedReader = false

    private var chargeContinuation: CheckedContinuation<ChargeResult, Never>?
    private var readerObserver: ReaderObserverBridge?
    private static var didInitializeSDK = false
    private let locationManager = CLLocationManager()
    private var bluetoothManager: CBCentralManager?

    // When a known reader is unreachable, retryConnection() fails almost
    // immediately, which flips connectionState .connecting -> .disconnected,
    // which (via the `wasConnectedOrConnecting` guard below) re-triggers
    // another retry — a tight loop with no delay between attempts that was
    // spamming the console with reconnect/log churn on every launch. This
    // cooldown caps automatic retries to once every few seconds so a reader
    // that's truly off just sits disconnected instead of being hammered.
    private var lastAutoReconnectAt: Date = .distantPast
    private static let autoReconnectCooldown: TimeInterval = 5

    // The reader re-establishes its secure connection to Square every few
    // minutes, often right as a payment starts, and Square cancels a payment
    // that's in progress when it does. These two tell such a cancel apart
    // from staff cancelling (`ReaderInterruption`).
    private var lastReaderDropAt: Date = .distantPast
    private var chargeStartedAt: Date = .distantFuture
    /// The current payment's attempt ID, and the server ID Square gave the
    /// payment if it got that far before being cancelled — either one
    /// reaching Square rules out reopening the payment (no double charge).
    private var paymentAttemptID = ""
    private var cancelledPaymentID: String?
    /// Which step a `.connecting` reader is on — "device" (Bluetooth) or
    /// "Square" (secure connection) — so the activity log says which.
    private var connectingTo = ""

    /// How long a card payment waits for a reconnecting reader. The secure
    /// connection refresh takes 0.5–6 seconds.
    private static let reconnectWait: Duration = .seconds(10)
    /// Lets Square's payment screen finish closing before it opens again.
    private static let reopenDelay: Duration = .seconds(1)
    /// How long a launch gives the SDK to load its saved login before
    /// authorizing (see `configure()`).
    private static let savedLoginWait: Duration = .seconds(3)
    private static let pollInterval: Duration = .milliseconds(250)

    /// Diagnostic logging for the reader-reconnect investigation. View in
    /// Console.app (or `log stream`) filtered by subsystem "MoonTea",
    /// category "SquareReader". Remove once the alternating-launch failure
    /// is root-caused.
    private let log = Logger(subsystem: "MoonTea", category: "SquareReader")

    private override init() {
        super.init()
        locationManager.delegate = self
        if isConfigured { connectionState = .unauthorized }
    }

    // MARK: - Location permission
    //
    // The SDK refuses to process card payments with `PaymentError.locationPermissionNeeded`
    // until the app holds at least "when in use" location authorization — Square uses it
    // to verify the payment is happening at the seller's registered location.

    private func requestLocationPermissionIfNeeded() {
        guard locationManager.authorizationStatus == .notDetermined else { return }
        locationManager.requestWhenInUseAuthorization()
    }

    // MARK: - Bluetooth permission
    //
    // iOS only shows the system "Allow Bluetooth" prompt the first time a
    // `CBCentralManager` is instantiated. The Square SDK apparently defers
    // creating its own manager until you actually try to pair — by which point
    // a `.notDetermined` status makes pairing silently fail ("unknown bluetooth
    // error") instead of prompting. Spinning up our own manager early forces
    // the prompt to appear before the SDK ever needs Bluetooth.

    private func requestBluetoothPermissionIfNeeded() {
        guard bluetoothManager == nil, CBCentralManager.authorization == .notDetermined else { return }
        bluetoothManager = CBCentralManager(delegate: self, queue: nil)
    }

    var isConfigured: Bool {
        !Secrets.squareApplicationID.hasPrefix("YOUR-") &&
        !Secrets.squareLocationID.hasPrefix("YOUR-") &&
        !Secrets.squareAccessToken.hasPrefix("YOUR-")
    }

    // MARK: - App-launch setup

    static func configure() {
        guard shared.isConfigured, !didInitializeSDK else {
            shared.log.info("configure() skipped — configured=\(shared.isConfigured, privacy: .public) didInitializeSDK=\(didInitializeSDK, privacy: .public) (warm path: SDK NOT re-initialized)")
            return
        }
        shared.log.info("configure() running — first SDK initialize this process (COLD launch path)")
        didInitializeSDK = true
        ActivityLog.shared.info(.reader, "Square SDK started")
        MobilePaymentsSDK.initialize(squareApplicationID: Secrets.squareApplicationID)
        shared.connectionState = .unauthorized
        shared.requestLocationPermissionIfNeeded()
        shared.requestBluetoothPermissionIfNeeded()
        // The SDK loads its saved login in the background after `initialize`
        // and reports `.notAuthorized` until it's done. Calling `authorize` in
        // that window can leave a connected reader stuck until it reconnects
        // (Square fixed this in SDK 2.6.0; still no reason to race it), so
        // give the saved login a moment first. A phone that has never logged
        // in just waits out `savedLoginWait`.
        Task {
            _ = await shared.wait(upTo: savedLoginWait) {
                MobilePaymentsSDK.shared.authorizationManager.state != .notAuthorized
            }
            await shared.authorize()
        }
    }

    /// Checks `condition` every `pollInterval` until it holds (true) or
    /// `timeout` passes (false).
    private func wait(upTo timeout: Duration, until condition: () -> Bool) async -> Bool {
        let deadline = ContinuousClock.now + timeout
        while !condition() {
            guard ContinuousClock.now < deadline,
                  (try? await Task.sleep(for: Self.pollInterval)) != nil else { return false }
        }
        return true
    }

    // MARK: - Authorization

    func authorize() async {
        guard isConfigured else { connectionState = .notConfigured; return }

        let authState = MobilePaymentsSDK.shared.authorizationManager.state
        log.info("authorize() — sdk authState=\(authState == .authorized ? "authorized" : authState == .notAuthorized ? "notAuthorized" : "authorizing/other", privacy: .public)")

        // If the SDK already holds credentials from a previous session, skip the
        // authorize call entirely and go straight to syncing reader state.
        guard MobilePaymentsSDK.shared.authorizationManager.state == .notAuthorized else {
            lastError = ""
            syncWithSDK()
            return
        }

        MobilePaymentsSDK.shared.authorizationManager.authorize(
            withAccessToken: Secrets.squareAccessToken,
            locationID: Secrets.squareLocationID
        ) { [weak self] error in
            Task { @MainActor [weak self] in
                guard let self else { return }
                // On relaunch the SDK can briefly report `.notAuthorized` while it
                // loads persisted credentials from disk, so the guard above falls
                // through and `authorize` is called — which the SDK rejects with
                // `alreadyAuthorized` (code 0). That is not a real failure.
                //
                // Note: `error as? AuthorizationError` always fails (NS_ENUM cast)
                // so we check the NSError domain + code directly.
                if let error, !Self.isAlreadyAuthorizedError(error) {
                    self.lastError = Self.friendlyAuthorizationError(error)
                    ActivityLog.shared.error(.reader, "Square authorization failed", [
                        "error": self.lastError, "code": (error as NSError).code,
                    ])
                } else {
                    ActivityLog.shared.info(.reader, "Square authorized")
                    self.lastError = ""
                    self.syncWithSDK()
                }
            }
        }
    }

    private nonisolated static func isAlreadyAuthorizedError(_ error: Error) -> Bool {
        let ns = error as NSError
        return ns.domain == "MobilePaymentsSDKAPI.AuthorizationError" && ns.code == 0
    }

    private nonisolated static func friendlyAuthorizationError(_ error: Error) -> String {
        let ns = error as NSError
        guard ns.domain == "MobilePaymentsSDKAPI.AuthorizationError" else {
            return error.localizedDescription
        }
        switch ns.code {
        case 9:  // AuthorizationError.invalidAccessToken
            return "Invalid Square access token — check Secrets.swift."
        case 10: // AuthorizationError.invalidLocationID
            return "Invalid Square location ID — check Secrets.swift."
        case 11: // AuthorizationError.locationNotActivatedForCardProcessing
            return "This Square location isn't activated for card processing — check your Square dashboard."
        case 12: // AuthorizationError.noNetwork
            return "No internet connection — connect to Wi-Fi or cellular and try again."
        case 14: // AuthorizationError.unexpected
            return "Unexpected Square authorization error — try again or re-check your credentials."
        default:
            return error.localizedDescription
        }
    }

    // MARK: - Reader observation

    /// Re-syncs everything that depends on the SDK's reader state: makes sure
    /// we're observing changes, re-derives `connectionState` from what's
    /// currently reported, and kicks off a reconnect attempt for any reader
    /// Square already knows about but hasn't reconnected to on its own.
    private func syncWithSDK() {
        installReaderObserver()
        refreshConnectionFromReaders()
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 500_000_000)
            await MainActor.run { self?.reconnectKnownReadersThrottled() }
        }
    }

    /// Registers a ReaderObserver with Square's ReaderManager. The observer
    /// pushes every reader add / remove / change back to us so connectionState
    /// + connectedReaderName stay accurate without any polling from the UI.
    private func installReaderObserver() {
        guard readerObserver == nil else { return }
        let observer = ReaderObserverBridge { [weak self] in
            Task { @MainActor [weak self] in self?.refreshConnectionFromReaders() }
        }
        readerObserver = observer
        MobilePaymentsSDK.shared.readerManager.add(observer)
    }

    /// Re-derives `connectionState` and `connectedReaderName` from whatever
    /// the SDK currently reports. A reader counts as "ready" only when its
    /// status is `.ready` — connecting/unavailable states map to `.connecting`
    /// or `.disconnected`.
    fileprivate func refreshConnectionFromReaders() {
        let before = (state: connectionState, reader: connectedReaderName, reason: readerUnavailableReason, step: connectingTo)
        defer {
            if before.state == .ready && connectionState != .ready { lastReaderDropAt = Date() }
            logConnectionChange(from: before)
        }

        // `readers` always includes a virtual `.tapToPay` entry for the
        // iPhone's own built-in NFC chip ("Tap to Pay on iPhone") — it
        // reports `.ready` independent of any physical Bluetooth reader,
        // which was masking whether the actual contactless reader was
        // connected (status showed "Ready — Tap to Pay" with nothing paired).
        // We only care about the physical hardware here, so filter it out.
        let readers = MobilePaymentsSDK.shared.readerManager.readers.filter { $0.model != .tapToPay }
        hasPairedReader = !readers.isEmpty
        for r in readers {
            let reasonCode = r.statusInfo.unavailableReasonInfo.map { Int($0.reason.rawValue) } ?? -1
            log.info("refresh: reader '\(r.name, privacy: .public)' status=\(r.statusInfo.status.rawValue, privacy: .public) unavailableReason=\(reasonCode, privacy: .public)")
        }
        if let ready = readers.first(where: { $0.statusInfo.status == .ready }) {
            connectionState = .ready
            connectedReaderName = ready.name
            readerUnavailableReason = ""
            connectingTo = ""
        } else if let connecting = readers.first(where: { $0.statusInfo.status == .connectingToDevice || $0.statusInfo.status == .connectingToSquare }) {
            connectionState = .connecting
            connectedReaderName = ""
            readerUnavailableReason = ""
            connectingTo = connecting.statusInfo.status == .connectingToSquare ? "Square" : "device"
        } else {
            connectingTo = ""
            // Re-queue a retry whenever we transition INTO the disconnected
            // state. `retryConnection` is one-shot — the SDK consumes the
            // request when the reader next becomes available and does not
            // automatically queue another one. Without this, every other
            // reader power-cycle fails because no retry is pending.
            let wasConnectedOrConnecting = connectionState == .ready || connectionState == .connecting
            connectionState = .disconnected
            connectedReaderName = ""
            // Surface *why* a known reader can't be reached (e.g. Bluetooth
            // disabled, max readers connected, firmware update needed) —
            // without this, "device cannot be accessed" gives the user
            // nothing to act on.
            if let reasonInfo = readers.compactMap({ $0.statusInfo.unavailableReasonInfo }).first {
                readerUnavailableReason = "\(reasonInfo.title): \(reasonInfo.detail)"
            } else {
                readerUnavailableReason = ""
            }
            if wasConnectedOrConnecting {
                reconnectKnownReadersThrottled()
            }
        }
        log.info("refresh -> connectionState=\(String(describing: self.connectionState), privacy: .public) reader='\(self.connectedReaderName, privacy: .public)' reason='\(self.readerUnavailableReason, privacy: .public)'")
    }

    /// Records reader connection changes in the activity log. Only actual
    /// changes: `refreshConnectionFromReaders` runs on every SDK callback.
    private func logConnectionChange(from before: (state: ConnectionState, reader: String, reason: String, step: String)) {
        guard before.state != connectionState || before.reader != connectedReaderName
                || before.reason != readerUnavailableReason || before.step != connectingTo else { return }
        let from = String(describing: before.state)
        switch connectionState {
        case .ready:
            ActivityLog.shared.info(.reader, "Card reader ready", ["reader": connectedReaderName, "was": from])
        case .connecting:
            ActivityLog.shared.info(.reader, "Card reader connecting", ["was": from, "to": connectingTo])
        case .disconnected:
            var details: [String: Any] = ["was": from]
            if !readerUnavailableReason.isEmpty { details["reason"] = readerUnavailableReason }
            if !before.reader.isEmpty { details["reader"] = before.reader }
            ActivityLog.shared.warning(.reader, "Card reader not connected", details)
        case .notConfigured, .unauthorized:
            ActivityLog.shared.info(.reader, "Card reader state changed", ["state": String(describing: connectionState), "was": from])
        }
    }

    /// Gates `reconnectKnownReaders()` behind `autoReconnectCooldown` so a
    /// reader that keeps failing to reconnect (powered off, out of range)
    /// can't re-trigger itself in a tight loop — every failed retry flips
    /// connectionState back to `.disconnected`, which would otherwise queue
    /// another retry immediately.
    private func reconnectKnownReadersThrottled() {
        let now = Date()
        guard now.timeIntervalSince(lastAutoReconnectAt) >= Self.autoReconnectCooldown else { return }
        lastAutoReconnectAt = now
        reconnectKnownReaders()
    }

    /// Square remembers readers you've paired before across launches, but
    /// doesn't automatically re-establish their connection — they just sit in
    /// `readers` as `.readerUnavailable` until something nudges the SDK to
    /// retry. Rather than making you open Reader Settings and tap Connect by
    /// hand every time the app restarts, proactively retry every known reader
    /// that isn't already connected/connecting.
    private func reconnectKnownReaders() {
        let manager = MobilePaymentsSDK.shared.readerManager
        for reader in manager.readers
        where reader.model != .tapToPay && reader.statusInfo.status == .readerUnavailable {
            let result = manager.retryConnection(reader)
            ActivityLog.shared.info(.reader, "Retrying card reader connection", [
                "reader": reader.name, "result": Self.describe(result),
                "retryable": reader.isConnectionRetryable,
            ])
            log.info("retryConnection('\(reader.name, privacy: .public)') -> result=\(result.rawValue, privacy: .public)")
        }
    }

    private static func describe(_ result: RetryConnectionResult) -> String {
        switch result {
        case .startingReconnection:            "reconnecting"
        case .readerAlreadyConnectingToSquare: "already connecting"
        case .unableToRetry:                   "unable to retry"
        case .readerNotFound:                  "reader not found"
        @unknown default:                      "unknown (\(result.rawValue))"
        }
    }

    // MARK: - Reader pairing

    /// Opens the Square reader-pairing UI.
    func presentReaderSettings() {
        guard isConfigured else {
            lastError = "Fill in Square credentials in Secrets.swift first."
            return
        }
        guard let vc = UIApplication.shared.topViewController else { return }
        ActivityLog.shared.info(.reader, "Opened card reader pairing")
        MobilePaymentsSDK.shared.settingsManager.presentSettings(with: vc) { [weak self] error in
            guard let error else { return }
            ActivityLog.shared.warning(.reader, "Card reader pairing screen reported an error", ["error": error])
            Task { @MainActor [weak self] in
                self?.lastError = error.localizedDescription
            }
        }
    }

    // MARK: - Charging

    func charge(amountCents: Int) async -> ChargeResult {
        let amount = Double(amountCents) / 100
        var result = await startCharge(amountCents: amountCents)
        if case .cancelled = result, shouldReopenAfterCancel(amount: amount) {
            // Open Square's payment screen again once the reader is back
            // instead of making staff start over. Only once: a second cancel
            // is left to staff.
            try? await Task.sleep(for: Self.reopenDelay)
            result = await startCharge(amountCents: amountCents)
        }
        switch result {
        case .success(let transactionID):
            ActivityLog.shared.info(.payment, "Card payment approved", ["amount": amount, "paymentID": transactionID])
        case .cancelled:
            ActivityLog.shared.info(.payment, "Card payment cancelled", ["amount": amount])
        case .failure(let message):
            ActivityLog.shared.warning(.payment, "Card payment failed", [
                "amount": amount, "error": message, "readerState": String(describing: connectionState),
            ])
        }
        return result
    }

    /// Whether to open a cancelled payment again: the reader cut it off, the
    /// app is still on screen, and Square never got as far as creating the
    /// payment, so reopening can't charge the card twice. Re-reads the
    /// reader first, in case Square's cancel arrived before the observer
    /// reported the drop.
    private func shouldReopenAfterCancel(amount: Double) -> Bool {
        refreshConnectionFromReaders()
        let cutOff = ReaderInterruption.didCutOffCharge(
            startedAt: chargeStartedAt,
            cancelledAt: Date(),
            lastReaderDropAt: lastReaderDropAt,
            isReaderReadyNow: connectionState == .ready
        )
        guard cutOff else { return false }
        let idempotencyKey = MobilePaymentsSDK.shared.paymentManager
            .getIdempotencyKey(withPaymentAttemptId: paymentAttemptID)
        let reachedSquare = cancelledPaymentID != nil || idempotencyKey != nil
        let isAppActive = UIApplication.shared.applicationState == .active
        let reopen = !reachedSquare && isAppActive
        ActivityLog.shared.warning(.payment, "Card payment cut off by the reader reconnecting", [
            "amount": amount, "readerState": String(describing: connectionState),
            "reopening": reopen, "paymentID": cancelledPaymentID ?? "none",
            "hasIdempotencyKey": idempotencyKey != nil, "appActive": isAppActive,
        ])
        return reopen
    }

    private func startCharge(amountCents: Int) async -> ChargeResult {
        guard isConfigured else {
            return .failure("Square credentials not configured.")
        }
        if connectionState == .connecting {
            // Usually the reader refreshing its secure connection to Square,
            // back within seconds — wait for it rather than refuse the card.
            _ = await wait(upTo: Self.reconnectWait) { connectionState != .connecting }
        }
        guard connectionState == .ready else {
            let message = switch connectionState {
            case .connecting:   "The card reader is still connecting — wait a moment, then tap Card again."
            case .disconnected: "Reader not connected — open Reader Settings to pair."
            default:            "Square not authorized — tap Authorize in Reader Settings."
            }
            return .failure(message)
        }

        // Square requires at least "When In Use" location permission to verify
        // the payment is happening at the seller's registered location.
        // Catching this here avoids reaching startPayment only to get the
        // cryptic "payment_location_permission_needed" error from the SDK.
        let locStatus = locationManager.authorizationStatus
        guard locStatus == .authorizedWhenInUse || locStatus == .authorizedAlways else {
            return .failure(
                "Location access is required for card payments — enable it in Settings → Privacy & Security → Location Services → MoonTea."
            )
        }

        guard let vc = UIApplication.shared.topViewController else {
            return .failure("Could not find a view controller to present from.")
        }

        ActivityLog.shared.info(.payment, "Card payment started", [
            "amount": Double(amountCents) / 100, "reader": connectedReaderName,
        ])
        chargeStartedAt = Date()
        paymentAttemptID = UUID().uuidString
        cancelledPaymentID = nil
        return await withCheckedContinuation { cont in
            chargeContinuation = cont
            let params = PaymentParameters(
                paymentAttemptID: paymentAttemptID,
                amountMoney: Money(amount: UInt(amountCents), currency: .USD),
                // Never store a card payment to process later: offline
                // payments can be declined after the customer has left.
                processingMode: .onlineOnly
            )
            let prompt = PromptParameters(mode: .default, additionalMethods: .all)
            let handle = MobilePaymentsSDK.shared.paymentManager.startPayment(
                params,
                promptParameters: prompt,
                from: vc,
                delegate: self
            )
            // No handle means Square didn't start the payment, and it may
            // never call the delegate — don't leave the payment page waiting
            // forever. A delegate call that does follow finds nothing to resume.
            if handle == nil {
                chargeContinuation?.resume(returning: .failure("Square couldn't start the payment — tap Card to try again."))
                chargeContinuation = nil
            }
        }
    }

    /// Re-syncs our state with the SDK when the app returns to the foreground.
    ///
    /// Backgrounding can silently drop the reader's BLE link (or simply pause
    /// `ReaderObserver` callbacks while suspended), so `connectionState` can go
    /// stale and get "stuck" on `.ready`/`.connecting` — which then blocks the
    /// UI from offering a fresh "Connect / Pair Reader" action. Re-installing
    /// the observer and re-deriving state directly from `readerManager.readers`
    /// guarantees the UI reflects reality as soon as we're active again.
    func handleAppDidBackground() {
        log.info("scenePhase -> background (didInitializeSDK=\(Self.didInitializeSDK, privacy: .public))")
        guard Self.didInitializeSDK, let observer = readerObserver else { return }
        MobilePaymentsSDK.shared.readerManager.remove(observer)
        readerObserver = nil
    }

    func handleAppDidBecomeActive() {
        log.info("scenePhase -> active (didInitializeSDK=\(Self.didInitializeSDK, privacy: .public))")
        // `MobilePaymentsSDK.shared` asserts (hard crash) if accessed before
        // `initialize` has run — which `configure()` skips when the Square
        // credentials aren't filled in — so bail out unless the SDK is up.
        guard Self.didInitializeSDK, isConfigured,
              MobilePaymentsSDK.shared.authorizationManager.state == .authorized else { return }
        syncWithSDK()
    }

    /// Call this when you observe a reader connect/disconnect externally.
    func setReaderReady(_ ready: Bool, name: String = "") {
        connectionState = ready ? .ready : .disconnected
        connectedReaderName = ready ? name : ""
    }

    /// Forgets every paired physical reader (the SDK has no
    /// `disconnectAllReaders()` — `forget(_:)` is the documented way to
    /// un-pair a reader), then re-derives connection state from the SDK.
    func disconnectReaders() {
        let manager = MobilePaymentsSDK.shared.readerManager
        let readers = manager.readers.filter { $0.model != .tapToPay }
        ActivityLog.shared.info(.reader, "Card readers forgotten", ["readers": readers.map(\.name).joined(separator: ", ")])
        for reader in readers {
            manager.forget(reader)
        }
        refreshConnectionFromReaders()
    }
}

// MARK: - CLLocationManagerDelegate

extension SquareService: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        let name: String = switch status {
        case .notDetermined:       "not asked yet"
        case .restricted:          "restricted"
        case .denied:              "denied"
        case .authorizedAlways:    "always"
        case .authorizedWhenInUse: "when in use"
        @unknown default:          "unknown"
        }
        ActivityLog.shared.info(.reader, "Location permission", ["status": name])
        Task { @MainActor [weak self] in
            guard let self else { return }
            if status == .denied || status == .restricted {
                self.lastError = "Location access is required to take card payments — enable it in Settings → Privacy & Security → Location Services → MoonTea."
            } else if status == .authorizedWhenInUse || status == .authorizedAlways {
                if self.lastError.contains("Location access is required") { self.lastError = "" }
            }
        }
    }
}

// MARK: - CBCentralManagerDelegate

extension SquareService: CBCentralManagerDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        // Instantiating the manager is what triggers the system Bluetooth
        // permission prompt; we don't scan with it ourselves. But its state
        // tells us *why* Square's reader-pairing UI might show no devices
        // and report "device cannot be accessed" — Bluetooth being off or
        // the app being denied access never surfaces from the SDK itself.
        let state = central.state
        let name: String = switch state {
        case .poweredOn:    "on"
        case .poweredOff:   "off"
        case .unauthorized: "not allowed for this app"
        case .unsupported:  "unsupported"
        case .resetting:    "resetting"
        case .unknown:      "unknown"
        @unknown default:   "unknown"
        }
        let level: ActivityLog.Level = state == .poweredOn ? .info : .warning
        ActivityLog.shared.log(level, .reader, "Bluetooth is \(name)")
        Task { @MainActor [weak self] in
            guard let self else { return }
            switch state {
            case .poweredOff:
                self.lastError = "Bluetooth is off — turn it on to connect your card reader."
            case .unauthorized:
                self.lastError = "Bluetooth access is required to connect your card reader — enable it in Settings → Privacy & Security → Bluetooth → MoonTea."
            default:
                if self.lastError.contains("Bluetooth") { self.lastError = "" }
            }
        }
    }
}

// MARK: - PaymentManagerDelegate

extension SquareService: PaymentManagerDelegate {
    nonisolated func paymentManager(_ manager: PaymentManager, didFinish payment: Payment) {
        Task { @MainActor in
            chargeContinuation?.resume(returning: .success(transactionID: payment.id ?? ""))
            chargeContinuation = nil
        }
    }

    nonisolated func paymentManager(_ manager: PaymentManager, didFail payment: Payment, withError error: Error) {
        // Translate SDK error codes (domain "MobilePaymentsSDKAPI.PaymentError") into
        // human-readable messages. The raw localizedDescription is the enum case name
        // in snake_case — not suitable to show directly to a customer.
        let message = Self.friendlyPaymentError(error)
        Task { @MainActor in
            chargeContinuation?.resume(returning: .failure(message))
            chargeContinuation = nil
        }
    }

    private nonisolated static func friendlyPaymentError(_ error: Error) -> String {
        let ns = error as NSError
        guard ns.domain == "MobilePaymentsSDKAPI.PaymentError" else {
            return error.localizedDescription
        }
        switch ns.code {
        case 3:  // PaymentError.locationPermissionNeeded
            return "Location access is required for card payments — enable it in Settings → Privacy & Security → Location Services → MoonTea."
        case 5:  // PaymentError.notAuthorized
            return "Square account not authorized — open Reader Settings and tap Authorize."
        case 6:  // PaymentError.noNetwork
            return "No internet connection — connect to Wi-Fi or cellular and try again."
        case 9:  // PaymentError.paymentAlreadyInProgress
            return "A payment is already in progress — please wait for it to complete."
        case 11: // PaymentError.timedOut
            return "Payment timed out — please try again."
        case 14: // PaymentError.trackingConsentIsPending
            return "App tracking consent is required — please respond to the system prompt and try again."
        default:
            return error.localizedDescription
        }
    }

    nonisolated func paymentManager(_ manager: PaymentManager, didCancel payment: Payment) {
        let paymentID = payment.id
        Task { @MainActor in
            cancelledPaymentID = paymentID
            chargeContinuation?.resume(returning: .cancelled)
            chargeContinuation = nil
        }
    }
}

// MARK: - ReaderObserver bridge

/// Square's `ReaderObserver` protocol methods are nonisolated, so we keep
/// the conformance on a small NSObject that hops back to MainActor before
/// touching SquareService state.
private final class ReaderObserverBridge: NSObject, ReaderObserver {
    private let onChange: @Sendable () -> Void
    init(onChange: @escaping @Sendable () -> Void) { self.onChange = onChange }

    func readerWasAdded(_ readerInfo: ReaderInfo)   { onChange() }
    func readerWasRemoved(_ readerInfo: ReaderInfo) { onChange() }
    func readerDidChange(_ readerInfo: ReaderInfo, change: ReaderChange) { onChange() }
}

// MARK: - UIApplication helper

private extension UIApplication {
    var topViewController: UIViewController? {
        guard let scene = connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
              let window = scene.keyWindow else { return nil }
        var top = window.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
