import Foundation

/// Decides how to bring back a paired card reader that Square reports as
/// unavailable, without staff leaving the order screen.
///
/// The reader re-establishes its secure connection to Square about every five
/// minutes. On 2026-11-14 that failed 5 times in 51, and each time the reader
/// then sat unavailable until staff opened Square's reader screen or
/// restarted the app (29 seconds to 7.5 minutes). The app's only retry went
/// out the instant the reader dropped, when Square still refused it.
///
/// - A network failure becomes retryable some seconds later: retry it then,
///   and keep retrying.
/// - A secure-connection failure never becomes retryable (14 retries refused
///   that day, over up to 7 minutes): restart the reader instead, which is
///   what switching it off and on by hand does.
///
/// Kept free of the Square SDK so it can be tested on its own.
enum ReaderRecovery {
    enum Action {
        /// Leave the reader alone for now.
        case wait
        /// Ask Square to reconnect the reader's session.
        case retry
        /// Restart the reader itself.
        case reboot
    }

    /// Why Square can't use the reader, as far as recovery cares.
    enum Failure {
        /// Square failed or refused the reader's secure connection.
        case secureConnection
        /// The secure connection failed because of the phone's internet.
        case network
        /// Anything else: Bluetooth off, a firmware update, the reader out of
        /// range or switched off. Restarting it wouldn't help or isn't safe.
        case other
    }

    /// One look at an unavailable reader.
    struct Reader {
        var failure: Failure
        /// Square will accept a retry for this reader now.
        var isRetryable: Bool
        /// The reader can be restarted from the app.
        var isRebootable: Bool
    }

    /// What has been tried since the reader last worked.
    struct Attempts {
        /// When the reader was first seen unavailable.
        var downSince: Date?
        var retries = 0
        var lastRetryAt = Date.distantPast
        var reboots = 0
        var lastRebootAt = Date.distantPast
    }

    /// How long a secure-connection failure is left before the reader is
    /// restarted. Covers a payment the failure landed on finishing first:
    /// two were approved 0.3 s and 2 s after it on 2026-11-14.
    static let secureConnectionRebootDelay: TimeInterval = 8
    /// A network failure can turn retryable, which is far quicker than a
    /// restart, so it gets longer before the reader is restarted. Square took
    /// a retry 27 s and 38 s after the two on 2026-11-14, though those were
    /// the first times it was asked again.
    static let networkRebootDelay: TimeInterval = 30
    /// A restarted reader gets this long to come back before another restart.
    static let rebootGap: TimeInterval = 60
    /// Restarts per outage. After that it's left to staff, as before.
    static let maxReboots = 2
    /// How long staff are told to wait after a retry or a restart goes out.
    static let retrySettle: TimeInterval = 10
    static let rebootSettle: TimeInterval = 45

    /// The pause before the next retry: none before the first, then 3 s,
    /// doubling to a ceiling of 30 s, so a long internet outage is retried
    /// steadily without filling the activity log.
    static func retryGap(after retries: Int) -> TimeInterval {
        guard retries > 0 else { return 0 }
        return min(3 * pow(2, Double(min(retries, 5) - 1)), 30)
    }

    /// What to do about an unavailable reader right now.
    static func nextAction(for reader: Reader, attempts: Attempts, isCharging: Bool, now: Date) -> Action {
        // Never touch the reader while a card payment is on screen.
        guard !isCharging else { return .wait }

        if reader.isRetryable {
            let isDue = now.timeIntervalSince(attempts.lastRetryAt) >= retryGap(after: attempts.retries)
            return isDue ? .retry : .wait
        }

        guard let delay = rebootDelay(after: reader.failure),
              reader.isRebootable,
              attempts.reboots < maxReboots,
              let downSince = attempts.downSince,
              now.timeIntervalSince(downSince) >= delay,
              now.timeIntervalSince(attempts.lastRebootAt) >= rebootGap else { return .wait }
        return .reboot
    }

    /// Whether the app is still bringing the reader back on its own, so staff
    /// should wait instead of opening Square's reader screen. `reader` is nil
    /// while a restarted reader is off the air.
    static func isWorking(on reader: Reader?, attempts: Attempts, now: Date) -> Bool {
        if now.timeIntervalSince(attempts.lastRebootAt) < rebootSettle { return true }
        if now.timeIntervalSince(attempts.lastRetryAt) < retrySettle { return true }
        guard let reader else { return false }
        if reader.isRetryable { return true }
        return rebootDelay(after: reader.failure) != nil
            && reader.isRebootable
            && attempts.reboots < maxReboots
    }

    /// How long this kind of failure is left before a restart, or nil when a
    /// restart is never the answer.
    private static func rebootDelay(after failure: Failure) -> TimeInterval? {
        switch failure {
        case .secureConnection: return secureConnectionRebootDelay
        case .network:          return networkRebootDelay
        case .other:            return nil
        }
    }
}
