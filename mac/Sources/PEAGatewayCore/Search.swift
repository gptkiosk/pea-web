import Foundation

/// The search rules, from the `search` part of the shared rules file: which search providers exist,
/// the one request each may be sent, and every limit. Nothing here names a host of its own.
public struct SearchRules {
    public struct Provider {
        public let host: String
        public let method: String
        public let path: String
        public let queryField: String
        public let body: JSONObject
        public let keyHeader: String
        public let keyPrefix: String
    }

    /// A checked request to search.
    public struct Request: Equatable {
        public let provider: String
        public let key: String
        public let query: String
    }

    public let path: String
    public let queryCharacters: Int
    public let bodyBytes: Int
    public let seconds: Double
    public let userAgent: String
    public let providers: [String: Provider]
    let key: NSRegularExpression

    /// What the owner's page is told when a search provider gives no results. Its own words are never passed on.
    static let refusals = [
        "key": "The search provider rejected this key.",
        "credit": "The search provider says this key has no credit for this.",
        "busy": "The search provider is busy or rate limiting this key. No automatic retry.",
        "query": "The search provider did not accept this search.",
        "failed": "The search provider could not be reached or failed. No retry and no other provider.",
    ]

    static func reason(status: Int) -> String {
        switch status {
        case 401, 403: return "key"
        case 402: return "credit"
        case 429: return "busy"
        case 400, 404, 422: return "query"
        default: return "failed"
        }
    }

    init(_ value: JSONValue?) throws {
        let missing = GatewayError("The rules file has no search rules.")
        guard case .object(let rules)? = value else { throw missing }
        func whole(_ key: String) throws -> Int {
            guard let number = rules[key]?.integer, number > 0 else { throw missing }
            return number
        }
        // Anything sent as part of a request line or header may not carry a space, a line break or other control.
        func plain(_ text: String?, spaces: Bool = false, empty: Bool = false) throws -> String {
            guard let text, empty || !text.isEmpty,
                  text.unicodeScalars.allSatisfy({ $0.value > 0x20 && $0.value < 0x7F || (spaces && $0.value == 0x20) }) else { throw missing }
            return text
        }
        guard let path = rules["path"]?.string, path.hasPrefix("/v1/") else { throw missing }
        self.path = path
        guard case .array(let named)? = rules["fields"], Set(named.compactMap { $0.string }) == ["provider", "key", "query"], named.count == 3 else {
            throw GatewayError("The rules file names search fields this gateway does not know.")
        }
        queryCharacters = try whole("queryCharacters")
        bodyBytes = try whole("bodyBytes")
        seconds = Double(try whole("seconds"))
        userAgent = try plain(rules["userAgent"]?.string, spaces: true)
        guard let text = rules["keyPattern"]?.string, let expression = try? NSRegularExpression(pattern: "\\A(?:" + text + ")\\z") else { throw missing }
        key = expression
        guard case .object(let listed)? = rules["providers"], !listed.keys.isEmpty else { throw missing }
        var known = [String: Provider]()
        for name in listed.keys {
            guard case .object(let one)? = listed[name] else { throw missing }
            let host = try plain(one["host"]?.string), route = try plain(one["path"]?.string), method = try plain(one["method"]?.string)
            guard !host.contains("/"), !host.contains(":"), !host.contains("@"), host.contains("."), route.hasPrefix("/") else { throw missing }
            var field = "", fixed = JSONObject()
            if method == "GET" {
                guard route.contains("{query}") else { throw missing }
            } else if method == "POST" {
                guard let named = one["queryField"]?.string, !named.isEmpty, case .object(let body)? = one["body"], body[named] == nil else { throw missing }
                field = named
                fixed = body
            } else {
                throw GatewayError("The rules file names a search method this gateway does not know.")
            }
            known[name] = Provider(host: host, method: method, path: route, queryField: field, body: fixed, keyHeader: try plain(one["keyHeader"]?.string),
                                   keyPrefix: try plain(one["keyPrefix"]?.string, spaces: true, empty: true))
        }
        providers = known
    }

    /// Checks a request to search. Anything else throws.
    public func validate(_ raw: JSONValue) throws -> Request {
        let bad = GatewayError("Invalid search request.")
        guard case .object(let body) = raw, body.keys.count == 3, Set(body.keys) == ["provider", "key", "query"],
              let provider = body["provider"]?.string, providers[provider] != nil,
              let secret = body["key"]?.string, Contract.matches(key, secret),
              let query = body["query"]?.string, !query.isEmpty, query == query.trimmingCharacters(in: .whitespacesAndNewlines),
              query.unicodeScalars.count <= queryCharacters,
              !query.unicodeScalars.contains(where: { $0.value < 0x20 || $0.value == 0x7F }) else { throw bad }
        return Request(provider: provider, key: secret, query: query)
    }

    /// Every byte but letters, digits and `-._~` as %XX, so the words can stand in an address.
    static func encoded(_ text: String) -> String {
        var out = ""
        for byte in text.utf8 {
            switch byte {
            case 0x30...0x39, 0x41...0x5A, 0x61...0x7A, 0x2D, 0x2E, 0x5F, 0x7E: out.append(Character(UnicodeScalar(byte)))
            default: out += String(format: "%%%02X", byte)
            }
        }
        return out
    }

    /// The one request a provider is sent. `testPort` stands in for the provider in tests only.
    func outbound(_ request: Request, testPort: UInt16?) -> URLRequest? {
        guard let rules = providers[request.provider] else { return nil }
        let path = rules.method == "GET" ? rules.path.replacingOccurrences(of: "{query}", with: SearchRules.encoded(request.query)) : rules.path
        guard let url = URL(string: (testPort.map { "http://127.0.0.1:\($0)" } ?? "https://" + rules.host) + path) else { return nil }
        var out = URLRequest(url: url)
        out.httpMethod = rules.method
        out.httpShouldHandleCookies = false
        out.setValue(rules.keyPrefix + request.key, forHTTPHeaderField: rules.keyHeader)
        out.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        out.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        out.setValue("application/json", forHTTPHeaderField: "Accept")
        if rules.method == "POST" {
            var pairs = rules.body.keys.compactMap { name in rules.body[name].map { (name, $0) } }
            pairs.append((rules.queryField, .string(request.query)))
            out.httpBody = JSON.serialize(.object(JSONObject(pairs)))
            out.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return out
    }
}
