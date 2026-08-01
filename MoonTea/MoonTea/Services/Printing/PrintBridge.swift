import Foundation

/// One row of `public.print_jobs`.
///
/// Property names are snake_case to match PostgREST's JSON exactly, matching
/// how the `Patch` structs in `SupabaseService` are written.
nonisolated struct PrintJobRow: Codable, Sendable, Identifiable {
    let id: String
    let order_number: Int
    let order_timestamp: String
    let status: String
    let attempts: Int
}

/// Turns `print_jobs` rows into receipts on this device's printer.
///
/// Only one device in the shop should run this — the one physically next to
/// the printer. Everything else (web tills, other phones) just enqueues.
///
/// Ordering of operations matters and is deliberate:
///   1. claim atomically, so two devices never take the same job
///   2. enqueue to `PrintManager`, which owns durability and retry
///   3. flip to 'printed' only from `PrintManager`'s success callback
///
/// If this device dies between 2 and 3, the row stays 'claimed' and the reaper
/// releases it after `staleClaimTimeout`. That can reprint a receipt — chosen
/// deliberately over the alternative, which loses one.
///
/// iOS suspends backgrounded apps within ~30s, which stops this loop. The
/// print-station device must stay foregrounded and powered; there is no code
/// fix for that.
actor PrintBridge {
    private let supabase: SupabaseService
    private let printer: EpsonPrinter
    private let deviceName: String
    private let cashappURL: String

    /// Safety poll. Realtime is the fast path once `print_jobs` is added to the
    /// `supabase_realtime` publication; this catches anything a dropped
    /// websocket missed.
    private static let pollInterval: Duration = .seconds(3)
    private static let staleClaimTimeout: TimeInterval = 120
    private static let maxAttempts = 5

    private var loop: Task<Void, Never>?

    /// orderNumber → print_jobs.id, so `PrintManager`'s success callback can
    /// find the row to mark. In-memory only: a job whose device restarted
    /// mid-print is recovered by the reaper instead.
    private var inFlight: [String: String] = [:]

    init(
        supabase: SupabaseService = .shared,
        printer: EpsonPrinter = .shared,
        deviceName: String = "ios-bridge",
        cashappURL: String = AppConstants.defaultCashAppURL
    ) {
        self.supabase = supabase
        self.printer = printer
        self.deviceName = deviceName
        self.cashappURL = cashappURL
    }

    func start() async {
        guard loop == nil else { return }

        await printer.setPrintedHandler { [weak self] orderNumber in
            await self?.handlePrinted(orderNumber: orderNumber)
        }

        loop = Task { [weak self] in
            while !Task.isCancelled {
                await self?.pollOnce()
                try? await Task.sleep(for: Self.pollInterval)
            }
        }
    }

    func stop() async {
        loop?.cancel()
        loop = nil
        await printer.setPrintedHandler(nil)
    }

    /// One sweep: release abandoned claims, then take whatever is pending.
    func pollOnce() async {
        await releaseStaleClaims()

        do {
            for job in try await supabase.pendingPrintJobs() {
                await process(job)
            }
        } catch {
            // Transient — the next tick retries. Logged, never swallowed.
            print("[print-bridge] could not read pending jobs: \(error)")
        }
    }

    private func process(_ job: PrintJobRow) async {
        do {
            guard try await supabase.claimPrintJob(id: job.id, deviceName: deviceName) else {
                return // another device won it
            }

            let rows = try await supabase.orderRows(
                orderNumber: job.order_number,
                timestamp: job.order_timestamp
            )
            guard !rows.isEmpty else {
                // The job outlived its order — retiring beats retrying forever.
                try await supabase.releasePrintJob(
                    id: job.id,
                    attempts: Self.maxAttempts,
                    message: "No order rows for \(job.order_number) at \(job.order_timestamp)",
                    retire: true
                )
                return
            }

            let payload = Self.makePayload(
                orderNumber: job.order_number,
                rows: rows,
                cashappURL: cashappURL
            )
            inFlight[payload.orderNumber] = job.id
            await printer.print(payload)
        } catch {
            print("[print-bridge] job \(job.id) failed: \(error)")
            try? await supabase.releasePrintJob(
                id: job.id,
                attempts: job.attempts + 1,
                message: error.localizedDescription,
                retire: job.attempts + 1 >= Self.maxAttempts
            )
        }
    }

    /// Called by `PrintManager` once the printer has taken the receipt.
    private func handlePrinted(orderNumber: String) async {
        guard let jobID = inFlight.removeValue(forKey: orderNumber) else { return }
        do {
            try await supabase.markPrintJobPrinted(id: jobID)
        } catch {
            // The row stays 'claimed'; the reaper will release it and the
            // receipt reprints. Duplicate beats lost.
            print("[print-bridge] printed but could not mark \(jobID): \(error)")
        }
    }

    private func releaseStaleClaims() async {
        let cutoff = Date().addingTimeInterval(-Self.staleClaimTimeout)
        do {
            for job in try await supabase.stalePrintJobs(olderThan: cutoff) {
                try await supabase.releasePrintJob(
                    id: job.id,
                    attempts: job.attempts,
                    message: "Reclaimed after \(Int(Self.staleClaimTimeout))s",
                    retire: job.attempts >= Self.maxAttempts
                )
            }
        } catch {
            print("[print-bridge] could not release stale claims: \(error)")
        }
    }

    /// Collapses one-row-per-unit into printable lines.
    ///
    /// Rows are per unit, so three of the same drink are three rows; the
    /// receipt shows one line with a quantity, matching the till.
    nonisolated static func makePayload(
        orderNumber: Int,
        rows: [Order],
        now: Date = Date(),
        cashappURL: String
    ) -> EpsonPrinter.ReceiptPayload {
        var order: [String] = []
        var totals: [String: (qty: Int, price: Double)] = [:]

        for row in rows {
            if totals[row.name] == nil {
                order.append(row.name)
                totals[row.name] = (0, row.price)
            }
            totals[row.name]?.qty += 1
        }

        let lines = order.map { name in
            EpsonPrinter.ReceiptPayload.LineItem(
                name: name,
                qty: totals[name]?.qty ?? 1,
                price: totals[name]?.price ?? 0
            )
        }

        let subtotal = rows.reduce(0) { $0 + $1.price }
        let tax = subtotal * AppConstants.taxRate

        let df = DateFormatter()
        df.dateFormat = "MMM d, yyyy h:mm a"

        return EpsonPrinter.ReceiptPayload(
            orderNumber: String(orderNumber),
            lines: lines,
            cartSubtotal: subtotal,
            discountAmount: 0,
            subtotal: subtotal,
            tax: tax,
            total: subtotal + tax,
            paymentMethod: rows.first?.paymentMethod ?? "",
            dateString: df.string(from: now),
            cashappURL: cashappURL,
            cashTag: cashappURL.replacingOccurrences(of: "https://cash.app/", with: "")
        )
    }
}
