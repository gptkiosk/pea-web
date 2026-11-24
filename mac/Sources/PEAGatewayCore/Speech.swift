import Foundation

/// The speech rules, from the `speech` part of the shared rules file: which voice providers exist,
/// the one request each may be sent, and every limit. Nothing here names a host of its own.
public struct SpeechRules {
    public struct Provider {
        public let host: String
        public let speak: String
        public let list: String
        /// The provider's fixed page of licensed voices, where it has one.
        public let library: String?
        public let keyHeader: String
        public let keyPrefix: String
        public let model: String
    }

    /// A checked request to speak, or to list voices (then `voice` and `text` are empty).
    public struct Request: Equatable {
        public let provider: String
        public let key: String
        public let voice: String
        public let text: String
        /// List the provider's licensed voices in place of the key's own.
        public var library = false
    }

    public let path: String
    public let voicesPath: String
    public let textCharacters: Int
    public let audioBytes: Int
    public let listBytes: Int
    public let voices: Int
    public let nameCharacters: Int
    public let seconds: Double
    public let concurrent: Int
    public let audioType: String
    public let userAgent: String
    public let upstreamAudioTypes: Set<String>
    public let providers: [String: Provider]
    let fields: Set<String>
    let voicesFields: Set<String>
    let libraryFields: Set<String>
    let key: NSRegularExpression
    let voice: NSRegularExpression

    /// What the owner's page is told when a provider does not give audio. The provider's own words are never passed on.
    static let refusals = [
        "key": "The voice provider rejected this key.",
        "credit": "The voice provider says this key has no credit for this.",
        "busy": "The voice provider is busy or rate limiting this key. No automatic retry.",
        "voice": "The voice provider did not accept this voice or text.",
        "failed": "The voice provider could not be reached or failed. No retry and no other voice.",
    ]

    static func reason(status: Int) -> String {
        switch status {
        case 401, 403: return "key"
        case 402: return "credit"
        case 429: return "busy"
        case 400, 404, 422: return "voice"
        default: return "failed"
        }
    }

    init(_ value: JSONValue?) throws {
        let missing = GatewayError("The rules file has no speech rules.")
        guard case .object(let rules)? = value else { throw missing }
        func whole(_ key: String) throws -> Int {
            guard let number = rules[key]?.integer, number > 0 else { throw missing }
            return number
        }
        func strings(_ key: String) throws -> [String] {
            guard case .array(let items)? = rules[key], !items.isEmpty else { throw missing }
            return try items.map {
                guard let text = $0.string else { throw missing }
                return text
            }
        }
        // Anything sent as part of a request line or header may not carry a space, a line break or other control.
        func plain(_ text: String?, spaces: Bool = false, empty: Bool = false) throws -> String {
            guard let text, empty || !text.isEmpty,
                  text.unicodeScalars.allSatisfy({ $0.value > 0x20 && $0.value < 0x7F || (spaces && $0.value == 0x20) }) else { throw missing }
            return text
        }
        func pattern(_ key: String) throws -> NSRegularExpression {
            guard let text = rules[key]?.string, let expression = try? NSRegularExpression(pattern: "\\A(?:" + text + ")\\z") else { throw missing }
            return expression
        }
        guard let path = rules["path"]?.string, path.hasPrefix("/v1/"), let voicesPath = rules["voicesPath"]?.string, voicesPath.hasPrefix("/v1/"),
              path != voicesPath else { throw missing }
        self.path = path
        self.voicesPath = voicesPath
        fields = Set(try strings("fields"))
        voicesFields = Set(try strings("voicesFields"))
        libraryFields = Set(try strings("libraryFields"))
        guard fields == ["provider", "key", "voice", "text"], voicesFields == ["provider", "key"], libraryFields == ["provider", "key", "library"] else {
            throw GatewayError("The rules file names speech fields this gateway does not know.")
        }
        textCharacters = try whole("textCharacters")
        audioBytes = try whole("audioBytes")
        listBytes = try whole("listBytes")
        voices = try whole("voices")
        nameCharacters = try whole("nameCharacters")
        seconds = Double(try whole("seconds"))
        concurrent = try whole("concurrent")
        audioType = try plain(rules["audioType"]?.string)
        userAgent = try plain(rules["userAgent"]?.string, spaces: true)
        upstreamAudioTypes = Set(try strings("upstreamAudioTypes"))
        key = try pattern("keyPattern")
        voice = try pattern("voicePattern")
        guard case .object(let named)? = rules["providers"], Set(named.keys) == ["elevenlabs", "fish"] else {
            throw GatewayError("The rules file names voice providers this gateway does not know.")
        }
        var known = [String: Provider]()
        for name in named.keys {
            guard case .object(let one)? = named[name] else { throw missing }
            let host = try plain(one["host"]?.string), speak = try plain(one["speak"]?.string), list = try plain(one["list"]?.string)
            guard !host.contains("/"), !host.contains(":"), !host.contains("@"), host.contains("."), speak.hasPrefix("/"), list.hasPrefix("/") else { throw missing }
            let library = try one["library"].map { try plain($0.string) }
            guard library?.hasPrefix("/") ?? true else { throw missing }
            known[name] = Provider(host: host, speak: speak, list: list, library: library, keyHeader: try plain(one["keyHeader"]?.string),
                                   keyPrefix: try plain(one["keyPrefix"]?.string, spaces: true, empty: true), model: try plain(one["model"]?.string))
        }
        providers = known
    }

