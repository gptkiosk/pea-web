import XCTest
@testable import PEAGatewayCore

/// Unit tests for the parts of the gateway that decide what is let through. The behavior of the
/// running gateway as a whole is checked by browser/server/conformance/run.py, the same suite the
/// Python gateway passes.
final class RulesTests: XCTestCase {
    static let browser = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("browser")
    static let contract = try! Contract(data: try! Data(contentsOf: browser.appendingPathComponent("server/contract.json")))
    var contract: Contract { RulesTests.contract }

    func parse(_ text: String) throws -> JSONValue { try JSON.parse(Data(text.utf8)) }

    // MARK: JSON

    func testJSONKeepsTheDifferencesTheRulesDependOn() throws {
        XCTAssertEqual(try parse("12").integer, 12)
        XCTAssertNil(try parse("12.0").integer)
        XCTAssertNil(try parse("1e1").integer)
        XCTAssertNil(try parse("true").integer)
        XCTAssertNil(try parse("\"12\"").integer)
        XCTAssertEqual(try parse("0.25").double, 0.25)
        XCTAssertNil(try parse("1e999").double, "a number too large to hold is not a usable number")
        XCTAssertNil(try parse("99999999999999999999999").integer)
        XCTAssertEqual(try parse(" {\"a\" : [1, {\"b\": null}], \"c\":\"x\"} "),
                       .object(JSONObject([("a", .array([.number("1"), .object(JSONObject([("b", .null)]))])), ("c", .string("x"))])))
    }

    func testJSONRefusesWhatItCannotReadExactly() {
        let bad = ["", " ", "{", "[1,]", "{\"a\":1,}", "{\"a\":1,\"a\":2}", "{a:1}", "'x'", "01", "1.", ".5", "+1", "-", "1e", "NaN", "Infinity", "-Infinity",
                   "tru", "nul", "[1] x", "[1][2]", "\"\\ud83d\"", "\"\\udc00\"", "\"\\ud83d\\u0041\"", "\"\\x41\"", "\"a\nb\"", "\"unterminated", "\u{FEFF}{}",
                   String(repeating: "[", count: 40) + String(repeating: "]", count: 40), String(repeating: "9", count: 500)]
        for text in bad { XCTAssertThrowsError(try parse(text), text) }
        XCTAssertThrowsError(try JSON.parse(Data([0x22, 0xFF, 0x22])), "bytes that are not UTF-8")
        XCTAssertThrowsError(try JSON.parse(Data([0x22, 0xC0, 0xAF, 0x22])), "an overlong encoding")
        XCTAssertThrowsError(try JSON.parse("{}".data(using: .utf16)!), "UTF-16")
        XCTAssertNoThrow(try parse(String(repeating: "[", count: 30) + String(repeating: "]", count: 30)))
    }

    func testTextSurvivesReadingAndWriting() throws {
        let text = "Café 🌱 \"quoted\" \\ back\nline\ttab \u{0} \u{7F} \u{2028} end"
        let written = JSON.serialize(.string(text))
        XCTAssertEqual(try JSON.parse(written), .string(text))
        XCTAssertEqual(try JSONSerialization.jsonObject(with: written, options: .fragmentsAllowed) as? String, text, "another reader sees the same text")
        XCTAssertEqual(try parse("\"\\ud83c\\udf31 \\u00e9 \\/ \\b\\f\"").string, "🌱 é / \u{8}\u{C}")
        XCTAssertEqual(String(decoding: JSON.serialize(try parse("{\"b\":1.50,\"a\":[true,null]}")), as: UTF8.self), "{\"b\":1.50,\"a\":[true,null]}")
    }

    // MARK: Chat

    func chat(_ changes: String = "", messages: String = "[{\"role\":\"user\",\"content\":\"Hello\"}]") -> String {
        "{\"model\":\"tiny:test\",\"stream\":true,\"messages\":\(messages)\(changes)}"
    }

