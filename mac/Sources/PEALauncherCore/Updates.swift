import Foundation
import PEAGatewayCore

/// What the owner is told after a check for a newer release. Nothing is ever downloaded or installed here.
public struct UpdateStanding: Equatable {
    public enum Level: Equatable { case info, update, warning, failed }
    public let level: Level
    public let text: String
    /// The release page to open in the browser, when there is one worth reading.
    public let page: URL?
}

/// Where release information comes from. The real one asks GitHub; tests use a stand-in.
public protocol ReleaseSource {
    /// The status code and body of one GET. Throws if the address is not allowed or nothing came back.
    func get(_ url: URL) async throws -> (status: Int, body: Data)
}

public enum Updates {
    struct Version { let numbers: [Int]; let pre: [String] }

    private static let shape = try! NSRegularExpression(
        pattern: #"\A(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?\z"#)
    private static let tag = try! NSRegularExpression(pattern: #"\Av[0-9A-Za-z.+-]{1,80}\z"#)
    private static let repository = try! NSRegularExpression(pattern: #"\A[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}\z"#)

    private static func whole(_ expression: NSRegularExpression, _ text: String) -> NSTextCheckingResult? {
        let range = NSRange(text.startIndex..., in: text)
        guard let match = expression.firstMatch(in: text, range: range), match.range == range else { return nil }
        return match
    }

    /// A version written the usual way, with or without a leading `v`. The same rules as the web app.
    static func parts(_ value: String) -> Version? {
        guard value.unicodeScalars.count <= 80 else { return nil }
        let text = value.hasPrefix("v") ? String(value.dropFirst()) : value
        guard let match = whole(shape, text) else { return nil }
        func group(_ index: Int) -> String? { Range(match.range(at: index), in: text).map { String(text[$0]) } }
        var numbers = [Int]()
        for index in 1...3 {
            guard let digits = group(index), digits.count <= 15, let number = Int(digits) else { return nil }
            numbers.append(number)
        }
        let pre = group(4)?.split(separator: ".").map(String.init) ?? []
        // A numeric part of a pre-release may not be written with a leading zero.
        guard !pre.contains(where: { $0.allSatisfy(\.isASCIIDigit) && $0.count > 1 && $0.hasPrefix("0") }) else { return nil }
        return Version(numbers: numbers, pre: pre)
    }

    /// Whether `candidate` comes after `current`. False if either is not a version.
    public static func isNewer(_ candidate: String, than current: String) -> Bool {
        guard let a = parts(candidate), let b = parts(current) else { return false }
        for index in 0..<3 where a.numbers[index] != b.numbers[index] { return a.numbers[index] > b.numbers[index] }
        // A finished version comes after any pre-release of it.
        if a.pre.isEmpty || b.pre.isEmpty { return a.pre.isEmpty && !b.pre.isEmpty }
        for index in 0..<max(a.pre.count, b.pre.count) {
            guard index < a.pre.count else { return false }
            guard index < b.pre.count else { return true }
            let x = a.pre[index], y = b.pre[index]
            if x == y { continue }
            let xn = x.allSatisfy(\.isASCIIDigit), yn = y.allSatisfy(\.isASCIIDigit)
            if xn && yn {
                // Compared as numbers of any length: more digits is larger, then digit by digit.
                return x.count != y.count ? x.count > y.count : x > y
            }
            if xn != yn { return !xn }
            return Array(x.utf8).lexicographicallyPrecedes(Array(y.utf8)) == false
        }
        return false
    }

    /// The sentence for the owner, from this build's version and the latest published one.
    static func standing(installed: String, channel: String, latest: String, installedPublished: Bool?, page: URL) -> UpdateStanding {
        let shown = latest.hasPrefix("v") ? latest : "v" + latest
        if channel == "stable", installedPublished == false {
            return UpdateStanding(level: .warning, text: "Version \(installed) is no longer among the published releases, so it may have been withdrawn. The latest published version is \(shown). Read its notes before deciding whether to change versions. Nothing was changed.", page: page)
        }
        if isNewer(latest, than: installed) {
            return UpdateStanding(level: .update, text: "Version \(shown) is available; you have \(installed). Open the release page to read its notes and download it. Nothing has been downloaded or installed.", page: page)
        }
        if isNewer(installed, than: latest) {
            return channel == "stable"
                ? UpdateStanding(level: .warning, text: "This build (\(installed)) is newer than the latest published version (\(shown)). A version that is no longer the latest may have been withdrawn; check the releases page.", page: page)
                : UpdateStanding(level: .info, text: "This \(channel) build (\(installed)) is ahead of the latest published version (\(shown)), as expected. Nothing was changed.", page: nil)
        }
        return UpdateStanding(level: .info, text: "You have the latest published version, \(shown). Nothing was changed.", page: nil)
    }

    /// Asks the configured public repository for its latest published release and compares it with this build.
    /// Sends no token, no identifier and nothing about the owner. Any surprise in the answer is reported as a failure.
    public static func check(repository: String?, version: String, channel: String, source: ReleaseSource) async -> UpdateStanding {
        func failed(_ text: String) -> UpdateStanding { UpdateStanding(level: .failed, text: text, page: nil) }
        guard let repository, whole(Updates.repository, repository) != nil, !repository.contains("..") else {
            return failed("This build names no public place to look for releases.")
        }
        guard parts(version) != nil else { return failed("This build's own version could not be read.") }
        let unavailable = "The releases could not be checked. GitHub may be busy, this Mac may be offline, or nothing has been published yet. Nothing was changed."
        guard let answer = try? await source.get(URL(string: "https://api.github.com/repos/\(repository)/releases/latest")!), answer.status == 200 else {
            return failed(unavailable)
        }
        guard case .object(let row)? = try? JSON.parse(answer.body), row["draft"] == .bool(false), row["prerelease"] == .bool(false),
              let name = row["tag_name"]?.string, whole(tag, name) != nil, parts(name) != nil else {
            return failed("No published release that this build can compare itself with was found. Nothing was changed.")
        }
        // The page must be the one this repository's release would have, so the answer cannot send the owner elsewhere.
        let expected = "https://github.com/\(repository)/releases/tag/\(name)"
        guard row["html_url"]?.string == expected, let page = URL(string: expected) else {
            return failed("The release answer pointed somewhere unexpected, so it was ignored. Nothing was changed.")
        }
        // A stable build also checks that its own version is still published. A missing one may have been withdrawn.
        var published: Bool?
        if channel == "stable", let own = try? await source.get(URL(string: "https://api.github.com/repos/\(repository)/releases/tags/v\(version)")!) {
            published = own.status == 200 ? true : own.status == 404 ? false : nil
        }
        return standing(installed: version, channel: channel, latest: name, installedPublished: published, page: page)
    }
}

private extension Character {
    var isASCIIDigit: Bool { ("0"..."9").contains(self) }
}

/// Asks GitHub's public API, and nothing else: no cookies, no saved credentials, no cache, no redirects,
/// no system proxy settings changed, and a fixed product name in place of anything identifying this Mac.
public final class GitHubReleases: NSObject, ReleaseSource, URLSessionTaskDelegate {
    public static let limit = 500_000

    public func get(_ url: URL) async throws -> (status: Int, body: Data) {
        guard url.scheme == "https", url.host == "api.github.com", url.port == nil, url.user == nil, url.query == nil, url.fragment == nil,
              url.path.hasPrefix("/repos/") else { throw GatewayError("Only GitHub's release information may be asked for.") }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 20
        configuration.httpAdditionalHeaders = ["Accept": "application/vnd.github+json", "User-Agent": "PEA"]
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(from: url)
        guard let http = response as? HTTPURLResponse else { throw GatewayError("No answer.") }
        guard http.statusCode == 200 else { return (http.statusCode, Data()) }
        var body = Data()
        for try await byte in bytes {
            body.append(byte)
            guard body.count <= GitHubReleases.limit else { throw GatewayError("The release answer is too large.") }
        }
        return (200, body)
    }

    /// A redirect is never followed: the answer comes from the address asked, or not at all.
    public func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                           newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
