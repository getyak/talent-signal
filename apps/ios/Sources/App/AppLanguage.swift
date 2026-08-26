import Foundation
import SwiftUI

enum AppLanguage: String, CaseIterable, Identifiable {
    case system
    case english = "en"
    case simplifiedChinese = "zh-Hans"

    static let storageKey = "talent-signal.interface-language"

    var id: String { rawValue }

    static func stored(_ rawValue: String?) -> AppLanguage {
        rawValue.flatMap(AppLanguage.init(rawValue:)) ?? .system
    }

    var locale: Locale {
        switch self {
        case .system:
            return .autoupdatingCurrent
        case .english:
            return Locale(identifier: "en")
        case .simplifiedChinese:
            return Locale(identifier: "zh-Hans")
        }
    }

    func usesSimplifiedChinese(
        preferredLanguages: [String] = Locale.preferredLanguages
    ) -> Bool {
        switch self {
        case .simplifiedChinese:
            return true
        case .english:
            return false
        case .system:
            return preferredLanguages.first?.lowercased().hasPrefix("zh") == true
        }
    }

    func text(
        _ key: String,
        preferredLanguages: [String] = Locale.preferredLanguages
    ) -> String {
        let localization = usesSimplifiedChinese(
            preferredLanguages: preferredLanguages
        ) ? "zh-Hans" : "en"
        guard let path = Bundle.main.path(
            forResource: localization,
            ofType: "lproj"
        ), let bundle = Bundle(path: path) else {
            return key
        }
        return bundle.localizedString(forKey: key, value: key, table: nil)
    }

    /// Transitional compatibility for the original inline bilingual calls.
    /// New interface copy belongs in `Localizable.xcstrings` and uses
    /// `text(_:preferredLanguages:)` without a second sentence in the view.
    func text(
        _ english: String,
        zhHans: String,
        preferredLanguages: [String] = Locale.preferredLanguages
    ) -> String {
        let localized = text(
            english,
            preferredLanguages: preferredLanguages
        )
        guard usesSimplifiedChinese(preferredLanguages: preferredLanguages),
              localized == english else {
            return localized
        }
        return zhHans
    }

    func displayName(in interfaceLanguage: AppLanguage) -> String {
        switch self {
        case .system:
            return interfaceLanguage.text("Follow System")
        case .english:
            return "English"
        case .simplifiedChinese:
            return "简体中文"
        }
    }

    func description(in interfaceLanguage: AppLanguage) -> String {
        switch self {
        case .system:
            return interfaceLanguage.text(
                "Match the language selected on this iPhone."
            )
        case .english:
            return interfaceLanguage.text(
                "Use English for Talent Signal controls and guidance."
            )
        case .simplifiedChinese:
            return interfaceLanguage.text(
                "Use Simplified Chinese for Talent Signal controls and guidance."
            )
        }
    }

    func workspaceTerm(_ english: String) -> String {
        text(english)
    }
}

private struct AppLanguageEnvironmentKey: EnvironmentKey {
    static let defaultValue = AppLanguage.system
}

extension EnvironmentValues {
    var appLanguage: AppLanguage {
        get { self[AppLanguageEnvironmentKey.self] }
        set { self[AppLanguageEnvironmentKey.self] = newValue }
    }
}
