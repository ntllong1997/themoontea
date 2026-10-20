import Foundation

/// Tells a card payment that Square cancelled because the reader dropped off
/// mid-payment from one staff cancelled on purpose.
///
/// The reader re-establishes its secure connection to Square every few
/// minutes, often right as a payment starts. When that lands mid-payment,
/// Square either cancels the payment itself or leaves its screen frozen
/// until staff cancel it. Kept free of the Square SDK so it can be tested on
/// its own.
enum ReaderInterruption {
    /// How long after the reader dropped a cancel still counts as the
    /// reader's doing. Covers a frozen screen staff gave up on — 13 s and
    /// 24 s after the drop on 2026-10-18 — while a cancel long after the
    /// reader recovered is taken as staff meaning it.
    static let cancelWindow: TimeInterval = 30

    /// True when the reader isn't ready as the cancel arrives, or dropped
    /// after the payment started and no more than `cancelWindow` before it.
    static func didCutOffCharge(startedAt: Date, cancelledAt: Date, lastReaderDropAt: Date, isReaderReadyNow: Bool) -> Bool {
        guard isReaderReadyNow else { return true }
        return lastReaderDropAt >= startedAt
            && cancelledAt.timeIntervalSince(lastReaderDropAt) <= cancelWindow
    }
}
