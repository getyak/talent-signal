import Foundation
import SwiftUI

struct LabDisplayConfiguration: Codable, Equatable {
    enum Theme: String, Codable, CaseIterable { case system, light, dark
        var colorScheme: ColorScheme? { self == .dark ? .dark : self == .light ? .light : nil }
        var title: String { self == .system ? "Follow System" : self == .dark ? "Dark" : "Light" }
    }
    enum Language: String, Codable, CaseIterable { case current, english, chinese
        var value: AppLanguage? { self == .current ? nil : self == .english ? .english : .simplifiedChinese }
        var title: String { self == .current ? "Current language" : self == .english ? "English" : "简体中文" }
    }
    enum TextSize: String, Codable, CaseIterable { case current, large, extraLarge, accessibility1, accessibility3, accessibility5
        var requested: DynamicTypeSize? {
            switch self { case .current: nil; case .large: .large; case .extraLarge: .xxxLarge; case .accessibility1: .accessibility1; case .accessibility3: .accessibility3; case .accessibility5: .accessibility5 }
        }
        var title: String {
            switch self { case .current: "Current text size"; case .large: "Large"; case .extraLarge: "Extra large"; case .accessibility1: "Accessibility 1"; case .accessibility3: "Accessibility 3"; case .accessibility5: "Accessibility 5" }
        }
        func resolved(_ inherited: DynamicTypeSize) -> DynamicTypeSize {
            guard let requested else { return inherited }
            return inherited.isAccessibilitySize ? max(inherited, requested) : requested
        }
    }
    enum Density: String, Codable, CaseIterable { case current, compact, standard, comfortable
        var value: WorkspaceCardDensityPreference? { self == .current ? nil : .stored(rawValue) }
        var title: String { self == .current ? "Current card density" : self == .compact ? "Compact" : self == .standard ? "Standard" : "Comfortable" }
    }
    var theme: Theme = .system
    var language: Language = .current
    var textSize: TextSize = .current
    var density: Density = .current
    var reduceMotion = false
    var reduceTransparency = false
    var contrastBoost = false
    var layoutBounds = false
    static let standard = LabDisplayConfiguration()
}

struct LabDisplayPreset: Codable, Identifiable, Equatable {
    let id: UUID
    var name: String
    let configuration: LabDisplayConfiguration
}

enum LabPreviewPage: String, CaseIterable, Identifiable, Codable {
    case people, today, sessions, review, fullReview, onboarding
    var id: String { rawValue }
    var title: String {
        switch self { case .people: "People"; case .today: "Today"; case .sessions: "Sessions"; case .review: "Review · concise"; case .fullReview: "Review · full evidence"; case .onboarding: "Onboarding" }
    }
    var states: [LabPreviewState] {
        switch self {
        case .people, .sessions: LabPreviewState.allCases
        case .today: [.ready, .loading, .empty, .failed, .stale]
        case .review, .fullReview, .onboarding: [.ready]
        }
    }
}
enum LabPreviewState: String, CaseIterable, Identifiable, Codable {
    case ready, loading, empty, failed, stale, partial, longContent
    var id: String { rawValue }
    var title: String {
        switch self { case .ready: "Ready"; case .loading: "Loading"; case .empty: "Empty"; case .failed: "Failed"; case .stale: "Stale read"; case .partial: "Missing details"; case .longContent: "Long names & content" }
    }
}
