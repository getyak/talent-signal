import SwiftUI
import UIKit

@MainActor
struct ProductLabView: View {
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dismiss) private var dismiss
    @Environment(\.labRuntime) private var runtime
    @StateObject private var experiments: LabExperimentStore
    @StateObject private var trials: LabTaskTrialStore
    @StateObject private var featureOverrides: LabFeatureOverrideStore
    @StateObject private var jobs: LabJobStore
    @StateObject private var regressions: LabRegressionStore
    @StateObject private var device = DeviceLabStore()
    @ObservedObject var deterministic: TalentSignalLabStore
    let baseURL: URL?
    let workspace: String?
    let onSignOut: (() async -> Bool)?
    let refreshWorkspace: (() async -> Bool)?
    @State private var showsDeterministic = false
    @State private var showsOnboarding = false
    @State private var confirmsSignOut = false
    @State private var signingOut = false

    init(deterministic: TalentSignalLabStore, service: (any LabExperimentServing)?,
         baseURL: URL?, workspace: String?, userScope: String? = nil, runtimeScope: String? = nil, onSignOut: (() async -> Bool)? = nil, refreshWorkspace: (() async -> Bool)? = nil) {
        self.deterministic = deterministic
        self.baseURL = baseURL
        self.workspace = workspace
        self.onSignOut = onSignOut
        self.refreshWorkspace = refreshWorkspace
        let legacyScope = "\(baseURL?.absoluteString ?? "local")|\(workspace ?? "signed-out")|\(userScope ?? "local")"
        _trials = StateObject(wrappedValue: LabTaskTrialStore(service: service as? any LabTaskTrialServing, scope: runtimeScope ?? legacyScope))
        _featureOverrides = StateObject(wrappedValue: LabFeatureOverrideStore(service: service as? any LabFeatureOverrideServing, scope: runtimeScope ?? legacyScope))
        _jobs = StateObject(wrappedValue: LabJobStore(service: service as? any LabJobServing, scope: runtimeScope ?? legacyScope))
        _regressions = StateObject(wrappedValue: LabRegressionStore(service: service as? any LabRegressionServing, scope: runtimeScope ?? legacyScope))
        _experiments = StateObject(wrappedValue: LabExperimentStore(service: service,
            scope: runtimeScope ?? legacyScope, legacyScope: runtimeScope == nil ? nil : legacyScope))
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 9) {
                        Text(appLanguage.text("Make the next version better."))
                            .font(.title2.weight(.semibold))
                        Text(appLanguage.text("Compare real answers. Inspect this build. Start a clean test."))
                            .foregroundStyle(Color.tsMutedInk)
                            .font(.subheadline)
                    }
                    .padding(.vertical, 10)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                }

                Section {
                    if let runtime {
                        NavigationLink {
                            LabWorkspaceView(store: runtime.workspaceStore, onEntered: { dismiss() })
                        } label: {
                            LabTaskRow(title: appLanguage.text("Isolated test workspace"),
                                detail: appLanguage.text("Create a real empty server workspace, return safely, verify cleanup"),
                                icon: "shippingbox", accent: true)
                        }
                        .accessibilityIdentifier("product-lab-workspace")
                    }
                    NavigationLink {
                        LabJobView(store: jobs, previous: experiments, regressions: regressions)
                    } label: {
                        LabTaskRow(title: appLanguage.text("AI experiments"),
                            detail: appLanguage.text("Compare cases, control calls, inspect failures"), icon: "flask", accent: true)
                    }
                    .accessibilityIdentifier("product-lab-experiments")
                    NavigationLink { LabTaskTrialView(store: trials) } label: {
                        LabTaskRow(title: appLanguage.text("Models & session trials"), detail: appLanguage.text("Try a task model, inspect actual execution, return to default"), icon: "slider.horizontal.3")
                    }.accessibilityIdentifier("product-lab-task-trials")
                    NavigationLink { LabFeatureOverrideView(store: featureOverrides) } label: {
                        LabTaskRow(title: appLanguage.text("Feature overrides"), detail: appLanguage.text("Try a named product change in this sign-in and verify what actually applied"), icon: "switch.2")
                    }.accessibilityIdentifier("product-lab-feature-overrides")
                    NavigationLink { LabRegressionLibrary(store: regressions, jobs: jobs, previous: experiments) } label: {
                        LabTaskRow(title: appLanguage.text("Regression cases"), detail: appLanguage.text("Save failures, rerun frozen input, inspect release coverage"), icon: "arrow.triangle.branch")
                    }.accessibilityIdentifier("product-lab-regressions")
                } header: { Text(appLanguage.text("IMPROVE")) }

                Section {
                    NavigationLink {
                        overview
                    } label: {
                        LabTaskRow(title: appLanguage.text("Build & environment"),
                            detail: baseURL?.host ?? appLanguage.text("Local preview"), icon: "server.rack")
                    }
                    .accessibilityIdentifier("product-lab-environment")
                    NavigationLink {
                        LabAppearanceView()
                    } label: {
                        LabTaskRow(title: appLanguage.text("Appearance & accessibility"),
                            detail: appLanguage.text("Preview real pages, save presets, try display settings"), icon: "textformat.size")
                    }
                    .accessibilityIdentifier("product-lab-appearance")
                    NavigationLink {
                        LabDiagnosticsView(baseURL: baseURL)
                    } label: {
                        LabTaskRow(title: appLanguage.text("Performance & diagnostics"),
                            detail: appLanguage.text("Record a task, inspect timing, review a diagnostic report"), icon: "waveform.path.ecg")
                    }
                    .accessibilityIdentifier("product-lab-diagnostics")
                    NavigationLink {
                        maintenance
                    } label: {
                        LabTaskRow(title: appLanguage.text("Data & restart"),
                            detail: appLanguage.text("Cache, sign-in and onboarding"), icon: "arrow.counterclockwise")
                    }
                    .accessibilityIdentifier("product-lab-maintenance")
                } header: { Text(appLanguage.text("ON THIS DEVICE")) }

                Section {
                    Button { showsDeterministic = true } label: {
                        LabTaskRow(title: appLanguage.text("Deterministic scenarios"),
                            detail: appLanguage.text("Fixed examples for interface and boundary checks"), icon: "checklist")
                    }
                    .foregroundStyle(Color.tsInk)
                    .accessibilityIdentifier("product-lab-deterministic")
                } footer: {
                    Text(appLanguage.text("Device tools remain available offline. Model experiments require an enabled internal backend."))
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Color.tsSurface)
            .navigationTitle(appLanguage.text("Lab"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(appLanguage.text("Close Lab")) { dismiss() }
                        .accessibilityIdentifier("product-lab-done")
                }
            }
        }
        .tint(.tsVermilion)
        .task { await experiments.load() }
        .sheet(isPresented: $showsDeterministic) { TalentSignalLabView(store: deterministic) }
        .sheet(isPresented: $showsOnboarding) { LabOnboardingReplayView() }
        .confirmationDialog(appLanguage.text("Sign out of this workspace?"), isPresented: $confirmsSignOut, titleVisibility: .visible) {
            Button(appLanguage.text("Sign out"), role: .destructive) {
                signingOut = true
                Task {
                    let closed = await onSignOut?() ?? false
                    signingOut = false
                    if closed { dismiss() }
                }
            }
        } message: {
            Text(appLanguage.text("The app will remove this device session and attempt server revocation. Your account and captured sources will not be deleted."))
        }
    }

    private var overview: some View {
        List {
            Section(appLanguage.text("This app")) {
                LabInfoRow(label: appLanguage.text("Version"), value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—")
                LabInfoRow(label: appLanguage.text("Build"), value: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—")
                LabInfoRow(label: appLanguage.text("Device"), value: "\(UIDevice.current.model) · iOS \(UIDevice.current.systemVersion)")
            }
            Section(appLanguage.text("Connection")) {
                LabInfoRow(label: appLanguage.text("Backend"), value: displayedEndpoint ?? appLanguage.text("Not connected"))
                LabInfoRow(label: appLanguage.text("Workspace"), value: workspace ?? appLanguage.text("Not signed in"))
                LabInfoRow(label: appLanguage.text("Backend revision"), value: experiments.catalog?.backend_revision ?? appLanguage.text("Not reported"))
                LabInfoRow(label: appLanguage.text("Prompt revision"), value: experiments.catalog?.prompt_version ?? appLanguage.text("Not reported"))
                if let checkedAt = experiments.checkedAt {
                    LabInfoRow(label: appLanguage.text("Last verified"), value: checkedAt.formatted(date: .omitted, time: .standard))
                }
            }
            if let result = experiments.record?.results.last {
                Section(appLanguage.text("Latest actual run")) {
                    LabInfoRow(label: appLanguage.text("Model"), value: result.model)
                    LabInfoRow(label: appLanguage.text("Status"), value: appLanguage.text(result.status))
                }
            }
            Section {
                if let runtime {
                    NavigationLink { LabEnvironmentView(runtime: runtime) } label: {
                        Text(appLanguage.text("Environment & version"))
                    }
                    .accessibilityIdentifier("lab-runtime-environments")
                } else {
                    Text(appLanguage.text("Environment controls are available from the app's Lab entry."))
                        .foregroundStyle(Color.tsMutedInk)
                }
            }
        }
        .navigationTitle(appLanguage.text("Build & environment"))
    }

    private var displayedEndpoint: String? {
        guard let baseURL, var parts = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { return nil }
        parts.user = nil
        parts.password = nil
        parts.query = nil
        parts.fragment = nil
        return parts.string
    }

    private var maintenance: some View {
        List {
            Section {
                if let runtime {
                    NavigationLink { LabWorkspaceView(store: runtime.workspaceStore) } label: {
                        LabTaskRow(title: appLanguage.text("Test workspaces"),
                            detail: appLanguage.text("Isolated server data, protected return and cleanup receipts"), icon: "shippingbox")
                    }.accessibilityIdentifier("lab-workspace-open")
                }
                NavigationLink { LabResetView(refreshWorkspace: refreshWorkspace) } label: {
                    LabTaskRow(title: appLanguage.text("Restart a device test"), detail: appLanguage.text("Review selected steps, verify results, resume interrupted cleanup"), icon: "arrow.counterclockwise.circle")
                }.accessibilityIdentifier("lab-reset-open")
            }
            Section {
                LabInfoRow(label: appLanguage.text("Rebuildable network cache"), value: ByteCountFormatter.string(fromByteCount: Int64(device.cacheBytes), countStyle: .file))
                Button(appLanguage.text("Clear network cache")) { Task { await device.clearCache() } }
                    .disabled(device.isClearing)
                    .accessibilityIdentifier("product-lab-clear-cache")
                if device.isClearing { ProgressView() }
                if let after = device.cacheAfterClear {
                    Label(appLanguage.text(after == 0 ? "Cache cleared" : "Cache cleanup requested"),
                          systemImage: after == 0 ? "checkmark.circle" : "arrow.clockwise")
                        .accessibilityIdentifier("product-lab-cache-cleared")
                    LabInfoRow(label: appLanguage.text("Remaining cache"), value: ByteCountFormatter.string(fromByteCount: Int64(after), countStyle: .file))
                }
            } footer: {
                Text(appLanguage.text("Clears this app's shared URL cache. Authenticated API requests use an uncached session. Original captures and drafts stay."))
            }
            Section {
                Button { showsOnboarding = true } label: {
                    LabTaskRow(title: appLanguage.text("Replay onboarding"),
                        detail: appLanguage.text("Fresh isolated example, using the real review flow"), icon: "play.rectangle")
                }
                .accessibilityIdentifier("product-lab-onboarding")
            } footer: {
                Text(appLanguage.text("Your account and onboarding progress are preserved. System permission prompts cannot be reset by the app."))
            }
            Section {
                if let runtime {
                    NavigationLink { LabSessionEndingsView(store: runtime.sessionStore) } label: {
                        Text(appLanguage.text("Sign-in & recovery"))
                    }.accessibilityIdentifier("lab-ending-open")
                } else if onSignOut != nil {
                    Button(appLanguage.text("Sign out"), role: .destructive) { confirmsSignOut = true }
                        .disabled(signingOut)
                        .accessibilityIdentifier("product-lab-sign-out")
                } else { Text(appLanguage.text("No authenticated session to clear")) }
                Button(appLanguage.text("Open app permission settings")) {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                }
            } header: { Text(appLanguage.text("Sign-in & permissions")) }
        }
        .task { device.refreshCache() }
        .navigationTitle(appLanguage.text("Data & restart"))
    }
}

private struct LabTaskRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let title: String
    let detail: String
    let icon: String
    var accent = false
    var body: some View {
        HStack(alignment: .top, spacing: 13) {
            if !dynamicTypeSize.isAccessibilitySize {
                Image(systemName: icon).font(.title3).frame(width: 25, height: 27)
                    .foregroundStyle(accent ? Color.tsVermilion : Color.tsMutedInk)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.body.weight(.medium)).foregroundStyle(Color.tsInk)
                Text(detail).font(.footnote).foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 6)
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }
}

struct LabInfoRow: View {
    let label: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(Color.tsMutedInk)
            Text(value).font(.body).textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}

struct LabOnboardingReplayView: View {
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            StandaloneOnboardingView(arguments: [], labPreview: true)
                .safeAreaInset(edge: .top) {
                    Text(appLanguage.text("ISOLATED PREVIEW · Changes stay in this example"))
                        .font(.caption).foregroundStyle(Color.tsMutedInk)
                        .frame(maxWidth: .infinity).padding(10).background(Color.tsSurface)
                }
                .navigationTitle(appLanguage.text("Replay onboarding"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(appLanguage.text("Close preview")) { dismiss() }
                    }
                }
        }
    }
}
