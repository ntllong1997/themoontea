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
        case .main:       return try BoothCounter.shared.number(for: orderUUID)
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
/// At an event the main phone is the only thing handing out numbers — its own
/// orders and every till's — so they run strictly 1, 2, 3 with no signal
/// needed. The website isn't used to take orders while a main phone runs.
/// Numbers continue after the highest ticket on the phone's list, so a main
/// phone must have loaded today's tickets (from Supabase, or from the old main
/// phone when a till takes over) before it hands out the first one.
@MainActor
@Observable
final class BoothCounter {
    static let shared = BoothCounter()

    private(set) var state: BoothCounterState
    private static let storageKey = "boothCounter"

    private init() {
        let saved = UserDefaults.standard.data(forKey: Self.storageKey)
            .flatMap { try? JSONDecoder().decode(BoothCounterState.self, from: $0) }
        state = saved?.day == Self.today() ? saved! : BoothCounterState(day: Self.today())
    }

    var lastNumber: Int { state.day == Self.today() ? state.lastGiven : 0 }

    func number(for orderUUID: UUID) throws -> Int {
        if state.day != Self.today() { state = BoothCounterState(day: Self.today()) }
        // A phone that already numbered tickets today knows where it is; one
        // that didn't must know today's tickets, or it could start again at 1.
        guard state.lastGiven > 0 || TicketStore.shared.hasLoadedToday else {
            throw Failure.ticketsNotLoaded
        }
        let number = state.take(for: orderUUID, highestSeen: TicketStore.shared.highestOrderNumber)
        if let data = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
        return number
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
