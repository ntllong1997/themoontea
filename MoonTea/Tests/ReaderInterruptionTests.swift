// Tests for ReaderInterruption (the decision to reopen a card payment the
// reader cut off). No XCTest target, so it runs as a standalone program:
//
//   swiftc -parse-as-library MoonTea/Tests/ReaderInterruptionTests.swift \
//     MoonTea/MoonTea/Services/ReaderInterruption.swift -o /tmp/reader-tests && /tmp/reader-tests
//
// Lives outside MoonTea/MoonTea so Xcode does not compile it into the app.

import Foundation

@main
enum ReaderInterruptionTests {
    static func main() {
        let start = Date(timeIntervalSince1970: 1_000)
        func at(_ seconds: TimeInterval) -> Date { start.addingTimeInterval(seconds) }
        var failures = 0
        func check(_ name: String, _ condition: Bool) {
            print(condition ? "PASS" : "FAIL", name)
            if !condition { failures += 1 }
        }

        // Oct 18 15:20:41 — reader dropped 0.8s in, Square cancelled 1.6s later.
        check("drop just after start, cancel right after -> cut off",
              ReaderInterruption.didCutOffCharge(startedAt: start, cancelledAt: at(2.4), lastReaderDropAt: at(0.8), isReaderReadyNow: true))
        // Oct 18 16:02:09 — dropped 9.6s in, screen froze, staff cancelled 12.9s after the drop.
        check("frozen screen cancelled 13s after the drop -> cut off",
              ReaderInterruption.didCutOffCharge(startedAt: start, cancelledAt: at(22.5), lastReaderDropAt: at(9.6), isReaderReadyNow: true))
        // Oct 18 16:41:33 — dropped 2.1s in, staff cancelled 24.2s after the drop.
        check("frozen screen cancelled 24s after the drop -> cut off",
              ReaderInterruption.didCutOffCharge(startedAt: start, cancelledAt: at(26.3), lastReaderDropAt: at(2.1), isReaderReadyNow: true))
        check("reader still not ready when the cancel arrives -> cut off",
              ReaderInterruption.didCutOffCharge(startedAt: start, cancelledAt: at(3), lastReaderDropAt: .distantPast, isReaderReadyNow: false))
        check("drop exactly at the start -> cut off",
              ReaderInterruption.didCutOffCharge(startedAt: start, cancelledAt: at(1), lastReaderDropAt: start, isReaderReadyNow: true))

        check("drop 20s in, staff cancel 40s after it (customer paying cash) -> not cut off",
              !ReaderInterruption.didCutOffCharge(startedAt: start, cancelledAt: at(60), lastReaderDropAt: at(20), isReaderReadyNow: true))
        check("staff cancel, reader steady, last drop 2 min before the start -> not cut off",
              !ReaderInterruption.didCutOffCharge(startedAt: start, cancelledAt: at(2), lastReaderDropAt: at(-120), isReaderReadyNow: true))
        check("no drop ever recorded, reader ready -> not cut off",
              !ReaderInterruption.didCutOffCharge(startedAt: start, cancelledAt: at(2), lastReaderDropAt: .distantPast, isReaderReadyNow: true))

        print(failures == 0 ? "ALL PASSED" : "\(failures) FAILED")
        exit(failures == 0 ? 0 : 1)
    }
}
