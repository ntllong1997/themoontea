import Foundation

/// The period a sales summary covers, as one half-open window `[from, to)`.
///
/// Every filter — the preset pills and a hand-picked range alike — reduces to
/// one window, so there is a single rule for "is this order in the period?"
/// rather than one branch per pill. Mirrors `lib/orders/dateRange.js` on the
/// web, so the two tills report the same figures for the same days.
///
/// All arithmetic is local-time on purpose: a stall's trading day is the day
/// the till was open, not a UTC day.
struct DateWindow: Equatable {
    /// Inclusive lower bound. `nil` is open.
    let from: Date?
    /// Exclusive upper bound. `nil` is open.
    let to: Date?

    /// Matches everything, including rows whose timestamp will not parse.
    static let unbounded = DateWindow(from: nil, to: nil)

    /// The whole local day containing `date`.
    static func day(containing date: Date, calendar: Calendar = .current) -> DateWindow {
        let start = calendar.startOfDay(for: date)
        return DateWindow(from: start, to: calendar.date(byAdding: .day, value: 1, to: start))
    }

    /// The last `days` days, counting the day containing `date`.
    ///
    /// Open at the top, matching the pill's long-standing behaviour: a row
    /// dated slightly in the future is still this week's trade.
    static func trailingDays(
        _ days: Int,
        endingOn date: Date,
        calendar: Calendar = .current
    ) -> DateWindow {
        let start = calendar.startOfDay(for: date)
        return DateWindow(from: calendar.date(byAdding: .day, value: -(days - 1), to: start), to: nil)
    }

    /// A hand-picked range. Either end may be `nil` to leave that side open.
    ///
    /// The last day is included in full: a range ending on the 12th must keep
    /// the 12th's evening rush, so the exclusive bound is the 13th's midnight.
    /// Picked back to front, it is read as the range the user meant.
    static func range(
        from first: Date?,
        through last: Date?,
        calendar: Calendar = .current
    ) -> DateWindow {
        let firstDay = first.map { calendar.startOfDay(for: $0) }
        let lastDay = last.map { calendar.startOfDay(for: $0) }

        var earlier = firstDay
        var later = lastDay
        if let a = firstDay, let b = lastDay, a > b {
            earlier = b
            later = a
        }

        return DateWindow(
            from: earlier,
            to: later.flatMap { calendar.date(byAdding: .day, value: 1, to: $0) }
        )
    }

    /// Whether a date falls in the window.
    ///
    /// A missing date is kept only by the fully open window, so rows with an
    /// unreadable timestamp stay visible under "All Time" instead of
    /// vanishing everywhere. Matches how the web summary treats them.
    func contains(_ date: Date?) -> Bool {
        if from == nil && to == nil { return true }
        guard let date else { return false }
        if let from, date < from { return false }
        if let to, date >= to { return false }
        return true
    }

    /// Convenience for the timestamps Supabase hands back as strings.
    func contains(timestamp: String) -> Bool {
        contains(TimestampParser.parse(timestamp))
    }

    /// A human label for the period, so a screenshot of the summary still says
    /// which days it is about.
    var label: String {
        let calendar = Calendar.current
        // `to` is exclusive, so the last day actually included is the one before it.
        let lastDay = to.flatMap { calendar.date(byAdding: .day, value: -1, to: $0) }

        switch (from, lastDay) {
        case (nil, nil):
            return "All time"
        case let (start?, nil):
            return "From \(Self.dayAndYear.string(from: start))"
        case let (nil, end?):
            return "Up to \(Self.dayAndYear.string(from: end))"
        case let (start?, end?):
            if calendar.isDate(start, inSameDayAs: end) {
                return Self.dayAndYear.string(from: start)
            }
            let sameYear = calendar.component(.year, from: start)
                == calendar.component(.year, from: end)
            let opening = sameYear
                ? Self.dayOnly.string(from: start)
                : Self.dayAndYear.string(from: start)
            return "\(opening) – \(Self.dayAndYear.string(from: end))"
        }
    }

    private static let dayOnly = formatter("MMM d")
    private static let dayAndYear = formatter("MMM d, yyyy")

    private static func formatter(_ pattern: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = pattern
        return f
    }
}
