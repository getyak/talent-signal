import SwiftUI
import UIKit

struct LabAppearanceView: View {
    @Environment(\.labDisplayStore) private var sessionStore
    @StateObject private var fallbackStore = LabDisplayStore()
    var body: some View { LabAppearanceEditor(store: sessionStore ?? fallbackStore, canApplyToApp: sessionStore != nil) }
}

private struct LabAppearanceEditor: View {
    @ObservedObject var store: LabDisplayStore
    let canApplyToApp: Bool
    @Environment(\.appLanguage) private var language
    @State private var configuration = LabDisplayConfiguration.standard
    @State private var page = LabPreviewPage.people
    @State private var state = LabPreviewState.ready
    @State private var minutes = 15
    @State private var preview = false
    @State private var savesPreset = false
    @State private var savesPreferences = false
    @State private var presetName = ""
    var body: some View {
        Form {
            Section {
                Text(language.text("Inspect real pages with repeatable display settings."))
                Text(language.text("Page previews use synthetic data. Apply a temporary display trial to inspect your current app."))
                    .font(.footnote).foregroundStyle(Color.tsMutedInk)
            }
            Section(language.text("Page state catalog")) {
                Picker(language.text("Page"), selection: $page) {
                    ForEach(LabPreviewPage.allCases) { Text(language.text($0.title)).tag($0) }
                }.accessibilityIdentifier("lab-appearance-page")
                Picker(language.text("Page state"), selection: $state) {
                    ForEach(page.states) { Text(language.text($0.title)).tag($0) }
                }.accessibilityIdentifier("lab-appearance-state")
                Button(language.text("Open live preview")) { preview = true }
                    .accessibilityIdentifier("product-lab-live-preview")
            }
            LabDisplayControls(configuration: $configuration)
            Section(language.text("Current app · Temporary")) {
                Picker(language.text("Duration"), selection: $minutes) {
                    ForEach([5, 15, 30, 60], id: \.self) { Text(String(format: language.text("%lld minutes"), Int64($0))).tag($0) }
                }
                Button(language.text(store.active == nil ? "Apply to current app" : "Apply updated display trial")) { store.apply(configuration, minutes: minutes) }
                    .disabled(!canApplyToApp || !store.canApply)
                    .accessibilityIdentifier("lab-display-apply")
                if let active = store.active {
                    LabInfoRow(label: language.text("Ends at"), value: active.expiresAt.formatted(date: .omitted, time: .shortened))
                    Button(language.text("Restore display")) { store.stop() }.accessibilityIdentifier("lab-appearance-stop")
                }
                Text(language.text("Close Lab to inspect the app. Restore, expiry, account change or app relaunch ends the trial. Saved preferences remain unchanged."))
                    .font(.footnote).foregroundStyle(Color.tsMutedInk)
                if !store.canApply {
                    Text(language.text("An internal device-tools build is required to save or apply display settings. Page previews remain available."))
                        .font(.footnote).foregroundStyle(Color.tsMutedInk)
                }
            }
            Section {
                ForEach(store.presets) { preset in
                    HStack {
                        Button(preset.name) { configuration = preset.configuration }
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).buttonStyle(.borderless)
                            .accessibilityIdentifier("lab-display-preset-\(preset.id.uuidString)")
                        Button(role: .destructive) { store.deletePreset(preset.id) } label: { Image(systemName: "trash").frame(width: 44, height: 44) }
                            .buttonStyle(.borderless)
                            .disabled(!store.canApply)
                            .accessibilityLabel(String(format: language.text("Delete preset %@"), preset.name))
                    }
                }
                Button(language.text("Save as display preset")) { presetName = ""; savesPreset = true }
                    .disabled(!store.canSavePreset).accessibilityIdentifier("lab-display-save-preset")
                Button(language.text("Reset preview controls")) { configuration = .standard }.accessibilityIdentifier("lab-display-reset-controls")
                Button(language.text("Save theme, language & density")) { savesPreferences = true }
                    .disabled(!store.canApply)
                    .accessibilityIdentifier("lab-display-save-preferences")
            } header: { Text(language.text("Display presets")) }
              footer: { Text(language.text("Presets are stored only on this device. Loading a preset does not apply it to the app.")) }
            if let notice = store.notice {
                Section { Text(language.text(notice)).font(.footnote).accessibilityIdentifier("lab-display-notice") }
            }
            if let error = store.error {
                Section {
                    Text(language.text(error)).foregroundStyle(Color.tsVermilion)
                    Button(language.text("Reload display presets")) { store.loadPresets() }
                }
            }
        }
        .navigationTitle(language.text("Appearance & accessibility"))
        .onChange(of: page) { _ in if !page.states.contains(state) { state = .ready } }
        .fullScreenCover(isPresented: $preview) { LabPagePreview(configuration: $configuration, page: page, state: state) }
        .alert(language.text("Name this display preset"), isPresented: $savesPreset) {
            TextField(language.text("Preset name"), text: $presetName).accessibilityIdentifier("lab-display-preset-name")
            Button(language.text("Save")) { store.savePreset(name: presetName, configuration: configuration) }
                .disabled(presetName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || presetName.count > 60)
            Button(language.text("Cancel"), role: .cancel) {}
        }
        .confirmationDialog(language.text("Save these personal display preferences?"), isPresented: $savesPreferences, titleVisibility: .visible) {
            Button(language.text("Save theme, language & density")) { store.savePersonalPreferences(configuration) }
        } message: { Text(language.text("Theme, language and card density will remain after relaunch. Text-size simulation, motion, transparency, contrast and layout guides stay temporary.")) }
    }
}

