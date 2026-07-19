import Foundation

/// One pending receipt. Persisted to disk by `PrintQueueStore` so a job
/// survives an app kill or crash while the printer is unreachable — printing
/// must never silently drop a receipt just because the app relaunched.
// `nonisolated`: the project defaults new types to `@MainActor`
// (SWIFT_DEFAULT_ACTOR_ISOLATION), but this needs to be constructed and
// encoded from `PrintManager`'s background actor.
nonisolated struct PrintJob: Codable, Identifiable {
    let id: UUID
    let orderNumber: String
    let payload: EpsonPrinter.ReceiptPayload
    let createdAt: Date
    var attempts: Int

    init(orderNumber: String, payload: EpsonPrinter.ReceiptPayload) {
        self.id = UUID()
        self.orderNumber = orderNumber
        self.payload = payload
        self.createdAt = Date()
        self.attempts = 0
    }
}
