import Foundation
import Network

/// PEA's local gateway: serves the listed web files and passes text chat to the owner's own model
/// server on this Mac. It listens on 127.0.0.1 only, keeps no logs of requests or conversations, and
/// has no route that reaches anything except that one loopback address.
///
/// Everything runs on one serial queue, so no state here is shared between threads.
public final class Gateway: NSObject, URLSessionDataDelegate {
    public struct Options {
        public var port: UInt16
        public var token: String
        public var upstream: String
        public var root: URL

        public init(port: UInt16, token: String, upstream: String, root: URL) {
            self.port = port
            self.token = token
            self.upstream = upstream
            self.root = root
        }
    }

    public let contract: Contract
    public let port: UInt16
    public private(set) var upstream: Upstream
    let root: URL
    let tokens: TokenCheck
    let hosts: Set<String>
    let origins: Set<String>
    let queue = DispatchQueue(label: "pea.gateway")

    private var listener: NWListener?
    private var session: URLSession!
    private var open = [ObjectIdentifier: Client]()
    var modelRequests = 0
    var models = Set<String>()
    var modelsAt = Date.distantPast
    private var identity: Data?
    private var identityAt = Date.distantPast
    private var calls = [Int: UpstreamCall]()

    public init(_ options: Options) throws {
        guard options.port >= 1 else { throw GatewayError("Choose a valid port.") }
        root = options.root.resolvingSymlinksInPath()
        guard let rules = Files.read(root: root, name: "server/contract.json", limit: 200_000) else {
            throw GatewayError("The web files were not found, or their rules file is missing.")
        }
        contract = try Contract(data: rules)
        guard contract.isToken(options.token) else { throw GatewayError("Use a random token of 32–128 URL-safe characters.") }
        tokens = TokenCheck(token: options.token)
        upstream = try Upstream(options.upstream)
        port = options.port
        hosts = Set(["127.0.0.1", "localhost", "[::1]"].map { $0 + ":" + String(options.port) })
        origins = Set(hosts.map { "http://" + $0 })
        super.init()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.connectionProxyDictionary = [:]  // never through a system proxy
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = contract.upstreamTimeoutSeconds
        configuration.timeoutIntervalForResource = contract.streamSeconds + contract.upstreamTimeoutSeconds
        configuration.httpMaximumConnectionsPerHost = contract.concurrentModelRequests
        configuration.httpAdditionalHeaders = [:]
        let delegates = OperationQueue()
        delegates.underlyingQueue = queue
        delegates.maxConcurrentOperationCount = 1
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: delegates)
    }

    /// Starts listening. `ready` is called once, on an arbitrary queue, with nil or the reason it could not start.
    public func start(ready: @escaping (Error?) -> Void) {
        queue.async {
            let parameters = NWParameters.tcp
            parameters.allowLocalEndpointReuse = true
            parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: self.port)!)
            parameters.acceptLocalOnly = true
            let listener: NWListener
            do { listener = try NWListener(using: parameters) } catch { return ready(error) }
            var reported = false
            listener.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    if !reported { reported = true; ready(nil) }
                case .failed(let error), .waiting(let error):
                    listener.cancel()
                    if !reported { reported = true; ready(error) }
                default: break
                }
            }
            listener.newConnectionHandler = { connection in self.accept(connection) }
            self.listener = listener
            listener.start(queue: self.queue)
        }
    }

    /// Stops listening and drops every open connection. `done` is called once the port is free again.
    public func stop(done: @escaping () -> Void = {}) {
        queue.async {
            self.session.invalidateAndCancel()
            for client in self.open.values { client.close() }
            guard let listener = self.listener else { return done() }
            self.listener = nil
            listener.stateUpdateHandler = { state in
                if case .cancelled = state { done() }
            }
            listener.cancel()
        }
    }

    /// Points the gateway at a different model server on this Mac. The list of usable models is forgotten.
    public func setUpstream(_ text: String) throws {
        let next = try Upstream(text)
        queue.async {
            self.upstream = next
            self.models = []
            self.modelsAt = .distantPast
        }
    }

    private func accept(_ connection: NWConnection) {
        // Past the limit a connection is closed without an answer, so held-open connections cannot pile up.
        guard open.count < contract.connections else { return connection.cancel() }
        let client = Client(connection: connection, gateway: self)
        open[ObjectIdentifier(client)] = client
        client.start()
    }

    func clientClosed(_ client: Client) { open.removeValue(forKey: ObjectIdentifier(client)) }

    func buildInfo() -> Data? {
        if let identity, Date().timeIntervalSince(identityAt) <= contract.buildInfoSeconds { return identity }
        guard let object = try? BuildIdentity.read(root: root) else { return nil }
        identity = JSON.serialize(.object(object))
        identityAt = Date()
        return identity
    }

    // MARK: Calls to the model server

    final class UpstreamCall {
        var onResponse: (HTTPURLResponse) -> Bool = { _ in true }
        var onData: (Data) -> Void = { _ in }
        var onEnd: (Error?) -> Void = { _ in }
        var task: URLSessionDataTask?
        func cancel() {
            onResponse = { _ in false }
            onData = { _ in }
            onEnd = { _ in }
            task?.cancel()
        }
    }

    func call(_ method: String, _ path: String, body: Data? = nil) -> UpstreamCall {
        var request = URLRequest(url: upstream.url(path))
        request.httpMethod = method
        request.httpBody = body
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(method == "POST" ? "text/event-stream" : "application/json", forHTTPHeaderField: "Accept")
        request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        let call = UpstreamCall()
        let task = session.dataTask(with: request)
        call.task = task
        calls[task.taskIdentifier] = call
        task.resume()
        return call
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                           newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)  // a redirect is never followed; it is treated as a failed answer
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                           completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let call = calls[dataTask.taskIdentifier], let http = response as? HTTPURLResponse else { return completionHandler(.cancel) }
        completionHandler(call.onResponse(http) ? .allow : .cancel)
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        calls[dataTask.taskIdentifier]?.onData(data)
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        calls.removeValue(forKey: task.taskIdentifier)?.onEnd(error)
    }

    public func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                           completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        completionHandler(.cancelAuthenticationChallenge, nil)  // the gateway has no credentials to offer
    }
}

