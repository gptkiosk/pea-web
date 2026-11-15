import Foundation
import Network
import Security

/// The page reader's rules, from the `reader` part of the shared rules file.
public struct ReaderRules {
    struct Network {
        let bytes: [UInt8]
        let bits: Int
    }

    public let path: String
    public let urlCharacters: Int
    public let refusedSuffixes: Set<String>
    public let contentTypes: Set<String>
    public let userAgent: String
    public let accept: String
    public let bodyBytes: Int
    public let headBytes: Int
    public let seconds: Double
    public let concurrent: Int
    let networks: [Network]
    let host: NSRegularExpression

    init(_ value: JSONValue?) throws {
        let missing = GatewayError("The rules file has no page reader rules.")
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
        func line(_ key: String) throws -> String {
            // Sent as a request header, so it may not carry a line break.
            guard let text = rules[key]?.string, !text.isEmpty, text.unicodeScalars.allSatisfy({ $0.value >= 0x20 && $0.value < 0x7F }) else { throw missing }
            return text
        }
        guard let path = rules["path"]?.string, path.hasPrefix("/v1/"), try strings("fields") == ["url"] else { throw missing }
        self.path = path
        urlCharacters = try whole("urlCharacters")
        let longest = try whole("hostCharacters")
        refusedSuffixes = Set(try strings("refusedSuffixes"))
        contentTypes = Set(try strings("contentTypes"))
        userAgent = try line("userAgent")
        accept = try line("accept")
        bodyBytes = try whole("bodyBytes")
        headBytes = try whole("headBytes")
        seconds = Double(try whole("seconds"))
        concurrent = try whole("concurrent")
        networks = try strings("refusedNetworks").map { text in
            let parts = text.split(separator: "/", omittingEmptySubsequences: false)
            guard parts.count == 2, let bytes = ReaderRules.addressBytes(String(parts[0])), let bits = Int(parts[1]), (0...bytes.count * 8).contains(bits) else {
                throw GatewayError("The rules file has a network the page reader cannot understand.")
            }
            return Network(bytes: bytes, bits: bits)
        }
        host = try NSRegularExpression(pattern: "\\A(?=.{1,\(longest)}\\z)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?\\z")
    }

    /// The four or sixteen bytes of a written address, or nil if it is not one.
    static func addressBytes(_ text: String) -> [UInt8]? {
        var four = in_addr()
        if inet_pton(AF_INET, text, &four) == 1 { return withUnsafeBytes(of: &four) { Array($0) } }
        var six = in6_addr()
        if inet_pton(AF_INET6, text, &six) == 1 { return withUnsafeBytes(of: &six) { Array($0) } }
        return nil
    }

    /// Splits an address the reader may ask for into a host and a path. Anything else throws.
    /// Only `https://name[:443]/path?query` in printable ASCII: no user name, no other port, no fragment,
    /// no numeric address, and no name that is private by convention. `allowed` are test stand-ins.
    public func target(_ url: String, allowed: Set<String> = []) throws -> (host: String, path: String) {
        let scalars = url.unicodeScalars
        guard (12...urlCharacters).contains(scalars.count), url.hasPrefix("https://") else { throw GatewayError("Only an https:// address can be read.") }
        guard scalars.allSatisfy({ (0x21...0x7E).contains($0.value) && $0 != "\\" && $0 != "#" }) else {
            throw GatewayError("The address has a character that cannot be used.")
        }
        let rest = url.dropFirst("https://".count)
        let cut = rest.firstIndex(where: { $0 == "/" || $0 == "?" }) ?? rest.endIndex
        var authority = String(rest[..<cut])
        let tail = String(rest[cut...])
        if authority.hasSuffix(":443") { authority.removeLast(4) }
        let name = authority.lowercased()
        guard Contract.matches(host, name) else { throw GatewayError("Only a named public site on the usual port can be read.") }
        let last = String(name.split(separator: ".").last ?? "")
        guard allowed.contains(name) || !refusedSuffixes.contains(last) else { throw GatewayError("That name is not a public site.") }
        return (name, tail.hasPrefix("?") ? "/" + tail : tail.isEmpty ? "/" : tail)
    }

