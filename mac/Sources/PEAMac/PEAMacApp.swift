import AppKit
import PEAGatewayCore
import PEALauncherCore
import ServiceManagement
import SwiftUI

/// PEA for Mac: a menu-bar and Dock launcher. It runs PEA's gateway on this Mac and opens PEA in the
/// owner's normal browser. There is no web view here, so sign-in and voice work as they do on the web.
@main
struct PEAMacApp: App {
    @StateObject private var launcher: Launcher

    init() {
        // Packaged, the web files are inside the app. PEA_WEB_ROOT is for running from source.
        let root = ProcessInfo.processInfo.environment["PEA_WEB_ROOT"].map { URL(fileURLWithPath: $0, isDirectory: true) }
            ?? Bundle.main.resourceURL!.appendingPathComponent("browser", isDirectory: true)
        let service = (Bundle.main.bundleIdentifier ?? "pea.development") + ".gateway"
        // Notifications belong to a packaged app; run from source, PEA simply has no reminders.
        let packaged = Bundle.main.bundleIdentifier != nil && Bundle.main.bundleURL.pathExtension == "app"
        let launcher = Launcher(webRoot: root, tokens: KeychainTokenStore(service: service), defaults: .standard,
                                notifications: packaged ? SystemNotifications() : nil)
        _launcher = StateObject(wrappedValue: launcher)
        launcher.start()
    }

    var body: some Scene {
        Window("PEA", id: "main") {
            StatusView().environmentObject(launcher)
        }
        .windowResizability(.contentSize)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Open PEA") { open(launcher) }.keyboardShortcut("o").disabled(!launcher.isRunning)
            }
        }
        MenuBarExtra("PEA", systemImage: launcher.isRunning ? "leaf.fill" : "leaf") {
            Actions().environmentObject(launcher)
        }
    }
}

@MainActor func open(_ launcher: Launcher) {
    NSWorkspace.shared.open(launcher.address)
}

@MainActor func statusLine(_ launcher: Launcher) -> String {
    switch launcher.status {
    case .stopped: return "PEA is stopped"
    case .starting: return "PEA is starting…"
    case .running: return "PEA is running at 127.0.0.1:\(launcher.port)"
    case .portBusy: return "Port \(launcher.port) is in use by another program"
    case .failed(let reason): return "PEA could not start: \(reason)"
    }
}

/// The actions, shared by the menu-bar menu and the window.
struct Actions: View {
    @EnvironmentObject var launcher: Launcher
    @State private var startsAtLogin = SMAppService.mainApp.status == .enabled
    @State private var checking = false

    var body: some View {
        Text(statusLine(launcher))
        Text("Version \(launcher.version)")
        Divider()
        Button("Open PEA") { open(launcher) }.disabled(!launcher.isRunning)
        Button("Copy Connection Token") { copyToken() }
        Button("Local Model Address…") { askForModelAddress() }
        Button(launcher.engineAddress == nil ? "Project Engine…" : "Project Engine (Connected)…") { askForEngine() }
        if case .portBusy(let free) = launcher.status {
            Divider()
            if let free {
                Button("Use Port \(free) Instead…") { confirmPort(free) }
            }
            Button("Try Port \(launcher.port) Again") { launcher.start() }
        } else if case .failed = launcher.status {
            Button("Try Again") { launcher.start() }
        }
        Divider()
        Toggle("Start at Login", isOn: Binding(get: { startsAtLogin }, set: { setLogin($0) }))
        if launcher.canRemind {
            Toggle("Show Reminders as Notifications", isOn: Binding(get: { launcher.remindersOn }, set: { setReminders($0) }))
        }
        if let page = launcher.releasesPage {
            Button("Check for Updates…") { checkForUpdates() }.disabled(checking)
            Button("Releases") { NSWorkspace.shared.open(page) }
        }
        Divider()
        Button("Quit PEA") { NSApplication.shared.terminate(nil) }.keyboardShortcut("q")
    }