/// One browser connection: one request, one answer, then closed.
final class Client {
    private let connection: NWConnection
    private let gateway: Gateway
    private var buffer = Data()
    private var head: RequestHead?
    private var bodyStart = 0
    private var bodyLength = 0
    private var deadline: DispatchWorkItem?
    private var idle: DispatchWorkItem?
    private var answered = false
    private var closed = false
    private var holdsModelSlot = false
    private var call: Gateway.UpstreamCall?

    private var contract: Contract { gateway.contract }

    init(connection: NWConnection, gateway: Gateway) {
        self.connection = connection
        self.gateway = gateway
    }

    func start() {
        connection.stateUpdateHandler = { state in
            switch state {
            case .failed, .cancelled: self.finished()
            default: break
            }
        }
        // A client has a fixed time to deliver its whole request, however slowly it sends.
        deadline = after(contract.requestDeadlineSeconds) { self.close() }
        touch()
        connection.start(queue: gateway.queue)
        receive()
    }

    private func after(_ seconds: Double, _ work: @escaping () -> Void) -> DispatchWorkItem {
        let item = DispatchWorkItem(block: work)
        gateway.queue.asyncAfter(deadline: .now() + seconds, execute: item)
        return item
    }

    /// Restarts the timer that closes a connection on which nothing is moving.
    private func touch() {
        idle?.cancel()
        idle = after(contract.readTimeoutSeconds) { self.close() }
    }

    /// Closes the connection and gives its place back at once. Waiting for the system to report the
    /// close would leave finished connections counted for a moment, and a busy page load would then
    /// run into the connection limit and be refused.
    func close() {
        connection.cancel()
        finished()
    }

    /// Runs once when the connection is gone, however that happened. The retain cycle through the
    /// connection's handlers is what keeps this object alive until then.
    private func finished() {
        guard !closed else { return }
        closed = true
        deadline?.cancel()
        idle?.cancel()
        streamLimit?.cancel()
        call?.cancel()
        call = nil
        releaseModelSlot()
        connection.stateUpdateHandler = nil
        gateway.clientClosed(self)
    }

    private func releaseModelSlot() {
        if holdsModelSlot {
            holdsModelSlot = false
            gateway.modelRequests -= 1
        }
    }

    private func takeModelSlot() -> Bool {
        guard gateway.modelRequests < contract.concurrentModelRequests else { return false }
        gateway.modelRequests += 1
        holdsModelSlot = true
        return true
    }

