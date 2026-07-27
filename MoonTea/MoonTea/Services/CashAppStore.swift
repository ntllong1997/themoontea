import Foundation

@MainActor
@Observable
final class CashAppStore {
    static let shared = CashAppStore()

    private let tagsKey = "cashappTags"
    private let activeKey = "cashappActive"
    private let seededKey = "cashappSeeded_v1"

    /// One-time defaults seeded on first launch. The leading `$` / `@` is stripped
    /// by `addTag` so plain handles are fine. The first entry becomes active.
    private static let defaultHandles = ["themoontea", "ThiLNguyen", "MichaelNguyen44"]

    private(set) var tags: [String] = []
    private(set) var active: String = ""

    private init() {
        if let raw = UserDefaults.standard.data(forKey: tagsKey),
           let decoded = try? JSONDecoder().decode([String].self, from: raw) {
            self.tags = decoded
        }
        self.active = UserDefaults.standard.string(forKey: activeKey) ?? ""
        seedDefaultsIfNeeded()
    }

    private func seedDefaultsIfNeeded() {
        let alreadySeeded = UserDefaults.standard.bool(forKey: seededKey)
        guard !alreadySeeded else { return }
        for handle in Self.defaultHandles { addTag(handle) }
        UserDefaults.standard.set(true, forKey: seededKey)
    }

    var activeURL: String {
        active.isEmpty ? AppConstants.defaultCashAppURL : active
    }

    func addTag(_ raw: String) {
        let clean = raw.trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "^[@$]", with: "", options: .regularExpression)
        guard !clean.isEmpty else { return }
        let url = "https://cash.app/$\(clean)"
        guard !tags.contains(url) else { return }
        tags.append(url)
        if active.isEmpty { active = url }
        persist()
    }

    func remove(_ url: String) {
        tags.removeAll { $0 == url }
        if active == url { active = tags.first ?? "" }
        persist()
    }

    func setActive(_ url: String) {
        active = url
        persist()
    }

    static func displayTag(_ url: String) -> String {
        url.replacingOccurrences(of: "https://cash.app/", with: "")
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(tags) {
            UserDefaults.standard.set(data, forKey: tagsKey)
        }
        UserDefaults.standard.set(active, forKey: activeKey)
    }
}
