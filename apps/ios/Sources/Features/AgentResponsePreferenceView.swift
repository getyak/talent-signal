import SwiftUI

@MainActor
struct AgentResponsePreferenceView: View {
    @ObservedObject var workspaceStore: PursuitWorkspaceStore
    @Environment(\.appLanguage) private var appLanguage
    @State private var current: AgentReplyPreference?
    @State private var style: AgentResponseStyle = .default
    @State private var busy = false
    @State private var saved = false
    @State private var failure: String?
    @State private var attempt: AgentReplyPreferenceMutation?

    var body: some View {
        Form {
            Section {
                Picker(appLanguage.text("Reply order"), selection: $style) {
                    Text(appLanguage.text("Adapt to the question")).tag(AgentResponseStyle.default)
                    Text(appLanguage.text("Conclusion first, then details")).tag(AgentResponseStyle.conclusionFirst)
                }
                .disabled(busy || current == nil)
                .accessibilityIdentifier("agent-reply-style")
                Button(appLanguage.text("Save preference")) { Task { await save() } }
                    .disabled(busy || current == nil || (style == current?.responseStyle && attempt == nil))
                    .accessibilityIdentifier("agent-reply-save")
                Button(appLanguage.text("Reload")) { Task { await load() } }
                    .disabled(busy)
                if busy { ProgressView() }
                if saved { Text(appLanguage.text("Saved. New conversations will use this preference.")) }
                if let failure { Text(failure).foregroundStyle(Color.tsVermilion) }
            } footer: {
                Text(appLanguage.text("Your saved reply preference syncs across Web and iOS. Your current request takes precedence. Reset it by choosing Adapt to the question."))
            }
        }
        .navigationTitle(appLanguage.text("Reply preference"))
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(Color.tsSurface)
        .onChange(of: style) { _ in attempt = nil; saved = false }
        .task { await load() }
    }
    private func load() async {
        busy = true; saved = false; failure = nil
        defer { busy = false }
        do { let result = try await workspaceStore.loadReplyPreference(); current = result; style = result.responseStyle; attempt = nil }
        catch { failure = error.localizedDescription }
    }
    private func save() async {
        guard let current else { return }
        busy = true; saved = false; failure = nil
        defer { busy = false }
        do {
            let request = attempt ?? AgentReplyPreferenceMutation(idempotencyKey: UUID().uuidString, expectedRevision: current.revision, responseStyle: style)
            attempt = request
            self.current = try await workspaceStore.saveReplyPreference(request)
            attempt = nil; saved = true
        } catch { failure = error.localizedDescription }
    }
}
