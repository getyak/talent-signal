import SwiftUI

struct RelationshipContinueRow: View {
    let initials: String
    let name: String
    let context: String
    let status: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                RelationshipInitials(initials: initials, size: 40)
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline, spacing: 7) {
                        Text(name)
                            .font(.custom("Georgia", size: 16, relativeTo: .body))
                            .foregroundStyle(Color.tsInk)
                        Text(context)
                            .font(.caption2)
                            .foregroundStyle(Color.tsMutedInk)
                    }
                    Text(status)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
            }
            .frame(minHeight: 68)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
    }
}


struct RelationshipPersonRow: View {
    let person: RelationshipArchivePerson
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 14) {
                RelationshipInitials(initials: person.initials, size: 50)
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(person.state.rawValue.uppercased())
                            .font(.caption2.weight(.bold))
                            .tracking(0.7)
                            .foregroundStyle(
                                person.state == .changed
                                    ? Color.tsVermilion
                                    : Color.tsMutedInk
                            )
                        Spacer()
                        Text(person.recency.uppercased())
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color.tsMutedInk)
                    }
                    Text(person.name)
                        .font(.custom("Georgia", size: 19, relativeTo: .headline))
                        .foregroundStyle(Color.tsInk)
                    Text("\(person.role) · \(person.company)")
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(person.dependency)
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 3)
                }
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .frame(minHeight: 50)
            }
            .padding(.vertical, 20)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
        .accessibilityIdentifier("relationship-person-\(person.id)")
    }
}


struct RelationshipLibraryRow: View {
    let systemImage: String
    let title: String
    let detail: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Image(systemName: systemImage)
                    .font(.body)
                    .foregroundStyle(Color.tsMutedInk)
                    .frame(width: 42, height: 42)
                    .overlay { Circle().stroke(Color.tsLine, lineWidth: 1) }
                VStack(alignment: .leading, spacing: 5) {
                    Text(title)
                        .font(.custom("Georgia", size: 16, relativeTo: .body))
                        .foregroundStyle(Color.tsInk)
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
            }
            .frame(minHeight: 82)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
    }
}


struct RelationshipCollectionLabel: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
        }
        .font(.caption2.weight(.semibold))
        .tracking(0.8)
        .textCase(.uppercase)
        .foregroundStyle(Color.tsMutedInk)
        .frame(minHeight: 44)
        .overlay(alignment: .top) { Divider().overlay(Color.tsLine) }
    }
}