    /// Whether an address a name resolved to is one the reader must never contact.
    public func refuses(address: String) -> Bool {
        let plain = String(address.split(separator: "%", maxSplits: 1, omittingEmptySubsequences: false)[0])
        guard let bytes = ReaderRules.addressBytes(plain) else { return true }
        return networks.contains { network in
            guard network.bytes.count == bytes.count else { return false }
            let whole = network.bits / 8, left = network.bits % 8
            if bytes[..<whole] != network.bytes[..<whole] { return false }
            if left == 0 { return true }
            let mask = UInt8(truncatingIfNeeded: 0xFF << (8 - left))
            return bytes[whole] & mask == network.bytes[whole] & mask
        }
    }
}

/// One read of one public page. Everything runs on the queue it was given.
///
/// The name's addresses are looked up once and every one must be public. The connection then goes to
/// one of those same addresses, not to the name, so a second lookup cannot give a different answer,
/// and the site's certificate is checked against the name. A redirect is reported, never followed.
final class PageRead {
    struct Refusal: Error {
        let code: Int
        let message: String
        var status: Int?
    }

    private let rules: ReaderRules
    private let url: String
    private let sites: [String: UInt16]
    private let fixed: [String: [String]]
    private let queue: DispatchQueue
    private let done: (Int, JSONObject) -> Void
    private var connection: NWConnection?
    private var clock: DispatchWorkItem?
    private var finished = false
    private var host = ""
    private var buffer = Data()
    private var answer: Answer?

    private static let unreachable = Refusal(code: 502, message: "The site could not be reached.")

    init(rules: ReaderRules, url: String, sites: [String: UInt16], fixed: [String: [String]], queue: DispatchQueue, done: @escaping (Int, JSONObject) -> Void) {
        self.rules = rules
        self.url = url
        self.sites = sites
        self.fixed = fixed
        self.queue = queue
        self.done = done
    }

    func start() {
        let path: String
        do { (host, path) = try rules.target(url, allowed: Set(sites.keys).union(fixed.keys)) } catch {
            return fail(Refusal(code: 400, message: String(describing: error)))
        }
        // One clock for the whole read, however slowly the site talks.
        let limit = DispatchWorkItem { [weak self] in self?.fail(PageRead.unreachable) }
        clock = limit
        queue.asyncAfter(deadline: .now() + rules.seconds, execute: limit)
        if let port = sites[host] {
            return open(NWConnection(host: .ipv4(IPv4Address("127.0.0.1")!), port: NWEndpoint.Port(rawValue: port)!, using: .tcp), path: path)
        }
        if let addresses = fixed[host] { return connect(addresses, path: path) }
        let name = host
        DispatchQueue.global(qos: .userInitiated).async {
            let addresses = PageRead.lookUp(name)
            self.queue.async { self.connect(addresses, path: path) }
        }
    }

    func cancel() {
        guard !finished else { return }
        finished = true
        clock?.cancel()
        connection?.cancel()
    }

    /// Every address a name has, as written numbers. Blocks, so it is called off the gateway's queue.
    private static func lookUp(_ name: String) -> [String] {
        var hints = addrinfo()
        hints.ai_socktype = SOCK_STREAM
        var list: UnsafeMutablePointer<addrinfo>?
        guard getaddrinfo(name, "443", &hints, &list) == 0 else { return [] }
        defer { freeaddrinfo(list) }
        var found = [String]()
        var next = list
        while let item = next {
            var text = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(item.pointee.ai_addr, item.pointee.ai_addrlen, &text, socklen_t(text.count), nil, 0, NI_NUMERICHOST) == 0 {
                let address = String(cString: text)
                if !found.contains(address) { found.append(address) }
            }
            next = item.pointee.ai_next
        }
        return found
    }

