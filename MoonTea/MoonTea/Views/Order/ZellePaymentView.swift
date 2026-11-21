import SwiftUI

/// The Zelle step of the payment page: the shop's Zelle QR for the customer
/// to scan from Zelle in their bank app, with the amount and ticket to type.
/// The first time on a phone it asks for the shop's Zelle details instead.
/// Showing the code is the "are you sure" step, so there is no second ask.
struct ZellePaymentView: View {
    let total: Double
    let orderNumber: Int
    let onPaid: () -> Void
    let onBack: () -> Void

    @State private var store = ZelleStore.shared
    @State private var isEditing = false
    @State private var nameInput = ""
    @State private var recipientInput = ""
    @State private var setupError = ""

    var body: some View {
        if isEditing || store.qrURL == nil {
            setup
        } else if let url = store.qrURL {
            code(url)
        }
    }

    private func code(_ url: String) -> some View {
        VStack(spacing: 14) {
            Text("Scan in your bank app's Zelle")
                .font(.system(size: 16, weight: .semibold))
            if let image = PaymentSheet.qrCode(url) {
                Image(uiImage: image)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 230, height: 230)
                    .padding(12)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Theme.cardBorder, lineWidth: 0.5)
                    )
                    .accessibilityLabel("Zelle QR code for \(store.name)")
            }
            Text("\(store.name) · \(store.recipient)")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(.purple)
            Text("Bank app → Zelle → Send → scan. Type $\(total.fmt2) and “ticket #\(orderNumber)”. Only confirm once you see the payment.")
                .font(.system(size: 12))
                .foregroundStyle(Theme.mutedText)
                .multilineTextAlignment(.center)
            Button(action: onPaid) {
                Text("Paid by Zelle")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(.black)
            Button("Not yet", action: onBack)
                .font(.system(size: 15, weight: .semibold))
            Button("Change Zelle details") { startEditing() }
                .font(.system(size: 12))
                .foregroundStyle(Theme.mutedText)
        }
        .frame(maxWidth: .infinity)
    }

    private var setup: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Set up the shop's Zelle once on this phone")
                .font(.system(size: 16, weight: .semibold))
            Text("Copy both exactly as your bank's own Zelle QR code shows them (Zelle → My QR code). Some banks, like Bank of America, reject the code if the name differs.")
                .font(.system(size: 12))
                .foregroundStyle(Theme.mutedText)
            TextField("Name as Zelle shows it (e.g. THANH)", text: $nameInput)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.words)
            TextField("Zelle email or US phone", text: $recipientInput)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
            if !setupError.isEmpty {
                Text(setupError)
                    .font(.system(size: 13))
                    .foregroundStyle(.red)
            }
            Button {
                if let problem = store.save(name: nameInput, recipient: recipientInput) {
                    setupError = problem
                } else {
                    setupError = ""
                    isEditing = false
                }
            } label: {
                Text("Save Zelle details")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(.purple)
            Button("Not yet", action: onBack)
                .font(.system(size: 15, weight: .semibold))
                .frame(maxWidth: .infinity)
        }
        .onAppear { if nameInput.isEmpty { nameInput = store.name } }
    }

    private func startEditing() {
        nameInput = store.name
        recipientInput = store.recipient
        isEditing = true
    }
}
