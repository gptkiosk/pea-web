import Foundation
import Security

/// Where the connection token is kept. The app uses the Keychain; tests use memory.
public protocol TokenStore {
    func read() throws -> String?
    func save(_ token: String) throws
    func delete() throws
}

public struct TokenStoreError: Error, CustomStringConvertible, Equatable {
    public let status: Int32
    public var description: String {
        let detail = SecCopyErrorMessageString(status, nil) as String? ?? "error \(status)"
        return "The Keychain could not be used: \(detail)"
    }
}

/// The token as a generic password in the owner's login Keychain. It is never written to a file,
/// a preference, a log or an address, and it does not travel to other devices.
public struct KeychainTokenStore: TokenStore {
    public let service: String
    public let account: String

    public init(service: String, account: String = "connection-token") {
        self.service = service
        self.account = account
    }

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    public func read() throws -> String? {
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query.merging([kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]) { $1 } as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data, let token = String(data: data, encoding: .utf8) else { throw TokenStoreError(status: status) }
        return token
    }

    public func save(_ token: String) throws {
        let data = Data(token.utf8)
        var status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            let item = query.merging([
                kSecValueData as String: data,
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
                kSecAttrSynchronizable as String: false,
                kSecAttrLabel as String: "PEA connection token",
            ]) { $1 }
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw TokenStoreError(status: status) }
    }

    public func delete() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw TokenStoreError(status: status) }
    }
}

public final class MemoryTokenStore: TokenStore {
    public var token: String?
    public init(_ token: String? = nil) { self.token = token }
    public func read() throws -> String? { token }
    public func save(_ token: String) throws { self.token = token }
    public func delete() throws { token = nil }
}

public enum ConnectionToken {
    /// 32 bytes from the system's secure random source, as 43 URL-safe characters.
    public static func make() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else { throw TokenStoreError(status: status) }
        return Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
