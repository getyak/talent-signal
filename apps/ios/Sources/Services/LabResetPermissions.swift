import AVFAudio
import Contacts
import EventKit
import Photos

// Read-only status snapshot. Opening reset review never requests a permission
// or reads any protected media, address-book entry or calendar event.
struct LabResetPermissions {
    let microphone: String
    let photos: String
    let contacts: String
    let calendar: String
    @MainActor static func current() -> Self {
        let microphone: String
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted: microphone = "Allowed"
            case .denied: microphone = "Denied"
            default: microphone = "Not requested"
            }
        } else {
            switch AVAudioSession.sharedInstance().recordPermission {
            case .granted: microphone = "Allowed"
            case .denied: microphone = "Denied"
            default: microphone = "Not requested"
            }
        }
        let photos: String
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .authorized: photos = "Allowed"
        case .limited: photos = "Selected photos only"
        case .denied: photos = "Denied"
        case .restricted: photos = "Restricted by system"
        case .notDetermined: photos = "Not requested"
        @unknown default: photos = "Not reported"
        }
        let contacts: String
        let contactStatus = CNContactStore.authorizationStatus(for: .contacts)
        if #available(iOS 18.0, *), contactStatus == .limited { contacts = "Selected contacts only" }
        else {
            switch contactStatus {
            case .authorized: contacts = "Allowed"
            case .denied: contacts = "Denied"
            case .restricted: contacts = "Restricted by system"
            case .notDetermined: contacts = "Not requested"
            default: contacts = "Not reported"
            }
        }
        let calendar: String
        let calendarStatus = EKEventStore.authorizationStatus(for: .event)
        if #available(iOS 17.0, *), calendarStatus == .fullAccess { calendar = "Full calendar access" }
        else if #available(iOS 17.0, *), calendarStatus == .writeOnly { calendar = "Write-only calendar access" }
        else {
            switch calendarStatus {
            case .authorized: calendar = "Allowed"
            case .denied: calendar = "Denied"
            case .restricted: calendar = "Restricted by system"
            case .notDetermined: calendar = "Not requested"
            default: calendar = "Not reported"
            }
        }
        return .init(microphone: microphone, photos: photos, contacts: contacts, calendar: calendar)
    }
}
