import SwiftUI

struct AuthenticationEmailView: View {
    @ObservedObject var store: AppSessionStore
    @Environment(\.appLanguage) private var language
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var registering = false
    @FocusState private var focusEmail: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(language.text("Email"), text: $email)
                        .textContentType(.emailAddress).keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($focusEmail)
                        .accessibilityIdentifier("login-email")
                    SecureField(language.text("Password"), text: $password)
                        .textContentType(registering ? .newPassword : .password)
                        .accessibilityIdentifier("login-password")
                } footer: {
                    if registering { Text(language.text("Use at least 8 characters for your password.")) }
                }
                Section {
                    Button {
                        Task { await store.signInWithEmail(email: email, password: password, registering: registering) }
                    } label: {
                        HStack {
                            Text(language.text(registering ? "Create workspace" : "Sign in"))
                            Spacer()
                            if store.isWorking { ProgressView() } else { Image(systemName: "arrow.right") }
                        }
                        .frame(minHeight: 44)
                    }
                    .disabled(store.isWorking || !email.contains("@") || password.count < (registering ? 8 : 1))
                    .accessibilityIdentifier("login-email-submit")
                    Button(language.text(registering ? "Already have an account? Sign in" : "New here? Create an account")) {
                        registering.toggle(); store.notice = nil
                    }
                    .disabled(store.isWorking)
                    .frame(minHeight: 44)
                }
                if let notice = store.notice {
                    Section { Text(language.text(notice)).foregroundStyle(Color.tsMutedInk) }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.tsSurface)
            .navigationTitle(language.text("Continue with email"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button(language.text("Cancel")) { password = ""; store.notice = nil; dismiss() }.disabled(store.isWorking)
            } }
        }
    }
}
