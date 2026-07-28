import SwiftUI

struct CashAppView: View {
    @State private var store = CashAppStore.shared
    @State private var input: String = ""
    @State private var savedFlash: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                activeBanner
                tagList
                addBox
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("CashApp Tags")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var activeBanner: some View {
        Card {
            VStack(alignment: .leading, spacing: 4) {
                Text("Active tag (prints on receipts)")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.mutedText)
                if store.active.isEmpty {
                    Text("None selected")
                        .font(.system(size: 18))
                        .foregroundStyle(Theme.mutedText)
                } else {
                    Text(CashAppStore.displayTag(store.active))
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.green)
                }
                if savedFlash {
                    Text("Saved ✓")
                        .font(.system(size: 11))
                        .foregroundStyle(.green)
                }
            }
        }
    }

    private var tagList: some View {
        VStack(spacing: 8) {
            if store.tags.isEmpty {
                Text("No tags yet. Add one below.")
                    .foregroundStyle(Theme.mutedText)
                    .font(.system(size: 14))
                    .padding(.vertical, 12)
            } else {
                ForEach(store.tags, id: \.self) { url in
                    tagRow(url)
                }
            }
        }
    }

    private func tagRow(_ url: String) -> some View {
        let isActive = store.active == url
        return HStack {
            Text(CashAppStore.displayTag(url))
                .font(.system(size: 15, weight: .medium))
            Spacer()
            if isActive {
                Text("Active ✓")
                    .font(.system(size: 11, weight: .semibold))
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Color.green)
                    .foregroundStyle(.white)
                    .clipShape(Capsule())
            } else {
                Button {
                    store.setActive(url)
                    savedFlash = true
                    Task { try? await Task.sleep(nanoseconds: 1_500_000_000); savedFlash = false }
                } label: {
                    Text("Set active")
                        .font(.system(size: 11, weight: .semibold))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Color.green.opacity(0.15))
                        .foregroundStyle(.green)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            Button { store.remove(url) } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.red)
                    .padding(8)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Theme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(isActive ? Color.green.opacity(0.5) : Theme.cardBorder, lineWidth: 0.8)
        )
    }

    private var addBox: some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                Text("Add CashApp tag").font(.system(size: 14, weight: .medium))
                HStack(spacing: 8) {
                    HStack(spacing: 2) {
                        Text("$").foregroundStyle(Theme.mutedText)
                        TextField("TheMoonTea", text: $input)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .submitLabel(.done)
                            .onSubmit(handleAdd)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                    Button(action: handleAdd) {
                        Text("Add")
                            .font(.system(size: 14, weight: .semibold))
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(input.trimmingCharacters(in: .whitespaces).isEmpty
                                        ? Color.blue.opacity(0.3) : Color.blue)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func handleAdd() {
        store.addTag(input)
        input = ""
    }
}
