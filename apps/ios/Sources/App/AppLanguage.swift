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
        _ english: String,
        zhHans: String,
        preferredLanguages: [String] = Locale.preferredLanguages
    ) -> String {
        usesSimplifiedChinese(preferredLanguages: preferredLanguages)
            ? zhHans
            : english
    }

    func displayName(in interfaceLanguage: AppLanguage) -> String {
        switch self {
        case .system:
            return interfaceLanguage.text("Follow System", zhHans: "跟随系统")
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
                "Match the language selected on this iPhone.",
                zhHans: "与这台 iPhone 的系统语言保持一致。"
            )
        case .english:
            return interfaceLanguage.text(
                "Use English for Talent Signal controls and guidance.",
                zhHans: "Talent Signal 的控件与引导使用英文。"
            )
        case .simplifiedChinese:
            return interfaceLanguage.text(
                "Use Simplified Chinese for Talent Signal controls and guidance.",
                zhHans: "Talent Signal 的控件与引导使用简体中文。"
            )
        }
    }

    func workspaceTerm(_ english: String) -> String {
        guard usesSimplifiedChinese() else { return english }
        switch english {
        case "Due action · review context": return "到期行动 · 查看背景"
        case "Review": return "待审阅"
        case "Review interrupted": return "审阅已中断"
        case "Evidence-backed gap": return "有证据支持的缺口"
        case "Evidence partly unavailable": return "部分证据不可用"
        case "Recruiter-authored": return "招聘顾问记录"
        case "Evidence unavailable": return "证据不可用"
        case "Owned action": return "已负责的行动"
        case "Current gap": return "当前缺口"
        case "Review proposal": return "审阅提议"
        case "Record owned action outcome": return "记录行动结果"
        case "Open Pursuit": return "打开目标"
        default: return english
        }
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
