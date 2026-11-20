import Foundation
import Network

/// PEA's local gateway: serves the listed web files and passes text chat to the owner's own model
/// server on this Mac. It listens on 127.0.0.1 only and keeps no logs of requests or conversations.
/// Beyond that one loopback address it reaches only what the rules file names: one public page the
/// owner approved (Reader.swift) and the two voice providers (Speech.swift).
///
/// Everything runs on one serial queue, so no state here is shared between threads.
public final class Gateway: NSObject, URLSessionDataDelegate {
    public struct Options {
        public var port: UInt16
        public var token: String
        public var upstream: String
        public var root: URL
        /// What shows reminders as notifications. Without one, the gateway says reminders are not available.
        public var reminders: ReminderSink?
        /// Tests only: names the page reader is served from a plain HTTP port on this Mac, and names
        /// given fixed addresses in place of a DNS answer. The app never sets either.
        public var readerTestSites = [String: UInt16]()
        public var readerTestResolve = [String: [String]]()
        /// Tests only: voice providers reached at a plain HTTP port on this Mac instead. The app never sets it.
        public var speechTestPorts = [String: UInt16]()
        /// The owner's project engine (MCD or RCD), if the operator connected one. Without it, projects are not available.
        public var projects: ProjectEngine?

        public init(port: UInt16, token: String, upstream: String, root: URL, reminders: ReminderSink? = nil) {
            self.port = port
            self.token = token
            self.upstream = upstream
            self.root = root
            self.reminders = reminders
        }
    }

    public let contract: Contract
    public let port: UInt16
    public private(set) var upstream: Upstream
    let root: URL
    let tokens: TokenCheck
    let hosts: Set<String>
    let origins: Set<String>
    let reminders: ReminderSink?
    let readerTestSites: [String: UInt16]
    let readerTestResolve: [String: [String]]
    var pageReads = 0
    let speechTestPorts: [String: UInt16]
    var speechRequests = 0
    let projects: ProjectEngine?
    var projectRequests = 0
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
        reminders = options.reminders
        readerTestSites = options.readerTestSites
        readerTestResolve = options.readerTestResolve
        speechTestPorts = options.speechTestPorts
        projects = options.projects
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

