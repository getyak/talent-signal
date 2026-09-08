import SwiftUI
import UIKit

/// A reversible, direct-manipulation invitation with an equivalent tap action.
struct AuthenticationWelcomeView<Content: View>: View {
    var openLab: (() -> Void)? = nil
    var needsRecovery = false
    @ViewBuilder let content: () -> Content
    @Environment(\.talentSignalReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.appLanguage) private var language
    @AppStorage("talent-signal.authentication.welcome-entered") private var hasEntered = false
    @GestureState(resetTransaction: Transaction(animation: .spring(response: 0.58, dampingFraction: 0.86)))
    private var pull: CGFloat = 0

    private var motion: Animation {
        reduceMotion ? .easeOut(duration: 0.18) : .spring(response: 0.62, dampingFraction: 0.86)
    }

    var body: some View {
        GeometryReader { geometry in
            let travel = max(170, min(235, geometry.size.height * 0.28))
            let progress = hasEntered ? CGFloat(1) : min(1, pull / travel)
            let heroHeight: CGFloat = typeSize.isAccessibilitySize ? 174 : min(geometry.size.height * 0.43, 350)
            ScrollView {
                VStack(spacing: 0) {
                    HStack {
                        Text("Talent Signal")
                            .font(.system(.subheadline, design: .serif).weight(.medium))
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                            .accessibilityIdentifier("welcome-brand")
                            .contextMenu {
                                if let openLab {
                                    Button(action: openLab) {
                                        Label(language.text("LAB · Experiments & tools"), systemImage: "flask")
                                    }
                                    .accessibilityIdentifier("login-product-lab")
                                }
                            }
                        Spacer()
                        Button {
                            if hasEntered {
                                withAnimation(motion) { hasEntered = false }
                            } else { enter() }
                        } label: {
                            Group {
                                if hasEntered {
                                    Image(systemName: "arrow.counterclockwise")
                                        .font(.system(size: 18, weight: .regular))
                                } else { Text(language.text("Sign in")) }
                            }
                            .font(.subheadline)
                            .foregroundStyle(Color.tsMutedInk)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(language.text(hasEntered ? "Introduction" : "Sign in"))
                        .accessibilityIdentifier("welcome-skip")
                    }
                    .padding(.horizontal, 28)

                    if !typeSize.isAccessibilitySize || !hasEntered {
                        ZStack(alignment: .bottom) {
                            AuthenticationPortraits(progress: progress)
                            TalentSignalBrandMark()
                                .frame(width: 76, height: 76)
                                .opacity(reduceMotion ? 1 : Double(
                                    1 - AuthenticationPortraitLayout.phase(progress, from: 0.08, to: 0.32)
                                    + AuthenticationPortraitLayout.phase(progress, from: 0.88, to: 1)))
                                .scaleEffect(1 - (reduceMotion ? (hasEntered ? CGFloat(1) : 0) : progress) * 0.42)
                                .rotationEffect(.degrees(reduceMotion ? 0 : -12 * (1 - progress)))
                                .offset(y: -heroHeight * 0.38 * (1 - (reduceMotion ? (hasEntered ? CGFloat(1) : 0) : progress)))
                                .transaction { if reduceMotion { $0.animation = nil } }
                                .padding(.bottom, 4)
                        }
                        .frame(height: heroHeight)
                        .padding(.top, 12)

                        Text(language.text("Every relationship.\nA next chapter."))
                            .font(.system(typeSize.isAccessibilitySize ? .title3 : .largeTitle, design: .serif).weight(.regular))
                            .lineLimit(nil)
                            .tracking(-0.9)
                            .lineSpacing(3)
                            .foregroundStyle(Color.tsInk)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                            .padding(.horizontal, 28)
                            .padding(.top, 16)
                    }

                    Spacer(minLength: 28)

                    Group {
                        if hasEntered {
                            content()
                                .transition(.opacity.combined(with: reduceMotion ? .identity : .offset(y: 18)))
                        } else {
                            Button(action: enter) {
                                VStack(spacing: 12) {
                                    Image(systemName: "chevron.up")
                                        .font(.system(size: 20, weight: .medium))
                                        .frame(width: 56, height: 56)
                                        .background(Color.tsCanvas, in: Circle())
                                    Text(language.text("Swipe up, or tap to begin"))
                                        .font(.subheadline)
                                }
                                .foregroundStyle(Color.tsInk)
                                .frame(maxWidth: .infinity, minHeight: 100)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .offset(y: reduceMotion ? 0 : -min(pull, travel) * 0.12)
                            .opacity(1 - Double(progress) * 0.55)
                            .accessibilityIdentifier("welcome-enter")
                            .highPriorityGesture(revealGesture(travel: travel))
                        }
                    }
                    .padding(.horizontal, 28)
                    .padding(.bottom, 24)
                }
                .frame(maxWidth: 480)
                .frame(minHeight: geometry.size.height, alignment: .top)
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
            }
            .scrollIndicators(.hidden)
            .scrollDisabled(!hasEntered && !typeSize.isAccessibilitySize && geometry.size.height > 600)
            .simultaneousGesture(revealGesture(travel: travel))
        }
        .background(Color.tsSurface.ignoresSafeArea())
        .onAppear {
#if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--welcome-first-meeting") { hasEntered = false }
#endif
            if needsRecovery { hasEntered = true }
        }
        .onChange(of: needsRecovery) { required in
            if required { withAnimation(motion) { hasEntered = true } }
        }
    }

    private func revealGesture(travel: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 8)
            .updating($pull) { value, state, transaction in
                guard !hasEntered, value.translation.height < 0,
                      abs(value.translation.height) > abs(value.translation.width) else { return }
                transaction.animation = nil
                state = -value.translation.height
            }
            .onEnded { value in
                guard !hasEntered else { return }
                if AuthenticationWelcomeGesture.shouldEnter(translation: value.translation,
                    predicted: value.predictedEndTranslation, travel: travel) { enter() }
            }
    }

    private func enter() {
        guard !hasEntered else { return }
        if !reduceMotion { UIImpactFeedbackGenerator(style: .soft).impactOccurred() }
        withAnimation(motion) { hasEntered = true }
    }
}

enum AuthenticationWelcomeGesture {
    static func shouldEnter(translation: CGSize, predicted: CGSize, travel: CGFloat) -> Bool {
        let distance = -translation.height
        guard distance > abs(translation.width) else { return false }
        // A small exploratory tug always returns, regardless of a noisy fling prediction.
        return distance >= travel * 0.62 || (distance >= travel * 0.28 && -predicted.height >= travel)
    }
}
