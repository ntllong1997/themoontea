import Foundation

/// Where a new ticket's number comes from, by `BoothRole`.
@MainActor
enum TicketNumbers {
    enum Failure: LocalizedError {
        case mainPhoneNotConnected

        var errorDescription: String? {
            "Main phone not connected. Check the main phone has the app open, and WiFi and Bluetooth are on."
        }
    }

    static func next(for orderUUID: UUID) async throws -> Int {
        switch TillSettings.role {
        case .standalone: return try await fromSupabase()
        case .main:       return NumberPool.shared.number(for: orderUUID, highestSeen: TicketStore.shared.highestOrderNumber)
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

/// The main phone's numbers. It keeps a few numbers reserved from Supabase
/// ahead of time, so it can hand them out with no signal — and since Supabase
/// gave them out, a website pre-order can never get the same number.
///
/// If the reserve runs out with no signal, it carries on from the highest
/// number it has seen ("offline numbers"). Those could clash with a website
/// pre-order taken meanwhile, so the booth screen warns while it happens.
@MainActor
@Observable
final class NumberPool {
    static let shared = NumberPool()

    private(set) var state: NumberPoolState
    private static let storageKey = "numberPool"
    private static let target = 10
    /// Supabase calls one refill may make, so skipping stale numbers can't loop.
    private static let maxCallsPerRefill = 30
    @ObservationIgnored private var isRefilling = false
    @ObservationIgnored private var refillTimer: Task<Void, Never>?

    private init() {
        state = Self.load() ?? NumberPoolState(day: Self.today())
    }

    var reservedCount: Int { state.reserved.count }
    var isUsingOfflineNumbers: Bool { state.isUsingOfflineNumbers }

    func number(for orderUUID: UUID, highestSeen: Int) -> Int {
        rollOverIfNewDay()
        let number = state.take(for: orderUUID, highestSeen: highestSeen)
        save()
        Task { await refill() }
        return number
    }

    /// Keeps topping up the reserve while this is the main phone.
    func startRefilling() {
        guard refillTimer == nil else { return }
        refillTimer = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refill()
                try? await Task.sleep(nanoseconds: 30_000_000_000)
            }
        }
    }

    func stopRefilling() {
        refillTimer?.cancel()
        refillTimer = nil
    }

    func refill() async {
        guard !isRefilling else { return }
        isRefilling = true
        defer { isRefilling = false }
        rollOverIfNewDay()
        var calls = 0
        while state.reserved.count < Self.target, calls < Self.maxCallsPerRefill {
            calls += 1
            guard let number = try? await SupabaseService.shared.nextOrderNumber() else { return }
            state.addReserved(number)
            save()
        }
    }

    private func rollOverIfNewDay() {
        let today = Self.today()
        guard state.day != today else { return }
        state = NumberPoolState(day: today)
        save()
    }

    private static func today() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(state) else { return }
        UserDefaults.standard.set(data, forKey: Self.storageKey)
    }

    private static func load() -> NumberPoolState? {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return nil }
        return try? JSONDecoder().decode(NumberPoolState.self, from: data)
    }
}
