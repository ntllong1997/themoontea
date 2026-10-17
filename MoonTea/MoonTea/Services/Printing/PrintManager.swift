import Foundation

/// Owns the durable FIFO print queue. `enqueue` returns immediately — the
/// actual printing (and any retrying) happens in the background, so nothing
/// upstream (checkout, reprint) ever blocks on a slow or disconnected printer.
///
/// A job is only ever removed from the queue after `PrinterTransport.send`
/// succeeds. On failure the same head job is retried with backoff instead of
/// being dropped or skipped — a stuck printer just backs up the queue
/// (visible via `pendingCount`), matching "never lose queued receipts."
actor PrintManager {
    private let transport: PrinterTransport
    private let targetProvider: () -> String?
    private var jobs: [PrintJob]
    private var isProcessing = false

    private static let backoffSchedule: [UInt64] = [5, 15, 30] // seconds
    private static let steadyBackoff: UInt64 = 30

    init(transport: PrinterTransport, targetProvider: @escaping () -> String?) {
        self.transport = transport
        self.targetProvider = targetProvider
        self.jobs = PrintQueueStore.load()
        if !jobs.isEmpty {
            ActivityLog.shared.info(.printer, "Unprinted receipts left from last run", [
                "count": jobs.count, "orders": jobs.map(\.orderNumber).joined(separator: ", "),
            ])
        }
    }

    var pendingCount: Int { jobs.count }

    func enqueue(orderNumber: String, payload: EpsonPrinter.ReceiptPayload) {
        jobs.append(PrintJob(orderNumber: orderNumber, payload: payload))
        PrintQueueStore.save(jobs)
        ActivityLog.shared.info(.printer, "Receipt queued", ["order": orderNumber, "waiting": jobs.count])
        Task { await processQueue() }
    }

    /// Restarts processing after being idle (e.g. app launch with jobs left
    /// over from a previous run, or the transport reconnecting).
    func resume() {
        Task { await processQueue() }
    }

    private func processQueue() async {
        guard !isProcessing else { return }
        isProcessing = true
        defer { isProcessing = false }

        while let job = jobs.first {
            guard let target = targetProvider(), !target.isEmpty else {
                // No printer configured — nothing to do until one is saved.
                ActivityLog.shared.warning(.printer, "Receipts waiting but no printer is selected", ["waiting": jobs.count])
                return
            }
            do {
                try await transport.send(job.payload, target: target)
                jobs.removeFirst()
                PrintQueueStore.save(jobs)
            } catch {
                ActivityLog.shared.warning(.printer, "Print attempt failed, will retry", [
                    "order": job.orderNumber,
                    "attempt": job.attempts + 1,
                    "retryInSeconds": Int(Self.delay(afterAttempt: job.attempts)),
                    "waiting": jobs.count,
                    "error": error,
                ])
                await backoff(afterAttempt: job.attempts)
                if let idx = jobs.firstIndex(where: { $0.id == job.id }) {
                    jobs[idx].attempts += 1
                    PrintQueueStore.save(jobs)
                }
            }
        }
    }

    private nonisolated static func delay(afterAttempt attempt: Int) -> UInt64 {
        attempt < backoffSchedule.count ? backoffSchedule[attempt] : steadyBackoff
    }

    private func backoff(afterAttempt attempt: Int) async {
        try? await Task.sleep(nanoseconds: Self.delay(afterAttempt: attempt) * 1_000_000_000)
    }
}