    // MARK: Reading

    private func receive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { data, _, complete, error in
            guard !self.closed, !self.answered else { return }
            if let data, !data.isEmpty {
                self.touch()
                self.buffer.append(data)
                self.advance()
            }
            if self.answered || self.closed { return }
            if complete || error != nil { return self.close() }
            self.receive()
        }
    }

    private func advance() {
        if head == nil {
            do {
                guard let parsed = try RequestHead.parse(buffer) else { return }
                head = parsed.head
                bodyStart = parsed.bodyStart
            } catch RequestHead.Failure.tooLarge {
                return reply(431, error: "Request too large.")
            } catch {
                return reply(400, error: "Bad request.")
            }
            route(head!)
        } else if buffer.count - bodyStart >= bodyLength {
            chat(buffer.subdata(in: buffer.startIndex + bodyStart..<buffer.startIndex + bodyStart + bodyLength))
        }
    }

    // MARK: Routing

    /// Host, address and token checks, in the same order as the Python gateway.
    private func allowed(_ head: RequestHead, needsToken: Bool) -> Bool {
        let origin = head.headers["origin"]
        guard let host = head.headers["host"], gateway.hosts.contains(host), origin == nil || gateway.origins.contains(origin!) else {
            reply(403, error: "Origin or host rejected.")
            return false
        }
        // The address is used exactly as sent; a doubled leading slash is not tidied into one.
        guard !head.target.hasPrefix("//") else {
            reply(404, error: "Not found.")
            return false
        }
        guard !needsToken || gateway.tokens.accepts(head.headers["authorization"]) else {
            reply(401, error: "Enter this server’s connection token.")
            return false
        }
        return true
    }

    private func route(_ head: RequestHead) {
        switch head.method {
        case "GET":
            guard allowed(head, needsToken: head.target.hasPrefix("/v1/")) else { return }
            deadline?.cancel()
            switch head.target {
            case "/api/build-info":
                guard let info = gateway.buildInfo() else { return reply(503, error: "Build identity unavailable.") }
                reply(200, body: info)
            case "/v1/models":
                listModels()
            default:
                file(head.target)
            }
        case "POST":
            guard allowed(head, needsToken: true) else { return }
            guard head.target == "/v1/chat/completions" else { return reply(404, error: "Only model listing and text chat are exposed.") }
            let type = head.headers["content-type"].map { String($0.split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false)[0]) }
            guard type == "application/json", head.headers["transfer-encoding"] == nil, let text = head.headers["content-length"],
                  (1...7).contains(text.count), text.allSatisfy({ ("0"..."9").contains($0) }), let length = Int(text),
                  length > 0, length <= contract.requestBytes else {
                return reply(400, error: "Invalid or oversized text chat request.")
            }
            bodyLength = length
            advance()
        default:
            reply(501, error: "Unsupported method.")
        }
    }

    private func file(_ target: String) {
        let name: String
        if ["/", "/browser/", "/browser"].contains(target) {
            name = "index.html"
        } else {
            var rest = Substring(target)
            if rest.hasPrefix("/browser/") { rest = rest.dropFirst("/browser/".count) }
            if rest.hasPrefix("/") { rest = rest.dropFirst() }
            name = String(rest)
        }
        // Only an exact name from the list is ever joined to the folder.
        guard contract.assets.contains(name), let data = Files.read(root: gateway.root, name: name) else { return reply(404, error: "Not found.") }
        reply(200, body: data, type: Files.contentType(name))
    }

    // MARK: Model list

    private func listModels() {
        guard takeModelSlot() else { return reply(429, error: "Local model busy. No automatic retry.") }
        let unavailable = "Local model server unavailable or invalid model list. No cloud fallback."
        var collected = Data()
        var good = false
        let call = gateway.call("GET", "models")
        self.call = call
        call.onResponse = { response in
            good = response.statusCode == 200
            return good
        }
        call.onData = { data in
            collected.append(data)
            if collected.count > self.contract.modelListBytes {
                good = false
                call.task?.cancel()
            }
        }
        call.onEnd = { error in
            self.call = nil
            self.releaseModelSlot()
            guard error == nil, good, case .object(let top)? = try? JSON.parse(collected), case .array(let rows)? = top["data"] else {
                return self.reply(502, error: unavailable)
            }
            var ids = [String]()
            var seen = Set<String>()
            for row in rows {
                guard case .object(let entry) = row, let id = entry["id"]?.string, self.contract.isModelID(id), seen.insert(id).inserted else { continue }
                ids.append(id)
            }
            ids = Array(ids.prefix(self.contract.models))
            guard !ids.isEmpty else { return self.reply(502, error: unavailable) }
            self.gateway.models = Set(ids)
            self.gateway.modelsAt = Date()
            let list = ids.map { JSONValue.object(JSONObject([("id", .string($0)), ("object", .string("model")), ("owned_by", .string("customer-local"))])) }
            self.reply(200, body: JSON.serialize(.object(JSONObject([("data", .array(list))]))))
        }
    }

    // MARK: Chat

    private var streamLimit: DispatchWorkItem?

    private func chat(_ raw: Data) {
        let body: JSONObject
        do { body = try contract.validateChat(try JSON.parse(raw)) } catch {
            return reply(400, error: "Invalid or oversized text chat request.")
        }
        deadline?.cancel()
        idle?.cancel()
        guard let model = body["model"]?.string, gateway.models.contains(model),
              Date().timeIntervalSince(gateway.modelsAt) <= contract.modelListSeconds else {
            return reply(409, error: "Refresh and choose a model listed by this server.")
        }
        guard takeModelSlot() else { return reply(429, error: "Local model busy. No automatic retry.") }
        answered = true  // nothing more is read from the browser; the answer may still be an error
        var started = false
        var sent = 0
        let call = gateway.call("POST", "chat/completions", body: JSON.serialize(.object(body)))
        self.call = call
        watchForDisconnect()
        call.onResponse = { response in
            let type = response.value(forHTTPHeaderField: "Content-Type") ?? ""
            guard response.statusCode == 200, type.hasPrefix("text/event-stream") else {
                self.call = nil
                self.releaseModelSlot()
                self.send(code: 502, body: Response.error("Local model rejected this request. No fallback."), type: "application/json")
                return false
            }
            started = true
            self.connection.send(content: Response.head(200, headers: self.contract.streamHeaders), completion: .contentProcessed { _ in })
            self.streamLimit = self.after(self.contract.streamSeconds) { self.endStream() }
            return true
        }
        call.onData = { data in
            guard started else { return }
            let room = self.contract.streamBytes - sent
            let part = data.prefix(max(room, 0))
            sent += part.count
            if !part.isEmpty {
                self.connection.send(content: part, completion: .contentProcessed { error in
                    if error != nil { self.close() }
                })
            }
            if data.count > room { self.endStream() }  // the reply is cut off at the size limit
        }
        call.onEnd = { _ in
            self.call = nil
            self.releaseModelSlot()
            if started { self.endStream() } else if !self.closed {
                self.send(code: 502, body: Response.error("Local model unavailable. No cloud fallback."), type: "application/json")
            }
        }
    }

    /// While a reply streams, the only thing expected from the browser is that it may go away.
    private func watchForDisconnect() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { _, _, complete, error in
            guard !self.closed else { return }
            if complete || error != nil { return self.close() }
            self.watchForDisconnect()
        }
    }

    private func endStream() {
        guard !closed else { return }
        streamLimit?.cancel()
        call?.cancel()
        call = nil
        releaseModelSlot()
        connection.send(content: nil, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { _ in self.close() })
    }

    // MARK: Answering

    private func reply(_ code: Int, error message: String) {
        reply(code, body: Response.error(message))
    }

    private func reply(_ code: Int, body: Data, type: String = "application/json") {
        guard !answered else { return }
        answered = true
        send(code: code, body: body, type: type)
    }

    private func send(code: Int, body: Data, type: String) {
        guard !closed else { return }
        deadline?.cancel()
        // The same headers go on every answer, including refusals.
        let headers = [("Content-Type", type), ("Content-Length", String(body.count))] + contract.headers.map { ($0.name, $0.value) }
        idle?.cancel()
        idle = after(contract.readTimeoutSeconds) { self.close() }  // a browser that will not read its answer is dropped
        connection.send(content: Response.head(code, headers: headers) + body, contentContext: .finalMessage, isComplete: true,
                        completion: .contentProcessed { _ in self.close() })
    }
}
