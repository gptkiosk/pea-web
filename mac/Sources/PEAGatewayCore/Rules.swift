import CryptoKit
import Foundation

public struct GatewayError: Error, CustomStringConvertible, Equatable {
    public let description: String
    public init(_ description: String) { self.description = description }
}

/// The gateway's rules, read from the same `server/contract.json` the Python gateway reads.
/// Nothing here has a built-in fallback: a missing or malformed value stops the gateway from starting.
public struct Contract {
    public let assets: Set<String>
    public let headers: [(name: String, value: String)]
    public let streamHeaders: [(name: String, value: String)]
    public let chatFields: Set<String>
    public let roles: Set<String>
    public let requestBytes: Int
    public let messages: Int
    public let messageCharacters: Int
    public let maxTokens: Int
    public let defaultMaxTokens: Int
    public let temperatureMax: Double
    public let defaultTemperature: String
    public let modelListBytes: Int
    public let models: Int
    public let modelListSeconds: Double
    public let concurrentModelRequests: Int
    public let connections: Int
    public let readTimeoutSeconds: Double
    public let requestDeadlineSeconds: Double
    public let upstreamTimeoutSeconds: Double
    public let streamSeconds: Double
    public let streamBytes: Int
    public let buildInfoSeconds: Double
    public let reader: ReaderRules
    public let remindersPath: String
    public let reminderFields: Set<String>
    public let reminderItems: Int
    public let reminderTitleCharacters: Int
    public let reminderDueMax: Int
    let modelID: NSRegularExpression
    let token: NSRegularExpression
    let reminderID: NSRegularExpression

    public static let supportedVersion = 1

    public init(data: Data) throws {
        guard data.count <= 200_000, case .object(let root)? = try? JSON.parse(data) else { throw GatewayError("The rules file is not readable.") }
        guard root["version"]?.integer == Contract.supportedVersion else { throw GatewayError("The rules file is a version this gateway does not know.") }
        func strings(_ key: String) throws -> [String] {
            guard case .array(let items)? = root[key], !items.isEmpty else { throw GatewayError("The rules file has no \(key).") }
            return try items.map {
                guard let text = $0.string else { throw GatewayError("The rules file has a bad entry in \(key).") }
                return text
            }
        }
        func pairs(_ key: String) throws -> [(name: String, value: String)] {
            guard case .object(let object)? = root[key], !object.keys.isEmpty else { throw GatewayError("The rules file has no \(key).") }
            return try object.keys.map { name in
                // A header is written into the answer as it stands, so it may not carry a line break.
                guard let value = object[name]?.string, !(name + value).unicodeScalars.contains(where: { $0.value < 0x20 || $0.value == 0x7F }), !name.contains(":") else {
                    throw GatewayError("The rules file has a bad header in \(key).")
                }
                return (name, value)
            }
        }
        guard case .object(let limits)? = root["limits"] else { throw GatewayError("The rules file has no limits.") }
        func whole(_ key: String) throws -> Int {
            guard let value = limits[key]?.integer, value > 0 else { throw GatewayError("The rules file has no limit named \(key).") }
            return value
        }
        func pattern(_ key: String) throws -> NSRegularExpression {
            guard let text = limits[key]?.string, let expression = try? NSRegularExpression(pattern: "\\A(?:" + text + ")\\z") else {
                throw GatewayError("The rules file has no pattern named \(key).")
            }
            return expression
        }
        assets = Set(try strings("assets"))
        for name in assets {
            // File names are joined to the web folder, so each part must be an ordinary name.
            let parts = name.split(separator: "/", omittingEmptySubsequences: false)
            guard !parts.isEmpty, parts.allSatisfy({ part in
                !part.isEmpty && !part.hasPrefix(".") && part.unicodeScalars.allSatisfy { $0.isASCII && ($0.properties.isAlphabetic || ("0"..."9").contains($0) || $0 == "-" || $0 == "_" || $0 == ".") }
            }) else { throw GatewayError("The rules file lists a file name this gateway will not serve.") }
        }
        headers = try pairs("headers")
        streamHeaders = try pairs("streamHeaders")
        chatFields = Set(try strings("chatFields"))
        roles = Set(try strings("roles"))
        requestBytes = try whole("requestBytes")
        messages = try whole("messages")
        messageCharacters = try whole("messageCharacters")
        maxTokens = try whole("maxTokens")
        defaultMaxTokens = try whole("defaultMaxTokens")
        guard let hottest = limits["temperatureMax"]?.double, hottest >= 0, case .number(let usual)? = limits["defaultTemperature"] else {
            throw GatewayError("The rules file has no temperature limits.")
        }
        temperatureMax = hottest
        defaultTemperature = usual
        modelListBytes = try whole("modelListBytes")
        models = try whole("models")
        modelListSeconds = Double(try whole("modelListSeconds"))
        concurrentModelRequests = try whole("concurrentModelRequests")
        connections = try whole("connections")
        readTimeoutSeconds = Double(try whole("readTimeoutSeconds"))
        requestDeadlineSeconds = Double(try whole("requestDeadlineSeconds"))
        upstreamTimeoutSeconds = Double(try whole("upstreamTimeoutSeconds"))
        streamSeconds = Double(try whole("streamSeconds"))
        streamBytes = try whole("streamBytes")
        buildInfoSeconds = Double(try whole("buildInfoSeconds"))
        modelID = try pattern("modelIdPattern")
        token = try pattern("tokenPattern")
        guard case .object(let reminders)? = root["reminders"], let path = reminders["path"]?.string, path.hasPrefix("/v1/"),
              case .array(let fields)? = reminders["fields"], let items = reminders["items"]?.integer, items > 0,
              let title = reminders["titleCharacters"]?.integer, title > 0, let latest = reminders["dueMax"]?.integer, latest > 0,
              let identity = reminders["idPattern"]?.string,
              let expression = try? NSRegularExpression(pattern: "\\A(?:" + identity + ")\\z") else {
            throw GatewayError("The rules file has no reminder rules.")
        }
        remindersPath = path
        reminderFields = Set(fields.compactMap { $0.string })
        guard reminderFields == ["id", "title", "due"], fields.count == 3 else { throw GatewayError("The rules file names reminder fields this gateway does not know.") }
        reminderItems = items
        reminderTitleCharacters = title
        reminderDueMax = latest
        reminderID = expression
        reader = try ReaderRules(root["reader"])
    }

