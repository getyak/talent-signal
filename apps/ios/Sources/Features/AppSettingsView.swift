import SwiftUI

struct AppSettingsView: View {
    @AppStorage(AppLanguage.storageKey) private var storedLanguage =
        AppLanguage.system.rawValue
    @Environment(\.appLanguage) private var interfaceLanguage

    private var selectedLanguage: AppLanguage {
        AppLanguage.stored(storedLanguage)
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text(
                        interfaceLanguage.text(
                            "PERSONAL PREFERENCE",
                            zhHans: "个人偏好"
                        )
                    )
                    .font(.caption2.weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(Color.tsMutedInk)

                    Text(interfaceLanguage.text("Settings", zhHans: "设置"))
                        .font(.custom("Georgia", size: 34, relativeTo: .largeTitle))
                        .foregroundStyle(Color.tsInk)
                        .tracking(-0.7)

                    Text(
                        interfaceLanguage.text(
                            "Choose the language that makes daily review feel most natural.",
                            zhHans: "选择最适合你日常审阅习惯的界面语言。"
                        )
                    )
                    .font(.body)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, 12)
                .listRowInsets(
                    EdgeInsets(top: 10, leading: 2, bottom: 16, trailing: 2)
                )
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }

            Section {
                ForEach(AppLanguage.allCases) { language in
                    AppLanguageOptionRow(
                        language: language,
                        interfaceLanguage: interfaceLanguage,
                        isSelected: language == selectedLanguage
                    ) {
                        storedLanguage = language.rawValue
                    }
                }
            } header: {
                Text(interfaceLanguage.text("Language", zhHans: "语言"))
            } footer: {
                Text(
                    interfaceLanguage.text(
                        "Changes apply immediately and remain on this device.",
                        zhHans: "更改会立即生效，并保存在这台设备上。"
                    )
                )
            }

            Section {
                HStack(alignment: .top, spacing: 14) {
                    Image(systemName: "text.bubble")
                        .font(.body.weight(.medium))
                        .foregroundStyle(Color.tsMutedInk)
                        .frame(width: 28, height: 28)
                        .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 5) {
                        Text(
                            interfaceLanguage.text(
                                "Interface language only",
                                zhHans: "仅更改界面语言"
                            )
                        )
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.tsInk)

                        Text(
                            interfaceLanguage.text(
                                "Candidate names, quoted evidence, and source-authored content stay in their original language.",
                                zhHans: "候选人姓名、引用证据与来源原文会保留其原始语言。"
                            )
                        )
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.vertical, 8)
            } header: {
                Text(interfaceLanguage.text("Evidence boundary", zhHans: "证据边界"))
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.tsSurface)
        .navigationTitle(interfaceLanguage.text("Settings", zhHans: "设置"))
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("app-settings")
    }
}

private struct AppLanguageOptionRow: View {
    let language: AppLanguage
    let interfaceLanguage: AppLanguage
    let isSelected: Bool
    let select: () -> Void

    var body: some View {
        Button(action: select) {
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(language.displayName(in: interfaceLanguage))
                        .font(.body.weight(.medium))
                        .foregroundStyle(Color.tsInk)
                    Text(language.description(in: interfaceLanguage))
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 12)

                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.body)
                    .foregroundStyle(isSelected ? Color.tsInk : Color.tsLine)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 54)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(language.displayName(in: interfaceLanguage))
        .accessibilityValue(
            isSelected
                ? interfaceLanguage.text("Selected", zhHans: "已选择")
                : interfaceLanguage.text("Not selected", zhHans: "未选择")
        )
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("language-option-\(language.rawValue)")
    }
}

#Preview("Settings") {
    NavigationStack {
        AppSettingsView()
    }
    .environment(\.appLanguage, .english)
}
