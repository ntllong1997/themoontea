import Foundation

/// Square's reply after a hand-off to Square POS.
nonisolated enum SquarePOSResponse: Equatable, Sendable {
    case paid(transactionID: String, state: String?)
    case failed(errorCode: String, state: String?)

    /// The request id sent out as `state`, so a reply is matched to its ticket.
    var state: String? {
        switch self {
        case .paid(_, let state), .failed(_, let state): state
        }
    }
}

/// Square's Point of Sale API on iOS: opening Square POS with a ticket's
/// amount filled in, and reading the reply it sends back to
/// `moontea://square-pos-callback`. Pure, so it is tested on its own
/// (MoonTea/Tests/SquarePOSRequestTests.swift).
///
/// https://developer.squareup.com/docs/pos-api/build-mobile-web
nonisolated enum SquarePOSRequest {
    static let callbackScheme = "moontea"
    static let callbackHost = "square-pos-callback"
    static let callbackURL = "\(callbackScheme)://\(callbackHost)"

    private static let apiVersion = "1.3"
    /// The ticket is saved as Card, so Square only offers card tenders.
    private static let tenderTypes = ["CREDIT_CARD", "SQUARE_GIFT_CARD"]
    /// What `encodeURIComponent` leaves alone; everything else is escaped so
    /// a `#`, `&` or `+` in the JSON can't end or split the query.
    private static let unreservedCharacters = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~"
    )

    /// The note Square saves with the payment. Same wording as the website.
    static func note(orderNumber: Int) -> String { "Moon Tea ticket #\(orderNumber)" }

    /// The URL that opens Square POS ready to charge `amountCents`, or nil
    /// when there is nothing valid to charge or no Square app id.
    static func paymentURL(amountCents: Int, note: String, state: String, clientID: String) -> URL? {
        let cleanClientID = clientID.trimmingCharacters(in: .whitespaces)
        guard amountCents > 0, !cleanClientID.isEmpty else { return nil }

        let payload: [String: Any] = [
            "amount_money": ["amount": amountCents, "currency_code": "USD"],
            "callback_url": callbackURL,
            "client_id": cleanClientID,
            "version": apiVersion,
            "notes": note,
            "state": state,
            "options": [
                // The ticket total already includes tax.
                "clear_default_fees": true,
                "auto_return": true,
                "supported_tender_types": tenderTypes,
            ],
        ]
        guard let json = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
              let text = String(data: json, encoding: .utf8),
              let encoded = text.addingPercentEncoding(withAllowedCharacters: unreservedCharacters)
        else { return nil }
        return URL(string: "square-commerce-v1://payment/create?data=\(encoded)")
    }

    /// Square's reply, or nil when the URL isn't one (or can't be read).
    static func response(from url: URL) -> SquarePOSResponse? {
        guard url.scheme == callbackScheme, url.host == callbackHost,
              let raw = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "data" })?.value,
              let data = raw.data(using: .utf8),
              let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        else { return nil }

        let state = body["state"] as? String
        guard body["status"] as? String == "ok" else {
            return .failed(errorCode: body["error_code"] as? String ?? "unknown_error", state: state)
        }
        // Offline payments come back with only the client-side id.
        let transactionID = (body["transaction_id"] as? String) ?? (body["client_transaction_id"] as? String)
        guard let transactionID, !transactionID.isEmpty else {
            return .failed(errorCode: "missing_transaction_id", state: state)
        }
        return .paid(transactionID: transactionID, state: state)
    }

    /// What staff read when Square didn't take the payment.
    static func message(forErrorCode code: String) -> String {
        switch code {
        case "payment_canceled":
            "The payment was cancelled in Square."
        case "not_logged_in", "user_not_logged_in", "user_not_active":
            "Log in to Square POS on this phone, then try again."
        case "client_not_authorized":
            "Square POS hasn't approved this app yet. Add the bundle ID and callback URL in the Square Developer Dashboard."
        case "no_network_connection":
            "Square POS has no internet connection."
        case "amount_too_small":
            "That amount is below Square's card minimum."
        case "amount_too_large":
            "That amount is above Square's card limit."
        default:
            "Square couldn't take the payment (\(code)). Check Square POS before confirming."
        }
    }
}