    static func matches(_ expression: NSRegularExpression, _ text: String) -> Bool {
        let range = NSRange(text.startIndex..., in: text)
        return expression.firstMatch(in: text, range: range)?.range == range
    }

    public func isModelID(_ text: String) -> Bool { Contract.matches(modelID, text) }
    public func isToken(_ text: String) -> Bool { Contract.matches(token, text) }

    /// Checks a chat request and returns exactly what may be sent to the model server.
    /// Anything unexpected refuses the whole request; nothing is repaired or dropped.
    public func validateChat(_ raw: JSONValue) throws -> JSONObject {
        guard case .object(var body) = raw, Set(body.keys).isSubset(of: chatFields) else {
            throw GatewayError("Only text chat is supported; tools and provider overrides are disabled.")
        }
        guard let model = body["model"]?.string, isModelID(model), body["stream"] == .bool(true) else {
            throw GatewayError("Choose a listed model and streaming text response.")
        }
        guard case .array(let rows)? = body["messages"], (1...messages).contains(rows.count) else {
            throw GatewayError("Bounded text messages are required.")
        }
        var total = 0
        for row in rows {
            guard case .object(let message) = row, Set(message.keys) == ["role", "content"],
                  let role = message["role"]?.string, roles.contains(role), let content = message["content"]?.string else {
                throw GatewayError("Only plain text system/user/assistant messages are supported.")
            }
            total += content.unicodeScalars.count
        }
        let limit = body["max_tokens"] ?? .number(String(defaultMaxTokens))
        guard total <= messageCharacters, let tokens = limit.integer, (1...maxTokens).contains(tokens) else {
            throw GatewayError("Message or output limit exceeded.")
        }
        let temperature = body["temperature"] ?? .number(defaultTemperature)
        guard let heat = temperature.double, heat >= 0, heat <= temperatureMax else { throw GatewayError("Invalid temperature.") }
        body["max_tokens"] = limit
        body["temperature"] = temperature
        return body
    }
}

/// One reminder the owner asked for: a to-do's title and the moment it is due.
public struct Reminder: Equatable, Sendable {
    public let id: String
    public let title: String
    public let due: Date

    public init(id: String, title: String, due: Date) {
        self.id = id
        self.title = title
        self.due = due
    }
}

/// Something that can show reminders as system notifications. The command-line gateway has none.
/// Both members are called on the gateway's queue, so an implementation must be safe to use from any thread.
public protocol ReminderSink: AnyObject {
    /// Whether the owner has turned reminders on and the system allows them.
    var available: Bool { get }
    /// Replaces everything shown before with exactly this list.
    func replace(with reminders: [Reminder])
}