    func testAValidChatGainsOnlyTheDefaults() throws {
        let body = try contract.validateChat(try parse(chat()))
        XCTAssertEqual(body.keys, ["model", "stream", "messages", "max_tokens", "temperature"])
        XCTAssertEqual(body["max_tokens"], .number(String(contract.defaultMaxTokens)))
        XCTAssertEqual(body["temperature"]?.double, 0.7)
        let chosen = try contract.validateChat(try parse(chat(",\"max_tokens\":\(contract.maxTokens),\"temperature\":2")))
        XCTAssertEqual(chosen["max_tokens"]?.integer, contract.maxTokens)
        XCTAssertEqual(chosen["temperature"], .number("2"))
        XCTAssertNoThrow(try contract.validateChat(try parse(chat(",\"temperature\":0"))))
        XCTAssertNoThrow(try contract.validateChat(try parse(chat(messages: "[{\"content\":\"\",\"role\":\"system\"},{\"role\":\"assistant\",\"content\":\"x\"}]"))))
    }

    func testEveryOtherChatIsRefused() throws {
        let long = String(repeating: "x", count: contract.messageCharacters + 1)
        let many = "[" + Array(repeating: "{\"role\":\"user\",\"content\":\"x\"}", count: contract.messages + 1).joined(separator: ",") + "]"
        let bad = [
            "[]", "\"text\"", "null", "{}",
            chat(",\"tools\":[]"), chat(",\"provider\":{}"), chat(",\"stop\":\"x\""),
            "{\"model\":\"tiny:test\",\"stream\":false,\"messages\":[{\"role\":\"user\",\"content\":\"x\"}]}",
            "{\"model\":\"tiny:test\",\"stream\":1,\"messages\":[{\"role\":\"user\",\"content\":\"x\"}]}",
            "{\"model\":\"tiny:test\",\"messages\":[{\"role\":\"user\",\"content\":\"x\"}]}",
            "{\"model\":\"bad model\",\"stream\":true,\"messages\":[{\"role\":\"user\",\"content\":\"x\"}]}",
            "{\"model\":\"tiny:test\\n\",\"stream\":true,\"messages\":[{\"role\":\"user\",\"content\":\"x\"}]}",
            "{\"model\":7,\"stream\":true,\"messages\":[{\"role\":\"user\",\"content\":\"x\"}]}",
            "{\"stream\":true,\"messages\":[{\"role\":\"user\",\"content\":\"x\"}]}",
            chat(messages: "[]"), chat(messages: "\"x\""), chat(messages: "{}"), chat(messages: many),
            chat(messages: "[\"x\"]"), chat(messages: "[{\"role\":\"tool\",\"content\":\"x\"}]"), chat(messages: "[{\"role\":\"user\"}]"),
            chat(messages: "[{\"role\":\"user\",\"content\":[\"x\"]}]"), chat(messages: "[{\"role\":\"user\",\"content\":\"x\",\"name\":\"y\"}]"),
            chat(messages: "[{\"role\":\"user\",\"content\":null}]"), chat(messages: "[{\"role\":\"user\",\"content\":\"\(long)\"}]"),
            chat(",\"max_tokens\":0"), chat(",\"max_tokens\":-1"), chat(",\"max_tokens\":\(contract.maxTokens + 1)"), chat(",\"max_tokens\":1.5"),
            chat(",\"max_tokens\":10.0"), chat(",\"max_tokens\":1e1"), chat(",\"max_tokens\":\"10\""), chat(",\"max_tokens\":true"), chat(",\"max_tokens\":null"),
            chat(",\"temperature\":-0.1"), chat(",\"temperature\":2.1"), chat(",\"temperature\":\"hot\""), chat(",\"temperature\":true"),
            chat(",\"temperature\":null"), chat(",\"temperature\":1e999"),
        ]
        for text in bad { XCTAssertThrowsError(try contract.validateChat(try parse(text)), String(text.prefix(120))) }
        // The character limit counts the whole conversation, in characters and not bytes.
        let half = String(repeating: "é", count: contract.messageCharacters / 2)
        XCTAssertNoThrow(try contract.validateChat(try parse(chat(messages: "[{\"role\":\"user\",\"content\":\"\(half)\"},{\"role\":\"user\",\"content\":\"\(half)\"}]"))))
        XCTAssertThrowsError(try contract.validateChat(try parse(chat(messages: "[{\"role\":\"user\",\"content\":\"\(half)\"},{\"role\":\"user\",\"content\":\"\(half)x\"}]"))))
    }

    // MARK: Reminders

