import XCTest
import PEAGatewayCore
@testable import PEALauncherCore

@MainActor
final class LauncherTests: XCTestCase {
    static let browser = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("browser")
    var defaults: UserDefaults!
    var suite = ""

    override func setUp() {
        suite = "pea-launcher-tests-" + UUID().uuidString
        defaults = UserDefaults(suiteName: suite)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suite)
    }

    func launcher(_ tokens: TokenStore = MemoryTokenStore()) -> Launcher {
        Launcher(webRoot: LauncherTests.browser, tokens: tokens, defaults: defaults)
    }

    func wait(for launcher: Launcher, _ done: (Launcher.Status) -> Bool) async throws {
        for _ in 0..<200 {
            if done(launcher.status) { return }
            try await Task.sleep(nanoseconds: 25_000_000)
        }
        XCTFail("still \(launcher.status)")
    }

    func get(_ url: URL, token: String? = nil) async throws -> (Int, Data) {
        var request = URLRequest(url: url)
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        let (data, response) = try await URLSession(configuration: .ephemeral).data(for: request)
        return ((response as! HTTPURLResponse).statusCode, data)
    }

    /// Stands in for the system's notifications: it records what would be waiting and never shows anything.
    final class FakeNotifications: NotificationPoster, @unchecked Sendable {
        let lock = NSLock()
        var permission = true
        var asked = 0
        var lists = [[Reminder]]()
        func askPermission(_ done: @escaping (Bool) -> Void) {
            lock.lock(); asked += 1; let answer = permission; lock.unlock()
            done(answer)
        }
        func isPermitted(_ done: @escaping (Bool) -> Void) {
            lock.lock(); let answer = permission; lock.unlock()
            done(answer)
        }
        func show(exactly reminders: [Reminder]) {
            lock.lock(); lists.append(reminders); lock.unlock()
        }
        var shown: [[Reminder]] { lock.lock(); defer { lock.unlock() }; return lists }
    }

    func send(_ url: URL, token: String, body: String) async throws -> (Int, String) {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(body.utf8)
        let (data, response) = try await URLSession(configuration: .ephemeral).data(for: request)
        return ((response as! HTTPURLResponse).statusCode, String(decoding: data, as: UTF8.self))
    }

    func testRemindersNeedTheOwnersSwitchAndTheSystemsPermission() async throws {
        let fake = FakeNotifications()
        let center = ReminderCenter(poster: fake, defaults: defaults)
        let one = Reminder(id: "a", title: "Water the peas", due: Date().addingTimeInterval(600))
        XCTAssertFalse(center.available, "off until the owner turns it on")
        center.replace(with: [one])
        XCTAssertEqual(fake.shown, [], "nothing is shown while off")
        fake.permission = false
        var answer = await withCheckedContinuation { done in center.turnOn { done.resume(returning: $0) } }
        XCTAssertFalse(answer, "the system said no")
        XCTAssertFalse(center.available)
        fake.permission = true
        answer = await withCheckedContinuation { done in center.turnOn { done.resume(returning: $0) } }
        XCTAssertTrue(answer)
        XCTAssertEqual(fake.asked, 2)
        center.replace(with: [one])
        XCTAssertEqual(fake.shown, [[one]])
        XCTAssertTrue(ReminderCenter(poster: fake, defaults: defaults).available, "still on at the next launch")
        fake.permission = false
        XCTAssertFalse(ReminderCenter(poster: fake, defaults: defaults).available, "off again if the system withdrew its permission")
        center.turnOff()
        XCTAssertFalse(center.available)
        XCTAssertEqual(fake.shown.last, [], "turning off withdraws what was waiting")
        fake.permission = true
        XCTAssertFalse(ReminderCenter(poster: fake, defaults: defaults).available, "and stays off at the next launch")
    }

    func testTheRunningAppTakesRemindersOnlyWhenTurnedOn() async throws {
        let port = try XCTUnwrap(Launcher.freePort(after: 43000))
        defaults.set(Int(port), forKey: "port")
        let fake = FakeNotifications()
        let app = Launcher(webRoot: LauncherTests.browser, tokens: MemoryTokenStore(), defaults: defaults, notifications: fake)
        XCTAssertTrue(app.canRemind)
        XCTAssertFalse(launcher().canRemind, "run from source there is nothing to show reminders with")
        app.start()
        try await wait(for: app) { $0 == .running }
        let url = app.address.appendingPathComponent("v1/reminders"), token = try app.token()
        let ahead = Int(Date().timeIntervalSince1970 * 1000) + 600_000
        let list = #"{"reminders":[{"id":"soon","title":"Water the peas","due":\#(ahead)},{"id":"gone","title":"Yesterday","due":1000}]}"#
        let refused = try await get(url)
        XCTAssertEqual(refused.0, 401)
        var state = try await get(url, token: token)
        XCTAssertEqual(String(decoding: state.1, as: UTF8.self), #"{"available":false}"#)
        var sent = try await send(url, token: token, body: list)
        XCTAssertEqual(sent.0, 200)
        XCTAssertEqual(sent.1, #"{"available":false,"scheduled":0}"#)
        XCTAssertEqual(fake.shown, [], "nothing is handed on while the switch is off")
        let on = await app.setReminders(true)
        XCTAssertTrue(on)
        XCTAssertTrue(app.remindersOn)
        state = try await get(url, token: token)
        XCTAssertEqual(String(decoding: state.1, as: UTF8.self), #"{"available":true}"#)
        sent = try await send(url, token: token, body: list)
        XCTAssertEqual(sent.1, #"{"available":true,"scheduled":1}"#)
        XCTAssertEqual(fake.shown.last?.map(\.id), ["soon"], "a reminder already past is not handed on")
        XCTAssertEqual(fake.shown.last?.first?.title, "Water the peas")
        let bad = try await send(url, token: token, body: #"{"reminders":[{"id":"x","title":"two\nlines","due":5}]}"#)
        XCTAssertEqual(bad.0, 400)
        XCTAssertEqual(fake.shown.last?.map(\.id), ["soon"], "a refused list changes nothing")
        sent = try await send(url, token: token, body: #"{"reminders":[]}"#)
        XCTAssertEqual(sent.1, #"{"available":true,"scheduled":0}"#)
        XCTAssertEqual(fake.shown.last, [], "an empty list withdraws them all")
        await app.setReminders(false)
        XCTAssertFalse(app.remindersOn)
        state = try await get(url, token: token)
        XCTAssertEqual(String(decoding: state.1, as: UTF8.self), #"{"available":false}"#)
        await app.stop()
    }

    func testTheOfferIsHeadedAsTimeManagementAndARemindersHeadingStays() {
        XCTAssertEqual(notificationHeading(for: "plan-offer-2026-11-27"), "Time management")
        XCTAssertEqual(notificationHeading(for: "3f1c0f0e-6f0a-4c59-9b0e-2f6a0d1c7a11"), "PEA reminder")
        XCTAssertEqual(notificationHeading(for: "my-plan-offer-1"), "PEA reminder")
        XCTAssertEqual(notificationHeading(for: ""), "PEA reminder")
    }

    func testATokenIsMadeOnceAndKept() throws {
        let store = MemoryTokenStore()
        let first = try launcher(store).token()
        XCTAssertEqual(first.count, 43)
        XCTAssertNotNil(first.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression))
        XCTAssertEqual(try launcher(store).token(), first, "the same token on the next launch")
        XCTAssertNotEqual(try launcher(MemoryTokenStore()).token(), first, "another install gets another token")
        store.token = "too short"
        XCTAssertNotEqual(try launcher(store).token(), "too short", "a damaged token is replaced, not used")
        XCTAssertEqual(Set(try (0..<50).map { _ in try ConnectionToken.make() }).count, 50)
    }

    func testSettingsAreRememberedAndBadOnesIgnored() throws {
        XCTAssertEqual(launcher().port, Launcher.defaultPort)
        XCTAssertEqual(launcher().upstream, Launcher.defaultUpstream)
        defaults.set(80, forKey: "port")
        defaults.set("https://example.com", forKey: "upstream")
        XCTAssertEqual(launcher().port, Launcher.defaultPort, "a port below 1024 is not used")
        XCTAssertEqual(launcher().upstream, Launcher.defaultUpstream, "a saved address that is not on this Mac is not used")
        let one = launcher()
        try one.use(upstream: "  http://localhost:1234/v1 ")
        XCTAssertEqual(launcher().upstream, "http://localhost:1234/v1")
        for bad in ["http://example.com", "https://127.0.0.1:1", "http://192.168.0.2:11434", ""] {
            XCTAssertThrowsError(try one.use(upstream: bad), bad)
        }
        XCTAssertEqual(one.upstream, "http://localhost:1234/v1", "a refused address changes nothing")
        XCTAssertEqual(one.address.absoluteString, "http://127.0.0.1:\(Launcher.defaultPort)/")
        XCTAssertEqual(one.releasesPage?.absoluteString, "https://github.com/gptkiosk/pea-web/releases")
        XCTAssertFalse(one.version.isEmpty)
    }

    /// A synthetic access file of the shape an engine issues, in a folder removed after the test.
    func accessFile(_ text: String = String(repeating: "e", count: 64) + "\n", mode: Int = 0o600) throws -> String {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("pea-engine-tests-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: folder) }
        let file = folder.appendingPathComponent("pea.token").path
        XCTAssertTrue(FileManager.default.createFile(atPath: file, contents: Data(text.utf8), attributes: [.posixPermissions: mode]))
        return file
    }

    func testAProjectEngineIsAcceptedOnlyWithASafeAddressAndAPrivateAccessFile() async throws {
        let one = launcher()
        XCTAssertNil(one.engineAddress)
        XCTAssertFalse(one.engineReady)
        let good = try accessFile()
        for address in ["http://example.com:8800", "http://192.168.0.2:8800", "http://127.0.0.1:8800/api",
                        "https://user@engine.example", "https://engine.example/?x=1", "ftp://127.0.0.1", "http://127.0.0.1:0", ""] {
            do {
                try await one.use(engine: address, tokenFile: good)
                XCTFail("accepted " + address)
            } catch {}
        }
        let link = (good as NSString).deletingLastPathComponent + "/link.token"
        try FileManager.default.createSymbolicLink(atPath: link, withDestinationPath: good)
        for file in [try accessFile(mode: 0o644), try accessFile("too short\n"), try accessFile(String(repeating: "e", count: 63) + "!"),
                     link, (good as NSString).deletingLastPathComponent, good + ".missing", "relative.token", ""] {
            do {
                try await one.use(engine: "http://127.0.0.1:8800", tokenFile: file)
                XCTFail("accepted the file " + file)
            } catch {
                XCTAssertFalse(String(describing: error).contains("eeee"), "a refusal never repeats the access")
            }
        }
        XCTAssertNil(one.engineAddress, "a refused setting changes nothing")
        XCTAssertNil(defaults.string(forKey: "projectsAddress"))
        XCTAssertNil(launcher().engineAddress)

        try await one.use(engine: "  http://127.0.0.1:8800/ ", tokenFile: good)
        XCTAssertEqual(one.engineAddress, "http://127.0.0.1:8800/")
        XCTAssertEqual(one.engineTokenFile, good)
        XCTAssertTrue(one.engineReady)
        XCTAssertEqual(one.status, .stopped, "a stopped PEA is not started by the setting")
        // Only the address and the path are remembered, never what the file holds.
        let saved = defaults.dictionaryRepresentation().filter { $0.key.hasPrefix("projects") }
        XCTAssertEqual(saved.keys.sorted(), ["projectsAddress", "projectsTokenFile"])
        XCTAssertFalse(String(describing: saved).contains("eeee"))
        let next = launcher()
        XCTAssertEqual(next.engineAddress, "http://127.0.0.1:8800/")
        XCTAssertTrue(next.engineReady)
        // Another machine of the owner's, by name over HTTPS, is accepted too.
        try await one.use(engine: "https://engine.example:9443", tokenFile: good)
        XCTAssertEqual(launcher().engineAddress, "https://engine.example:9443")

        // A saved address that no longer passes the rules is not used; a file that has gone is, and is simply not ready.
        defaults.set("http://192.168.0.2:8800", forKey: "projectsAddress")
        XCTAssertNil(launcher().engineAddress)
        defaults.set("http://127.0.0.1:8800", forKey: "projectsAddress")
        try FileManager.default.removeItem(atPath: good)
        XCTAssertEqual(launcher().engineAddress, "http://127.0.0.1:8800")
        XCTAssertFalse(launcher().engineReady)

        await one.removeEngine()
        XCTAssertNil(one.engineAddress)
        XCTAssertNil(defaults.string(forKey: "projectsAddress"))
        XCTAssertNil(defaults.string(forKey: "projectsTokenFile"))
        XCTAssertNil(launcher().engineAddress)
    }

    func testTheRunningAppOffersProjectsOnlyWhileAnEngineIsConnectedAndItsFileIsUsable() async throws {
        let port = try XCTUnwrap(Launcher.freePort(after: 43000))
        defaults.set(Int(port), forKey: "port")
        let one = launcher()
        one.start()
        try await wait(for: one) { $0 == .running }
        let token = try one.token()
        let route = one.address.appendingPathComponent("v1/projects")
        func available() async throws -> String { String(decoding: try await get(route, token: token).1, as: UTF8.self) }
        let before = try await available()
        XCTAssertEqual(before, #"{"available":false}"#)
        let asked = try await send(route, token: token, body: #"{"action":"list"}"#)
        XCTAssertEqual(asked.0, 409, "with no engine nothing is asked of anyone")

        // Port 9 on this Mac answers nothing: the setting is what is under test, not an engine.
        let file = try accessFile()
        try await one.use(engine: "http://127.0.0.1:9", tokenFile: file)
        try await wait(for: one) { $0 == .running }
        XCTAssertEqual(one.port, port, "PEA restarts at the same address")
        let connected = try await available()
        XCTAssertEqual(connected, #"{"available":true}"#)
        let unanswered = try await send(route, token: token, body: #"{"action":"list"}"#)
        XCTAssertEqual(unanswered.0, 502, "the request now goes to the engine's address, where nothing answers")
        XCTAssertFalse(unanswered.1.contains("eeee"))
        let closed = try await get(route)
        XCTAssertEqual(closed.0, 401, "the route still needs PEA's own token")

        // Removing the file ends the access at once, with no restart.
        try FileManager.default.removeItem(atPath: file)
        let gone = try await available()
        XCTAssertEqual(gone, #"{"available":false}"#)
        XCTAssertFalse(one.engineReady)

        await one.removeEngine()
        try await wait(for: one) { $0 == .running }
        let after = try await send(route, token: token, body: #"{"action":"list"}"#)
        XCTAssertEqual(after.0, 409)
        await one.stop()
    }

    func testItStartsServesStopsAndRestartsOnTheSamePort() async throws {
        let port = try XCTUnwrap(Launcher.freePort(after: 41000))
        defaults.set(Int(port), forKey: "port")
        let one = launcher()
        one.start()
        try await wait(for: one) { $0 == .running }
        let page = try await get(one.address)
        XCTAssertEqual(page.0, 200)
        XCTAssertEqual(page.1, try Data(contentsOf: LauncherTests.browser.appendingPathComponent("index.html")))
        let refused = try await get(one.address.appendingPathComponent("v1/models"))
        XCTAssertEqual(refused.0, 401, "the model route needs the token")
        let wrong = try await get(one.address.appendingPathComponent("v1/models"), token: String(repeating: "x", count: 43))
        XCTAssertEqual(wrong.0, 401)
        await one.stop()
        XCTAssertEqual(one.status, .stopped)
        do {
            _ = try await get(one.address)
            XCTFail("still answering after stop")
        } catch {}
        one.start()
        try await wait(for: one) { $0 == .running }
        let again = try await get(one.address)
        XCTAssertEqual(again.0, 200)
        await one.stop()
    }

    func testABusyPortIsReportedWithAFreeOneAndMovingIsRemembered() async throws {
        let port = try XCTUnwrap(Launcher.freePort(after: 42000))
        defaults.set(Int(port), forKey: "port")
        let first = launcher()
        first.start()
        try await wait(for: first) { $0 == .running }

        let second = launcher()
        second.start()
        try await wait(for: second) { if case .portBusy = $0 { return true } else { return false } }
        guard case .portBusy(let free?) = second.status else { return XCTFail("no free port was offered") }
        XCTAssertGreaterThan(free, port)
        let firstPage = try await get(first.address)
        XCTAssertEqual(firstPage.0, 200, "the program already on the port is not disturbed")

        await second.use(port: free)
        try await wait(for: second) { $0 == .running }
        XCTAssertEqual(second.port, free)
        let moved = try await get(second.address)
        XCTAssertEqual(moved.0, 200)
        XCTAssertEqual(launcher().port, free, "the chosen port is remembered")
        await second.stop()
        await first.stop()
    }

    func testTheKeychainStoreKeepsReplacesAndRemovesAToken() throws {
        // Uses a service name made for this run and removes it. Skipped where no Keychain can be used unattended.
        let store = KeychainTokenStore(service: "pea.tests." + UUID().uuidString)
        defer { try? store.delete() }
        do { try store.save("first-synthetic-token-0123456789abcdef") } catch let error as TokenStoreError {
            throw XCTSkip("No usable Keychain here: \(error)")
        }
        XCTAssertEqual(try store.read(), "first-synthetic-token-0123456789abcdef")
        try store.save("second-synthetic-token-0123456789abcde")
        XCTAssertEqual(try store.read(), "second-synthetic-token-0123456789abcde")
        XCTAssertNil(try KeychainTokenStore(service: "pea.tests.other." + UUID().uuidString).read(), "another service sees nothing")
        try store.delete()
        XCTAssertNil(try store.read())
        XCTAssertNoThrow(try store.delete(), "removing what is not there is not an error")
    }
}