extension Contract {
    /// Checks a list of reminders: `{"reminders":[{"id","title","due"}]}`, `due` in milliseconds since 1970.
    /// Anything unexpected refuses the whole list.
    public func validateReminders(_ raw: JSONValue) throws -> [Reminder] {
        guard case .object(let body) = raw, body.keys == ["reminders"], case .array(let rows)? = body["reminders"], rows.count <= reminderItems else {
            throw GatewayError("A bounded list of reminders is required.")
        }
        var seen = Set<String>()
        return try rows.map { row in
            guard case .object(let fields) = row, Set(fields.keys) == reminderFields, fields.keys.count == reminderFields.count else {
                throw GatewayError("A reminder has an id, a title and a due time.")
            }
            guard let id = fields["id"]?.string, Contract.matches(reminderID, id), seen.insert(id).inserted else {
                throw GatewayError("Reminder ids must be simple and different.")
            }
            guard let title = fields["title"]?.string, (1...reminderTitleCharacters).contains(title.unicodeScalars.count),
                  !title.unicodeScalars.contains(where: { $0.value < 0x20 || (0x7F...0x9F).contains($0.value) || $0.value == 0x2028 || $0.value == 0x2029 }) else {
                throw GatewayError("A reminder title is one short line.")
            }
            guard let due = fields["due"]?.integer, (1...reminderDueMax).contains(due) else {
                throw GatewayError("A reminder is due at a whole number of milliseconds.")
            }
            return Reminder(id: id, title: title, due: Date(timeIntervalSince1970: Double(due) / 1000))
        }
    }
}

/// Where the owner's model server is. Only a loopback address is accepted, so the gateway can never
/// be pointed at another machine or a cloud service.
public struct Upstream: Equatable {
    public let host: String
    public let port: Int

    public init(_ text: String) throws {
        let refusal = GatewayError("The model address must be http:// on this Mac, for example http://127.0.0.1:11434")
        guard text.hasPrefix("http://"), text.unicodeScalars.allSatisfy({ $0.isASCII && $0.value > 0x20 && $0.value != 0x7F }),
              !text.contains(where: { "@?#\\".contains($0) }) else { throw refusal }
        let rest = text.dropFirst("http://".count)
        let slash = rest.firstIndex(of: "/") ?? rest.endIndex
        guard ["", "/", "/v1", "/v1/"].contains(String(rest[slash...])) else { throw refusal }
        var authority = String(rest[..<slash])
        var port = 80
        var name: String
        if authority.hasPrefix("[") {
            guard let close = authority.firstIndex(of: "]") else { throw refusal }
            name = String(authority[authority.index(after: authority.startIndex)..<close])
            authority = String(authority[authority.index(after: close)...])
            guard name == "::1" else { throw refusal }
            if !authority.isEmpty {
                guard authority.hasPrefix(":") else { throw refusal }
                port = try Upstream.port(authority.dropFirst(), refusal)
            }
        } else {
            let parts = authority.split(separator: ":", omittingEmptySubsequences: false)
            guard parts.count == 1 || parts.count == 2 else { throw refusal }
            name = String(parts[0])
            if parts.count == 2 { port = try Upstream.port(parts[1], refusal) }
            if name == "localhost" { name = "127.0.0.1" }
            let numbers = name.split(separator: ".", omittingEmptySubsequences: false)
            guard numbers.count == 4, numbers[0] == "127", numbers.allSatisfy({ part in
                (1...3).contains(part.count) && part.allSatisfy { ("0"..."9").contains($0) } && (part == "0" || !part.hasPrefix("0")) && Int(part)! <= 255
            }) else { throw refusal }
        }
        host = name
        self.port = port
    }

    private static func port(_ text: Substring, _ refusal: GatewayError) throws -> Int {
        guard (1...5).contains(text.count), text.allSatisfy({ ("0"..."9").contains($0) }), let value = Int(text), (1...65535).contains(value) else { throw refusal }
        return value
    }

    func url(_ path: String) -> URL {
        URL(string: "http://" + (host.contains(":") ? "[" + host + "]" : host) + ":" + String(port) + "/v1/" + path)!
    }
}

/// The connection token, kept only as a digest. Comparison takes the same time whatever was sent.
public struct TokenCheck {
    private let digest: [UInt8]

    public init(token: String) { digest = Array(SHA256.hash(data: Data(token.utf8))) }

    /// `header` is the whole Authorization value. Only `Bearer <token>` is accepted.
    public func accepts(_ header: String?) -> Bool {
        let value = header ?? ""
        let prefix = "Bearer "
        let presented = Array(SHA256.hash(data: Data((value.hasPrefix(prefix) ? String(value.dropFirst(prefix.count)) : value).utf8)))
        var difference: UInt8 = 0
        for index in 0..<digest.count { difference |= digest[index] ^ presented[index] }
        return value.hasPrefix(prefix) && difference == 0
    }
}

