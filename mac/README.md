# PEA for Mac (development build)

This folder holds the Mac side of PEA Web: the same local gateway that `browser/server/gateway.py` provides, written in Swift so that a Mac user needs no Python and no Terminal. The app is a small menu-bar and Dock launcher that runs this gateway and opens PEA in your normal browser. It has no web view of its own, because Google sign-in and voice input do not work inside one; every PEA feature therefore works exactly as it does on the web. **There is no signed download yet.** You can build an unsigned copy for your own Mac.

It is not the PEA iPhone app and shares no source with it.

## Build and use the app

```sh
mac/build.sh
open mac/build/PEA.app
```

- A leaf appears in the menu bar and PEA appears in the Dock, with a small window showing whether PEA is running.
- **Open PEA** opens `http://127.0.0.1:18770/` in your default browser.
- **Copy Connection Token** puts the token on the clipboard. In PEA, open Connections, choose Local model and paste it. The token is made on first launch and kept in your login Keychain. It is never written to a file or shown on screen.
- **Local Model Address…** is where your model server is, by default Ollama at `http://127.0.0.1:11434`. Only an address on this Mac is accepted.
- **Start at Login** asks macOS to open PEA when you log in.
- **Quit PEA** stops the gateway.

If another program already uses port 18770, PEA says so and offers the next free port. Your browser treats each port as a separate site, so chats, memories and boards saved in the browser under one port are not visible under another. They are not deleted.

The build is unsigned and only opens on the Mac that built it. Signing and notarizing are the owner's steps: [SIGNING.md](SIGNING.md).

## What is here

- `Sources/PEAGatewayCore`: the gateway. It listens on `127.0.0.1` only, serves the web files named in `browser/server/contract.json`, and passes text chat to a model server on the same Mac. It keeps no log of requests or conversations and cannot be pointed at another machine.
- `Sources/pea-gateway`: a command-line tool around the core, for development and tests.
- `Sources/PEALauncherCore`: what the app does apart from drawing: the Keychain token, remembered port and model address, starting and stopping the gateway, finding a free port.
- `Sources/PEAMac`: the SwiftUI menu, window and dialogs.
- `build.sh`: assembles the unsigned `PEA.app` with the web files, the rules file, a build stamp and an icon drawn from the pea icon.
- `Tests`: unit tests for the request reader, the chat rules, the model address rule, the token check and file reading, and launcher tests that start a real gateway on a spare port, stop it, restart it and handle a busy port.

No third-party packages are used.

## One set of rules, one set of tests

Two gateways could drift apart. Three things prevent it:

1. Neither gateway holds its own copy of a limit, a header or the file list. Both read `browser/server/contract.json`.
2. `browser/server/conformance/run.py` tests a running gateway from the outside. Both gateways must pass it unchanged.
3. The browser-level tests run against this gateway as well as the Python one, so the whole app is driven end to end through each.

Where the two languages would read a request differently, both were made to refuse it: a repeated JSON key, `NaN`, text that is not UTF-8, half of a surrogate pair, a repeated `Host` or `Authorization` header, and an address starting with two slashes.

## Build and test

Needs a Mac with Xcode 15 or later, or the Swift 5.9 toolchain.

```sh
swift build --package-path mac
swift test --package-path mac
PEA_GATEWAY_COMMAND="[\"$PWD/mac/.build/debug/pea-gateway\"]" python3 browser/server/conformance/run.py
PEA_GATEWAY=swift node --test browser/tests/dom/*.test.mjs
```

To try it by hand with a token file made by `python3 browser/server/local.py setup`:

```sh
mac/.build/debug/pea-gateway --root browser --token-file "$HOME/.config/pea/connection-token" --port 18771
```

## Known differences from the Python gateway

- No `--public-origin` option. Reaching PEA from a phone through your own private proxy still needs the Python gateway.
- Build identity comes from `release.json` and, when packaged, a `build-info.json` stamp. It does not run Git and does not re-check an installed release manifest.
- A request head larger than 64 KB, or one that is not well formed, is refused with a JSON answer; Python answers those with its own plain error page.
- Answers carry no `Server` or `Date` header.

## Not done

- Signing, notarization and a disk image: owner's steps in [SIGNING.md](SIGNING.md), not yet rehearsed.
- A build for Intel Macs, the app sandbox, and checking for updates.
- Reminders still appear only while a PEA tab is open; the app does not yet show them as system notifications.
- The window also appears when PEA is opened at login.
- The menus and dialogs are checked by hand, not by an automated test.
