import SwiftUI

struct SelectedTextServiceBridge: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .onReceive(NotificationCenter.default.publisher(for: .talentSignalSelectedTextServiceRequest)) { notification in
                guard let request = notification.object as? SelectedTextServiceRequest,
                      model.addServiceSelectedText(request.text, requestID: request.id) else {
                    return
                }
                openWindow(id: "quick-panel")
            }
            .accessibilityHidden(true)
    }
}
