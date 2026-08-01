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

    /// Notified with a job's `orderNumber` once the printer has actually taken
    /// it. `PrintBridge` uses this to flip the Supabase row to 'printed' —
    /// which must happen here, not at `enqueue`, because enqueue returns long
    /// before anything is on paper.
    private var onPrinted: (@Sendable (String) async -> Void)?

    init(transport: PrinterTransport, targetProvider: @escaping () -> String?) {
        self.transport = transport
        self.targetProvider = targetProvider
        self.jobs = PrintQueueStore.load()
    }

    func setOnPrinted(_ handler: (@Sendable (String) async -> Void)?) {
        onPrinted = handler
    }

    var pendingCount: Int { jobs.count }

    func enqueue(orderNumber: String, payload: EpsonPrinter.ReceiptPayload) {
        jobs.append(PrintJob(orderNumber: orderNumber, payload: payload))
        PrintQueueStore.save(jobs)
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
                return
            }
            do {
                try await transport.send(job.payload, target: target)
                jobs.removeFirst()
                PrintQueueStore.save(jobs)
                await onPrinted?(job.orderNumber)
            } catch {
                await backoff(afterAttempt: job.attempts)
                if let idx = jobs.firstIndex(where: { $0.id == job.id }) {
                    jobs[idx].attempts += 1
                    PrintQueueStore.save(jobs)
                }
            }
        }
    }

    private func backoff(afterAttempt attempt: Int) async {
        let seconds = attempt < Self.backoffSchedule.count ? Self.backoffSchedule[attempt] : Self.steadyBackoff
        try? await Task.sleep(nanoseconds: seconds * 1_000_000_000)
    }
}
