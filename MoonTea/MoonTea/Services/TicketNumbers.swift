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
/// At an event the main phone numbers every booth ticket — its own and every
/// till's — strictly in order, nothing skipped. With signal it asks Supabase
/// for each number, so website orders share the same sequence; it tells
/// Supabase the highest number it knows, so numbers it handed out offline are
/// never handed out again. With no signal (or no answer within a few seconds)
/// it continues by itself; the website isn't used then.
///
/// Requests are handled one at a time, so two tills asking at once can't get
/// the same number. Numbering by itself needs today's tickets loaded (from
/// Supabase, or from the old main phone after a takeover), or it could start
/// again at #1.
@MainActor
@Observable
final class BoothCounter {
    static let shared = BoothCounter()

    private(set) var state: BoothCounterState
    /// Whether the last number came from this phone alone (no signal).
    private(set) var isNumberingOffline = false
    private static let storageKey = "boothCounter"
    private static let supabaseTimeoutSeconds: UInt64 = 3
    @ObservationIgnored private var queue: Task<Void, Never>?

    private init() {
        let saved = UserDefaults.standard.data(forKey: Self.storageKey)
            .flatMap { try? JSONDecoder().decode(BoothCounterState.self, from: $0) }
        state = saved?.day == Self.today() ? saved! : BoothCounterState(day: Self.today())
    }

    var lastNumber: Int { state.day == Self.today() ? state.lastGiven : 0 }

    func number(for orderUUID: UUID) async throws -> Int {
        // Wait for any request in progress, so each sees the one before it.
        let previous = queue
        let task = Task { () -> Result<Int, Error> in
            await previous?.value
            do { return .success(try await self.assign(orderUUID)) } catch { return .failure(error) }
        }
        queue = Task { _ = await task.value }
        return try await task.value.get()
    }

    private func assign(_ orderUUID: UUID) async throws -> Int {
        if state.day != Self.today() { state = BoothCounterState(day: Self.today()) }
        if let number = state.number(for: orderUUID) { return number }
        let highest = state.highest(seen: TicketStore.shared.highestOrderNumber)

        let number: Int
        if let fromSupabase = await Self.askSupabase(after: highest) {
            number = fromSupabase
            isNumberingOffline = false
        } else {
            // A phone that already numbered tickets today knows where it is;
            // one that didn't must know today's tickets, or it could restart at 1.
            guard state.lastGiven > 0 || TicketStore.shared.hasLoadedToday else {
                throw Failure.ticketsNotLoaded
            }
            number = highest + 1
            isNumberingOffline = true
        }
        state.record(number, for: orderUUID)
        if let data = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
        return number
    }

    /// Supabase's next number, or nil with no signal / no answer in time.
    private static func askSupabase(after highest: Int) async -> Int? {
        await withTaskGroup(of: Int?.self) { group in
            group.addTask { try? await SupabaseService.shared.nextOrderNumber(after: highest) }
            group.addTask {
                try? await Task.sleep(nanoseconds: supabaseTimeoutSeconds * 1_000_000_000)
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
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
