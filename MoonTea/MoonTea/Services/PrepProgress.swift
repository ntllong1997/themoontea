import Foundation
import Observation

/// Station progress on this phone: each unit's stage (e.g. a corndog's
/// frying → done), keyed by its row id.
///
/// Shared by every screen on the phone — the stations, Tickets and History all
/// show the same stage — but never sent to other phones or Supabase: each
/// device tracks what it is making. Saved on the phone so it survives the app
/// closing, and started fresh each day.
@MainActor
@Observable
final class PrepProgress {
    static let shared = PrepProgress()

    private(set) var stages: PrepStages
    private static let storageKey = "prepProgress"

    private init() {
        let saved = UserDefaults.standard.data(forKey: Self.storageKey)
            .flatMap { try? JSONDecoder().decode(PrepStages.self, from: $0) }
        stages = saved?.day == Self.today() ? saved! : PrepStages(day: Self.today())
    }

    /// The unit's stage name in its category's flow; nil = not started.
    func stage(of rowID: UUID) -> String? {
        stages.day == Self.today() ? stages.byRow[rowID] : nil
    }

    func setStage(_ stage: String, of rowID: UUID) {
        if stages.day != Self.today() { stages = PrepStages(day: Self.today()) }
        stages.set(stage, for: rowID)
        if let data = try? JSONEncoder().encode(stages) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }

    private static func today() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }
}

/// The saved form of `PrepProgress`, one day at a time.
nonisolated struct PrepStages: Codable, Equatable, Sendable {
    let day: String
    private(set) var byRow: [UUID: String] = [:]

    init(day: String) { self.day = day }

    mutating func set(_ stage: String, for rowID: UUID) { byRow[rowID] = stage }
}
