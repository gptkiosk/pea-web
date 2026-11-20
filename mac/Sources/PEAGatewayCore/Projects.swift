import Foundation

/// The projects rules, from the `projects` part of the shared rules file: the few named things the
/// owner's page may ask their project engine (MCD or RCD), and every limit. Nothing in a request
/// chooses the engine's address, path, credential or a working folder.
public struct ProjectRules {
    public let path: String
    public let upstreamPath: String
    public let projectMax: Int
    public let answerBytes: Int
    public let seconds: Double
    public let concurrent: Int
    public let userAgent: String
    public let unavailable: String
    /// What the owner's page is told when the engine does not answer usefully. Its own words are never passed on.
    public let refusals: [String: String]
    let actions: [String: Set<String>]
    let optional: [String: Set<String>]
    let limits: [String: Int]
    let type: NSRegularExpression
    let host: NSRegularExpression
    let token: NSRegularExpression

    static func reason(status: Int) -> String {
        switch status {
        case 401, 403: return "refused"
        case 400, 404, 409, 422: return "declined"
        default: return "failed"
        }
    }

    init(_ value: JSONValue?) throws {
        let bad = GatewayError("The rules file has no usable projects rules.")
        guard case .object(let rules)? = value else { throw bad }
        func text(_ key: String) throws -> String {
            guard let found = rules[key]?.string, !found.isEmpty else { throw bad }
            return found
        }
        func whole(_ key: String) throws -> Int {
            guard let found = rules[key]?.integer, found > 0 else { throw bad }
            return found
        }
        func pattern(_ key: String) throws -> NSRegularExpression {
            guard let found = try? NSRegularExpression(pattern: "\\A(?:" + (try text(key)) + ")\\z") else { throw bad }
            return found
        }
        func lists(_ key: String) throws -> [String: Set<String>] {
            guard case .object(let table)? = rules[key] else { throw bad }
            var out = [String: Set<String>]()
            for name in table.keys {
                guard case .array(let fields)? = table[name] else { throw bad }
                let names = fields.compactMap { $0.string }
                guard names.count == fields.count else { throw bad }
                out[name] = Set(names)
            }
            return out
        }
        path = try text("path")
        upstreamPath = try text("upstreamPath")
        guard path.hasPrefix("/v1/"), upstreamPath.hasPrefix("/api/"), !upstreamPath.contains(where: { "?#".contains($0) }) else { throw bad }
        actions = try lists("actions")
        optional = try lists("optional")
        let known: Set<String> = ["project", "type", "title", "brief", "constraints"]
        guard !actions.isEmpty, actions.values.allSatisfy({ $0.isSubset(of: known) }), optional.values.allSatisfy({ $0.isSubset(of: known) }) else { throw bad }
        projectMax = try whole("projectMax")
        limits = ["title": try whole("titleCharacters"), "brief": try whole("briefCharacters"), "constraints": try whole("constraintsCharacters")]
        type = try pattern("typePattern")
        host = try pattern("hostPattern")
        token = try pattern("tokenPattern")
        answerBytes = try whole("answerBytes")
        seconds = Double(try whole("seconds"))
        concurrent = try whole("concurrent")
        userAgent = try text("userAgent")
        unavailable = try text("unavailable")
        guard case .object(let words)? = rules["refusals"] else { throw bad }
        var refusals = [String: String]()
        for reason in ["refused", "declined", "failed"] {
            guard let sentence = words[reason]?.string, !sentence.isEmpty else { throw bad }
            refusals[reason] = sentence
        }
        self.refusals = refusals
    }

    /// The request, unchanged, if it is one of the named ones with exactly its fields; nil otherwise.
    public func validate(_ raw: JSONValue) -> JSONObject? {
        guard case .object(let request) = raw, let action = request["action"]?.string, let needed = actions[action] else { return nil }
        let given = Set(request.keys).subtracting(["action"])
        guard needed.isSubset(of: given), given.isSubset(of: needed.union(optional[action] ?? [])) else { return nil }
        if let project = request["project"] {
            guard let number = project.integer, (1...projectMax).contains(number) else { return nil }
        }
        if let kind = request["type"] {
            guard let name = kind.string, Contract.matches(type, name) else { return nil }
        }
        for (name, required) in [("title", true), ("brief", true), ("constraints", false)] {
            guard let value = request[name] else { continue }
            guard let words = value.string, words.unicodeScalars.count <= limits[name]! else { return nil }
            if required && words.unicodeScalars.allSatisfy({ " \t\n\r".unicodeScalars.contains($0) }) { return nil }
        }
        return request
    }
}

