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
- **Project Engine…** connects PEA to your own project engine (MCD or RCD), which is optional: PEA does not need it, and it adds an agent project and assignment engine to your assistant. If you want it, install and start the engine first. Paste the address of your MCD server, wherever it runs (on this Mac or in the cloud; PEA assumes no location or port), then choose the file holding the access the engine issued for PEA; the file must be readable only by you. The app keeps the file's path and never shows or stores its contents. PEA restarts at the same address, and Projects on Today is connected after you reload the page. **Disconnect** is in the same dialog.
- **Local Model Address…** is where your model server is, by default Ollama at `http://127.0.0.1:11434`. Only an address on this Mac is accepted.
- **Start at Login** asks macOS to open PEA when you log in.
- **Show Reminders as Notifications** lets PEA in your browser hand this Mac your reminders, so they appear as notifications even when the browser tab or this app is closed. See [Reminders](#reminders).
- **Check for Updates…** asks GitHub, once, for the latest published release of the repository this build names, and says whether it is newer. It can open the release page in your browser; it downloads and installs nothing, and the app never checks unless you choose this. The request carries no token and nothing about you beyond what any visit to GitHub reveals, your network address.
- **Quit PEA** stops the gateway.

If another program already uses port 18770, PEA says so and offers the next free port. Your browser treats each port as a separate site, so chats, memories and boards saved in the browser under one port are not visible under another. They are not deleted.

The build is unsigned and only opens on the Mac that built it. Signing and notarizing are the owner's steps: [SIGNING.md](SIGNING.md).

## Reminders

On its own, PEA in a browser can only remind you while its tab is open. With the Mac app it can hand reminders over ahead of time. Two switches must both be on, and both start off:

1. In the Mac app's menu, **Show Reminders as Notifications**. macOS then asks once whether PEA may show notifications.
2. In PEA in the browser, on Today under To-dos, **Also remind me through PEA for Mac**. It appears once the local model is connected with the connection token, and shows a review of what will be handed over before anything is.

What is handed over is the title and time of each open reminder still ahead, from the Personal and Work profiles alike, at most 64 at a time, and the whole list again whenever it changes. The app passes them to macOS, which shows each at its time. The app writes nothing to a file itself, but macOS keeps the waiting titles in plain form, outside the browser's encrypted storage, and may show them on the lock screen.

The Time management offer can be handed over the same way, by its own switch beside the offer on Today: one fixed line at the first hour you chose, for each of the next seven days, and nothing about your day. A page that is open and in view withdraws that day’s notification, since it shows the offer itself.

Turning either switch off withdraws the reminders still waiting. The page can only update the Mac while it is open and connected: a to-do checked off in a tab that has not reconnected since a reload is still on the Mac until it does.

The route is `/v1/reminders` on the gateway and needs the connection token like the model routes. Its rules are in `browser/server/contract.json`. The Python gateway and the command-line tool check a list in exactly the same way and answer that reminders are not available, so the offer never appears there.

Not checked yet: whether macOS allows notifications from the unsigned development build, and how a real notification looks. The automated tests use a stand-in for the notification service and never show one.

## What is here

- `Sources/PEAGatewayCore`: the gateway. It listens on `127.0.0.1` only, serves the web files named in `browser/server/contract.json`, and passes text chat to a model server on the same Mac. It keeps no log of requests or conversations and cannot be pointed at another machine.
- `Sources/PEAGatewayCore/Reader.swift`: the page reader behind `/v1/read`. It looks a name up once, refuses it if any address is private or local, connects to one of those checked addresses with the certificate verified against the name, and reports a redirect without following it.
- `Sources/PEAGatewayCore/Search.swift`: the search rules behind `/v1/search`. A request names one of the providers from the rules file, the owner's key and the search words; the one request it is sent, its host, path and options all come from the rules file. It shares the one provider slot with speech.
- `Sources/PEAGatewayCore/Speech.swift`: the speech rules behind `/v1/speak` and `/v1/voices`. A request names one of two providers from the rules file, and the one request sent to it is built only from those rules. The sending is in `Gateway.swift`, through the same session that never follows a redirect.
- `Sources/pea-gateway`: a command-line tool around the core, for development and tests.
- `Sources/PEALauncherCore`: what the app does apart from drawing: the Keychain token, remembered port and model address, starting and stopping the gateway, finding a free port, `Updates.swift`, which compares this build with the latest published release, and `Reminders.swift`, which decides whether reminders handed over by the page become notifications.
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

`pea-gateway` also takes `--speech-test-port PROVIDER=PORT`, for tests only: a stand-in for a voice or search provider on this Mac. It also takes `--reader-test-site NAME.example=PORT` and `--reader-test-resolve NAME.example=ADDRESS`, for tests only: stand-ins for public sites so the page reader can be tested without the internet. The app never sets them.

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
- A build for Intel Macs and the app sandbox.
- Updating itself. The update check only tells you and links to the release page; no release has been published yet, so today it answers that the releases could not be checked.
- Reminders as notifications are built but have not been seen working on a real Mac: see [Reminders](#reminders). Pressing a notification opens PEA in the browser, which has only been compiled, not seen. There are no recurring reminders.
- The window also appears when PEA is opened at login.
- The menus and dialogs are checked by hand, not by an automated test.
