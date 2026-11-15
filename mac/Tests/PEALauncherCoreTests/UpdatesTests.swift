import XCTest
import PEAGatewayCore
@testable import PEALauncherCore

/// The update check, with a stand-in for GitHub. No test here uses the network.
final class UpdatesTests: XCTestCase {
    /// Answers from a table and records every address asked.
    final class FakeReleases: ReleaseSource, @unchecked Sendable {
        var answers = [String: (Int, String)]()
        var asked = [String]()
        var broken = false
        func get(_ url: URL) async throws -> (status: Int, body: Data) {
            asked.append(url.absoluteString)
            if broken { throw GatewayError("offline") }
            let answer = answers[url.absoluteString] ?? (404, "")
            return (answer.0, Data(answer.1.utf8))
        }
    }

    let latest = "https://api.github.com/repos/synthetic-owner/pea-web/releases/latest"

    func release(_ tag: String, page: String? = nil, extra: String = #""draft":false,"prerelease":false"#) -> String {
        #"{"tag_name":"\#(tag)","html_url":"\#(page ?? "https://github.com/synthetic-owner/pea-web/releases/tag/" + tag)",\#(extra),"body":"Synthetic notes"}"#
    }

    func check(_ source: FakeReleases, version: String = "0.1.0", channel: String = "stable", repository: String? = "synthetic-owner/pea-web") async -> UpdateStanding {
        await Updates.check(repository: repository, version: version, channel: channel, source: source)
    }

    func testVersionsAreOrderedAsOnTheWeb() {
        for (a, b) in [("1.10.0", "1.9.9"), ("2.0.0", "1.99.99"), ("1.0.0", "1.0.0-rc.9"), ("1.0.0-rc.10", "1.0.0-rc.2"), ("1.0.0-beta", "1.0.0-9"),
                       ("v0.2.0", "0.1.0-dev.35"), ("0.1.0-dev.36", "0.1.0-dev.35"), ("0.1.0-dev.100", "0.1.0-dev.99"), ("1.0.0-rc.1.1", "1.0.0-rc.1")] {
            XCTAssertTrue(Updates.isNewer(a, than: b), "\(a) > \(b)")
            XCTAssertFalse(Updates.isNewer(b, than: a), "\(b) < \(a)")
        }
        for (a, b) in [("1.0.0", "1.0.0"), ("1.0.0+build.2", "1.0.0+build.1"), ("1.0.0-rc", "1.0.0"), ("0.9.9", "1.0.0"), ("not-a-release", "1.0.0"), ("1.0.0", "not-a-release")] {
            XCTAssertFalse(Updates.isNewer(a, than: b), "\(a) vs \(b)")
        }
        for bad in ["01.0.0", "1.0", "1.0.0-01", "1.0.0-", "1.0.0/../../x", "", "1.0.0\n", String(repeating: "1", count: 81), "1.0.9999999999999999"] {
            XCTAssertNil(Updates.parts(bad), bad)
        }
    }

    func testANewerReleaseIsReportedWithItsOwnPage() async {
        let source = FakeReleases()
        source.answers[latest] = (200, release("v0.2.0"))
        source.answers["https://api.github.com/repos/synthetic-owner/pea-web/releases/tags/v0.1.0"] = (200, "{}")
        let standing = await check(source)
        XCTAssertEqual(standing.level, .update)
        XCTAssertTrue(standing.text.contains("v0.2.0") && standing.text.contains("0.1.0"))
        XCTAssertTrue(standing.text.contains("Nothing has been downloaded or installed"))
        XCTAssertEqual(standing.page?.absoluteString, "https://github.com/synthetic-owner/pea-web/releases/tag/v0.2.0")
        XCTAssertEqual(source.asked, [latest, "https://api.github.com/repos/synthetic-owner/pea-web/releases/tags/v0.1.0"], "only the configured repository is asked")
    }

    func testTheSameOrAnOlderReleaseChangesNothing() async {
        let source = FakeReleases()
        source.answers[latest] = (200, release("v0.1.0"))
        var standing = await check(source, channel: "development")
        XCTAssertEqual(standing.level, .info)
        XCTAssertNil(standing.page)
        XCTAssertEqual(source.asked, [latest], "a development build does not look its own version up")
        standing = await check(source, version: "0.2.0-dev.3", channel: "development")
        XCTAssertEqual(standing.level, .info)
        XCTAssertTrue(standing.text.contains("ahead of the latest published version"))
        standing = await check(source, version: "0.3.0", channel: "stable")
        XCTAssertEqual(standing.level, .warning, "a stable build newer than the latest may have been withdrawn")
    }