/// Where the owner's project engine is and where its credential is kept. Set by the operator when
/// the gateway starts, never by a request.
public struct ProjectEngine {
    let base: String
    public let tokenFile: String

    /// `address` is http:// on a loopback IP of this Mac, or https:// on a named host; `testHosts`
    /// (tests only) maps a .example name to a plain HTTP port on this Mac.
    public init(address: String, tokenFile: String, rules: ProjectRules, testHosts: [String: UInt16] = [:]) throws {
        let refusal = GatewayError("The project engine must be at http:// on a loopback IP of this Mac, or at https:// on a named host, with no path.")
        guard address.unicodeScalars.allSatisfy({ $0.isASCII && $0.value > 0x20 && $0.value != 0x7F }),
              !address.contains(where: { "@?#\\".contains($0) }) else { throw refusal }
        self.tokenFile = tokenFile
        if address.hasPrefix("https://") {
            var rest = String(address.dropFirst("https://".count))
            if rest.hasSuffix("/") { rest.removeLast() }
            let parts = rest.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
            guard parts.count == 1 || parts.count == 2, !rest.contains("/") else { throw refusal }
            let name = parts[0].lowercased()
            var port = 443
            if parts.count == 2 {
                guard (1...5).contains(parts[1].count), parts[1].allSatisfy({ ("0"..."9").contains($0) }), let value = Int(parts[1]), (1...65535).contains(value) else { throw refusal }
                port = value
            }
            guard Contract.matches(rules.host, name) else { throw refusal }
            if let standIn = testHosts[name] { base = "http://127.0.0.1:" + String(standIn) } else { base = "https://" + name + ":" + String(port) }
            return
        }
        // The same rule as the model address, without its /v1 path.
        var plain = address
        if plain.hasSuffix("/") { plain.removeLast() }
        guard plain.hasPrefix("http://"), !plain.dropFirst("http://".count).contains("/"), let local = try? Upstream(plain) else { throw refusal }
        base = "http://" + (local.host.contains(":") ? "[" + local.host + "]" : local.host) + ":" + String(local.port)
    }

    /// The project rules shipped with the web files at `webRoot`, for the Mac app to check a setting against.
    public static func rules(webRoot: URL) throws -> ProjectRules {
        guard let data = Files.read(root: webRoot.resolvingSymlinksInPath(), name: "server/contract.json", limit: 200_000) else {
            throw GatewayError("The web files were not found, or their rules file is missing.")
        }
        return try Contract(data: data).projects
    }

    /// Whether the credential file can be used right now. Says nothing about what it holds.
    public func hasCredential(_ rules: ProjectRules) -> Bool { token(rules) != nil }

    /// The engine's credential, read for each request so that removing the file ends the access.
    func token(_ rules: ProjectRules) -> String? {
        var info = stat()
        guard lstat(tokenFile, &info) == 0, info.st_mode & S_IFMT == S_IFREG, info.st_mode & 0o077 == 0, info.st_uid == getuid(),
              let data = FileManager.default.contents(atPath: tokenFile), data.count <= 1024, let text = String(data: data, encoding: .utf8) else { return nil }
        let token = text.trimmingCharacters(in: CharacterSet(charactersIn: " \t\n\r"))
        return Contract.matches(rules.token, token) ? token : nil
    }

    func request(_ body: JSONObject, token: String, rules: ProjectRules) -> URLRequest {
        var request = URLRequest(url: URL(string: base + rules.upstreamPath)!)
        request.httpMethod = "POST"
        request.httpBody = JSON.serialize(.object(body))
        request.httpShouldHandleCookies = false
        request.timeoutInterval = rules.seconds
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue(rules.userAgent, forHTTPHeaderField: "User-Agent")
        return request
    }
}
