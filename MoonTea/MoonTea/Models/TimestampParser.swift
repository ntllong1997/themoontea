import Foundation

/// Robust timestamp parser. Supabase returns timestamps in several variants
/// depending on the column type (`text` vs `timestamptz`) and PostgREST
/// version: `T` or space separator, 0/3/6 fractional digits, `Z` or
/// `+00:00` or `+00` time-zone suffix. iOS `ISO8601DateFormatter` is
/// strict and rejects most of these — so we try a sequence of formats.
enum TimestampParser {
    static func parse(_ raw: String) -> Date? {
        let s = raw.trimmingCharacters(in: .whitespaces)
        guard !s.isEmpty else { return nil }

        // Fast path: ISO 8601 with `T` separator
        if let d = isoWithFraction.date(from: s) { return d }
        if let d = isoNoFraction.date(from: s) { return d }

        // PostgREST `timestamptz` variants — explicit patterns
        for fmt in fallbackFormatters where fmt.date(from: s) != nil {
            return fmt.date(from: s)
        }

        // Last resort: normalise common deviations and retry ISO8601.
        var normalised = s.replacingOccurrences(of: " ", with: "T")
        // Postgres sometimes emits `+00` (no minutes) — pad to `+00:00`
        if normalised.hasSuffix("+00") || normalised.hasSuffix("-00") {
            normalised += ":00"
        }
        if let d = isoWithFraction.date(from: normalised) { return d }
        if let d = isoNoFraction.date(from: normalised) { return d }
        return nil
    }

    private static let isoWithFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoNoFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let fallbackFormatters: [DateFormatter] = {
        let patterns = [
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXXXX",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXXXX",
            "yyyy-MM-dd HH:mm:ss.SSSSSSXXXXX",
            "yyyy-MM-dd HH:mm:ss.SSSXXXXX",
            "yyyy-MM-dd HH:mm:ssXXXXX",
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSS",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss.SSSSSS",
            "yyyy-MM-dd HH:mm:ss",
        ]
        return patterns.map { pattern in
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.timeZone = TimeZone(identifier: "UTC")
            f.dateFormat = pattern
            return f
        }
    }()
}