    /// Checks a request to speak or to list voices. Anything else throws.
    public func validate(_ raw: JSONValue, listing: Bool) throws -> Request {
        let bad = GatewayError("Invalid speech request.")
        guard case .object(let body) = raw else { throw bad }
        let library = listing && Set(body.keys) == libraryFields
        let wanted = library ? libraryFields : listing ? voicesFields : fields
        guard body.keys.count == wanted.count, Set(body.keys) == wanted,
              let provider = body["provider"]?.string, let known = providers[provider],
              let secret = body["key"]?.string, Contract.matches(key, secret) else { throw bad }
        if library { guard body["library"] == .bool(true), known.library != nil else { throw bad } }
        if listing { return Request(provider: provider, key: secret, voice: "", text: "", library: library) }
        guard let name = body["voice"]?.string, Contract.matches(voice, name), let text = body["text"]?.string,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.unicodeScalars.count <= textCharacters,
              !text.unicodeScalars.contains(where: { ($0.value < 0x20 && $0 != "\n" && $0 != "\t") || $0.value == 0x7F }) else { throw bad }
        return Request(provider: provider, key: secret, voice: name, text: text)
    }

    /// The one request a provider is sent. `testPort` stands in for the provider in tests only.
    func outbound(_ request: Request, listing: Bool, testPort: UInt16?) -> URLRequest? {
        guard let rules = providers[request.provider] else { return nil }
        guard !request.library || (listing && rules.library != nil) else { return nil }
        let path = listing ? (request.library ? rules.library ?? rules.list : rules.list) : rules.speak.replacingOccurrences(of: "{voice}", with: request.voice)
        guard let url = URL(string: (testPort.map { "http://127.0.0.1:\($0)" } ?? "https://" + rules.host) + path) else { return nil }
        var out = URLRequest(url: url)
        out.httpMethod = listing ? "GET" : "POST"
        out.httpShouldHandleCookies = false
        out.setValue(rules.keyPrefix + request.key, forHTTPHeaderField: rules.keyHeader)
        out.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        out.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        out.setValue(listing ? "application/json" : audioType, forHTTPHeaderField: "Accept")
        if !listing {
            let sent: JSONObject
            if request.provider == "elevenlabs" {
                sent = JSONObject([("text", .string(request.text)), ("model_id", .string(rules.model)), ("apply_text_normalization", .string("on"))])
            } else {
                sent = JSONObject([("text", .string(request.text)), ("reference_id", .string(request.voice)), ("format", .string("mp3"))])
                out.setValue(rules.model, forHTTPHeaderField: "model")
            }
            out.httpBody = JSON.serialize(.object(sent))
            out.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return out
    }

    /// The voices in a provider's answer as `{voices: [{id, name}]}`, or nil if it is not a list.
    /// Anything not shaped like a voice is dropped.
    public func voicesIn(provider: String, data: Data) -> JSONObject? {
        guard case .object(let answer)? = try? JSON.parse(data), case .array(let rows)? = answer[provider == "elevenlabs" ? "voices" : "items"] else { return nil }
        var found = [JSONValue]()
        for row in rows {
            guard case .object(let one) = row else { continue }
            if provider == "fish", let kind = one["type"], kind != .string("tts") { continue }
            if provider == "fish", let state = one["state"], state != .string("trained") { continue }
            guard let identity = one[provider == "elevenlabs" ? "voice_id" : "_id"]?.string, Contract.matches(voice, identity),
                  let title = one[provider == "elevenlabs" ? "name" : "title"]?.string else { continue }
            var cleaned = String.UnicodeScalarView()
            for scalar in title.unicodeScalars { cleaned.append(scalar.value < 0x20 || scalar.value == 0x7F ? " " : scalar) }
            let trimmed = String(cleaned).trimmingCharacters(in: .whitespacesAndNewlines)
            var cut = String.UnicodeScalarView()
            cut.append(contentsOf: trimmed.unicodeScalars.prefix(nameCharacters))
            let name = String(cut).trimmingCharacters(in: .whitespacesAndNewlines)
            if !name.isEmpty, found.count < voices {
                found.append(.object(JSONObject([("id", .string(identity)), ("name", .string(name))])))
            }
        }
        return JSONObject([("voices", .array(found))])
    }
}
