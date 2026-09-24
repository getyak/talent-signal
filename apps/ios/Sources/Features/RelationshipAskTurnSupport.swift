import SwiftUI

struct AskPendingMediaStrip: View {
    let drafts: [AskMediaDraft]
    let language: AppLanguage

    private var visibleDrafts: [AskMediaDraft] { Array(drafts.prefix(3)) }

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(visibleDrafts.enumerated()), id: \.element.id) { index, draft in
                Image(uiImage: draft.preview)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 58, height: 58)
                    .clipShape(RoundedRectangle(cornerRadius: 13))
                    .overlay {
                        if index == 2, drafts.count > 3 {
                            RoundedRectangle(cornerRadius: 13)
                                .fill(Color.black.opacity(0.48))
                            Text(verbatim: "+\(drafts.count - 3)")
                                .font(.headline)
                                .foregroundStyle(.white)
                        }
                    }
            }
        }
        .padding(3)
        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.tsLine, lineWidth: 1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            String(drafts.count) + " · "
                + language.text("Task images, not evidence")
        )
        .accessibilityIdentifier("ask-pending-media")
    }
}


struct AskUserMessageBubble: View {
    let message: String
    var accessibilityIdentifier = "ask-user-message"

    var body: some View {
        ViewThatFits(in: .horizontal) {
            bubble(fixesWidth: true)
            bubble(fixesWidth: false)
                .frame(maxWidth: 330, alignment: .trailing)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(message)
        .accessibilityIdentifier(accessibilityIdentifier)
    }

    private func bubble(fixesWidth: Bool) -> some View {
        Text(message)
            .font(.body)
            .foregroundStyle(Color.tsInk)
            .fixedSize(horizontal: fixesWidth, vertical: true)
            .padding(.horizontal, 15)
            .padding(.vertical, 11)
            .background(
                Color.tsSurfaceMuted,
                in: RoundedRectangle(cornerRadius: 17, style: .continuous)
            )
    }
}

