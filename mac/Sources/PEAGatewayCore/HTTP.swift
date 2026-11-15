import Foundation

/// One parsed request head. Parsing is deliberately narrow: anything unusual is refused, not guessed at.
struct RequestHead: Equatable {
    var method: String
    var target: String
    var headers: [String: String]  // names in lower case

    enum Failure: Error, Equatable { case malformed, tooLarge }

    static let maximumBytes = 65_536
    private static let once: Set<String> = ["host", "origin", "authorization", "content-length", "content-type", "transfer-encoding"]

    /// Returns nil until the blank line ending the head has arrived.
    static func parse(_ buffer: Data) throws -> (head: RequestHead, bodyStart: Int)? {
        guard let end = buffer.range(of: Data([13, 10, 13, 10])) else {
            if buffer.count > maximumBytes { throw Failure.tooLarge }
            return nil
        }
        let headBytes = buffer.subdata(in: buffer.startIndex..<end.lowerBound)
        guard headBytes.count <= maximumBytes else { throw Failure.tooLarge }
        guard let text = String(data: headBytes, encoding: .utf8), !text.unicodeScalars.contains(where: { $0.value == 0 }) else { throw Failure.malformed }
        var lines = text.components(separatedBy: "\r\n")
        let first = lines.removeFirst().split(separator: " ", omittingEmptySubsequences: false)
        guard first.count == 3, first[2] == "HTTP/1.1" || first[2] == "HTTP/1.0", !first[0].isEmpty, !first[1].isEmpty,
              first[0].allSatisfy({ $0.isASCII && $0.isLetter }), lines.count <= 100 else { throw Failure.malformed }
        var headers = [String: String]()
        for line in lines {
            guard let colon = line.firstIndex(of: ":"), let start = line.unicodeScalars.first, start != " ", start != "\t", !line.contains("\n"), !line.contains("\r") else {
                throw Failure.malformed
            }
            let name = line[..<colon].lowercased()
            guard !name.isEmpty, !name.contains(where: { $0 == " " || $0 == "\t" }) else { throw Failure.malformed }
            let value = line[line.index(after: colon)...].trimmingCharacters(in: CharacterSet(charactersIn: " \t"))
            if headers[name] != nil {
                // Two different values for a header that decides access is never acceptable.
                guard !once.contains(name) else { throw Failure.malformed }
                headers[name]! += ", " + value
            } else {
                headers[name] = value
            }
        }
        return (RequestHead(method: String(first[0]), target: String(first[1]), headers: headers), end.upperBound - buffer.startIndex)
    }
}

enum Response {
    private static let reasons = [200: "OK", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 409: "Conflict",
                                  429: "Too Many Requests", 431: "Request Header Fields Too Large", 501: "Not Implemented", 502: "Bad Gateway", 503: "Service Unavailable"]

    /// Answers are HTTP/1.0 and the connection closes after each one, as with the Python gateway.
    static func head(_ code: Int, headers: [(name: String, value: String)]) -> Data {
        var text = "HTTP/1.0 \(code) \(reasons[code] ?? "Error")\r\n"
        for (name, value) in headers { text += name + ": " + value + "\r\n" }
        return Data((text + "\r\n").utf8)
    }

    static func error(_ message: String) -> Data {
        JSON.serialize(.object(JSONObject([("error", .string(message))])))
    }
}