/// Reads a token file with the same checks as the Python gateway: a regular file, owned by this
/// user, readable by nobody else.
public func readTokenFile(_ path: String, contract: Contract) throws -> String {
    var info = stat()
    guard lstat(path, &info) == 0, info.st_mode & S_IFMT == S_IFREG, info.st_mode & 0o077 == 0, info.st_uid == getuid() else {
        throw GatewayError("Token file must be owned by this user, regular, and mode 0600.")
    }
    guard let data = FileManager.default.contents(atPath: path), data.count <= 1024, let text = String(data: data, encoding: .utf8) else {
        throw GatewayError("Token file could not be read.")
    }
    let token = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard contract.isToken(token) else { throw GatewayError("Use a random token of 32–128 URL-safe characters.") }
    return token
}

/// Public build identity: version and source commit only. Never a path, branch, host or credential.
public enum BuildIdentity {
    private static let version = try! NSRegularExpression(pattern: #"\A(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\z"#)
    private static let commit = try! NSRegularExpression(pattern: #"\A[a-f0-9]{40}\z"#)
    private static let repository = try! NSRegularExpression(pattern: #"\A[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}\z"#)

    public static func read(root: URL) throws -> JSONObject {
        let invalid = GatewayError("Build identity unavailable.")
        guard let data = Files.read(root: root, name: "release.json", limit: 4096), case .object(let config) = try JSON.parse(data),
              config["schema"]?.integer == 1, let number = config["version"]?.string, Contract.matches(version, number),
              let channel = config["channel"]?.string, ["development", "prerelease", "stable"].contains(channel) else { throw invalid }
        var result = JSONObject()
        result["schema"] = .number("1")
        result["version"] = .string(number)
        result["channel"] = .string(channel)
        for name in ["product", "organization"] {
            guard let text = config[name]?.string, text.unicodeScalars.count <= 80, !text.unicodeScalars.contains(where: { $0.value < 32 }) else { throw invalid }
            result[name] = .string(text)
        }
        switch config["repository"] {
        case nil, .null?: result["repository"] = .null
        case .string(let text)? where Contract.matches(repository, text) && !text.contains(".."): result["repository"] = .string(text)
        default: throw invalid
        }
        result["commit"] = .null
        result["modified"] = .null
        result["environment"] = .string("source")
        // A stamp is written when the web files are packaged. It must describe this same version.
        if let stamp = Files.read(root: root, name: "build-info.json", limit: 4096) {
            guard case .object(let value) = try JSON.parse(stamp), value["version"]?.string == number,
                  let hash = value["commit"]?.string, Contract.matches(commit, hash), case .bool(let modified)? = value["modified"],
                  let environment = value["environment"]?.string, ["development", "release"].contains(environment) else { throw invalid }
            result["commit"] = .string(hash)
            result["modified"] = .bool(modified)
            result["environment"] = .string(environment)
        }
        return result
    }
}

/// Reads files below the web folder without ever following a symbolic link.
enum Files {
    static func read(root: URL, name: String, limit: Int = 20_000_000) -> Data? {
        let parts = name.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard !parts.contains(where: { $0 == "." || $0 == ".." || $0.isEmpty }) else { return nil }
        var folder = open(root.path, O_RDONLY | O_DIRECTORY | O_CLOEXEC)
        guard folder >= 0 else { return nil }
        defer { close(folder) }
        for part in parts.dropLast() {
            // O_NOFOLLOW makes opening a link fail, so a link placed inside the folder leads nowhere.
            let next = openat(folder, part, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
            guard next >= 0 else { return nil }
            close(folder)
            folder = next
        }
        let file = openat(folder, parts.last!, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC)
        guard file >= 0 else { return nil }
        let handle = FileHandle(fileDescriptor: file, closeOnDealloc: true)
        var info = stat()
        guard fstat(file, &info) == 0, info.st_mode & S_IFMT == S_IFREG, info.st_size <= limit else { return nil }
        return try? handle.readToEnd() ?? Data()
    }

    static func contentType(_ name: String) -> String {
        switch name.split(separator: ".").last.map(String.init) ?? "" {
        case "mjs", "js": return "text/javascript"
        case "html": return "text/html"
        case "css": return "text/css"
        case "json": return "application/json"
        case "svg": return "image/svg+xml"
        case "md": return "text/markdown"
        case "png": return "image/png"
        case "ico": return "image/vnd.microsoft.icon"
        case "txt": return "text/plain"
        case "webmanifest": return "application/manifest+json"
        default: return "application/octet-stream"
        }
    }
}