    /// One request to a voice provider, built from the rules file. It shares the session, so a
    /// redirect is never followed and no cookie, cache or stored credential is used.
    func outbound(_ request: URLRequest) -> UpstreamCall {
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
        // A provider's certificate is checked the system's usual way. Anything else is a request for
        // credentials, and the gateway has none to offer.
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust {
            return completionHandler(.performDefaultHandling, nil)
        }
        completionHandler(.cancelAuthenticationChallenge, nil)
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
    private var pageRead: PageRead?
    private var holdsSpeechSlot = false
    private var speechLimit: DispatchWorkItem?
    private var holdsProjectSlot = false
    private var projectLimit: DispatchWorkItem?
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
        endPageRead()
        endSpeech()
        endProject()
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
            let body = buffer.subdata(in: buffer.startIndex + bodyStart..<buffer.startIndex + bodyStart + bodyLength)
            if head?.target == contract.remindersPath { remind(body) } else if head?.target == contract.reader.path { read(body) }
            else if head?.target == contract.speech.path || head?.target == contract.speech.voicesPath { speak(body, listing: head?.target == contract.speech.voicesPath) }
            else if head?.target == contract.projects.path { project(body) }
            else if head?.target == contract.updatesPath {
                // Checked the same way as any gateway would, then answered that it is not available here.
                guard let parsed = try? JSON.parse(body), contract.isUpdateRequest(parsed) else { return reply(400, error: "Invalid update request.") }
                reply(409, error: contract.updatesUnavailable)
            }
            else { chat(body) }
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
            case contract.remindersPath:
                reply(200, body: JSON.serialize(.object(JSONObject([("available", .bool(gateway.reminders?.available == true))]))))
            case contract.projects.path:
                let ready = gateway.projects?.token(contract.projects) != nil
                reply(200, body: JSON.serialize(.object(JSONObject([("available", .bool(ready))]))))
            case contract.updatesPath:
                // This gateway runs from an app bundle, which is not updated this way.
                reply(200, body: JSON.serialize(.object(JSONObject([("available", .bool(false))]))))
            default:
                file(head.target)
            }
        case "POST":
            guard allowed(head, needsToken: true) else { return }
            let forReminders = head.target == contract.remindersPath, forReader = head.target == contract.reader.path
            let forSpeech = head.target == contract.speech.path || head.target == contract.speech.voicesPath
            let forUpdate = head.target == contract.updatesPath, forProjects = head.target == contract.projects.path
            guard forReminders || forReader || forSpeech || forUpdate || forProjects || head.target == "/v1/chat/completions" else {
                return reply(404, error: "Only model listing, text chat, reminders, the page reader, speech, updates and projects are exposed.")
            }
            let type = head.headers["content-type"].map { String($0.split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false)[0]) }
            guard type == "application/json", head.headers["transfer-encoding"] == nil, let text = head.headers["content-length"],
                  (1...7).contains(text.count), text.allSatisfy({ ("0"..."9").contains($0) }), let length = Int(text),
                  length > 0, length <= contract.requestBytes else {
                return reply(400, error: forProjects ? "Invalid project request." : forUpdate ? "Invalid update request." : forSpeech ? "Invalid speech request." : forReminders ? "Invalid reminder list." : forReader ? "Invalid read request." : "Invalid or oversized text chat request.")
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

    /// Reads one public page the owner approved. The rules and the reading itself are in Reader.swift.
    private func read(_ raw: Data) {
        guard case .object(let body)? = try? JSON.parse(raw), body.keys == ["url"], let url = body["url"]?.string else {
            return reply(400, error: "Invalid read request.")
        }
        guard gateway.pageReads < contract.reader.concurrent else { return reply(429, error: "The reader is busy. No automatic retry.") }
        gateway.pageReads += 1
        deadline?.cancel()
        idle?.cancel()
        answered = true  // nothing more is read from the browser; the answer comes when the page has been read
        let reading = PageRead(rules: contract.reader, url: url, sites: gateway.readerTestSites, fixed: gateway.readerTestResolve, queue: gateway.queue) { code, answer in
            self.endPageRead()
            self.send(code: code, body: JSON.serialize(.object(answer)), type: "application/json")
        }
        pageRead = reading
        watchForDisconnect()
        reading.start()
    }

    /// Speaks text the owner reviewed, or lists a key's voices, with one request to the named provider.
    /// The key lives only in this request; nothing the provider says is passed on except audio or voice names.
    private func speak(_ raw: Data, listing: Bool) {
        let rules = contract.speech
        guard let parsed = try? JSON.parse(raw), let request = try? rules.validate(parsed, listing: listing),
              let out = rules.outbound(request, listing: listing, testPort: gateway.speechTestPorts[request.provider]) else {
            return reply(400, error: "Invalid speech request.")
        }
        guard gateway.speechRequests < rules.concurrent else { return reply(429, error: "A voice request is already running. No automatic retry.") }
        gateway.speechRequests += 1
        holdsSpeechSlot = true
        deadline?.cancel()
        idle?.cancel()
        answered = true  // nothing more is read from the browser; the answer comes when the provider has answered
        let limit = listing ? rules.listBytes : rules.audioBytes
        var status = 0, acceptable = false, tooLarge = false
        var data = Data()
        let call = gateway.outbound(out)
        self.call = call
        watchForDisconnect()
        func refuse(_ reason: String) {
            endSpeech()
            let body = JSONObject([("error", .string(SpeechRules.refusals[reason] ?? "")), ("reason", .string(reason))])
            send(code: 502, body: JSON.serialize(.object(body)), type: "application/json")
        }
        // One clock for the whole request, however slowly the provider answers.
        speechLimit = after(rules.seconds) { refuse("failed") }
        call.onResponse = { response in
            status = response.statusCode
            let type = (response.value(forHTTPHeaderField: "Content-Type") ?? "").split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false)
                .first.map { $0.trimmingCharacters(in: .whitespaces).lowercased() } ?? ""
            let encoding = (response.value(forHTTPHeaderField: "Content-Encoding") ?? "identity").trimmingCharacters(in: .whitespaces).lowercased()
            acceptable = encoding == "identity" && (listing ? type == "application/json" : rules.upstreamAudioTypes.contains(type))
            return status == 200 && acceptable
        }
        call.onData = { chunk in
            data.append(chunk)
            if data.count > limit {
                tooLarge = true
                call.task?.cancel()
            }
        }
        call.onEnd = { error in
            self.call = nil
            guard !self.closed, self.holdsSpeechSlot else { return }
            if status != 200 { return refuse(status == 0 ? "failed" : SpeechRules.reason(status: status)) }
            guard acceptable, !tooLarge, error == nil, !data.isEmpty else { return refuse("failed") }
            if listing {
                guard let voices = rules.voicesIn(provider: request.provider, data: data) else { return refuse("failed") }
                self.endSpeech()
                return self.send(code: 200, body: JSON.serialize(.object(voices)), type: "application/json")
            }
            self.endSpeech()
            self.send(code: 200, body: data, type: rules.audioType)
        }
    }

    private func endSpeech() {
        guard holdsSpeechSlot else { return }
        holdsSpeechSlot = false
        speechLimit?.cancel()
        speechLimit = nil
        call?.cancel()
        call = nil
        gateway.speechRequests -= 1
    }

    /// Asks the owner's project engine one named thing with one fixed request. A draft starts nothing
    /// there. The credential stays in this process; nothing the engine says on failure is passed on.
    private func project(_ raw: Data) {
        let rules = contract.projects
        guard let parsed = try? JSON.parse(raw), let request = rules.validate(parsed) else { return reply(400, error: "Invalid project request.") }
        guard let engine = gateway.projects else { return reply(409, error: rules.unavailable) }
        guard gateway.projectRequests < rules.concurrent else { return reply(429, error: "A project request is already running. No automatic retry.") }
        guard let token = engine.token(rules) else { return reply(409, error: rules.unavailable) }
        gateway.projectRequests += 1
        holdsProjectSlot = true
        deadline?.cancel()
        idle?.cancel()
        answered = true  // nothing more is read from the browser; the answer comes when the engine has answered
        var status = 0, acceptable = false, tooLarge = false
        var data = Data()
        let call = gateway.outbound(engine.request(request, token: token, rules: rules))
        self.call = call
        watchForDisconnect()
        func refuse(_ reason: String) {
            endProject()
            let body = JSONObject([("error", .string(rules.refusals[reason] ?? "")), ("reason", .string(reason))])
            send(code: 502, body: JSON.serialize(.object(body)), type: "application/json")
        }
        // One clock for the whole request, however slowly the engine answers.
        projectLimit = after(rules.seconds) { refuse("failed") }
        call.onResponse = { response in
            status = response.statusCode
            let type = (response.value(forHTTPHeaderField: "Content-Type") ?? "").split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false)
                .first.map { $0.trimmingCharacters(in: .whitespaces).lowercased() } ?? ""
            acceptable = type == "application/json" && response.value(forHTTPHeaderField: "Content-Encoding") == nil
            return status == 200 && acceptable
        }
        call.onData = { chunk in
            data.append(chunk)
            if data.count > rules.answerBytes {
                tooLarge = true
                call.task?.cancel()
            }
        }
        call.onEnd = { error in
            self.call = nil
            guard !self.closed, self.holdsProjectSlot else { return }
            if status != 200 { return refuse(status == 0 ? "failed" : ProjectRules.reason(status: status)) }
            guard acceptable, !tooLarge, error == nil, let answer = try? JSON.parse(data), case .object = answer else { return refuse("failed") }
            self.endProject()
            self.send(code: 200, body: JSON.serialize(.object(JSONObject([("result", answer)]))), type: "application/json")
        }
    }

    private func endProject() {
        guard holdsProjectSlot else { return }
        holdsProjectSlot = false
        projectLimit?.cancel()
        projectLimit = nil
        call?.cancel()
        call = nil
        gateway.projectRequests -= 1
    }

    private func endPageRead() {
        guard let reading = pageRead else { return }
        pageRead = nil
        reading.cancel()
        gateway.pageReads -= 1
    }

    /// Takes the owner's whole list of reminders. Only those still ahead are handed on, and only when
    /// something here can show them; the list is never kept or logged by the gateway itself.
    private func remind(_ raw: Data) {
        let list: [Reminder]
        do { list = try contract.validateReminders(try JSON.parse(raw)) } catch {
            return reply(400, error: "Invalid reminder list.")
        }
        var scheduled = 0
        let sink = gateway.reminders
        let available = sink?.available == true
        if available, let sink {
            let now = Date()
            let ahead = list.filter { $0.due > now }
            sink.replace(with: ahead)
            scheduled = ahead.count
        }
        reply(200, body: JSON.serialize(.object(JSONObject([("available", .bool(available)), ("scheduled", .number(String(scheduled)))]))))
    }

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