    private func copyToken() {
        do {
            let token = try launcher.token()
            NSPasteboard.general.clearContents()
            // Marked so clipboard managers that honor the convention do not keep a copy.
            NSPasteboard.general.setString(token, forType: .string)
            NSPasteboard.general.setString("", forType: NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType"))
            tell("Connection token copied", "In PEA, open Connections, choose Local model, and paste it into the connection token field. It stays in your Keychain; PEA never shows it.")
        } catch {
            tell("The token could not be read", String(describing: error))
        }
    }

    private func askForModelAddress() {
        let alert = NSAlert()
        alert.messageText = "Local model address"
        alert.informativeText = "The model server on this Mac, for example Ollama at http://127.0.0.1:11434. Only an address on this Mac is accepted; PEA will not send chat anywhere else through this route."
        let field = NSTextField(string: launcher.upstream)
        field.frame = NSRect(x: 0, y: 0, width: 320, height: 24)
        alert.accessoryView = field
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Cancel")
        NSApp.activate(ignoringOtherApps: true)
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        do { try launcher.use(upstream: field.stringValue) } catch { tell("That address was not saved", String(describing: error)) }
    }

    /// Two steps: where the engine is, then which file holds the access it issued. The app reads
    /// that file only to check it can be used, and never shows, copies or stores what is in it.
    private func askForEngine() {
        let alert = NSAlert()
        alert.messageText = "Project engine"
        alert.informativeText = "Optional: PEA does not need this. MCD adds an agent project and assignment engine to your assistant. If you want it, install and start MCD, then paste the address of your MCD server, on this Mac or in the cloud. RCD works the same way. An engine on this Mac starts with http://, and one anywhere else starts with https:// and its host name. Next you choose the file holding the access the engine issued for PEA. PEA can then list your projects, show their progress and leave drafts. It cannot plan, approve, start or pay for anything; that stays in the engine."
            + (launcher.engineAddress == nil ? "" : "\n\nConnected now" + (launcher.engineReady ? "." : ", but its access file cannot be used, so projects are not available."))
        let field = NSTextField(string: launcher.engineAddress ?? "")
        field.placeholderString = "Address of your MCD server"
        field.frame = NSRect(x: 0, y: 0, width: 320, height: 24)
        alert.accessoryView = field
        alert.addButton(withTitle: "Choose Access File…")
        alert.addButton(withTitle: "Cancel")
        if launcher.engineAddress != nil { alert.addButton(withTitle: "Disconnect") }
        NSApp.activate(ignoringOtherApps: true)
        alert.window.initialFirstResponder = field
        let answer = alert.runModal()
        if answer == .alertThirdButtonReturn {
            Task {
                await launcher.removeEngine()
                tell("Project engine disconnected", "PEA no longer asks it anything. The access file was not touched; revoke PEA’s access in the engine if you no longer want it.")
            }
            return
        }
        guard answer == .alertFirstButtonReturn else { return }
        let panel = NSOpenPanel()
        panel.message = "Choose the file holding the access your project engine issued for PEA."
        panel.prompt = "Use This File"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.resolvesAliases = false
        panel.showsHiddenFiles = true
        if let current = launcher.engineTokenFile { panel.directoryURL = URL(fileURLWithPath: current).deletingLastPathComponent() }
        guard panel.runModal() == .OK, let file = panel.url else { return }
        let address = field.stringValue
        Task {
            do {
                try await launcher.use(engine: address, tokenFile: file.path)
                tell("Project engine connected", "In PEA in your browser, reload the page and open Projects on Today. If PEA was running, it has restarted at the same address.")
            } catch {
                tell("The project engine was not connected", String(describing: error))
            }
        }
    }

    private func confirmPort(_ free: UInt16) {
        let alert = NSAlert()
        alert.messageText = "Use port \(free)?"
        alert.informativeText = "Your browser treats each port as a separate site. Chats, memories and boards you saved in the browser at port \(launcher.port) will not appear at port \(free), and will still be there if you go back. Nothing is deleted."
        alert.addButton(withTitle: "Use Port \(free)")
        alert.addButton(withTitle: "Cancel")
        NSApp.activate(ignoringOtherApps: true)
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        Task { await launcher.use(port: free) }
    }

    /// Asks GitHub once, because the owner chose to. The app never checks on its own.
    private func checkForUpdates() {
        checking = true
        Task {
            let standing = await launcher.checkForUpdates(from: GitHubReleases())
            checking = false
            let alert = NSAlert()
            alert.messageText = standing.level == .update ? "A newer version of PEA is available"
                : standing.level == .failed ? "PEA could not check for updates" : "PEA update check"
            alert.informativeText = standing.text
            if standing.level == .warning { alert.alertStyle = .warning }
            if standing.page != nil { alert.addButton(withTitle: "Open Release Page") }
            alert.addButton(withTitle: standing.page == nil ? "OK" : "Not Now")
            NSApp.activate(ignoringOtherApps: true)
            if alert.runModal() == .alertFirstButtonReturn, let page = standing.page { NSWorkspace.shared.open(page) }
        }
    }

    private func setReminders(_ wanted: Bool) {
        Task {
            let on = await launcher.setReminders(wanted)
            if wanted && on {
                tell("Reminders can now appear as notifications", "One more step, in PEA in your browser: connect the local model with the connection token, then on Today open To-dos and turn on “Also remind me through PEA for Mac”. PEA then hands this Mac the titles and times of your reminders. macOS keeps them, outside your browser’s encrypted storage, and can show them on the lock screen.")
            } else if wanted {
                tell("Reminders were not turned on", "macOS did not allow PEA to show notifications. You can allow it in System Settings › Notifications › PEA, then try again.")
            }
        }
    }

    private func setLogin(_ wanted: Bool) {
        do {
            if wanted { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            tell("Start at login was not changed", error.localizedDescription)
        }
        startsAtLogin = SMAppService.mainApp.status == .enabled
    }

    private func tell(_ title: String, _ detail: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = detail
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
    }
}

struct StatusView: View {
    @EnvironmentObject var launcher: Launcher

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: launcher.isRunning ? "leaf.fill" : "leaf").font(.system(size: 28)).foregroundStyle(.green)
                VStack(alignment: .leading, spacing: 2) {
                    Text(statusLine(launcher)).font(.headline)
                    Text("Version \(launcher.version) · model server \(launcher.upstream)" + (launcher.engineAddress.map { " · project engine \($0)" } ?? "")).font(.caption).foregroundStyle(.secondary)
                }
            }
            Text("PEA runs on this Mac and opens in your browser. The first time, copy the connection token and paste it into Connections → Local model.")
                .fixedSize(horizontal: false, vertical: true)
            HStack {
                Button("Open PEA") { open(launcher) }.keyboardShortcut(.defaultAction).disabled(!launcher.isRunning)
                Menu("More") { Actions() }.fixedSize()
            }
        }
        .padding(20)
        .frame(width: 440, alignment: .leading)
    }
}
