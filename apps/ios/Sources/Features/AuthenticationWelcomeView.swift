import SwiftUI
import UIKit

/// A gesture-led introduction with an equivalent button and a stable login area.
struct AuthenticationWelcomeView<Content: View>: View {
    @ViewBuilder let content: () -> Content
    @Environment(\.talentSignalReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.appLanguage) private var language
    @AppStorage("talent-signal.authentication.welcome-entered") private var hasEntered = false
    @State private var drag: CGFloat = 0
    @State private var appeared = false
    @State private var loginReady = false

    private var motion: Animation { reduceMotion ? .easeOut(duration: 0.18) : .spring(response: 0.78, dampingFraction: 0.84) }

    var body: some View {
        GeometryReader { geometry in
            let heroHeight: CGFloat = typeSize.isAccessibilitySize ? 174 : min(geometry.size.height * 0.39, 330)
            ScrollView {
                VStack(spacing: 0) {
                    HStack {
                        Text("Talent Signal")
                            .font(.system(.subheadline, design: .serif).weight(.medium))
                        Spacer()
                        Button {
                            withAnimation(motion) { hasEntered.toggle() }
                        } label: {
                            Text(language.text(hasEntered ? "Introduction" : "Sign in"))
                                .font(.subheadline)
                                .foregroundStyle(Color.tsMutedInk)
                                .frame(minWidth: 44, minHeight: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("welcome-skip")
                    }
                    .padding(.horizontal, 28)

                    ZStack(alignment: .bottom) {
                        AuthenticationPortraits(expanded: hasEntered)
                            .opacity(appeared ? 1 : 0)
                            .offset(y: reduceMotion ? 0 : drag * 0.2)
                        TalentSignalBrandMark()
                            .frame(width: hasEntered ? 54 : 88, height: hasEntered ? 54 : 88)
                            .rotationEffect(.degrees(hasEntered || reduceMotion ? 0 : -12))
                            .offset(y: hasEntered ? 0 : -heroHeight * 0.37)
                            .scaleEffect(appeared ? 1 : 0.85)
                            .opacity(appeared ? 1 : 0)
                            .padding(.bottom, 4)
                    }
                    .frame(height: heroHeight)
                    .padding(.top, hasEntered ? 6 : 28)

                    VStack(spacing: 14) {
                        Text(language.text("Every relationship.\nA next chapter."))
                            .font(.system(.largeTitle, design: .serif).weight(.regular))
                            .tracking(-0.9)
                            .lineSpacing(3)
                            .foregroundStyle(Color.tsInk)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                        Text(language.text("Keep the context. Make room for what’s next."))
                            .font(.subheadline)
                            .foregroundStyle(Color.tsMutedInk)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 28)
                    .padding(.top, 22)

                    Spacer(minLength: hasEntered ? 32 : 48)

                    Group {
                        if hasEntered {
                            content()
                                .opacity(loginReady ? 1 : 0)
                                .offset(y: loginReady || reduceMotion ? 0 : 24)
                                .allowsHitTesting(loginReady)
                                .accessibilityHidden(!loginReady)
                                .transition(.opacity.combined(with: reduceMotion ? .identity : .move(edge: .bottom)))
                        } else {
                            Button(action: enter) {
                                VStack(spacing: 12) {
                                    Image(systemName: "arrow.up")
                                        .font(.system(size: 22, weight: .medium))
                                        .frame(width: 60, height: 60)
                                        .background(Color.tsCanvas, in: Circle())
                                        .overlay(Circle().stroke(Color.tsLine, lineWidth: 0.5))
                                    Text(language.text("Swipe up, or tap to begin"))
                                        .font(.subheadline)
                                }
                                .foregroundStyle(Color.tsInk)
                                .frame(maxWidth: .infinity, minHeight: 100)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("welcome-enter")
                            .padding(.bottom, 20)
                        }
                    }
                    .padding(.horizontal, 28)
                    .padding(.bottom, 12)
                }
                .frame(maxWidth: 480)
                .frame(minHeight: geometry.size.height, alignment: .top)
                .frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
            .simultaneousGesture(DragGesture(minimumDistance: 20)
                .onChanged { value in
                    guard !hasEntered else { return }
                    drag = max(-100, min(0, value.translation.height))
                    if value.translation.height < -70 { enter() }
                }
                .onEnded { value in
                    if !hasEntered, value.translation.height < -45 || value.predictedEndTranslation.height < -110 { enter() }
                    withAnimation(motion) { drag = 0 }
                })
        }
        .background(Color.tsSurface.ignoresSafeArea())
        .onAppear { withAnimation(motion) { appeared = true } }
        .task(id: hasEntered) {
            loginReady = false
            guard hasEntered else { return }
            if !reduceMotion { try? await Task.sleep(for: .milliseconds(1050)) }
            guard !Task.isCancelled else { return }
            withAnimation(reduceMotion ? .easeOut(duration: 0.18) : .easeOut(duration: 0.5)) { loginReady = true }
        }
    }

    private func enter() {
        guard !hasEntered else { return }
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        withAnimation(motion) { hasEntered = true; drag = 0 }
    }
}
