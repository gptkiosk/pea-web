import Foundation

/// A small strict JSON reader and writer.
///
/// The gateway decides what reaches the owner's model from the exact shape of a request, so it needs
/// to tell `1` from `1.0` and `true` from `1`, refuse a repeated key, and stop at a fixed depth.
/// Foundation's reader hides those differences. Numbers keep their original text, so a value that is
/// passed on is passed on unchanged.
public indirect enum JSONValue: Equatable {
    case null
    case bool(Bool)
    case number(String)
    case string(String)
    case array([JSONValue])
    case object(JSONObject)

    /// The whole number this value holds, only if it was written as one (`12`, not `12.0` or `1e1`).
    public var integer: Int? {
        guard case .number(let text) = self, !text.contains(where: { $0 == "." || $0 == "e" || $0 == "E" }) else { return nil }
        return Int(text)
    }

    /// The numeric value, for either a whole or a fractional number. Never NaN or infinite.
    public var double: Double? {
        guard case .number(let text) = self, let value = Double(text), value.isFinite else { return nil }
        return value
    }

    public var string: String? {
        if case .string(let text) = self { return text }
        return nil
    }
}

/// An object that remembers the order its keys were written in.
public struct JSONObject: Equatable {
    public private(set) var keys: [String] = []
    public private(set) var values: [String: JSONValue] = [:]

    public init() {}

    public init(_ pairs: [(String, JSONValue)]) {
        for (key, value) in pairs { self[key] = value }
    }

    public subscript(key: String) -> JSONValue? {
        get { values[key] }
        set {
            if let newValue {
                if values[key] == nil { keys.append(key) }
                values[key] = newValue
            } else if values.removeValue(forKey: key) != nil {
                keys.removeAll { $0 == key }
            }
        }
    }
}

public struct JSONError: Error, Equatable {}

public enum JSON {
    /// Deepest nesting accepted. A chat request needs three levels.
    public static let maximumDepth = 32

    public static func parse(_ data: Data) throws -> JSONValue {
        var reader = Reader(bytes: [UInt8](data))
        reader.skipSpace()
        let value = try reader.value(depth: 0)
        reader.skipSpace()
        guard reader.at == reader.bytes.count else { throw JSONError() }
        return value
    }

    public static func serialize(_ value: JSONValue) -> Data {
        var out = [UInt8]()
        write(value, into: &out)
        return Data(out)
    }

    private static func write(_ value: JSONValue, into out: inout [UInt8]) {
        switch value {
        case .null: out += Array("null".utf8)
        case .bool(let flag): out += Array((flag ? "true" : "false").utf8)
        case .number(let text): out += Array(text.utf8)
        case .string(let text): write(text, into: &out)
        case .array(let items):
            out.append(UInt8(ascii: "["))
            for (index, item) in items.enumerated() {
                if index > 0 { out.append(UInt8(ascii: ",")) }
                write(item, into: &out)
            }
            out.append(UInt8(ascii: "]"))
        case .object(let object):
            out.append(UInt8(ascii: "{"))
            for (index, key) in object.keys.enumerated() {
                if index > 0 { out.append(UInt8(ascii: ",")) }
                write(key, into: &out)
                out.append(UInt8(ascii: ":"))
                write(object.values[key] ?? .null, into: &out)
            }
            out.append(UInt8(ascii: "}"))
        }
    }

    private static let hex = Array("0123456789abcdef".utf8)

    private static func write(_ text: String, into out: inout [UInt8]) {
        out.append(UInt8(ascii: "\""))
        for byte in text.utf8 {
            switch byte {
            case UInt8(ascii: "\""): out += [UInt8(ascii: "\\"), UInt8(ascii: "\"")]
            case UInt8(ascii: "\\"): out += [UInt8(ascii: "\\"), UInt8(ascii: "\\")]
            case 0x0A: out += [UInt8(ascii: "\\"), UInt8(ascii: "n")]
            case 0x0D: out += [UInt8(ascii: "\\"), UInt8(ascii: "r")]
            case 0x09: out += [UInt8(ascii: "\\"), UInt8(ascii: "t")]
            case 0..<0x20, 0x7F:
                out += [UInt8(ascii: "\\"), UInt8(ascii: "u"), UInt8(ascii: "0"), UInt8(ascii: "0"), hex[Int(byte >> 4)], hex[Int(byte & 15)]]
            default: out.append(byte)
            }
        }
        out.append(UInt8(ascii: "\""))
    }

    private struct Reader {
        let bytes: [UInt8]
        var at = 0

        var peek: UInt8? { at < bytes.count ? bytes[at] : nil }

        mutating func skipSpace() {
            while let byte = peek, byte == 0x20 || byte == 0x09 || byte == 0x0A || byte == 0x0D { at += 1 }
        }

        mutating func expect(_ word: String) throws {
            let wanted = Array(word.utf8)
            guard at + wanted.count <= bytes.count, Array(bytes[at..<at + wanted.count]) == wanted else { throw JSONError() }
            at += wanted.count
        }

