import SwiftUI

struct ActionCenterView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Action Center")
                        .font(.title2.weight(.semibold))
                    Text("A live projection of decisions, execution, recovery, and verified receipts. It is not a second action record.")
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if model.presentation.actionProjections.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "checklist")
                            .font(.title2)
                        Text("Nothing needs attention")
                            .font(.headline)
                        Text("Intentional no-action stays visible without manufacturing work.")
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, minHeight: 180)
                } else {
                    VStack(spacing: 10) {
                        ForEach(model.presentation.actionProjections) { action in
                            ActionProjectionRow(action: action)
                        }
                    }
                }
            }
            .frame(maxWidth: 850, alignment: .leading)
            .padding(36)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .navigationTitle("Action Center")
        .accessibilityIdentifier("action.center")
    }
}

private struct ActionProjectionRow: View {
    @EnvironmentObject private var model: AppModel
    let action: ActionProjection

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: action.status.icon)
                .font(.title3)
                .foregroundStyle(action.status == .failed || action.status == .outcomeUnknown ? TSBrand.seam : TSBrand.evidence)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 6) {
                Text(action.objectName)
                    .font(.headline)
                    .fixedSize(horizontal: false, vertical: true)
                Text(action.status.title)
                    .font(.subheadline.weight(.semibold))
                Text(action.consequence)
                    .font(.callout)
                Text(action.authority)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("Next: \(action.nextOperation)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button(action.route.buttonTitle) {
                Task { await model.openActionProjection(action) }
            }
                .accessibilityIdentifier("action.open.\(action.id)")
        }
        .padding(16)
        .background(TSBrand.surface, in: RoundedRectangle(cornerRadius: 9))
        .overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.secondary.opacity(0.18)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("action.row.\(action.id)")
    }
}

private extension ActionProjectionRoute {
    var buttonTitle: String {
        switch self {
        case .reviewDecision: "Review decision"
        case .reconcileOperation: "Reconcile outcome"
        case .openReceipt: "Open receipt"
        case .reviewStaleSource: "Review changed source"
        case .openCurrent: "Open current object"
        }
    }
}