struct LabDisplayControls: View {
    @Binding var configuration: LabDisplayConfiguration
    @Environment(\.appLanguage) private var language
    @Environment(\.accessibilityReduceMotion) private var systemMotion
    @Environment(\.accessibilityReduceTransparency) private var systemTransparency
    @Environment(\.colorSchemeContrast) private var systemContrast
    var body: some View {
        Section {
            Picker(language.text("Appearance"), selection: $configuration.theme) {
                ForEach(LabDisplayConfiguration.Theme.allCases, id: \.self) { Text(language.text($0.title)).tag($0) }
            }.accessibilityIdentifier("product-lab-theme")
            Picker(language.text("Interface language"), selection: $configuration.language) {
                ForEach(LabDisplayConfiguration.Language.allCases, id: \.self) { Text(language.text($0.title)).tag($0) }
            }.accessibilityIdentifier("lab-display-language")
            Picker(language.text("Text size"), selection: $configuration.textSize) {
                ForEach(LabDisplayConfiguration.TextSize.allCases, id: \.self) { Text(language.text($0.title)).tag($0) }
            }.accessibilityIdentifier("lab-display-text-size")
            Picker(language.text("Card density"), selection: $configuration.density) {
                ForEach(LabDisplayConfiguration.Density.allCases, id: \.self) { Text(language.text($0.title)).tag($0) }
            }.accessibilityIdentifier("lab-display-density")
            Toggle(language.text("Reduce app motion"), isOn: $configuration.reduceMotion).accessibilityIdentifier("lab-display-motion")
            Toggle(language.text("Opaque app surfaces"), isOn: $configuration.reduceTransparency).accessibilityIdentifier("lab-display-transparency")
            Toggle(language.text("Contrast rendering preview"), isOn: $configuration.contrastBoost).accessibilityIdentifier("lab-display-contrast")
            Toggle(language.text("Show component bounds"), isOn: $configuration.layoutBounds).accessibilityIdentifier("lab-display-bounds")
        } header: { Text(language.text("Preview display")) }
          footer: {
            Text(language.text("App simulations do not change system accessibility settings. System text-size and motion protections still apply. Contrast preview is a rendering adjustment, not an accessibility certification."))
        }
        Section(language.text("System accessibility · Read only")) {
            LabInfoRow(label: language.text("Accessibility text size"), value: language.text(UIApplication.shared.preferredContentSizeCategory.isAccessibilityCategory ? "On" : "Off"))
            LabInfoRow(label: language.text("Reduce motion"), value: language.text(systemMotion ? "On" : "Off"))
            LabInfoRow(label: language.text("Reduce transparency"), value: language.text(systemTransparency ? "On" : "Off"))
            LabInfoRow(label: language.text("Increased contrast"), value: language.text(systemContrast == .increased ? "On" : "Off"))
        }
    }
}