    private func connect(_ addresses: [String], path: String) {
        guard !finished else { return }
        guard let first = addresses.first else { return fail(Refusal(code: 502, message: "That site could not be found.")) }
        // Every address the name has must be public, so no answer can steer the reader inward.
        guard !addresses.contains(where: { rules.refuses(address: $0) }) else {
            return fail(Refusal(code: 422, message: "That name leads to a private or local address, which is never read."))
        }
        let plain = String(first.split(separator: "%", maxSplits: 1, omittingEmptySubsequences: false)[0])
        let endpoint: NWEndpoint.Host
        if let four = IPv4Address(plain) { endpoint = .ipv4(four) } else if let six = IPv6Address(plain) { endpoint = .ipv6(six) } else { return fail(PageRead.unreachable) }
        let tls = NWProtocolTLS.Options()
        let name = host
        sec_protocol_options_set_tls_server_name(tls.securityProtocolOptions, name)
        sec_protocol_options_set_min_tls_protocol_version(tls.securityProtocolOptions, .TLSv12)
        // The certificate must be valid for the site's name, checked here as well as by the system.
        sec_protocol_options_set_verify_block(tls.securityProtocolOptions, { _, trust, complete in
            let chain = sec_trust_copy_ref(trust).takeRetainedValue()
            SecTrustSetPolicies(chain, SecPolicyCreateSSL(true, name as CFString))
            var problem: CFError?
            complete(SecTrustEvaluateWithError(chain, &problem))
        }, queue)
        open(NWConnection(host: endpoint, port: 443, using: NWParameters(tls: tls)), path: path)
    }

    private func open(_ connection: NWConnection, path: String) {
        self.connection = connection
        connection.stateUpdateHandler = { [weak self] state in
            guard let self, !self.finished else { return }
            switch state {
            case .ready:
                let lines = ["GET \(path) HTTP/1.1", "Host: \(self.host)", "User-Agent: \(self.rules.userAgent)", "Accept: \(self.rules.accept)",
                             "Accept-Encoding: identity", "Connection: close", "", ""]
                connection.send(content: Data(lines.joined(separator: "\r\n").utf8), completion: .contentProcessed { _ in })
                self.receive()
            case .failed, .waiting, .cancelled:
                self.fail(PageRead.unreachable)
            default: break
            }
        }
        connection.start(queue: queue)
    }

