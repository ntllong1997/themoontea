// Tests for ZelleQR (the shop's Zelle QR link). No XCTest target, so it runs
// as a standalone program:
//
//   swiftc -parse-as-library MoonTea/Tests/ZelleQRTests.swift \
//     MoonTea/MoonTea/Services/ZelleQR.swift -o /tmp/zelle-tests && /tmp/zelle-tests
//
// Mirrors lib/orders/zelle.test.js so the app and website make the same code.

import Foundation

@main
enum ZelleQRTests {
    static func main() {
        var failures = 0
        func check(_ name: String, _ condition: Bool) {
            print(condition ? "PASS" : "FAIL", name)
            if !condition { failures += 1 }
        }

        check("email is trimmed and lowercased", ZelleQR.recipient("  Pay@TheMoonTea.com ") == "pay@themoontea.com")
        check("US phone keeps its 10 digits", ZelleQR.recipient("(714) 555-0123") == "7145550123")
        check("+1 is dropped from a phone", ZelleQR.recipient("+1 714 555 0123") == "7145550123")
        check("blank is not a recipient", ZelleQR.recipient("") == nil)
        check("a handle is not a recipient", ZelleQR.recipient("themoontea") == nil)
        check("a 7-digit phone is not a recipient", ZelleQR.recipient("555-0123") == nil)
        check("an email without a dot is not a recipient", ZelleQR.recipient("a@b") == nil)

        let url = ZelleQR.url(name: " The Moon Tea ", recipient: "Pay@TheMoonTea.com")
        check("uses the Zelle QR link", url?.hasPrefix("https://enroll.zellepay.com/qr-codes?data=") == true)
        let payload = url.flatMap(Self.payload)
        check("name is upper-cased", payload?["name"] == "THE MOON TEA")
        check("token is the normalized recipient", payload?["token"] == "pay@themoontea.com")
        check("action is payment", payload?["action"] == "payment")
        // Laid out like a real bank-made Zelle code; Bank of America rejected
        // the one-line form. Same expected links as lib/orders/zelle.test.js.
        check("phone link is byte-for-byte Zelle's own",
              ZelleQR.url(name: "Thanh", recipient: "(714) 555-0123")
              == "https://enroll.zellepay.com/qr-codes?data=ewogICJhY3Rpb24iIDogInBheW1lbnQiLAogICJuYW1lIiA6ICJUSEFOSCIsCiAgInRva2VuIiA6ICI3MTQ1NTUwMTIzIgp9")
        check("email link is byte-for-byte Zelle's own",
              ZelleQR.url(name: "The Moon Tea", recipient: "pay@themoontea.com")
              == "https://enroll.zellepay.com/qr-codes?data=ewogICJhY3Rpb24iIDogInBheW1lbnQiLAogICJuYW1lIiA6ICJUSEUgTU9PTiBURUEiLAogICJ0b2tlbiIgOiAicGF5QHRoZW1vb250ZWEuY29tIgp9")
        check("no link with a bad recipient", ZelleQR.url(name: "The Moon Tea", recipient: "nope") == nil)
        check("no link without a name", ZelleQR.url(name: "  ", recipient: "7145550123") == nil)

        print(failures == 0 ? "All passed" : "\(failures) failed")
        exit(failures == 0 ? 0 : 1)
    }

    static func payload(_ url: String) -> [String: String]? {
        guard let data = URLComponents(string: url)?.queryItems?.first(where: { $0.name == "data" })?.value,
              let json = Data(base64Encoded: data) else { return nil }
        return (try? JSONSerialization.jsonObject(with: json)) as? [String: String]
    }
}
