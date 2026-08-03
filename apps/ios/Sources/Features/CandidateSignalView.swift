import PhotosUI
import SwiftUI

struct CandidateSignalView: View {
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var importedImage: UIImage?
    @State private var actionStatus = ActionStatus.pending

    private let signal = CandidateSignal.sample

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    brandHeader
                    importCard
                    signalBrief
                    actionCard
                    privacyNote
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 36)
            }
            .background(Color.canvas.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
        .preferredColorScheme(.light)
        .tint(.signalRed)
        .onChange(of: selectedPhoto) { item in
            Task {
                guard let data = try? await item?.loadTransferable(type: Data.self),
                      let image = UIImage(data: data) else {
                    return
                }
                importedImage = image
            }
        }
    }

    private var brandHeader: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 10) {
                SignalMark()
                Text("TALENT SIGNAL")
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                    .tracking(1.6)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Know who needs you now.")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.ink)
                Text("Turn one recruiter-owned conversation into a reviewable next step.")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(Color.mutedInk)
                    .lineSpacing(3)
            }
        }
        .padding(.top, 18)
    }

    private var importCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionLabel(text: "Evidence import")

            if let importedImage {
                Image(uiImage: importedImage)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 180)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(alignment: .topTrailing) {
                        Button {
                            self.importedImage = nil
                            selectedPhoto = nil
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 12, weight: .bold))
                                .padding(9)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                        .padding(10)
                        .accessibilityLabel("Remove imported screenshot")
                    }
            } else {
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    HStack(spacing: 12) {
                        Image(systemName: "photo.badge.plus")
                            .font(.system(size: 20, weight: .semibold))
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Choose a conversation screenshot")
                                .font(.system(size: 16, weight: .semibold))
                            Text("Only the image you select enters the review loop.")
                                .font(.system(size: 13))
                                .foregroundStyle(Color.mutedInk)
                        }
                        Spacer(minLength: 0)
                    }
                    .foregroundStyle(Color.ink)
                    .padding(16)
                    .background(Color.surfaceMuted, in: RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)
            }
        }
        .cardSurface()
    }

    private var signalBrief: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: "Candidate brief")
                Spacer()
                Text("3 VERIFIED FACTS")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .tracking(1)
                    .foregroundStyle(Color.mutedInk)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(signal.name)
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                Text(signal.role)
                    .font(.system(size: 15))
                    .foregroundStyle(Color.mutedInk)
            }

            VStack(spacing: 0) {
                ForEach(Array(signal.facts.enumerated()), id: \.element.id) { index, fact in
                    HStack(alignment: .top, spacing: 14) {
                        Circle()
                            .fill(index == signal.facts.count - 1 ? Color.signalRed : Color.ink)
                            .frame(width: 7, height: 7)
                            .padding(.top, 6)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(fact.label.uppercased())
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .tracking(1.2)
                                .foregroundStyle(Color.mutedInk)
                            Text(fact.value)
                                .font(.system(size: 15, weight: .medium))
                        }
                        Spacer()
                    }
                    .padding(.vertical, 11)

                    if index < signal.facts.count - 1 {
                        Divider().overlay(Color.line)
                    }
                }
            }
        }
        .cardSurface()
    }

    private var actionCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(signal.verdict.rawValue.uppercased())
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .tracking(1.4)
                    .foregroundStyle(Color.signalRed)
                Spacer()
                Image(systemName: "exclamationmark.circle.fill")
                    .foregroundStyle(Color.signalRed)
            }

            Text("A near decision window and an unresolved constraint put momentum at risk.")
                .font(.system(size: 21, weight: .bold, design: .rounded))
                .foregroundStyle(Color.ink)

            Text(signal.nextAction)
                .font(.system(size: 15))
                .foregroundStyle(Color.mutedInk)
                .lineSpacing(3)

            switch actionStatus {
            case .pending:
                HStack(spacing: 10) {
                    Button("Confirm next step") {
                        actionStatus = .confirmed
                    }
                    .buttonStyle(PrimaryActionButtonStyle())

                    Button("Dismiss") {
                        actionStatus = .dismissed
                    }
                    .buttonStyle(SecondaryActionButtonStyle())
                }
            case .confirmed:
                statusPill(
                    icon: "checkmark.circle.fill",
                    text: "Confirmed — ready for recruiter follow-up",
                    color: .successGreen
                )
            case .dismissed:
                statusPill(
                    icon: "minus.circle.fill",
                    text: "Dismissed — no record was changed",
                    color: .mutedInk
                )
            }
        }
        .padding(22)
        .background(Color.ink, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .foregroundStyle(Color.canvas)
    }

    private var privacyNote: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "lock.shield")
            Text("Facts stay separate from inference. Contact and calendar changes always require confirmation.")
                .font(.system(size: 12))
                .lineSpacing(2)
        }
        .foregroundStyle(Color.mutedInk)
        .padding(.horizontal, 6)
    }

    private func statusPill(icon: String, text: String, color: Color) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
            Text(text)
                .font(.system(size: 13, weight: .semibold))
        }
        .foregroundStyle(color)
        .padding(.vertical, 11)
    }
}

private enum ActionStatus {
    case pending
    case confirmed
    case dismissed
}

private struct SignalMark: View {
    var body: some View {
        HStack(alignment: .bottom, spacing: 3) {
            Capsule().fill(Color.ink).frame(width: 4, height: 9)
            Capsule().fill(Color.ink).frame(width: 4, height: 18)
            Capsule().fill(Color.signalRed).frame(width: 4, height: 13)
        }
        .frame(width: 22, height: 20)
        .accessibilityHidden(true)
    }
}

private struct SectionLabel: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold, design: .monospaced))
            .tracking(1.4)
            .foregroundStyle(Color.mutedInk)
    }
}

private struct PrimaryActionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(
                configuration.isPressed ? Color.signalRed.opacity(0.8) : Color.signalRed,
                in: Capsule()
            )
    }
}

private struct SecondaryActionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(Color.canvas)
            .padding(.horizontal, 18)
            .padding(.vertical, 13)
            .background(Color.canvas.opacity(configuration.isPressed ? 0.18 : 0.09), in: Capsule())
    }
}

private extension View {
    func cardSurface() -> some View {
        padding(20)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(Color.line, lineWidth: 1)
            }
    }
}

private extension Color {
    static let canvas = Color(red: 0.949, green: 0.945, blue: 0.929)
    static let surface = Color(red: 0.98, green: 0.976, blue: 0.961)
    static let surfaceMuted = Color(red: 0.922, green: 0.914, blue: 0.89)
    static let ink = Color(red: 0.094, green: 0.094, blue: 0.086)
    static let mutedInk = Color(red: 0.39, green: 0.38, blue: 0.35)
    static let signalRed = Color(red: 0.847, green: 0.29, blue: 0.208)
    static let successGreen = Color(red: 0.47, green: 0.72, blue: 0.56)
    static let line = Color.ink.opacity(0.13)
}

#Preview {
    CandidateSignalView()
}
