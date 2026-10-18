import Foundation

/// Where a new ticket's number comes from, by `BoothRole`.
@MainActor
enum TicketNumbers {
    enum Failure: LocalizedError {
        case mainPhoneNotConnected
        case mainPhoneCantNumber(String)

        var errorDescription: String? {
            switch self {
            case .mainPhoneNotConnected:
                "Main phone not connected. Check the main phone has the app open, and WiFi and Bluetooth are on."
            case .mainPhoneCantNumber(let reason):
                reason
            }
        }
    }

    static func next(for orderUUID: UUID) async throws -> Int {
        switch TillSettings.role {
        case .standalone: return try await fromSupabase()
        case .main:       return try await BoothCounter.shared.number(for: orderUUID)
        case .till:       return try await BoothSync.shared.requestNumber(for: orderUUID)
        }
    }

    /// Asks Supabase, retrying briefly: on a weak signal one dropped request
    /// is common.
    static func fromSupabase() async throws -> Int {
        var lastError: Error?
        for attempt in 0..<3 {
            if attempt > 0 { try? await Task.sleep(nanoseconds: 1_000_000_000) }
            do {
                return try await SupabaseService.shared.nextOrderNumber()
            } catch {
                lastError = error
            }
        }
        throw lastError ?? SupabaseError.http(0, "no response")
    }
}

/// The main phone's ticket numbers (docs/offline-event-plan.md, step 4).
///
/// At an event the main phone is in charge of every ticket number: its own,
/// every till's, and the website's (`WebsiteNumberRequests`). It numbers them
/// itself, strictly 1, 2, 3 with nothing skipped and no signal needed.
/// Requests are handled one at a time, so two at once can't get the same
/// number. Numbering needs today's tickets loaded (from Supabase, or from the
/// old main phone after a takeover), or it could start again at #1.
@MainActor
@Observable
final class BoothCounter {
    static let shared = BoothCounter()

    private(set) var state: BoothCounterState
    private static let storageKey = "boothCounter"
    @ObservationIgnored private var queue: Task<Void, Never>?

    private init() {
        let saved = UserDefaults.standard.data(forKey: Self.storageKey)
            .flatMap { try? JSONDecoder().decode(BoothCounterState.self, from: $0) }
        state = saved?.day == Self.today() ? saved! : BoothCounterState(day: Self.today())
    }

    var lastNumber: Int { state.day == Self.today() ? state.lastGiven : 0 }

    /// A number for an order taken on this phone or a till.
    func number(for orderUUID: UUID) async throws -> Int {
        try await serially {
            if let number = self.state.number(for: orderUUID) { return number }
            let number = try self.nextNumber()
            self.record(number, for: orderUUID)
            return number
        }
    }

    /// Answers a website order's request. The number counts only if Supabase
    /// accepts the answer — a request the website already gave up on (it
    /// numbered the order 1000+) must not use up one of the phone's numbers.
    func answerWebsiteRequest(_ orderUUID: UUID) async {
        _ = try? await serially { () -> Int in
            if let number = self.state.number(for: orderUUID) { return number }
            let number = try self.nextNumber()
            let accepted = try await SupabaseService.shared.answerNumberRequest(
                orderUUID: orderUUID, number: number, device: TillSettings.name
            )
            guard accepted else { return 0 }
            self.record(number, for: orderUUID)
            ActivityLog.shared.info(.order, "Numbered a website order", ["order": number])
            return number
        }
    }

    private func nextNumber() throws -> Int {
        if state.day != Self.today() { state = BoothCounterState(day: Self.today()) }
        // A phone that already numbered tickets today knows where it is; one
        // that didn't must know today's tickets, or it could restart at 1.
        guard state.lastGiven > 0 || TicketStore.shared.hasLoadedToday else {
            throw Failure.ticketsNotLoaded
        }
        return state.next(seen: TicketStore.shared.highestOrderNumber)
    }

    private func record(_ number: Int, for orderUUID: UUID) {
        state.record(number, for: orderUUID)
        if let data = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }

    /// Runs `work` after every earlier request has finished.
    private func serially(_ work: @escaping @MainActor () async throws -> Int) async throws -> Int {
        let previous = queue
        let task = Task { () -> Result<Int, Error> in
            await previous?.value
            do { return .success(try await work()) } catch { return .failure(error) }
        }
        queue = Task { _ = await task.value }
        return try await task.value.get()
    }

    enum Failure: LocalizedError {
        case ticketsNotLoaded

        var errorDescription: String? {
            "The main phone hasn't loaded today's tickets yet, so it doesn't know the next number. Give it signal for a moment, or take over from a till that was connected to the old main phone."
        }
    }

    private static func today() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }
}
