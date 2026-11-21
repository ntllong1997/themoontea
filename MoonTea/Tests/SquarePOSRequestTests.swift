// Tests for SquarePOSRequest (opening Square POS with a ticket's amount, and
// reading what Square sends back). No XCTest target, so it runs as a
// standalone program:
//
//   swiftc -parse-as-library MoonTea/Tests/SquarePOSRequestTests.swift \
//     MoonTea/MoonTea/Services/SquarePOSRequest.swift -o /tmp/square-pos-tests && /tmp/square-pos-tests
//
// Lives outside MoonTea/MoonTea so Xcode does not compile it into the app.

import Foundation

@main
enum SquarePOSRequestTests {
    static func main() {
        var failures = 0
        func check(_ name: String, _ condition: Bool) {
            print(condition ? "PASS" : "FAIL", name)
            if !condition { failures += 1 }
        }

        // MARK: Opening Square

        let url = SquarePOSRequest.paymentURL(
            amountCents: 1250, note: "Moon Tea ticket #12", state: "abc-123", clientID: "sq0idp-test"
        )
        check("builds a square-commerce-v1 payment URL", url?.absoluteString.hasPrefix("square-commerce-v1://payment/create?data=") == true)

        let payload = url.flatMap(Self.payload)
        let money = payload?["amount_money"] as? [String: Any]
        check("amount is in cents", money?["amount"] as? Int == 1250)
        check("currency is USD", money?["currency_code"] as? String == "USD")
        check("note is the ticket", payload?["notes"] as? String == "Moon Tea ticket #12")
        check("state round-trips the request id", payload?["state"] as? String == "abc-123")
        check("client id is the Square app id", payload?["client_id"] as? String == "sq0idp-test")
        check("callback comes back to this app", payload?["callback_url"] as? String == "moontea://square-pos-callback")
        check("uses POS API 1.3", payload?["version"] as? String == "1.3")

        let options = payload?["options"] as? [String: Any]
        check("tax is already in the total, so Square adds none", options?["clear_default_fees"] as? Bool == true)
        check("Square returns here by itself", options?["auto_return"] as? Bool == true)
        check("only card tenders, since the ticket is saved as Card",
              options?["supported_tender_types"] as? [String] == ["CREDIT_CARD", "SQUARE_GIFT_CARD"])

        check("a '#' or '&' in the note cannot break the URL",
              url?.query?.contains("#") == false && url?.query?.contains("&") == false)

        check("no URL for a zero amount", SquarePOSRequest.paymentURL(amountCents: 0, note: "", state: "s", clientID: "id") == nil)
        check("no URL without a Square app id", SquarePOSRequest.paymentURL(amountCents: 100, note: "", state: "s", clientID: " ") == nil)

        check("note wording matches the website", SquarePOSRequest.note(orderNumber: 7) == "Moon Tea ticket #7")

        // MARK: Square's reply

        check("success gives the transaction id and state",
              SquarePOSRequest.response(from: callback(#"{"status":"ok","transaction_id":"tx_9","client_transaction_id":"c_1","state":"abc-123"}"#))
              == .paid(transactionID: "tx_9", state: "abc-123"))
        check("an offline success falls back to the client transaction id",
              SquarePOSRequest.response(from: callback(#"{"status":"ok","client_transaction_id":"c_1","state":"s"}"#))
              == .paid(transactionID: "c_1", state: "s"))
        check("a cancel is an error with its code",
              SquarePOSRequest.response(from: callback(#"{"status":"error","error_code":"payment_canceled","state":"s"}"#))
              == .failed(errorCode: "payment_canceled", state: "s"))
        check("success with no id at all is not trusted as paid",
              SquarePOSRequest.response(from: callback(#"{"status":"ok","state":"s"}"#))
              == .failed(errorCode: "missing_transaction_id", state: "s"))
        check("a URL for something else is ignored",
              SquarePOSRequest.response(from: URL(string: "moontea://other?data=%7B%7D")!) == nil)
        check("garbage data is ignored",
              SquarePOSRequest.response(from: URL(string: "moontea://square-pos-callback?data=nope")!) == nil)

        check("cancel reads plainly", SquarePOSRequest.message(forErrorCode: "payment_canceled") == "The payment was cancelled in Square.")
        check("an unknown code still says something",
              SquarePOSRequest.message(forErrorCode: "weird_code").contains("weird_code"))

        print(failures == 0 ? "All passed" : "\(failures) failed")
        exit(failures == 0 ? 0 : 1)
    }

    static func payload(_ url: URL) -> [String: Any]? {
        guard let data = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "data" })?.value?.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    static func callback(_ json: String) -> URL {
        let encoded = json.addingPercentEncoding(withAllowedCharacters: .alphanumerics)!
        return URL(string: "moontea://square-pos-callback?data=\(encoded)")!
    }
}
