import Foundation
import UIKit

/// Prints website orders on this iPad as they come in.
///
/// Every few seconds, while the app is open and a printer has been set up,
/// it asks the database for unprinted online orders. The database gives each
/// order to exactly one device (`claim_online_orders`), so two iPads never
/// print the same order. Each order is handed to the normal print queue —
/// which keeps it and retries until the printer takes it — and then marked
/// printed. If the app dies between claiming and queuing, the claim lapses
/// after 2 minutes and the order is offered again.
@MainActor
final class OnlineOrderPrinter {
    static let shared = OnlineOrderPrinter()

    private static let pollInterval: Duration = .seconds(5)
    private var task: Task<Void, Never>?

    /// Stable per install, so a claim and its "printed" mark match.
    private let deviceID = "ipad-" + (UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString)

    func start() {
        guard task == nil else { return }
        task = Task { [weak self] in
            while !Task.isCancelled {
                await self?.pollOnce()
                try? await Task.sleep(for: Self.pollInterval)
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    private func pollOnce() async {
        // No printer set up on this iPad: leave online orders for one that has.
        guard EpsonPrinter.shared.hasSavedPrinter else { return }
        do {
            let orders = try await SupabaseService.shared.claimOnlineOrders(device: deviceID)
            for order in orders {
                await EpsonPrinter.shared.print(Self.payload(for: order))
                try await SupabaseService.shared.markOnlineOrderPrinted(id: order.id, device: deviceID)
            }
        } catch {
            print("[online-print] \(error.localizedDescription)")
        }
    }

    private static func payload(for order: SupabaseService.OnlineOrderToPrint) -> EpsonPrinter.ReceiptPayload {
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US")
        df.dateFormat = "MMM d, yyyy h:mm a"
        let url = CashAppStore.shared.activeURL
        return EpsonPrinter.ReceiptPayload(
            orderNumber: String(order.order_number),
            lines: order.items.map { .init(name: $0.name, qty: $0.qty, price: $0.price) },
            cartSubtotal: order.subtotal,
            discountAmount: 0,
            subtotal: order.subtotal,
            tax: order.tax,
            total: order.total,
            paymentMethod: "Card (online)",
            dateString: df.string(from: Date()),
            cashappURL: url,
            cashTag: url.replacingOccurrences(of: "https://cash.app/", with: ""),
            isOnline: true,
            customerName: order.customer_name,
            note: order.note
        )
    }
}
