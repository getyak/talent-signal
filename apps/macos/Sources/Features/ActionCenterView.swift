import SwiftUI

struct ActionCenterView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                HStack(alignment: .top, spacing: 20) {
                    VStack(alignment: .leading, spacing: 7) {
                        SectionLabel(text: "Attention and recovery")
                        Text("Action Center")
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundStyle(TSBrand.ink)
                        Text("Current decisions, recovery, and verified receipts — projected from their canonical objects.")
                            .foregroundStyle(TSBrand.secondaryInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 16)
                    TSStatusBadge(
                        title: "\(model.actionCenterCount) current",
                        systemImage: "checklist"
                    )
                }

                if !model.hasActionCenterWork {
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
                    VStack(spacing: 0) {
                        if model.reminderNeedsActionCenter {
                            ReminderActionCenterRow()
                            if !model.actionCenterProjections.isEmpty {
                                Divider().padding(.leading, 74)
                            }
                        }
                        ForEach(Array(model.actionCenterProjections.enumerated()), id: \.element.id) { index, action in
                            ActionProjectionRow(action: action)
                            if index < model.actionCenterProjections.count - 1 {
                                Divider().padding(.leading, 74)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                    .tsSurface(raised: true)
                }
            }
            .frame(maxWidth: 1_060, alignment: .leading)
            .padding(.horizontal, 48)
            .padding(.vertical, 38)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .navigationTitle("Action Center")
        .background(TSBrand.canvas)
        .accessibilityIdentifier("action.center")
    }
}

private struct ReminderActionCenterRow: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(isAttention ? TSBrand.seamTint : TSBrand.evidenceTint)
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(isAttention ? TSBrand.seam : TSBrand.evidence)
            }
            .frame(width: 42, height: 42)
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(TSBrand.ink)
                TSStatusBadge(title: status, systemImage: icon, isAttention: isAttention)
                Text(detail)
                    .font(.callout)
                    .foregroundStyle(TSBrand.secondaryInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            Button("Open reminder") {
                openWindow(id: "quick-panel")
            }
            .buttonStyle(.bordered)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("action.reminder")
    }

    private var title: String {
        switch model.reminderOperationState {
        case .readyForApproval: "Follow-up reminder"
        case .saved(let receipt): receipt.title
        case .removed: "Removed follow-up reminder"
        default: "Follow-up reminder"
        }
    }

    private var status: String {
        switch model.reminderOperationState {
        case .loadingDestination: "Reading destination"
        case .readyForApproval: "Awaiting your approval"
        case .executing: "Writing and verifying"
        case .saved: "Verified · removal available"
        case .failed: "Preview failed"
        case .unknown: "Outcome unknown"
        case .removing: "Removing and verifying"
        case .removalFailed: "Removal failed"
        case .removalUnknown: "Removal outcome unknown"
        case .notPrepared: "Not prepared"
        case .removed: "Removal verified"
        }
    }

    private var detail: String {
        switch model.reminderOperationState {
        case .failed(let message), .unknown(let message): message
        case .removalFailed(_, let message), .removalUnknown(_, let message): message
        case .readyForApproval: "Review the exact title, due time, and Apple Reminders list before creating it."
        case .saved(let receipt): "Verified in \(receipt.destinationTitle). Open the receipt to keep or remove it."
        case .loadingDestination: "No reminder has been created."
        case .executing: "One approved write is in progress; do not retry."
        case .removing: "One approved removal is in progress; do not retry."
        case .removed: "Destination readback proves that the reminder is absent."
        case .notPrepared: "No reminder proposal exists."
        }
    }

    private var icon: String {
        switch model.reminderOperationState {
        case .saved: "checkmark.seal"
        case .unknown, .removalUnknown: "questionmark.circle"
        case .failed, .removalFailed: "exclamationmark.triangle"
        case .removing: "trash"
        case .removed: "trash.circle"
        case .loadingDestination, .executing: "hourglass"
        case .readyForApproval: "calendar.badge.plus"
        case .notPrepared: "calendar"
        }
    }

    private var isAttention: Bool {
        switch model.reminderOperationState {
        case .failed, .unknown, .removalFailed, .removalUnknown, .readyForApproval:
            true
        default:
            false
        }
    }
}

private struct ActionProjectionRow: View {
    @EnvironmentObject private var model: AppModel
    let action: ActionProjection

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(isAttention ? TSBrand.seamTint : TSBrand.evidenceTint)
                Image(systemName: action.status.icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(isAttention ? TSBrand.seam : TSBrand.evidence)
            }
            .frame(width: 42, height: 42)
            VStack(alignment: .leading, spacing: 6) {
                Text(action.objectName)
                    .font(.headline)
                    .foregroundStyle(TSBrand.ink)
                    .fixedSize(horizontal: false, vertical: true)
                TSStatusBadge(
                    title: action.status.title,
                    systemImage: action.status.icon,
                    isAttention: isAttention
                )
                Text(action.consequence)
                    .font(.callout)
                Text(action.authority)
                    .font(.caption)
                    .foregroundStyle(TSBrand.secondaryInk)
                Text("Next: \(action.nextOperation)")
                    .font(.caption)
                    .foregroundStyle(TSBrand.secondaryInk)
            }
            Spacer()
            Button(action.route.buttonTitle) {
                Task { await model.openActionProjection(action) }
            }
                .buttonStyle(.bordered)
                .controlSize(.regular)
                .accessibilityIdentifier("action.open.\(action.id)")
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("action.row.\(action.id)")
    }

    private var isAttention: Bool {
        action.status == .failed || action.status == .outcomeUnknown || action.status == .awaitingDecision
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