    func testAStableVersionThatIsNoLongerPublishedIsAWarning() async {
        let source = FakeReleases()
        source.answers[latest] = (200, release("v0.1.1"))
        let standing = await check(source)  // the tag lookup answers 404
        XCTAssertEqual(standing.level, .warning)
        XCTAssertTrue(standing.text.contains("may have been withdrawn"))
        source.answers["https://api.github.com/repos/synthetic-owner/pea-web/releases/tags/v0.1.0"] = (503, "")
        let unsure = await check(source)
        XCTAssertEqual(unsure.level, .update, "an unclear answer about this version is not treated as withdrawn")
    }

    func testAnythingUnexpectedIsAFailureAndNeverALink() async {
        let source = FakeReleases()
        for body in [
            release("v0.2.0", extra: #""draft":true,"prerelease":false"#), release("v0.2.0", extra: #""draft":false,"prerelease":true"#),
            release("v0.2.0", extra: #""draft":false"#), release("0.2.0"), release("vnext"), release("v0.2"),
            release("v0.2.0", page: "https://github.com/someone-else/pea-web/releases/tag/v0.2.0"),
            release("v0.2.0", page: "https://example.invalid/download"), release("v0.2.0", page: "https://github.com/synthetic-owner/pea-web/releases/tag/v0.2.0?x=1"),
            #"{"tag_name":7}"#, "[]", "not json", "", #"{"tag_name":"v0.2.0","tag_name":"v0.3.0","html_url":"x","draft":false,"prerelease":false}"#,
        ] {
            source.answers[latest] = (200, body)
            let standing = await check(source, channel: "development")
            XCTAssertEqual(standing.level, .failed, body)
            XCTAssertNil(standing.page, body)
        }
        for status in [301, 403, 404, 429, 500] {
            source.answers[latest] = (status, release("v0.2.0"))
            let standing = await check(source, channel: "development")
            XCTAssertEqual(standing.level, .failed, "status \(status)")
        }
        source.broken = true
        let offline = await check(source)
        XCTAssertEqual(offline.level, .failed)
        XCTAssertTrue(offline.text.contains("Nothing was changed"))
    }

    func testNothingIsAskedWithoutAValidPublicRepository() async {
        let source = FakeReleases()
        for repository in [nil, "", "no-slash", "owner/../x", "owner/repo/extra", "owner/re po", "https://example.invalid/x"] as [String?] {
            let standing = await check(source, repository: repository)
            XCTAssertEqual(standing.level, .failed, repository ?? "nil")
        }
        let standing = await check(source, version: "unknown")
        XCTAssertEqual(standing.level, .failed)
        XCTAssertEqual(source.asked, [], "no request left this Mac")
    }

    func testTheRealSourceRefusesAnyAddressButGitHubsReleaseInformation() async {
        let source = GitHubReleases()
        for address in ["http://api.github.com/repos/a/b/releases/latest", "https://example.invalid/repos/a/b/releases/latest",
                        "https://api.github.com.example.invalid/repos/a/b", "https://user@api.github.com/repos/a/b", "https://api.github.com:8443/repos/a/b",
                        "https://api.github.com/repos/a/b?token=x", "https://api.github.com/user", "https://127.0.0.1/repos/a/b"] {
            do {
                _ = try await source.get(URL(string: address)!)
                XCTFail("asked " + address)
            } catch let error as GatewayError {
                XCTAssertEqual(error.description, "Only GitHub's release information may be asked for.", address)
            } catch {
                XCTFail("reached the network for " + address)
            }
        }
    }

    /// The one test that uses the network, and only when asked: PEA_LIVE_UPDATE_REPOSITORY=owner/name swift test.
    /// It checks the real request and reading against a public repository that has releases.
    func testTheRealSourceAgainstGitHubWhenAsked() async throws {
        guard let repository = ProcessInfo.processInfo.environment["PEA_LIVE_UPDATE_REPOSITORY"] else {
            throw XCTSkip("Set PEA_LIVE_UPDATE_REPOSITORY to run this against GitHub.")
        }
        let standing = await Updates.check(repository: repository, version: "0.0.1", channel: "development", source: GitHubReleases())
        XCTAssertEqual(standing.level, .update, standing.text)
        XCTAssertEqual(standing.page?.host, "github.com")
        let missing = await Updates.check(repository: repository + "-no-such-repository-pea", version: "0.0.1", channel: "development", source: GitHubReleases())
        XCTAssertEqual(missing.level, .failed)
    }
}