    func testAValidReminderListIsReadExactly() throws {
        let list = try contract.validateReminders(parse(#"{"reminders":[{"id":"a-1","title":"Call Zoë 📞","due":1900000000000},{"due":1,"title":"x","id":"B2"}]}"#))
        XCTAssertEqual(list, [Reminder(id: "a-1", title: "Call Zoë 📞", due: Date(timeIntervalSince1970: 1_900_000_000)),
                              Reminder(id: "B2", title: "x", due: Date(timeIntervalSince1970: 0.001))])
        XCTAssertEqual(try contract.validateReminders(parse(#"{"reminders":[]}"#)), [])
        let full = (0..<contract.reminderItems).map { #"{"id":"n\#($0)","title":"t","due":5}"# }.joined(separator: ",")
        XCTAssertEqual(try contract.validateReminders(parse("{\"reminders\":[\(full)]}")).count, contract.reminderItems)
    }

    func testEveryOtherReminderListIsRefused() throws {
        let good = #"{"id":"a","title":"x","due":1900000000000}"#
        let long = String(repeating: "x", count: contract.reminderTitleCharacters + 1)
        let many = (0...contract.reminderItems).map { #"{"id":"n\#($0)","title":"t","due":5}"# }.joined(separator: ",")
        for bad in [
            "{}", "[]", "\"x\"", "null", #"{"reminders":{}}"#, "{\"reminders\":[\(good)],\"profile\":\"work\"}", "{\"items\":[\(good)]}",
            "{\"reminders\":[\(many)]}", "{\"reminders\":[\(good),\(good)]}", #"{"reminders":["x"]}"#,
            #"{"reminders":[{"id":"a","title":"x"}]}"#, #"{"reminders":[{"id":"a","title":"x","due":5,"profile":"work"}]}"#,
            #"{"reminders":[{"id":"","title":"x","due":5}]}"#, #"{"reminders":[{"id":"a b","title":"x","due":5}]}"#,
            #"{"reminders":[{"id":"../a","title":"x","due":5}]}"#, #"{"reminders":[{"id":7,"title":"x","due":5}]}"#,
            "{\"reminders\":[{\"id\":\"\(String(repeating: "a", count: 65))\",\"title\":\"x\",\"due\":5}]}",
            #"{"reminders":[{"id":"a","title":"","due":5}]}"#, "{\"reminders\":[{\"id\":\"a\",\"title\":\"\(long)\",\"due\":5}]}",
            #"{"reminders":[{"id":"a","title":"two\nlines","due":5}]}"#, #"{"reminders":[{"id":"a","title":"nul\u0000","due":5}]}"#,
            #"{"reminders":[{"id":"a","title":"sep\u2028","due":5}]}"#, #"{"reminders":[{"id":"a","title":"c1\u0085","due":5}]}"#,
            #"{"reminders":[{"id":"a","title":["x"],"due":5}]}"#,
            #"{"reminders":[{"id":"a","title":"x","due":0}]}"#, #"{"reminders":[{"id":"a","title":"x","due":-5}]}"#,
            #"{"reminders":[{"id":"a","title":"x","due":1.5}]}"#, #"{"reminders":[{"id":"a","title":"x","due":5.0}]}"#,
            #"{"reminders":[{"id":"a","title":"x","due":"5"}]}"#, #"{"reminders":[{"id":"a","title":"x","due":true}]}"#,
            "{\"reminders\":[{\"id\":\"a\",\"title\":\"x\",\"due\":\(contract.reminderDueMax + 1)}]}",
        ] {
            XCTAssertThrowsError(try contract.validateReminders(parse(bad)), bad)
        }
    }

    // MARK: Speech

    func testASpeechRequestNamesAKnownProviderAndCannotSteerTheRequest() throws {
        let speech = contract.speech
        let key = String(repeating: "k", count: 32), voice = String(repeating: "a", count: 32)
        func body(_ changes: [String: String] = [:], drop: String? = nil) -> String {
            var fields = ["provider": "\"fish\"", "key": "\"\(key)\"", "voice": "\"\(voice)\"", "text": "\"Hello.\""]
            for (name, value) in changes { fields[name] = value }
            if let drop { fields[drop] = nil }
            return "{" + fields.map { "\"\($0.key)\":\($0.value)" }.sorted().joined(separator: ",") + "}"
        }
        XCTAssertEqual(try speech.validate(parse(body()), listing: false), SpeechRules.Request(provider: "fish", key: key, voice: voice, text: "Hello."))
        XCTAssertEqual(try speech.validate(parse("{\"provider\":\"elevenlabs\",\"key\":\"\(key)\"}"), listing: true).voice, "")
        let longest = String(repeating: "🌱", count: speech.textCharacters)
        XCTAssertNoThrow(try speech.validate(parse(body(["text": "\"\(longest)\""])), listing: false), "the limit counts characters")
        for bad in [body(["voice": "\"../x\""]), body(["voice": "\"a/b12345678\""]), body(["key": "\"\(key)\\r\\nX: 1\""]), body(["key": "\"short\""]),
                    body(["provider": "\"api.fish.audio\""]), body(["provider": "7"]), body(["text": "\" \""]), body(["text": "\"bell \\u0007\""]),
                    body(["text": "\"\(longest)x\""]), body(["text": "7"]), body(["extra": "1"]), body(drop: "voice"), "[]", "\"x\""] {
            XCTAssertThrowsError(try speech.validate(parse(bad), listing: false), String(bad.prefix(70)))
        }
        XCTAssertThrowsError(try speech.validate(parse(body()), listing: true), "listing takes only a provider and a key")
    }

    func testTheRequestToAProviderIsBuiltOnlyFromTheRules() throws {
        let speech = contract.speech
        let ask = SpeechRules.Request(provider: "elevenlabs", key: String(repeating: "k", count: 32), voice: "voiceAAAA1111", text: "Hello.")
        let out = try XCTUnwrap(speech.outbound(ask, listing: false, testPort: nil))
        XCTAssertEqual(out.url?.absoluteString, "https://api.elevenlabs.io/v1/text-to-speech/voiceAAAA1111?output_format=mp3_44100_128")
        XCTAssertEqual(out.httpMethod, "POST")
        XCTAssertEqual(out.value(forHTTPHeaderField: "xi-api-key"), ask.key)
        XCTAssertNil(out.value(forHTTPHeaderField: "Authorization"))
        XCTAssertEqual(try parse(String(decoding: try XCTUnwrap(out.httpBody), as: UTF8.self)),
                       .object(JSONObject([("text", .string("Hello.")), ("model_id", .string("eleven_flash_v2_5")), ("apply_text_normalization", .string("on"))])))
        let fish = SpeechRules.Request(provider: "fish", key: ask.key, voice: String(repeating: "a", count: 32), text: "")
        let list = try XCTUnwrap(speech.outbound(fish, listing: true, testPort: nil))
        XCTAssertEqual(list.url?.absoluteString, "https://api.fish.audio/model?self=true&page_size=100")
        XCTAssertEqual(list.httpMethod, "GET")
        XCTAssertEqual(list.value(forHTTPHeaderField: "Authorization"), "Bearer " + ask.key)
        XCTAssertNil(list.httpBody)
        XCTAssertEqual(try XCTUnwrap(speech.outbound(fish, listing: true, testPort: 4567)).url?.host, "127.0.0.1", "a stand-in is used only when a test names its port")
        XCTAssertNil(speech.outbound(SpeechRules.Request(provider: "other", key: ask.key, voice: "", text: ""), listing: true, testPort: nil))
    }

    func testVoicesAreReducedToIdsAndNames() throws {
        let speech = contract.speech
        let answer = "{\"items\":[{\"_id\":\"\(String(repeating: "a", count: 32))\",\"title\":\" Bo\\n \",\"type\":\"tts\",\"author\":{\"x\":1}},{\"_id\":\"\(String(repeating: "b", count: 32))\",\"title\":\"Song\",\"type\":\"svc\"},{\"_id\":\"../x\",\"title\":\"No\"},7]}"
        XCTAssertEqual(speech.voicesIn(provider: "fish", data: Data(answer.utf8)),
                       JSONObject([("voices", .array([.object(JSONObject([("id", .string(String(repeating: "a", count: 32))), ("name", .string("Bo"))]))]))]))
        for junk in ["not json", "{\"voices\":[]}", "{\"items\":{}}", "[]"] {
            XCTAssertNil(speech.voicesIn(provider: "fish", data: Data(junk.utf8)), junk)
        }
        XCTAssertEqual(SpeechRules.reason(status: 401), "key")
        XCTAssertEqual(SpeechRules.reason(status: 402), "credit")
        XCTAssertEqual(SpeechRules.reason(status: 429), "busy")
        XCTAssertEqual(SpeechRules.reason(status: 422), "voice")
        XCTAssertEqual(SpeechRules.reason(status: 500), "failed")
        XCTAssertEqual(Set(["key", "credit", "busy", "voice", "failed"]), Set(SpeechRules.refusals.keys))
    }

    // MARK: Page reader

    func testOnlyANamedPublicHTTPSAddressCanBeRead() throws {
        let reader = contract.reader
        for (url, host, path) in [("https://example.org/", "example.org", "/"), ("https://Example.ORG", "example.org", "/"),
                                  ("https://a.b.co:443/x?y=1", "a.b.co", "/x?y=1"), ("https://xn--bcher-kva.de/a", "xn--bcher-kva.de", "/a"),
                                  ("https://a.io?q=1", "a.io", "/?q=1")] {
            let target = try reader.target(url)
            XCTAssertEqual(target.host, host, url)
            XCTAssertEqual(target.path, path, url)
        }
        for bad in ["http://example.org/", "HTTPS://a.org/", "https://example.org:8443/", "https://user@example.org/", "https://127.0.0.1/",
                    "https://2130706433/", "https://0x7f.1/", "https://[::1]/", "https://localhost/", "https://printer.local/", "https://a.internal/",
                    "https://example.org/#f", "https://example.org/a b", "https://example.org\\@evil.org/", "https://-a.org/", "https://a..org/",
                    "https://a.org./", "https://a.b.c.1/", "https://site.example/", "https://a.org:443:443/", "https://a.org:/", "https://a.org/é",
                    "https://", "", "https://a.org/" + String(repeating: "x", count: 2000)] {
            XCTAssertThrowsError(try reader.target(bad), bad)
        }
        XCTAssertEqual(try reader.target("https://site.example/x", allowed: ["site.example"]).host, "site.example", "a test stand-in is allowed only by name")
    }

    func testPrivateAndLocalAddressesAreRefused() {
        let reader = contract.reader
        for inside in ["127.0.0.1", "127.255.255.254", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
                       "0.0.0.0", "255.255.255.255", "224.0.0.1", "198.18.0.1", "::1", "::", "fe80::1%en0", "fd00::1", "fc00::2", "::ffff:10.0.0.1",
                       "::ffff:8.8.8.8", "64:ff9b::7f00:1", "2002:7f00:1::1", "2001:db8::1", "ff02::1", "not an address", ""] {
            XCTAssertTrue(reader.refuses(address: inside), inside)
        }
        for outside in ["93.184.216.34", "8.8.8.8", "172.32.0.1", "172.15.255.255", "100.128.0.1", "198.20.0.1", "2606:2800:220:1:248:1893:25c8:1946", "2600::1"] {
            XCTAssertFalse(reader.refuses(address: outside), outside)
        }
    }

    func testAPageSentInPiecesIsPutBackTogetherOrRefused() throws {
        struct Large: Error {}
        func pieces(_ text: String, limit: Int = 100) throws -> String? {
            try PageRead.unchunk(Data(text.utf8), limit: limit, large: Large()).map { String(decoding: $0, as: UTF8.self) }
        }
        XCTAssertEqual(try pieces("5\r\nHello\r\n1;x=y\r\n,\r\nA\r\n world 012\r\n0\r\n\r\n"), "Hello, world 012")
        XCTAssertEqual(try pieces("0\r\n\r\n"), "")
        XCTAssertNil(try pieces("5\r\nHel"), "not finished yet")
        XCTAssertNil(try pieces("5\r\nHello\r\n"), "the last piece has not come")
        XCTAssertNil(try pieces("5"), "a size that is still arriving")
        for broken in ["zz\r\nHello\r\n0\r\n\r\n", "-5\r\nHello\r\n", "5\r\nHelloXX0\r\n\r\n", "\r\nHello\r\n", "123456789\r\nx\r\n"] {
            XCTAssertThrowsError(try pieces(broken), broken)
        }
        XCTAssertThrowsError(try pieces("5\r\nHello\r\n5\r\nagain\r\n0\r\n\r\n", limit: 9)) { XCTAssertTrue($0 is Large) }
    }

    func testModelNamesAndTokensFollowTheSharedPatterns() {
        for name in ["tiny:test", "second/model@v1", "a", String(repeating: "x", count: 100), "org/model-1.5+q4"] { XCTAssertTrue(contract.isModelID(name), name) }
        for name in ["", "bad model", String(repeating: "x", count: 101), "tiny\n", "tiny\u{0}", "модель", "a?b", "a#b", "a%20b"] { XCTAssertFalse(contract.isModelID(name), name) }
        XCTAssertTrue(contract.isToken(String(repeating: "aB3_-", count: 8)))
        for token in ["", String(repeating: "a", count: 31), String(repeating: "a", count: 129), String(repeating: "a", count: 40) + "\n", String(repeating: "a", count: 40) + " ", String(repeating: "a", count: 40) + "="] {
            XCTAssertFalse(contract.isToken(token))
        }
    }

    // MARK: Where the model server may be

    func testOnlyAnAddressOnThisMacIsAccepted() throws {
        XCTAssertEqual(try Upstream("http://127.0.0.1:11434"), try Upstream("http://localhost:11434/v1/"))
        XCTAssertEqual(try Upstream("http://127.0.0.1").port, 80)
        XCTAssertEqual(try Upstream("http://127.8.9.10:1/v1").host, "127.8.9.10")
        XCTAssertEqual(try Upstream("http://[::1]:8080/").url("models").absoluteString, "http://[::1]:8080/v1/models")
        XCTAssertEqual(try Upstream("http://localhost:11434").url("chat/completions").absoluteString, "http://127.0.0.1:11434/v1/chat/completions")
        let bad = ["", "127.0.0.1:11434", "https://127.0.0.1:11434", "HTTP://127.0.0.1:11434", "http://example.com", "http://192.168.1.10:11434", "http://10.0.0.1",
                   "http://0.0.0.0:11434", "http://169.254.169.254", "http://127.0.0.1.example.com", "http://127.0.0.1@example.com", "http://example.com@127.0.0.1",
                   "http://user:pass@127.0.0.1", "http://127.0.0.1:11434/other", "http://127.0.0.1:11434/v1/models", "http://127.0.0.1:11434/v1//", "http://127.0.0.1:11434?x=1",
                   "http://127.0.0.1:11434/#x", "http://127.0.0.1:0", "http://127.0.0.1:65536", "http://127.0.0.1:", "http://127.0.0.1:80:80", "http://127.0.0.1:+80",
                   "http://127.1", "http://127.0.0.01", "http://127.0.0.256", "http://0x7f.0.0.1", "http://2130706433", "http://127.0.0.1.", "http://[::1", "http://[::2]",
                   "http://[::ffff:127.0.0.1]", "http://[::1]x", "http://::1", "http://localhost.", "http://LOCALHOST", "http://127.0.0.1\\@example.com", "http://127.0.0.1 ",
                   " http://127.0.0.1", "http://127.0.0.1\n", "http://１２７.0.0.1", "http:///v1", "http://"]
        for text in bad { XCTAssertThrowsError(try Upstream(text), text) }
    }

    // MARK: The token

    func testOnlyTheExactBearerTokenIsAccepted() {
        let token = String(repeating: "aB3_-", count: 8)
        let check = TokenCheck(token: token)
        XCTAssertTrue(check.accepts("Bearer " + token))
        for header in [nil, "", token, "bearer " + token, "Bearer  " + token, "Bearer " + token + " ", "Bearer " + token.dropLast(), "Bearer " + token + "x",
                       "Bearer " + token.uppercased(), "Basic " + token, "Bearer Bearer " + token, "Bearer "] as [String?] {
            XCTAssertFalse(check.accepts(header), header ?? "nil")
        }
    }

    // MARK: Request heads

    func head(_ text: String) throws -> RequestHead? { try RequestHead.parse(Data(text.utf8))?.head }

    func testARequestHeadIsReadNarrowly() throws {
        XCTAssertNil(try head("GET / HTTP/1.1\r\nHost: x\r\n"), "incomplete until the blank line")
        let parsed = try RequestHead.parse(Data("POST /v1/chat/completions HTTP/1.1\r\nHost: 127.0.0.1:1\r\nCONTENT-length:  5 \r\nAccept: a\r\nAccept: b\r\n\r\nhello".utf8))!
        XCTAssertEqual(parsed.head.method, "POST")
        XCTAssertEqual(parsed.head.target, "/v1/chat/completions")
        XCTAssertEqual(parsed.head.headers, ["host": "127.0.0.1:1", "content-length": "5", "accept": "a, b"])
        XCTAssertEqual(parsed.bodyStart, "POST /v1/chat/completions HTTP/1.1\r\nHost: 127.0.0.1:1\r\nCONTENT-length:  5 \r\nAccept: a\r\nAccept: b\r\n\r\n".utf8.count)
        let bad = ["GET /\r\n\r\n", "GET  / HTTP/1.1\r\n\r\n", "GET / HTTP/2\r\n\r\n", "GET / HTTP/1.1 x\r\n\r\n", "G@T / HTTP/1.1\r\n\r\n", " GET / HTTP/1.1\r\n\r\n",
                   "GET / HTTP/1.1\r\nHost\r\n\r\n", "GET / HTTP/1.1\r\n: x\r\n\r\n", "GET / HTTP/1.1\r\nHost : x\r\n\r\n", "GET / HTTP/1.1\r\nHost: x\r\n folded\r\n\r\n",
                   "GET / HTTP/1.1\r\nHost: a\r\nHost: b\r\n\r\n", "GET / HTTP/1.1\r\nHost: a\r\nhost: a\r\n\r\n", "GET / HTTP/1.1\r\nContent-Length: 1\r\nContent-Length: 2\r\n\r\n",
                   "GET / HTTP/1.1\r\nAuthorization: a\r\nAuthorization: b\r\n\r\n", "GET / HTTP/1.1\r\nHost: a\nX: b\r\n\r\n", "GET /\u{0} HTTP/1.1\r\n\r\n"]
        for text in bad { XCTAssertThrowsError(try head(text), text.debugDescription) }
        XCTAssertThrowsError(try RequestHead.parse(Data([0x47, 0x45, 0x54, 0x20, 0x2F, 0xFF, 0x20, 0x48, 0x54, 0x54, 0x50, 0x2F, 0x31, 0x2E, 0x31, 13, 10, 13, 10])), "not UTF-8")
        XCTAssertThrowsError(try head("GET / HTTP/1.1\r\n" + String(repeating: "X-Pad: 1\r\n", count: 101) + "\r\n"), "too many headers")
        XCTAssertThrowsError(try head("GET / HTTP/1.1\r\nX: " + String(repeating: "x", count: RequestHead.maximumBytes))) { XCTAssertEqual($0 as? RequestHead.Failure, .tooLarge) }
        XCTAssertThrowsError(try head("GET / HTTP/1.1\r\nX: " + String(repeating: "x", count: RequestHead.maximumBytes) + "\r\n\r\n")) { XCTAssertEqual($0 as? RequestHead.Failure, .tooLarge) }
    }

    // MARK: Files and build identity

    func testFilesAreReadWithoutFollowingLinks() throws {
        let folder = FileManager.default.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent("pea-files-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: folder.appendingPathComponent("web/assets"), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: folder.appendingPathComponent("outside"), withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let root = folder.appendingPathComponent("web")
        try Data("inside".utf8).write(to: root.appendingPathComponent("app.mjs"))
        try Data("picture".utf8).write(to: root.appendingPathComponent("assets/mark.svg"))
        try Data("secret".utf8).write(to: folder.appendingPathComponent("outside/secret.txt"))
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("link.mjs"), withDestinationURL: folder.appendingPathComponent("outside/secret.txt"))
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("linked"), withDestinationURL: folder.appendingPathComponent("outside"))
        XCTAssertEqual(Files.read(root: root, name: "app.mjs"), Data("inside".utf8))
        XCTAssertEqual(Files.read(root: root, name: "assets/mark.svg"), Data("picture".utf8))
        for name in ["link.mjs", "linked/secret.txt", "../outside/secret.txt", "assets/../../outside/secret.txt", "assets", "missing.mjs", "", "/app.mjs/", "./app.mjs", "assets//mark.svg/.."] {
            XCTAssertNil(Files.read(root: root, name: name), name)
        }
        XCTAssertNil(Files.read(root: root, name: "app.mjs", limit: 3), "a file over the size limit is not read")
    }

    func testTheContractListsOnlyOrdinaryFileNamesAndIsComplete() throws {
        XCTAssertEqual(contract.assets.count, 56)
        XCTAssertTrue(contract.assets.contains("app.mjs"))
        XCTAssertEqual(contract.headers.map(\.name).first, "Cache-Control")
        XCTAssertTrue(contract.headers.contains { $0.name == "Content-Security-Policy" && $0.value.contains("default-src") })
        func changed(_ edit: (inout [String: Any]) -> Void) throws -> Data {
            var object = try JSONSerialization.jsonObject(with: Data(contentsOf: RulesTests.browser.appendingPathComponent("server/contract.json"))) as! [String: Any]
            edit(&object)
            return try JSONSerialization.data(withJSONObject: object)
        }
        XCTAssertNoThrow(try Contract(data: try changed { _ in }))
        XCTAssertThrowsError(try Contract(data: try changed { $0["version"] = 2 }), "an unknown version")
        XCTAssertThrowsError(try Contract(data: try changed { $0["assets"] = ["../secret"] }))
        XCTAssertThrowsError(try Contract(data: try changed { $0["assets"] = ["/etc/passwd"] }))
        XCTAssertThrowsError(try Contract(data: try changed { $0["assets"] = [".hidden"] }))
        XCTAssertThrowsError(try Contract(data: try changed { $0["headers"] = ["X-Test": "a\r\nSet-Cookie: b"] }), "a header cannot carry a line break")
        XCTAssertThrowsError(try Contract(data: try changed { var limits = $0["limits"] as! [String: Any]; limits.removeValue(forKey: "streamBytes"); $0["limits"] = limits }), "no built-in fallback")
        XCTAssertThrowsError(try Contract(data: try changed { var limits = $0["limits"] as! [String: Any]; limits["connections"] = 0; $0["limits"] = limits }))
        XCTAssertThrowsError(try Contract(data: Data("[]".utf8)))
    }

    func testBuildIdentityHoldsOnlyPublicFields() throws {
        let identity = try BuildIdentity.read(root: RulesTests.browser)
        XCTAssertEqual(identity.keys.prefix(6), ["schema", "version", "channel", "product", "organization", "repository"])
        XCTAssertEqual(Set(identity.keys), ["schema", "version", "channel", "product", "organization", "repository", "commit", "modified", "environment"])
        XCTAssertEqual(identity["product"], .string("PEA"))
        let folder = FileManager.default.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent("pea-identity-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        XCTAssertThrowsError(try BuildIdentity.read(root: folder), "no release file")
        try Data("{\"schema\":1,\"version\":\"1.2.3\",\"channel\":\"stable\",\"product\":\"PEA\",\"organization\":\"Example\"}".utf8).write(to: folder.appendingPathComponent("release.json"))
        XCTAssertEqual(try BuildIdentity.read(root: folder)["environment"], .string("source"))
        let commit = String(repeating: "a1", count: 20)
        try Data("{\"version\":\"1.2.3\",\"commit\":\"\(commit)\",\"modified\":false,\"environment\":\"release\"}".utf8).write(to: folder.appendingPathComponent("build-info.json"))
        let stamped = try BuildIdentity.read(root: folder)
        XCTAssertEqual(stamped["commit"], .string(commit))
        XCTAssertEqual(stamped["modified"], .bool(false))
        XCTAssertEqual(stamped["environment"], .string("release"))
        try Data("{\"version\":\"9.9.9\",\"commit\":\"\(commit)\",\"modified\":false,\"environment\":\"release\"}".utf8).write(to: folder.appendingPathComponent("build-info.json"))
        XCTAssertThrowsError(try BuildIdentity.read(root: folder), "a stamp for another version is refused")
        try Data("{\"schema\":1,\"version\":\"01.2\",\"channel\":\"stable\",\"product\":\"PEA\",\"organization\":\"Example\"}".utf8).write(to: folder.appendingPathComponent("release.json"))
        XCTAssertThrowsError(try BuildIdentity.read(root: folder))
    }
}
