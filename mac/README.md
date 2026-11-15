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
- **Show Reminders as Notifications** lets PEA in your browser hand this Mac your reminders, so they appear as notifications even when the browser tab or this app is closed. See [Reminders](#reminders).
- **Quit PEA** stops the gateway.

If another program already uses port 18770, PEA says so and offers the next free port. Your browser treats each port as a separate site, so chats, memories and boards saved in the browser under one port are not visible under another. They are not deleted.

The build is unsigned and only opens on the Mac that built it. Signing and notarizing are the owner's steps: [SIGNING.md](SIGNING.md).

## Reminders

On its own, PEA in a browser can only remind you while its tab is open. With the Mac app it can hand reminders over ahead of time. Two switches must both be on, and both start off:

1. In the Mac app's menu, **Show Reminders as Notifications**. macOS then asks once whether PEA may show notifications.
2. In PEA in the browser, on Today under To-dos, **Also remind me through PEA for Mac**. It appears once the local model is connected with the connection token, and shows a review of what will be handed over before anything is.

What is handed over is the title and time of each open reminder still ahead, from the Personal and Work profiles alike, at most 64 at a time, and the whole list again whenever it changes. The app passes them to macOS, which shows each at its time. The app writes nothing to a file itself, but macOS keeps the waiting titles in plain form, outside the browser's encrypted storage, and may show them on the lock screen.

Turning either switch off withdraws the reminders still waiting. The page can only update the Mac while it is open and connected: a to-do checked off in a tab that has not reconnected since a reload is still on the Mac until it does.

The route is `/v1/reminders` on the gateway and needs the connection token like the model routes. Its rules are in `browser/server/contract.json`. The Python gateway and the command-line tool check a list in exactly the same way and answer that reminders are not available, so the offer never appears there.

Not checked yet: whether macOS allows notifications from the unsigned development build, and how a real notification looks. The automated tests use a stand-in for the notification service and never show one.

## What is here

- `Sources/PEAGatewayCore`: the gateway. It listens on `127.0.0.1` only, serves the web files named in `browser/server/contract.json`, and passes text chat to a model server on the same Mac. It keeps no log of requests or conversations and cannot be pointed at another machine.
- `Sources/pea-gateway`: a command-line tool around the core, for development and tests.
- `Sources/PEALauncherCore`: what the app does apart from drawing: the Keychain token, remembered port and model address, starting and stopping the gateway, finding a free port, and `Reminders.swift`, which decides whether reminders handed over by the page become notifications.
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

`pea-gateway` also takes `--reminders-file PATH`, for tests only: accepted reminders are written to that file in place of being shown.

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
- Reminders as notifications are built but have not been seen working on a real Mac: see [Reminders](#reminders). A notification cannot yet be clicked to open PEA, and there are no recurring reminders.
- The window also appears when PEA is opened at login.
- The menus and dialogs are checked by hand, not by an automated test.