    private func receive() {
        connection?.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, complete, error in
            guard let self, !self.finished else { return }
            if let data { self.buffer.append(data) }
            do {
                if try self.advance(ended: complete || error != nil) { return }
            } catch let refusal as Refusal {
                return self.fail(refusal)
            } catch {
                return self.fail(PageRead.unreachable)
            }
            self.receive()
        }
    }

    /// What the site said before the page itself, once it has all arrived.
    private struct Answer {
        var bodyStart: Int
        var kind: String
        var length: Int?
        var chunked: Bool
    }

    /// Looks at what has arrived. Returns true when the read is over, one way or the other.
    private func advance(ended: Bool) throws -> Bool {
        if answer == nil {
            guard let end = buffer.range(of: Data("\r\n\r\n".utf8)) else {
                guard buffer.count <= rules.headBytes, !ended else { throw PageRead.unreachable }
                return false
            }
            guard end.lowerBound - buffer.startIndex <= rules.headBytes, let text = String(bytes: buffer[buffer.startIndex..<end.lowerBound], encoding: .isoLatin1) else {
                throw PageRead.unreachable
            }
            var lines = text.components(separatedBy: "\r\n")
            let first = lines.removeFirst().split(separator: " ", maxSplits: 2, omittingEmptySubsequences: false)
            guard first.count >= 2, first[0] == "HTTP/1.1" || first[0] == "HTTP/1.0", first[1].count == 3, first[1].allSatisfy({ ("0"..."9").contains($0) }),
                  let status = Int(first[1]) else { throw PageRead.unreachable }
            var headers = [String: String]()
            for line in lines {
                guard let colon = line.firstIndex(of: ":"), colon != line.startIndex, lines.count <= 100 else { throw PageRead.unreachable }
                let name = line[..<colon].lowercased(), value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
                headers[name] = headers[name].map { $0 + ", " + value } ?? value
            }
            if [301, 302, 303, 307, 308].contains(status) {
                var location = headers["location"] ?? ""
                if let mark = location.firstIndex(of: "#") { location = String(location[..<mark]) }
                if location.hasPrefix("/") && !location.hasPrefix("//") { location = "https://" + host + location }
                guard (try? rules.target(location, allowed: Set(sites.keys).union(fixed.keys))) != nil else {
                    throw Refusal(code: 502, message: "The site sent the reader somewhere it will not go.")
                }
                // Not followed: the owner sees the new address and decides.
                finish(200, JSONObject([("outcome", .string("redirect")), ("url", .string(url)), ("location", .string(location))]))
                return true
            }
            guard status == 200 else { throw Refusal(code: 502, message: "The site answered with an error.", status: status) }
            let kind = (headers["content-type"] ?? "").split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false)[0]
                .trimmingCharacters(in: .whitespaces).lowercased()
            let packing = (headers["content-encoding"] ?? "identity").trimmingCharacters(in: .whitespaces).lowercased()
            guard rules.contentTypes.contains(kind), packing == "identity" else { throw Refusal(code: 502, message: "That address is not a plain web page or text.") }
            let chunked = (headers["transfer-encoding"] ?? "").lowercased().contains("chunked")
            var length: Int?
            if !chunked, let declared = headers["content-length"] {
                guard !declared.isEmpty, declared.count <= 12, declared.allSatisfy({ ("0"..."9").contains($0) }), let number = Int(declared), number <= rules.bodyBytes else {
                    throw Refusal(code: 502, message: "That page is too large to read.")
                }
                length = number
            }
            answer = Answer(bodyStart: end.upperBound - buffer.startIndex, kind: kind, length: length, chunked: chunked)
        }
        guard let answer else { return false }
        let large = Refusal(code: 502, message: "That page is too large to read.")
        let arrived = buffer.subdata(in: buffer.startIndex + answer.bodyStart..<buffer.endIndex)
        var body: Data?
        if answer.chunked {
            body = try PageRead.unchunk(arrived, limit: rules.bodyBytes, large: large)
            if body == nil, ended { throw PageRead.unreachable }
        } else if let length = answer.length {
            if arrived.count >= length { body = arrived.prefix(length) } else if ended { throw PageRead.unreachable }
        } else {
            guard arrived.count <= rules.bodyBytes else { throw large }
            if ended { body = arrived }
        }
        guard var page = body else { return false }
        guard page.count <= rules.bodyBytes else { throw large }
        if page.starts(with: [0xEF, 0xBB, 0xBF]) { page = page.dropFirst(3) }
        guard let text = String(bytes: page, encoding: .utf8) else { throw Refusal(code: 502, message: "That page is not in a text encoding the reader accepts.") }
        finish(200, JSONObject([("outcome", .string("page")), ("url", .string(url)), ("type", .string(answer.kind)), ("text", .string(text))]))
        return true
    }

    /// Puts a page sent in pieces back together. Returns nil while the last piece has not arrived.
    static func unchunk(_ data: Data, limit: Int, large: Error) throws -> Data? {
        var out = Data()
        var at = data.startIndex
        let lineEnd = Data("\r\n".utf8)
        while true {
            guard let end = data.range(of: lineEnd, in: at..<data.endIndex) else {
                guard data.endIndex - at <= 1024 else { throw unreachable }
                return nil
            }
            guard let line = String(bytes: data[at..<end.lowerBound], encoding: .isoLatin1) else { throw unreachable }
            let digits = line.split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false)[0].trimmingCharacters(in: .whitespaces)
            guard !digits.isEmpty, digits.count <= 8, let size = Int(digits, radix: 16), size >= 0 else { throw unreachable }
            at = end.upperBound
            if size == 0 { return out }  // anything after the last piece is not part of the page
            guard out.count + size <= limit else { throw large }
            guard data.endIndex - at >= size + 2 else { return nil }
            out.append(data[at..<at + size])
            guard data[at + size..<at + size + 2] == lineEnd else { throw unreachable }
            at += size + 2
        }
    }

    private func finish(_ code: Int, _ body: JSONObject) {
        guard !finished else { return }
        finished = true
        clock?.cancel()
        connection?.cancel()
        done(code, body)
    }

    private func fail(_ refusal: Refusal) {
        var body = JSONObject([("error", .string(refusal.message))])
        if let status = refusal.status { body["status"] = .number(String(status)) }
        finish(refusal.code, body)
    }
}
