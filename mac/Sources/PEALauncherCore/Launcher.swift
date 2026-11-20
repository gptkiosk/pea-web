import Combine
import Foundation
import Network
import PEAGatewayCore

/// Everything the Mac app does that is not drawing: it keeps the token, remembers the port and the
/// model address, and starts and stops the gateway. The menu and window only show this and call it.
@MainActor
public final class Launcher: ObservableObject {
    public enum Status: Equatable {
        case stopped
        case starting
        case running
        /// Another program holds the port. `free` is the next port nothing is using, if one was found.
        case portBusy(free: UInt16?)
        case failed(String)
    }

    public static let defaultPort: UInt16 = 18770
    public static let defaultUpstream = "http://127.0.0.1:11434"

    @Published public private(set) var status = Status.stopped
    @Published public private(set) var port: UInt16
    @Published public private(set) var upstream: String
    /// The owner's project engine (MCD or RCD), if they connected one: its address, and the path of
    /// the private file holding the access the engine issued. The app keeps the path, never the access.
    @Published public private(set) var engineAddress: String?
    @Published public private(set) var engineTokenFile: String?
    public let version: String
    public let repository: String?
    public let channel: String

    private let webRoot: URL
    private let tokens: TokenStore
    private let defaults: UserDefaults
    private var gateway: Gateway?
    private let projectRules: ProjectRules?
    private let reminders: ReminderCenter?
    /// Whether reminders from PEA in the browser are shown as notifications on this Mac.
    @Published public private(set) var remindersOn = false
    /// False when this copy of PEA cannot show notifications at all, for example when run from source.
    public var canRemind: Bool { reminders != nil }

    public init(webRoot: URL, tokens: TokenStore, defaults: UserDefaults, notifications: NotificationPoster? = nil) {
        reminders = notifications.map { ReminderCenter(poster: $0, defaults: defaults) }
        self.webRoot = webRoot
        self.tokens = tokens
        self.defaults = defaults
        let saved = defaults.integer(forKey: "port")
        port = (1024...65535).contains(saved) ? UInt16(saved) : Launcher.defaultPort
        let address = defaults.string(forKey: "upstream") ?? Launcher.defaultUpstream
        upstream = (try? Upstream(address)) == nil ? Launcher.defaultUpstream : address
        projectRules = try? ProjectEngine.rules(webRoot: webRoot)
        // A saved engine whose address no longer passes the rules is not used. A credential file
        // that has gone missing is kept: the gateway then says projects are not available.
        if let address = defaults.string(forKey: "projectsAddress"), let file = defaults.string(forKey: "projectsTokenFile"),
           let rules = projectRules, (try? ProjectEngine(address: address, tokenFile: file, rules: rules)) != nil {
            engineAddress = address
            engineTokenFile = file
        }
        let identity = try? BuildIdentity.read(root: webRoot.resolvingSymlinksInPath())
        version = identity?["version"]?.string ?? "unknown"
        repository = identity?["repository"]?.string
        channel = identity?["channel"]?.string ?? "development"
        if notifications != nil, defaults.bool(forKey: "reminders") {
            notifications?.isPermitted { allowed in Task { @MainActor in self.remindersOn = allowed } }
        }
    }

    /// Turns reminders as notifications on or off. Turning them on makes the system ask the owner
    /// once; the answer is whether they are on afterwards. Turning them off withdraws any still waiting.
    @discardableResult
    public func setReminders(_ wanted: Bool) async -> Bool {
        guard let reminders else { return false }
        if wanted {
            remindersOn = await withCheckedContinuation { done in reminders.turnOn { done.resume(returning: $0) } }
        } else {
            reminders.turnOff()
            remindersOn = false
        }
        return remindersOn
    }

    /// The address PEA is opened at. `127.0.0.1` and not a name, so it is the same browser origin every time.
    public var address: URL { URL(string: "http://127.0.0.1:\(port)/")! }

    public var releasesPage: URL? { repository.flatMap { URL(string: "https://github.com/\($0)/releases") } }

    public var isRunning: Bool { status == .running }

    /// Asks the public repository whether a newer release exists. Runs only when the owner asks.
    public func checkForUpdates(from source: ReleaseSource) async -> UpdateStanding {
        await Updates.check(repository: repository, version: version, channel: channel, source: source)
    }

    /// The token, made on first use. It is shown to nobody; the owner copies it into PEA.
    public func token() throws -> String {
        if let saved = try tokens.read(), saved.range(of: "^[A-Za-z0-9_-]{32,128}$", options: .regularExpression) != nil { return saved }
        let fresh = try ConnectionToken.make()
        try tokens.save(fresh)
        return fresh
    }

