# PEA for Mac (in progress)

This folder holds the Mac side of PEA Web: the same local gateway that `browser/server/gateway.py` provides, written in Swift so that a Mac user needs no Python and no Terminal. The finished app will be a small menu-bar and Dock launcher that runs this gateway and opens PEA in your normal browser. **Only the gateway and a command-line tool exist so far.** There is no app to download yet.

It is not the PEA iPhone app and shares no source with it.

## What is here

- `Sources/PEAGatewayCore`: the gateway. It listens on `127.0.0.1` only, serves the web files named in `browser/server/contract.json`, and passes text chat to a model server on the same Mac. It keeps no log of requests or conversations and cannot be pointed at another machine.
- `Sources/pea-gateway`: a command-line tool around the core, for development and tests.
- `Tests`: unit tests for the request reader, the chat rules, the model address rule, the token check and file reading.

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

The app itself, Keychain storage for the token, start at login, an app bundle, signing and notarization. Signing is the owner's step and is never done by automation here.
