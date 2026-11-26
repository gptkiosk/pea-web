import Foundation
import PEAGatewayCore
import UserNotifications

/// The part of the system that shows notifications, kept behind a protocol so tests never touch the real one.
public protocol NotificationPoster: AnyObject {
    /// Asks the owner, through the system's own prompt, whether PEA may show notifications.
    func askPermission(_ done: @escaping (Bool) -> Void)
    /// Whether the system currently lets PEA show notifications, without asking.
    func isPermitted(_ done: @escaping (Bool) -> Void)
    /// Leaves exactly these reminders waiting to be shown, and no others.
    func show(exactly reminders: [Reminder])
}

/// Decides whether reminders handed over by PEA in the browser become notifications.
/// They do only when the owner turned this on here and the system allows it. Nothing is written to a
/// file by PEA: the waiting reminders are held by the system's notification service.
public final class ReminderCenter: ReminderSink, @unchecked Sendable {
    private let poster: NotificationPoster
    private let defaults: UserDefaults
    private let lock = NSLock()
    private var on = false

    public init(poster: NotificationPoster, defaults: UserDefaults) {
        self.poster = poster
        self.defaults = defaults
        // Turned on in an earlier run: still on only if the system has not withdrawn its permission since.
        if defaults.bool(forKey: "reminders") {
            poster.isPermitted { allowed in self.set(allowed) }
        }
    }

    private func set(_ value: Bool) {
        lock.lock()
        on = value
        lock.unlock()
    }

    public var available: Bool {
        lock.lock()
        defer { lock.unlock() }
        return on
    }

    public func replace(with reminders: [Reminder]) {
        guard available else { return }
        poster.show(exactly: reminders)
    }

    /// Turns reminders on if the owner allows notifications. `done` hears whether they are now on.
    public func turnOn(_ done: @escaping (Bool) -> Void) {
        poster.askPermission { allowed in
            self.set(allowed)
            self.defaults.set(allowed, forKey: "reminders")
            done(allowed)
        }
    }

    /// Turns reminders off and withdraws every reminder still waiting.
    public func turnOff() {
        set(false)
        defaults.set(false, forKey: "reminders")
        poster.show(exactly: [])
    }
}

/// The heading a notification carries. The Time management offer, which the page hands over under
/// ids of its own, is not a reminder the owner wrote, so it is not headed as one.
public func notificationHeading(for id: String) -> String {
    id.hasPrefix("plan-offer-") ? "Time management" : "PEA reminder"
}

/// The real notification service. Only a packaged app may create one: the system refuses a bare program.
public final class SystemNotifications: NSObject, NotificationPoster, UNUserNotificationCenterDelegate {
    private static let prefix = "pea-reminder-"
    private let center = UNUserNotificationCenter.current()

    public override init() {
        super.init()
        center.delegate = self
    }

    public func askPermission(_ done: @escaping (Bool) -> Void) {
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in done(granted) }
    }

    public func isPermitted(_ done: @escaping (Bool) -> Void) {
        center.getNotificationSettings { settings in
            done(settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional)
        }
    }

    public func show(exactly reminders: [Reminder]) {
        let wanted = Dictionary(reminders.map { (SystemNotifications.prefix + $0.id, $0) }, uniquingKeysWith: { first, _ in first })
        center.getPendingNotificationRequests { pending in
            let stale = pending.map(\.identifier).filter { $0.hasPrefix(SystemNotifications.prefix) && wanted[$0] == nil }
            self.center.removePendingNotificationRequests(withIdentifiers: stale)
            for (identifier, reminder) in wanted {
                let content = UNMutableNotificationContent()
                content.title = notificationHeading(for: reminder.id)
                content.body = reminder.title
                content.sound = .default
                let moment = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: reminder.due)
                // Adding a request under an identifier already waiting replaces it.
                self.center.add(UNNotificationRequest(identifier: identifier, content: content,
                                                      trigger: UNCalendarNotificationTrigger(dateMatching: moment, repeats: false)))
            }
        }
    }

    /// What to do when the owner presses a notification: the app opens PEA in the browser.
    public var pressed: (() -> Void)?

    public func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                       withCompletionHandler completionHandler: @escaping () -> Void) {
        pressed?()
        completionHandler()
    }

    /// A reminder is shown even while PEA's own window is in front.
    public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                       withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }
}
