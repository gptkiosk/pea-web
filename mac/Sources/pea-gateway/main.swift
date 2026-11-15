import Foundation
import PEAGatewayCore

// A command-line PEA gateway for development and tests. The Mac app uses the same core directly
// and keeps its token in the Keychain; this tool reads one from a private file like the Python gateway.
//
//   pea-gateway --root BROWSER_DIR --token-file PATH [--port 18770] [--upstream http://127.0.0.1:11434]
//
// For tests only, --reminders-file PATH stands in for the Mac's notifications: each accepted list of
// reminders is written to that file instead of being shown. Without it, reminders are not available.

/// Writes each list it is given to a private file, so a test can see what a real app would have shown.
final class FileReminders: ReminderSink {
    let path: String
    init(path: String) { self.path = path }
    var available: Bool { true }
    func replace(with reminders: [Reminder]) {
        let rows = reminders.map { reminder in
            JSONValue.object(JSONObject([("id", .string(reminder.id)), ("title", .string(reminder.title)),
                                         ("due", .number(String(Int((reminder.due.timeIntervalSince1970 * 1000).rounded()))))]))
        }
        let descriptor = open(path, O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW, 0o600)
        guard descriptor >= 0 else { return }
        FileHandle(fileDescriptor: descriptor, closeOnDealloc: true).write(JSON.serialize(.array(rows)))
    }
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(2)
}

var values = ["--port": "18770", "--upstream": "http://127.0.0.1:11434"]
var arguments = Array(CommandLine.arguments.dropFirst())
while !arguments.isEmpty {
    let name = arguments.removeFirst()
    guard ["--port", "--upstream", "--token-file", "--root", "--reminders-file"].contains(name), !arguments.isEmpty else {
        fail("Usage: pea-gateway --root BROWSER_DIR --token-file PATH [--port N] [--upstream http://127.0.0.1:PORT]")
    }
    values[name] = arguments.removeFirst()
}
guard let rootPath = values["--root"], let tokenFile = values["--token-file"] else { fail("Both --root and --token-file are required.") }
guard let port = UInt16(values["--port"]!), port >= 1 else { fail("Choose a valid port.") }

let root = URL(fileURLWithPath: rootPath, isDirectory: true)
do {
    guard let rules = FileManager.default.contents(atPath: root.appendingPathComponent("server/contract.json").path) else {
        fail("The web files were not found at that --root.")
    }
    let token = try readTokenFile((tokenFile as NSString).expandingTildeInPath, contract: try Contract(data: rules))
    let gateway = try Gateway(Gateway.Options(port: port, token: token, upstream: values["--upstream"]!, root: root,
                                              reminders: values["--reminders-file"].map { FileReminders(path: $0) }))
    gateway.start { error in
        if let error { fail("PEA could not start on port \(port): \(error.localizedDescription)") }
        print("PEA is running at http://127.0.0.1:\(port)/")
        fflush(stdout)
    }
    dispatchMain()
} catch {
    fail(String(describing: error))
}