    public func start() {
        guard gateway == nil else { return }
        status = .starting
        let wanted = port
        do {
            var options = Gateway.Options(port: wanted, token: try token(), upstream: upstream, root: webRoot, reminders: reminders)
            options.projects = engine()
            let next = try Gateway(options)
            gateway = next
            next.start { error in
                Task { @MainActor in
                    guard self.gateway === next else { return }
                    guard let error else { return self.status = .running }
                    self.gateway = nil
                    if case NWError.posix(let code) = error, code == .EADDRINUSE {
                        self.status = .portBusy(free: Launcher.freePort(after: wanted))
                    } else {
                        self.status = .failed(error.localizedDescription)
                    }
                }
            }
        } catch {
            gateway = nil
            status = .failed(String(describing: error))
        }
    }

    public func stop() async {
        guard let running = gateway else { return status = .stopped }
        gateway = nil
        await withCheckedContinuation { done in running.stop { done.resume() } }
        status = .stopped
    }

    /// Moves PEA to another port. A different port is a different address to the browser, so
    /// libraries and boards saved under the old one are not visible under the new one.
    public func use(port next: UInt16) async {
        guard next >= 1024 else { return }
        await stop()
        port = next
        defaults.set(Int(next), forKey: "port")
        start()
    }

    /// Points PEA at a model server on this Mac. Anything that is not a loopback address is refused.
    public func use(upstream text: String) throws {
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        _ = try Upstream(cleaned)
        upstream = cleaned
        defaults.set(cleaned, forKey: "upstream")
        try gateway?.setUpstream(cleaned)
    }

    private func engine() -> ProjectEngine? {
        guard let address = engineAddress, let file = engineTokenFile, let rules = projectRules else { return nil }
        return try? ProjectEngine(address: address, tokenFile: file, rules: rules)
    }

    /// Whether the connected engine's credential file can be used right now.
    public var engineReady: Bool {
        guard let rules = projectRules, let engine = engine() else { return false }
        return engine.hasCredential(rules)
    }

    /// Connects PEA to the owner's project engine. The address is http:// on a loopback IP of this
    /// Mac or https:// on a named host; the file must be a regular file only the owner can read,
    /// holding the access the engine issued. Anything else is refused and nothing changes. A running
    /// PEA restarts on the same port, because the gateway takes this setting only when it starts.
    public func use(engine address: String, tokenFile: String) async throws {
        guard let rules = projectRules else { throw GatewayError("The web files were not found, or their rules file is missing.") }
        let cleaned = address.trimmingCharacters(in: .whitespacesAndNewlines)
        let file = (tokenFile as NSString).expandingTildeInPath
        guard file.hasPrefix("/") else { throw GatewayError("Choose the file that holds the access your project engine issued for PEA.") }
        let next = try ProjectEngine(address: cleaned, tokenFile: file, rules: rules)
        guard next.hasCredential(rules) else {
            throw GatewayError("That file cannot be used. It must be a regular file that only you can read (mode 600), holding the 64-character access your project engine issued for PEA.")
        }
        engineAddress = cleaned
        engineTokenFile = file
        defaults.set(cleaned, forKey: "projectsAddress")
        defaults.set(file, forKey: "projectsTokenFile")
        await restartIfRunning()
    }

    /// Disconnects PEA from the project engine. The credential file is left where it is.
    public func removeEngine() async {
        guard engineAddress != nil else { return }
        engineAddress = nil
        engineTokenFile = nil
        defaults.removeObject(forKey: "projectsAddress")
        defaults.removeObject(forKey: "projectsTokenFile")
        await restartIfRunning()
    }

    private func restartIfRunning() async {
        guard gateway != nil else { return }
        await stop()
        start()
    }

    /// The first port after `port` that nothing on this Mac is listening on.
    public nonisolated static func freePort(after port: UInt16, tries: Int = 30) -> UInt16? {
        for candidate in (Int(port) + 1)...(Int(port) + tries) where candidate <= 65535 {
            let descriptor = socket(AF_INET, SOCK_STREAM, 0)
            guard descriptor >= 0 else { return nil }
            defer { close(descriptor) }
            var address = sockaddr_in()
            address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
            address.sin_family = sa_family_t(AF_INET)
            address.sin_port = in_port_t(candidate).bigEndian
            address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
            let bound = withUnsafePointer(to: &address) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
            }
            if bound == 0 { return UInt16(candidate) }
        }
        return nil
    }
}
