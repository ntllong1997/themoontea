// Tests for ReaderRecovery (bringing back a card reader Square reports as
// unavailable). No XCTest target, so it runs as a standalone program:
//
//   swiftc -parse-as-library MoonTea/Tests/ReaderRecoveryTests.swift \
//     MoonTea/MoonTea/Services/ReaderRecovery.swift -o /tmp/recovery-tests && /tmp/recovery-tests
//
// Lives outside MoonTea/MoonTea so Xcode does not compile it into the app.

import Foundation

@main
enum ReaderRecoveryTests {
    static func main() {
        typealias Reader = ReaderRecovery.Reader
        typealias Attempts = ReaderRecovery.Attempts

        let start = Date(timeIntervalSince1970: 1_000)
        func at(_ seconds: TimeInterval) -> Date { start.addingTimeInterval(seconds) }
        var failures = 0
        func check(_ name: String, _ condition: Bool) {
            print(condition ? "PASS" : "FAIL", name)
            if !condition { failures += 1 }
        }
        /// A reader that went down at `start`, with whatever has been tried since.
        func down(_ configure: (inout Attempts) -> Void = { _ in }) -> Attempts {
            var attempts = Attempts()
            attempts.downSince = start
            configure(&attempts)
            return attempts
        }
        func action(_ reader: Reader, _ attempts: Attempts, charging: Bool = false, at now: Date) -> ReaderRecovery.Action {
            ReaderRecovery.nextAction(for: reader, attempts: attempts, isCharging: charging, now: now)
        }
        func isWorking(_ reader: Reader?, _ attempts: Attempts, at now: Date) -> Bool {
            ReaderRecovery.isWorking(on: reader, attempts: attempts, now: now)
        }

        let refused = Reader(failure: .secureConnection, isRetryable: false, isRebootable: true)
        let offline = Reader(failure: .network, isRetryable: false, isRebootable: true)
        let offlineRetryable = Reader(failure: .network, isRetryable: true, isRebootable: true)
        let switchedOff = Reader(failure: .other, isRetryable: false, isRebootable: true)
        let refusedNoRestart = Reader(failure: .secureConnection, isRetryable: false, isRebootable: false)
        let offlineNoRestart = Reader(failure: .network, isRetryable: false, isRebootable: false)

        // ── Network failure: retry once Square will take it ─────────────────

        // Nov 14 17:49:48 and 20:46:34 — Square refused the retry made the
        // instant the reader dropped, and took one 27 s and 38 s later.
        check("network failure, not retryable yet -> wait",
              action(offline, down(), at: at(0)) == .wait)
        check("network failure, not retryable yet -> staff are told to wait",
              isWorking(offline, down(), at: at(0)))
        check("turns retryable -> retry at once",
              action(offlineRetryable, down(), at: at(4)) == .retry)

        let retriedOnce = down { $0.retries = 1; $0.lastRetryAt = at(4) }
        check("a retry that didn't take, 2 s later -> wait",
              action(offlineRetryable, retriedOnce, at: at(6)) == .wait)
        check("a retry that didn't take, 3 s later -> retry again",
              action(offlineRetryable, retriedOnce, at: at(7)) == .retry)
        check("just after a retry -> staff are told to wait",
              isWorking(offlineNoRestart, retriedOnce, at: at(10)))
        check("a retry long ago and nothing left to try -> staff take over",
              !isWorking(offlineNoRestart, retriedOnce, at: at(20)))

        check("the pause between retries doubles to a ceiling of 30 s",
              [0, 1, 2, 3, 4, 5, 9].map(ReaderRecovery.retryGap(after:)) == [0, 3, 6, 12, 24, 30, 30])

        check("network failure that never turns retryable, 25 s in -> wait",
              action(offline, down(), at: at(25)) == .wait)
        check("network failure that never turns retryable, 30 s in -> restart",
              action(offline, down(), at: at(30)) == .reboot)

        // ── Secure-connection failure: Square never takes a retry ───────────

        // Nov 14 17:22:17 — 8 retries refused over 7 minutes, until staff
        // opened Square's reader screen.
        check("secure connection refused, 5 s in -> wait",
              action(refused, down(), at: at(5)) == .wait)
        check("secure connection refused, 8 s in -> restart",
              action(refused, down(), at: at(8)) == .reboot)
        check("secure connection refused -> staff are told to wait",
              isWorking(refused, down(), at: at(1)))

        // Nov 14 17:03:51 and 19:11:04 — the failure landed on a payment that
        // was approved 2 s and 0.3 s later.
        check("restart is due but a card payment is on screen -> wait",
              action(refused, down(), charging: true, at: at(30)) == .wait)
        check("retry is due but a card payment is on screen -> wait",
              action(offlineRetryable, down(), charging: true, at: at(30)) == .wait)

        let restartedOnce = down { $0.reboots = 1; $0.lastRebootAt = at(8) }
        check("still refused 32 s after a restart -> wait",
              action(refused, restartedOnce, at: at(40)) == .wait)
        check("still refused 60 s after a restart -> restart again",
              action(refused, restartedOnce, at: at(68)) == .reboot)
        check("a restarted reader is off the air -> staff are told to wait",
              isWorking(nil, restartedOnce, at: at(30)))
        check("a restarted reader never came back -> staff take over",
              !isWorking(nil, restartedOnce, at: at(60)))

        let restartedTwice = down { $0.reboots = 2; $0.lastRebootAt = at(68) }
        check("two restarts didn't help -> no third",
              action(refused, restartedTwice, at: at(200)) == .wait)
        check("two restarts didn't help -> staff take over",
              !isWorking(refused, restartedTwice, at: at(200)))

        // ── Readers and failures a restart can't help ───────────────────────

        check("reader can't be restarted from the app -> wait",
              action(refusedNoRestart, down(), at: at(60)) == .wait)
        check("reader can't be restarted from the app -> staff take over",
              !isWorking(refusedNoRestart, down(), at: at(60)))
        check("reader switched off or Bluetooth off -> never restarted",
              action(switchedOff, down(), at: at(600)) == .wait)
        check("reader switched off or Bluetooth off -> staff take over",
              !isWorking(switchedOff, down(), at: at(600)))
        check("no record of when the reader went down -> wait",
              action(refused, Attempts(), at: at(100)) == .wait)

        print(failures == 0 ? "ALL PASSED" : "\(failures) FAILED")
        exit(failures == 0 ? 0 : 1)
    }
}
