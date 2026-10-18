import Foundation
import Observation

/// The main phone numbers the website's orders too.
///
/// While this phone is the main phone it registers in `booth_main_phone`, and
/// the website then asks it for each number through `ticket_number_requests`
/// instead of the database counter. Requests arrive by Realtime and a 2 s
/// check; each is numbered by `BoothCounter`, in the same sequence as the
/// booth. With no signal the website gets no answer and numbers the order
/// from 1000 itself.
///
/// The registration stays until this phone switches to Standalone or Till
/// (a takeover by another phone replaces it). Removing it is retried until it
/// works, across launches, so the website never waits on a phone that left.
@MainActor
@Observable
final class WebsiteNumberRequests {
    static let shared = WebsiteNumberRequests()

    /// Whether Supabase knows this phone numbers the website's orders.
    private(set) var isRegistered = false

    private static let pollSeconds: UInt64 = 2
    private static let retrySeconds: UInt64 = 10
    private static let needsUnregisterKey = "mainPhoneNeedsUnregister"

    @ObservationIgnored private let realtime = SupabaseRealtime(channelName: "number-requests", table: "ticket_number_requests")
    @ObservationIgnored private var pollTask: Task<Void, Never>?
    @ObservationIgnored private var unregisterTask: Task<Void, Never>?
    @ObservationIgnored private var inFlight: Set<UUID> = []

    private init() {}

    private var deviceID: String { ActivityLog.shared.deviceIdentifier }

    /// Main phone: register, then keep answering. Registering is retried with
    /// each check until it works (e.g. once signal returns).
    func start() {
        unregisterTask?.cancel()
        unregisterTask = nil
        UserDefaults.standard.set(false, forKey: Self.needsUnregisterKey)
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.registerIfNeeded()
                await self?.answerOpenRequests()
                try? await Task.sleep(nanoseconds: Self.pollSeconds * 1_000_000_000)
            }
        }
        Task { [weak self] in
            guard let self else { return }
            await self.realtime.subscribe(onChange: { [weak self] type, record, _ in
                guard type == "INSERT", let id = (record?["order_uuid"] as? String).flatMap(UUID.init(uuidString:)) else { return }
                Task { @MainActor in await self?.answer(id) }
            })
        }
    }

    /// Not the main phone any more: stop answering and remove the
    /// registration, retrying until it's gone.
    func stop() {
        let wasRunning = pollTask != nil
        pollTask?.cancel()
        pollTask = nil
        Task { [realtime] in await realtime.unsubscribe() }
        if wasRunning || isRegistered || UserDefaults.standard.bool(forKey: Self.needsUnregisterKey) {
            UserDefaults.standard.set(true, forKey: Self.needsUnregisterKey)
            unregisterUntilDone()
        }
        isRegistered = false
    }

    private func registerIfNeeded() async {
        guard !isRegistered else { return }
        do {
            try await SupabaseService.shared.registerMainPhone(deviceID: deviceID, deviceName: TillSettings.name)
            isRegistered = true
            ActivityLog.shared.info(.sync, "Main phone now numbers website orders")
        } catch {
            // No signal yet: tried again on the next check.
        }
    }

    private func unregisterUntilDone() {
        guard unregisterTask == nil else { return }
        unregisterTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                do {
                    try await SupabaseService.shared.unregisterMainPhone(deviceID: self.deviceID)
                    UserDefaults.standard.set(false, forKey: Self.needsUnregisterKey)
                    ActivityLog.shared.info(.sync, "Website numbers its own orders again")
                    self.unregisterTask = nil
                    return
                } catch {
                    try? await Task.sleep(nanoseconds: Self.retrySeconds * 1_000_000_000)
                }
            }
        }
    }

    private func answerOpenRequests() async {
        guard let open = try? await SupabaseService.shared.unansweredNumberRequests() else { return }
        for id in open { await answer(id) }
    }

    private func answer(_ orderUUID: UUID) async {
        guard pollTask != nil, inFlight.insert(orderUUID).inserted else { return }
        defer { inFlight.remove(orderUUID) }
        await BoothCounter.shared.answerWebsiteRequest(orderUUID)
    }
}