        mutating func value(depth: Int) throws -> JSONValue {
            guard depth <= JSON.maximumDepth, let byte = peek else { throw JSONError() }
            switch byte {
            case UInt8(ascii: "{"): return try object(depth: depth)
            case UInt8(ascii: "["): return try array(depth: depth)
            case UInt8(ascii: "\""): return .string(try string())
            case UInt8(ascii: "t"): try expect("true"); return .bool(true)
            case UInt8(ascii: "f"): try expect("false"); return .bool(false)
            case UInt8(ascii: "n"): try expect("null"); return .null
            default: return .number(try number())
            }
        }

        mutating func object(depth: Int) throws -> JSONValue {
            at += 1
            var result = JSONObject()
            skipSpace()
            if peek == UInt8(ascii: "}") { at += 1; return .object(result) }
            while true {
                skipSpace()
                guard peek == UInt8(ascii: "\"") else { throw JSONError() }
                let key = try string()
                guard result[key] == nil else { throw JSONError() }  // a repeated key is refused
                skipSpace()
                guard peek == UInt8(ascii: ":") else { throw JSONError() }
                at += 1
                skipSpace()
                result[key] = try value(depth: depth + 1)
                skipSpace()
                guard let next = peek else { throw JSONError() }
                at += 1
                if next == UInt8(ascii: "}") { return .object(result) }
                guard next == UInt8(ascii: ",") else { throw JSONError() }
            }
        }

        mutating func array(depth: Int) throws -> JSONValue {
            at += 1
            var result = [JSONValue]()
            skipSpace()
            if peek == UInt8(ascii: "]") { at += 1; return .array(result) }
            while true {
                skipSpace()
                result.append(try value(depth: depth + 1))
                skipSpace()
                guard let next = peek else { throw JSONError() }
                at += 1
                if next == UInt8(ascii: "]") { return .array(result) }
                guard next == UInt8(ascii: ",") else { throw JSONError() }
            }
        }

        mutating func digits() throws {
            let start = at
            while let byte = peek, byte >= 0x30, byte <= 0x39 { at += 1 }
            guard at > start else { throw JSONError() }
        }

        mutating func number() throws -> String {
            let start = at
            if peek == UInt8(ascii: "-") { at += 1 }
            guard let first = peek else { throw JSONError() }
            if first == UInt8(ascii: "0") { at += 1 } else { try digits() }
            if peek == UInt8(ascii: ".") { at += 1; try digits() }
            if peek == UInt8(ascii: "e") || peek == UInt8(ascii: "E") {
                at += 1
                if peek == UInt8(ascii: "+") || peek == UInt8(ascii: "-") { at += 1 }
                try digits()
            }
            guard at - start <= 400 else { throw JSONError() }
            return String(decoding: bytes[start..<at], as: UTF8.self)
        }

        mutating func hexUnit() throws -> UInt32 {
            guard at + 4 <= bytes.count else { throw JSONError() }
            var unit: UInt32 = 0
            for byte in bytes[at..<at + 4] {
                let digit: UInt32
                switch byte {
                case 0x30...0x39: digit = UInt32(byte) - 0x30
                case 0x41...0x46: digit = UInt32(byte) - 0x41 + 10
                case 0x61...0x66: digit = UInt32(byte) - 0x61 + 10
                default: throw JSONError()
                }
                unit = unit << 4 | digit
            }
            at += 4
            return unit
        }

        mutating func string() throws -> String {
            at += 1
            var out = [UInt8]()
            while true {
                guard let byte = peek else { throw JSONError() }
                at += 1
                if byte == UInt8(ascii: "\"") { break }
                guard byte >= 0x20 else { throw JSONError() }  // raw control characters are not allowed
                guard byte == UInt8(ascii: "\\") else { out.append(byte); continue }
                guard let escape = peek else { throw JSONError() }
                at += 1
                switch escape {
                case UInt8(ascii: "\""), UInt8(ascii: "\\"), UInt8(ascii: "/"): out.append(escape)
                case UInt8(ascii: "b"): out.append(0x08)
                case UInt8(ascii: "f"): out.append(0x0C)
                case UInt8(ascii: "n"): out.append(0x0A)
                case UInt8(ascii: "r"): out.append(0x0D)
                case UInt8(ascii: "t"): out.append(0x09)
                case UInt8(ascii: "u"):
                    var scalar = try hexUnit()
                    if (0xD800..<0xDC00).contains(scalar) {
                        // The first half of a pair must be followed by the second half.
                        guard at + 2 <= bytes.count, bytes[at] == UInt8(ascii: "\\"), bytes[at + 1] == UInt8(ascii: "u") else { throw JSONError() }
                        at += 2
                        let low = try hexUnit()
                        guard (0xDC00..<0xE000).contains(low) else { throw JSONError() }
                        scalar = 0x10000 + ((scalar - 0xD800) << 10) + (low - 0xDC00)
                    }
                    guard let unicode = Unicode.Scalar(scalar) else { throw JSONError() }  // a lone half is refused
                    out += Array(String(Character(unicode)).utf8)
                default: throw JSONError()
                }
            }
            // Refuses bytes that are not valid UTF-8 instead of replacing them.
            guard let text = String(bytes: out, encoding: .utf8) else { throw JSONError() }
            return text
        }
    }
}
