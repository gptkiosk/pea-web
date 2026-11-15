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
