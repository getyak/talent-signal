import AVFAudio
import SwiftUI

@MainActor
struct AudioSignalCaptureView: View {
    @StateObject private var store: AudioSignalCaptureStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @FocusState private var focusedField: AudioSignalField?
    let onDismiss: () -> Void

    init(onDismiss: @escaping () -> Void = {}) {
        _store = StateObject(wrappedValue: AudioSignalCaptureStore())
        self.onDismiss = onDismiss
    }

    init(
        store: AudioSignalCaptureStore,
        onDismiss: @escaping () -> Void = {}
    ) {
        _store = StateObject(wrappedValue: store)
        self.onDismiss = onDismiss
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    intro
                    purpose
                    authorization
                    if let notice = store.notice { interruptionNotice(notice) }
                    status
                    actions
                    privacyBoundary
                }
                .padding(.horizontal, 22)
                .padding(.vertical, 24)
            }
            .background(Color.tsCanvas.ignoresSafeArea())
            .navigationTitle("Audio Signal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        if store.isRecording { store.stop() }
                        onDismiss()
                        dismiss()
                    } label: {
                        Image(systemName: "xmark").frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Close audio Signal")
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                        .accessibilityIdentifier("dismiss-audio-signal-keyboard")
                }
            }
        }
        .task { store.restore() }
        .onChange(of: scenePhase) { phase in
            guard phase != .active else { return }
            store.stopForForegroundLoss()
        }
        .onReceive(
            NotificationCenter.default.publisher(
                for: AVAudioSession.interruptionNotification
            )
        ) { _ in
            store.stopForForegroundLoss()
        }
        .interactiveDismissDisabled(store.isRecording)
        .tint(.tsVermilion)
        .accessibilityIdentifier("audio-signal-capture")
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("FOREGROUND ONLY")
                .font(.caption.weight(.bold))
                .tracking(1.8)
                .foregroundStyle(Color.tsVermilion)
            Text("Record only after permission and authorization.")
                .font(.custom("Georgia", size: 34, relativeTo: .largeTitle))
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
            Text("Opening this page does not start the microphone. A visible recording state appears only after the audio session succeeds.")
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var purpose: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("PURPOSE")
                .font(.caption.weight(.bold))
                .tracking(1.6)
                .foregroundStyle(Color.tsVermilion)
            TextField("Why is this recording needed?", text: $store.purpose, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .focused($focusedField, equals: .purpose)
                .disabled(store.isRecording)
                .accessibilityIdentifier("audio-signal-purpose")
        }
    }

    private var authorization: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("AUTHORIZING PARTY")
                .font(.caption.weight(.bold))
                .tracking(1.2)
                .foregroundStyle(Color.tsMutedInk)
            TextField(
                "Name or accountable party",
                text: $store.authorizingParty,
                axis: .vertical
            )
            .textFieldStyle(.roundedBorder)
            .focused($focusedField, equals: .authorizingParty)
            .submitLabel(.next)
            .onSubmit { focusedField = .authorizationBasis }
            .disabled(store.isRecording)
            .accessibilityLabel("Who authorized this recording?")
            .accessibilityIdentifier("audio-signal-authorizing-party")

            Text("AUTHORIZATION BASIS")
                .font(.caption.weight(.bold))
                .tracking(1.2)
                .foregroundStyle(Color.tsMutedInk)
            TextField(
                "For example, direct verbal permission",
                text: $store.authorizationBasis,
                axis: .vertical
            )
            .textFieldStyle(.roundedBorder)
            .focused($focusedField, equals: .authorizationBasis)
            .submitLabel(.done)
            .onSubmit { focusedField = nil }
            .disabled(store.isRecording)
            .accessibilityLabel("Authorization basis")
            .accessibilityIdentifier("audio-signal-authorization-basis")

            Toggle(isOn: $store.authorizationConfirmed) {
                Text("I attest that this authorization covers the purpose above.")
                    .font(.subheadline)
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .disabled(store.isRecording)
            .accessibilityIdentifier("audio-signal-authorization")
        }
    }

    @ViewBuilder
    private var status: some View {
        switch store.phase {
        case .idle:
            AudioSignalStatusCard(
                icon: "mic.slash",
                title: "Not recording",
                detail: "No microphone session or local audio payload exists."
            )
            .accessibilityIdentifier("audio-signal-idle")
        case .requestingPermission:
            AudioSignalStatusCard(
                icon: "hand.raised",
                title: "Waiting for permission",
                detail: "Recording has not started."
            )
            .accessibilityIdentifier("audio-signal-requesting-permission")
        case .preparing:
            AudioSignalStatusCard(
                icon: "waveform",
                title: "Preparing microphone",
                detail: "Recording is not presented as active until the audio session succeeds."
            )
            .accessibilityIdentifier("audio-signal-preparing")
        case let .recording(startedAt):
            VStack(alignment: .leading, spacing: 12) {
                Label("Recording now", systemImage: "record.circle.fill")
                    .font(.headline)
                    .foregroundStyle(Color.tsVermilion)
                Text(startedAt, style: .timer)
                    .font(.system(.title, design: .monospaced).weight(.medium))
                    .foregroundStyle(Color.tsInk)
                Text("Keep Talent Signal in the foreground. Leaving the app stops and seals the local payload.")
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 18))
            .overlay { RoundedRectangle(cornerRadius: 18).stroke(Color.tsVermilion, lineWidth: 1) }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("audio-signal-recording")
        case let .saved(receipt):
            VStack(alignment: .leading, spacing: 10) {
                AudioSignalStatusCard(
                    icon: "checkmark.shield",
                    title: "Saved only on this device",
                    detail: "\(format(receipt.durationSeconds)) · \(receipt.byteCount) bytes · protected local payload · no upload"
                )
                Text("Authorized by \(receipt.authorization.authorizingParty) · basis: \(receipt.authorization.basis) · scope: \(receipt.authorization.scope) · attested by \(receipt.authorization.attestedBy) · \(receipt.authorization.recordedAt.formatted(date: .abbreviated, time: .standard))")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("audio-signal-authorization-receipt")
            }
            .accessibilityIdentifier("audio-signal-saved-local")
        case let .failed(message):
            AudioSignalStatusCard(
                icon: "exclamationmark.triangle",
                title: "Not recording",
                detail: message
            )
            .accessibilityIdentifier("audio-signal-failed")
        case .deleting:
            AudioSignalStatusCard(
                icon: "trash",
                title: "Deleting local payload",
                detail: "No upload or external write is being attempted."
            )
        case .deleted:
            AudioSignalStatusCard(
                icon: "checkmark",
                title: "Local recording deleted",
                detail: "The audio payload and its local metadata were removed."
            )
            .accessibilityIdentifier("audio-signal-deleted")
        }
    }

    @ViewBuilder
    private var actions: some View {
        if store.isRecording {
            Button("Stop and save locally") { store.stop() }
                .buttonStyle(TSPrimaryButtonStyle())
                .accessibilityIdentifier("stop-audio-signal")
        } else if case .saved = store.phase {
            Button("Revoke authorization and delete recording", role: .destructive) {
                store.delete()
            }
                .buttonStyle(TSSecondaryButtonStyle())
                .accessibilityIdentifier("delete-audio-signal")
        } else if case .deleting = store.phase {
            ProgressView().frame(maxWidth: .infinity, minHeight: 44)
        } else {
            Button("Start foreground recording") {
                Task { await store.start(sceneIsActive: scenePhase == .active) }
            }
            .buttonStyle(TSPrimaryButtonStyle())
            .disabled(!store.canStart)
            .accessibilityIdentifier("start-audio-signal")
        }
    }

    private var privacyBoundary: some View {
        Label(
            "Audio remains local and untranscribed. It creates no Proposal, confirmed state, message, meeting, or external write.",
            systemImage: "lock.shield"
        )
        .font(.caption)
        .foregroundStyle(Color.tsMutedInk)
        .fixedSize(horizontal: false, vertical: true)
    }

    private func interruptionNotice(_ value: String) -> some View {
        Text(value)
            .font(.subheadline)
            .foregroundStyle(Color.tsInk)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 14))
            .accessibilityIdentifier("audio-signal-interruption-notice")
    }

    private func format(_ duration: TimeInterval) -> String {
        let seconds = max(0, Int(duration.rounded()))
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}

private enum AudioSignalField: Hashable {
    case purpose
    case authorizingParty
    case authorizationBasis
}

private struct AudioSignalStatusCard: View {
    let icon: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.title3.weight(.semibold))
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.headline)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .foregroundStyle(Color.tsInk)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 18))
        .overlay { RoundedRectangle(cornerRadius: 18).stroke(Color.tsLine, lineWidth: 1) }
        .accessibilityElement(children: .combine)
    }
}
