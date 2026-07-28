import Foundation

/// Trivial JSON-file persistence for the pending print queue. This is what
/// lets a queued receipt survive an app kill/crash while the printer is
/// unreachable, instead of only living in memory.
// `nonisolated`: called synchronously from `PrintManager`'s background actor;
// the project defaults new types to `@MainActor` otherwise.
nonisolated enum PrintQueueStore {
    private static let fileName = "pending-print-jobs.json"

    private static var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent(fileName)
    }

    static func load() -> [PrintJob] {
        guard let data = try? Data(contentsOf: fileURL) else { return [] }
        return (try? JSONDecoder().decode([PrintJob].self, from: data)) ?? []
    }

    static func save(_ jobs: [PrintJob]) {
        let dir = fileURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        guard let data = try? JSONEncoder().encode(jobs) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
