# PEA Web working handoff

## Current state — 2026-11-13

Read this section first. Everything described in the dated sections below is merged: application source on `main` is as merged in #17 (`c51ae44`), development identity `0.1.0-dev.17`, and there were no other open pull requests or working branches when this was written. The commit that added this section changed documentation only. Later sections are a dated record in the order they were written; where one says work was uncommitted, local only or awaiting a staged scan, that was true when written and is no longer.

What main contains beyond the first split: reviewed story, email, document and calendar proposals; the encrypted conversation library with backup and restore; the encrypted Today board with conflict protection, backup and story editing; the local quickstart helper; guided setup; the thirteen-question interview with profile transfer; voice screens for Chat and Greenhouse; owner tab-navigation commands; and the 2026-11-13 review fixes (3,500-token replies, 600,000-round key derivation with re-keying on unlock, per-file model review, framing refusal and gateway hardening).

Checks at `c51ae44`: `node --test browser/tests/*.test.mjs` (100 passed), `python3 -m unittest discover -s browser/server -p 'test_*.py'` (25 passed), `python3 tools/check_repository.py` (68 indexed files), `python3 browser/server/check_source.py` (55 files). CI on main passed for that commit.

Verified only by unit tests, not in a browser or on a device: the voice screens and dictation, device voice selection, board backup and restore through the interface, story editing, and the model-suggested navigation button. No real provider, account, microphone or physical phone has been used for any of this work.

Known gaps, in rough priority:

1. Device and real-account acceptance for the items above; see `browser/docs/OPERATOR-ACCEPTANCE.md`.
2. Calendar and mail snapshot contents reach the model under one approval per setting and are not re-reviewed when they refresh. Decide whether that should change.
3. Source formatting: the modules use very long lines, which makes review of security-sensitive code hard. A formatting-only change, with no behavior change, should land on its own.
4. DOM-level tests that every external write follows an accepted review; earlier review items L7 (release revocation and downgrade warning) and L8 (`appProperties` marker with migration).
5. Parity work in `browser/docs/PARITY.md`: reminders, phone and map links, richer documents, direct calendar changes, voice providers, and public research, which needs a server-side fetcher that validates resolved addresses.
6. Local packaging and update workflow, and a production release signer.

Storage note for anyone testing: a library or board unlocked by `0.1.0-dev.16` or later is re-keyed, and a library saved with the expanded interview uses schema 2. Earlier builds refuse both without changing them. Use synthetic data and a separate browser profile or origin when comparing builds.

Resume: branch from `main`, keep one bounded slice per pull request, stage named files, run the four checks above before every commit, and add a dated section here with exact source, tests and limits. Do not infer provider authority, private runtime state or deployment permission from this handoff; any operator-run preview is documented outside this repository.

## The Mac app, step 3 of 6: the Swift gateway — 2026-11-15

**Branch `mac/swift-gateway`, development identity `0.1.0-dev.32`.** Stacked on step 2.

- `mac/` is a Swift package with no third-party dependencies (tools version 5.9, macOS 13 or later). `PEAGatewayCore` is the gateway; `pea-gateway` is a command-line tool around it for tests and development; `mac/README.md` is the folder's guide.
  - `Gateway.swift`: a Network.framework listener bound to `127.0.0.1`, one serial queue for all state, one request per connection, connection and model-request limits, the request deadline and idle timer, model list, chat streaming with the size and time limits. Calls to the model server use one ephemeral `URLSession` with system proxies, cookies, credentials, caching and redirects all turned off.
  - `Rules.swift`: loads `contract.json` (no built-in fallback for any value), chat validation, the loopback-only model address, the token check on a SHA-256 digest in constant time, token-file checks, build identity, and file reads that open every path part with `O_NOFOLLOW`.
  - `JSON.swift`: a small strict JSON reader and writer. Foundation's reader cannot tell `1` from `1.0` or `true` from `1` reliably and accepts repeated keys, and the rules depend on those differences. Numbers keep their original text.
  - `HTTP.swift`: a narrow request-head reader (64 KB, 100 headers, no folded lines, deciding headers at most once).
- Results on this Mac (Swift 6.4): `swift test` 12 of 12; conformance 19 of 19 against Swift, Python 3.9 and Python 3.14; gateway, local and release tests 32 of 32.
- Writing the second gateway showed five places where the two languages would have read the same request differently. Each was closed by making both refuse it, with a conformance case: repeated JSON key, `NaN`/`Infinity`, UTF-16 or byte-order-marked bodies, half of a surrogate pair in message text, and a repeated deciding header. In Python these are `strict_json`, one `encode` in `validate_chat` and the first check in `Handler.boundary`. The conformance suite also now checks that message text with accents, emoji, quotes, a backslash and control characters reaches the model server unchanged.
- A defect found before merge, by measuring file serving with six tabs loading at once: the Swift gateway gave a connection's place back only when the system reported the close, so finished connections were still counted for a moment and about 1 request in 500 was refused at the 64-connection limit. Python refused none. `Client.close` now gives the place back at once, and the conformance suite has a six-tab test (20 tests in all) that fails on the old code and passes on both gateways.
- Repository rules: `tools/check_repository.py` also allows the files in `mac/MAC-FILES.json`, with the same scans. `AGENTS.md`, `README.md` and `CONTRIBUTING.md` say the repository holds PEA Web and its Mac launcher. CI has a second job, `mac`, on a macOS runner: build, Swift tests, conformance against `pea-gateway`. The `web` job is unchanged and needs no Mac. Branch protection still requires only `web`; the owner may want to require `mac` too.

Known differences from the Python gateway, also listed in `mac/README.md`: no `--public-origin`; build identity without Git or the installed-manifest re-check; malformed or oversized request heads get a JSON answer; no `Server` or `Date` header. Known gaps: the Swift source has had no independent review; the 45-second upstream timeout and 180-second stream limit are set but not exercised by a test; the browser-level suite has not yet been run against Swift.

Next action: step 4, a `PEA_GATEWAY=swift` switch in `browser/tests/dom/harness.mjs` so the 56 browser-level tests run against the Swift gateway in the `mac` job.

## The Mac app, step 2 of 6: gateway conformance suite — 2026-11-15

**Branch `mac/conformance-suite`, development identity `0.1.0-dev.31`.** Stacked on step 1.

- `browser/server/conformance/run.py`: 19 black-box tests. It writes a temporary token, starts a synthetic OpenAI-compatible server, launches the gateway as a child process and speaks plain HTTP and raw sockets to it. It imports nothing from `gateway.py` and takes every number from `contract.json`. By default it launches the Python gateway. `PEA_GATEWAY_COMMAND` (a JSON array) names another one, which is given `--port`, `--upstream`, `--token-file` and `--root` (the `browser/` folder). The Swift command-line gateway in step 3 must accept those four options.
- Covered: every listed file byte for byte under `/` and `/browser/`; nothing outside the list (server files, docs, tests, traversal, encoded dots, trailing slash, query, different case); the import graph from `app.mjs` is fully served; foreign host or origin gives 403 on every route and never reaches the model server; the token is accepted only as a bearer header (not in the address, a cookie or another scheme); model list filtering, the 100-model cap and no forwarded credentials; a valid chat forwards only the allowed fields with the defaults; 27 malformed bodies plus bad JSON, deep nesting, wrong content type, oversized length and chunked bodies all give 400 before the model server; an unlisted model gives 409; model server failures give 502 with none of its text; two model requests at once and then 429 while pages still load; the 2 MB reply cap; no other route, method or proxying; public build identity without private state; idle connections, a burst of 25, connections beyond the limit closed unanswered, and the 20-second trickle cut-off. A run takes about 25 seconds, most of it the deadline test.
- The suite found one difference between Python versions on its first run: newer versions of Python's HTTP server turn a doubled leading slash into one before the gateway sees the address, so `//app.mjs` was served on Python 3.14 and refused on 3.9. `Handler.boundary` now refuses such a request from the original request line with 404, after the host check and before the token check. The rule for both gateways: the address is used exactly as sent, with no normalizing.
- Passing locally on Python 3.9 and 3.14. `test_gateway.py` stays: it tests Python internals the black-box suite cannot see.

Known gaps: the suite does not test the 45-second upstream timeout or the 180-second stream limit (too slow for every run), nor reachability from another machine (it needs a second address). Those stay in the owner acceptance checklist.

Next action: step 3, the Swift gateway core and `pea-gateway` command-line tool under `mac/`, passing this suite, with the repository rule changes for the `mac/` folder.

## 0.2 begins: the Mac app, step 1 of 6 — 2026-11-15

The owner chose the Mac app as the first piece of 0.2 and settled its shape: a menu-bar and Dock launcher that runs PEA's gateway and opens PEA in the owner's normal browser (no embedded web view, because Google sign-in and speech recognition do not work in one); the gateway rewritten in Swift inside the app so no Python is needed; the code in this repository under `mac/`; an unsigned development build first, with signing and notarization left to the owner. Six steps, one pull request each: (1) shared rules file, (2) black-box conformance suite against the Python gateway, (3) Swift gateway core and a command-line tool that passes the same suite, with a macOS CI job and the repository's web-only rules amended for `mac/`, (4) the browser suite against the Swift gateway, (5) the app itself, (6) a signing hand-off document.

The plan exists to control one risk: two gateways drifting apart. Hence one source for the rules, one black-box suite run against both, and the whole browser suite run against the Swift one.

Working method from the owner, 2026-11-15: design and security-sensitive code on the main model; test runs, repeated runs, CI watching and looking at the running app in Sonnet subagents that report compactly.

**Step 1, branch `mac/shared-gateway-rules`, development identity `0.1.0-dev.30`.** `browser/server/contract.json` (version 1) now holds the static file allowlist, the headers sent on every answer, the headers of a streamed answer, every limit, the allowed chat fields and roles. `gateway.py` reads it at import and keeps no copy of any value; a new test checks the two agree, pins the limits the review settled on, checks the headers on a live answer and that the file itself is not served. No behavior change: 32 gateway and release tests pass on Python 3.9 and 3.14, 174 unit, 56 browser.

A Sonnet test run exposed a harness weakness: one browser run hung for ten minutes. If starting the test stack stalled past a hook's time limit, the processes already started were never stopped and kept the run alive. `harness.mjs` now registers every process it starts, kills them when the run exits and never lets them hold it open; the gateway probe has a time limit; and starting the stack has its own 45-second limit that stops whatever was started.

## Stability pass — 2026-11-15

Branch `test/stability-pass`, development identity `0.1.0-dev.29`. No application code changed; the pass found no new defects.

`browser/tests/dom/stability.test.mjs` adds nine browser tests: (1) model errors of three kinds reported plainly, with one attempt each, no upstream text shown and the app usable afterwards; (2) a reply cut off mid-stream keeps what arrived, hides the half-received action block and offers nothing; (3) Stop ends a slow request and the stopped reply never arrives later; (4) leaving the page during a request starts clean; (5) thirty turns, with at most fourteen messages sent and early ones no longer sent; (6) 200 stories and 200 to-dos, with the 201st of each refused with a reason; (7) a file just under 4 MB attached, with only a bounded excerpt in the review and the request; (8) two tabs on one encrypted board, where the stale tab is stopped with a notice and its write never reaches storage; (9) an encrypted library with no readable text in IndexedDB, nothing shown while locked after reload, a wrong passphrase refused and the conversation back after unlocking. Every test also asserts the page threw no uncaught error and logged no console error.

Harness additions: the synthetic model can answer with an error status, drop the connection mid-reply or delay; pages record uncaught exceptions and console errors in `page.errors`; `newPage(beside)` opens a second tab sharing the first one's storage.

What the pass taught: the gateway reports every failure of the owner's model server with the same message, by design; a cut-off stream has its own message; opening a saved library asks for confirmation before replacing the tab's contents.

`browser/docs/OPERATOR-ACCEPTANCE.md` gains section 7, the checks only the owner can do for 0.1.0: Safari and Firefox, a real pointer drag, Reduce Motion, a phone, a real model for each action, a real Google Doc created, replaced and refused after a hand edit, the Drive confirmation step, encrypted to-dos, and the release manager. README now states the browser versions the interface relies on and that tests need Node 22.

Totals: 174 unit, 56 browser, 31 gateway and release.

What is left for 0.1.0 is not code: the owner's acceptance run, the production signing key (created by the owner, never by an agent), then setting the version to `0.1.0`, building, signing and publishing.

## Review items L7 and L8 — 2026-11-15

Branch `fix/release-standing-and-drive-marker`, development identity `0.1.0-dev.28`. These were the last two open items from the 2026-11-11 review.

**L7, withdrawn and older releases.** `browser/server/releases.py`: `version_key` orders versions by semantic-version precedence; `revoke` records a staged release in `revoked.json` under the install root with a reason; `activate` refuses a withdrawn release and refuses a version older than the one in use unless `allow_older` is set (`--allow-older`); `rollback` passes `allow_older` but still refuses a withdrawn previous version; `list` reports withdrawn releases. `browser/releases.mjs` gains `releaseStanding`, used by Check for updates in `release-ui.mjs`: a stable build also asks whether its own version tag is still published and warns if it is not, or if it is newer than the latest published stable version. Development builds are told they are ahead as expected.

**L8, the Drive mark.** Files PEA creates carried only `properties.peaCreated`, which any app with access can read or set. `connections.mjs` now also writes `appProperties.peaCreated`, private to this app's Google client, on every creation path, and exports `madeByPEA` (private mark) and `labelledPEA` (public label). Only the private mark unlocks the two privileged behaviors: `maybeAutoAttach` in `live-ui.mjs` and `replaceDocument`. The public label is kept because the iPhone app uses a different Google client, cannot see private marks, and recognizes files by the label. Migration: `Services.confirmCreated` sets the private mark on up to 25 labelled files after re-checking membership, version, name and label for every file before writing anything; the owner reaches it through a Confirm files PEA created button that appears only when such files exist and shows the list in a review. Unconfirmed files are labelled as such in the file list and are otherwise treated like files the owner added.

Tests: 4 release-manager tests (31 gateway and release); 1 unit test for the update messages and 2 for the Drive mark and confirmation, with the existing Drive tests updated (174 unit); 4 browser tests for the update check, with GitHub's answers supplied through a new `Page.route` in the harness, asserting the two questions asked, no credentials and no referrer (47 browser, three consecutive clean runs each as Mac and as Linux).

Limits: the Drive changes are covered by unit tests against a synthetic Drive only, because tests cannot sign in to Google; the confirm step and the changed labels need owner acceptance with a real account. Files created by the iPhone app will show as not confirmed on the web until the owner confirms them. The withdrawn-release list is local to the machine, not a signed notice from the publisher.

Next: the stability pass (soak tests, Safari and Firefox, owner acceptance) and the release, which needs the owner's production signing key.

## Contracts, shared fixtures and the parity matrix — 2026-11-15

Branch `docs/contracts-and-parity`, development identity `0.1.0-dev.27`. No application code changed.

`browser/docs/CONTRACTS.md` defines what the two apps share: how a model asks for an action, the fields and limits of `pea-task`, `pea-doc` and `pea-open`, the Web-only `pea-story`, copy boxes, the honesty rules, the assistant's name, and how to change a contract. `browser/tests/fixtures/ActionFixtures.json` (version 1) holds 29 synthetic vectors plus honesty examples and the limits; `browser/tests/contracts.test.mjs` checks every vector and the limits against this app's parsers, so the file cannot drift from the code. Vectors marked `web_only` are the deliberate browser differences. `PolicyFixtures.json` is untouched, so its recorded digest still holds.

`browser/docs/PARITY.md` now opens with one table of shared features with a status for each app, a Web-only table, the list of things neither app has, and the steps for keeping the two in step. The per-feature sections below it are unchanged. iPhone statuses come from the private features note the owner approved as the source and from the earlier matrix; they were not re-verified against a running iPhone build.

Not aligned yet and said so in the contracts page: `pea-email`, `pea-calendar` and `pea-nav` are Web formats that differ from the iPhone's email and calendar actions and have no vectors. The iPhone app has not taken a copy of the fixtures; that is a separate change in its own repository.

Checks: 171 unit tests (7 new), 43 browser, 27 gateway and release, source and boundary checks. Next: review items L7 and L8, then the stability pass and release.

## Honesty, assistant name and remembered delivery — 2026-11-15

Branch `feature/honesty-and-name`, development identity `0.1.0-dev.26`. Fourth parity slice.

`browser/honesty.mjs` is pure: `honestyRule` (sent with every request), `sincereQuestion`, `claimsHuman`, `admitsAI`, `needsHonestyCorrection` and the fixed `honestyCorrection`; plus `assistantName` (a strict label, falling back to PEA) and `nameLine`. `live-ui.mjs` appends the rule and the name line to the system message, shows the name in the model-sharing review and adds it to the approval fingerprint. `app.mjs` runs the check in `finishReply` against the owner's last message on that surface and appends the sentence once. `memory-ui.mjs` passes `assistantName` in the request context and keeps the delivery switch in `localStorage` (`pea-presence-v1`, two booleans) through new helpers in `presence.mjs`; it is no longer cleared on lock, unlock or restore.

Tests: 5 unit tests for honesty and names, 1 for the delivery preference; 3 browser tests (a human claim corrected whatever was asked, a dodged sincere question answered by the app, a plain answer and a figure of speech left alone; the name in the review and the system message, a new review when it changes, and an instruction-like name not sent; the delivery choice surviving a reload per profile). The Copy button's "Copied" label could vanish at once, because the conversation is sometimes redrawn just after a reply and the redraw replaces the button; CI caught this as an intermittent failure. Copying itself always worked. A notice now confirms it and the test checks the notice. Totals: 164 unit, 43 browser (four consecutive clean runs each as Mac and as Linux), 27 gateway and release.

Limits: the patterns are English only. A sincere question in another language, or a human claim worded outside the patterns, is not caught by the app and relies on the rule sent to the model. The home-city parser from the plan is deferred to the 0.2 slice that uses it (weather and the Home card), since nothing here would consume it. Next: parity matrix restructure, contracts document and fixtures, then review items L7 and L8, then the stability pass.

## Phone links and copy boxes — 2026-11-15

Branch `feature/phone-links-copy-boxes`, development identity `0.1.0-dev.25`. Third parity slice.

`browser/handoff.mjs` is pure. `replySegments` splits a reply into prose and copy boxes, taking a short first line with no spaces (or starting `file:`) as the label and treating an unfinished fence as a box; `spokenReply` keeps the prose. `openProposals` accepts one `pea-open` row for a call, a text or directions with strict keys; `phoneNumber` normalizes 7 to 15 digits with an optional plus; `openLink` builds `tel:`, `sms:NUMBER?&body=` and a Google or Apple Maps directions address; `describeOpen`, `openLabel`, `openGuidance` and `claimsOpen` complete it. In `app.mjs`, `messageBody` draws boxes only when a reply has one (other replies render exactly as before), Read reply speaks `spokenReply` while still checking the unchanged message text, and the proposal follows the email pattern: review, then a link kept in `openReady`. The guidance and a one-line note about fenced text are appended in `live-ui.mjs`.

Tests: 9 unit tests; 5 browser tests (a call link only after approval, none after cancel or reload, and no navigation; a text shown word for word with an encoded link; directions naming the service, opening in a new tab without a referrer, and no request to the map service before a press; a name without a number and a Shortcut refused, with a correction; a copy box that copies exactly through a stubbed clipboard and is absent from what a stubbed speech engine is given). Totals: 158 unit, 40 browser (three consecutive clean runs each as Mac and as Linux), 27 gateway and release.

Limits: pressing a `tel:` or `sms:` link was not exercised, and on a computer without a phone app it does nothing; real phones are owner acceptance. Speech and the clipboard were stubbed in tests. Greenhouse `file:` blocks now show as copy boxes with their path as the label; delivery to GitHub still reads the message text and is unchanged. Next: honesty rules, assistant name and home city, then the parity matrix and contracts document.

## Documents from templates — 2026-11-15

Branch `feature/document-templates`, development identity `0.1.0-dev.24`. Second parity slice. The owner allowed a read-only look at the iPhone policies for the remaining 0.1.0 features; the block format and limits match, and all code, layout notes and wording here are our own.

`browser/documents.mjs` is pure: the 21 types with a label, whether they are titled, and a short layout note; `docProposals(raw, current)` for `doc_create` and `doc_update`; `docHTML` (everything escaped, bullets, checkboxes, the rental note); `docPlain`, `docSummary`, `typesMentioned`, `docGuidance` and `claimsDocument`. `Services.call` gained an `upload` option and a fixed `/upload/drive/v3/files` route; `createRichDocument` does one multipart upload after checking the folder and verifies the answer; `replaceDocument` checks the Drive version and the created-by-PEA mark first. `live-ui.mjs` keeps `currentDoc` per profile for the tab, decides folder or file, and `writeDocument` runs the review and the write. `app.mjs` offers Review document, shows the outcome, and for the file path a download link. The earlier `document_draft` block still handles simple forms and plain editable drafts; `documentGuidance` is no longer sent because `docGuidance` covers both.

Correction to the previous slice: several to-do receipt sentences, a guidance example and one disclaimer sentence had been written too close to the private app's wording. They are reworded here; behavior is unchanged.

Tests: 10 unit tests for documents, 4 for the Drive calls against a synthetic Drive (one upload with the right metadata and no text in the address, refusals, no retry after an uncertain write, replacement refused after a hand edit or for a file PEA did not create, the fixed upload route); 4 browser tests on the file path (whole text reviewed, cancel, approve once, escaped HTML with an injected script inert, a revision, the rental note, refusals and a correction, and one profile unable to revise or see another's document). Totals: 149 unit, 35 browser (three consecutive clean runs each as Mac and as Linux), 27 gateway and release.

Limits: creating or replacing a real Google Doc was not exercised in a browser, because tests cannot sign in to Google; that path is covered only by the synthetic-Drive unit tests and needs owner acceptance. The open document is forgotten on reload or new chat. Next: call, text and map links with copy boxes.

## To-dos and reminders — 2026-11-15

Branch `feature/todos-and-reminders`, development identity `0.1.0-dev.23`. First parity slice. The owner allowed a read-only look at the iPhone to-do policy to match its block format; nothing was copied, and the Web code and wording are our own.

`browser/todos.mjs` is pure: item validation with an exact key set, `parseLocalMoment` (local `YYYY-MM-DDTHH:MM`, impossible dates refused), `todoProposals` (one `pea-task` block, array or single row, at most 8 rows, strict keys), `applyTodoRequests` (duplicates skipped, a reminder only for a future time, check-off by one exact or one partial match, per-profile limit, and a sentence saying what happened), owner operations, `todoGuidance` (items only when shared; up to 25 open and 5 finished in the last week), `claimsTodoChange` and `dueReminders`. `browser/todos-ui.mjs` draws the list in a new Today section, runs a 20-second reminder check that also fires when the tab becomes visible, and asks for notification permission only on a click.

Storage: to-dos ride in the board's encrypted record. `encodeBoard` writes the earlier plain array when there are no to-dos and `{ schema: 2, tasks, todos }` otherwise; `decodeBoard` accepts both. `BoardVault.unlock` takes current to-dos and exposes `vault.todos`; `save(tasks, todos = this.todos)` keeps them when only stories change; lock clears them. An earlier build refuses a schema-2 board without changing it. `board-ui.mjs` holds the to-dos beside the stories and exports `todoStore`.

Wiring: `app.mjs` parses `todoProposals` in `finishReply`, offers Review to-do changes, applies on approval and shows the outcome sentence in place of the button. `live-ui.mjs` appends the guidance to the system message, adds `shareTodos` (default off) to the approval fingerprint and names it in the model-sharing review. Story proposals now use `pea-story` / `story_add`; `pea-task` is to-dos only.

Tests: 12 unit tests for the logic, 1 for the vault format; 6 browser tests (owner edits and profile separation; propose, cancel, approve once, check off, an unclear request reported; a claimed change corrected and a delete request ignored; the list absent from the system message until shared and re-reviewed, and the other profile's items never sent; a reminder appearing once when the page's clock passes the due time; an encrypted save, a locked reload showing nothing readable, and the item back after unlock). Totals: 135 unit, 31 browser (four consecutive clean runs each as Mac and as Linux), 27 gateway and release. Looked at in a browser at 1,500 and 375 pixels.

Limits: reminders cannot fire while the page is closed, and an overdue reminder shows again once after each reload until the item is checked off. The system notification path was not exercised (permission is never granted in tests). To-dos are not yet in the library backup or any iPhone-readable file. The board backup format carries them. Next parity slices: document templates, then call, text and map links with copy boxes.

## Drag and drop — 2026-11-15

Branch `feature/drag-and-drop`, development identity `0.1.0-dev.22`. Third and last slice of the desktop workspace.

`browser/dragdrop.mjs` holds the decisions: `localFileKind` (the file picker's rules, moved out of `app.mjs` so both paths share them), `fileDropPlan` (which workspace, and refusals while busy, in a dialog, in Blended or when empty) and `storyDraftFromMessage` (first non-empty line to 120 characters as the title, the text to 2,400 as scope). `browser/dragdrop-ui.mjs` adds the drop targets. `app.mjs` gains `openLocalFile`, used by both the picker and a drop. Dropping on Chat calls the same `live.attach` as Discuss. Messages are draggable unless incomplete or a preview, and a drag carries only the message id under `application/x-pea-message`; the text is looked up in the active profile's own conversations on drop, so an id from elsewhere drafts nothing. A window-level handler stops a stray file drop from navigating the browser away from the app.

Also in this change, at the owner's request after trying split panes: 20 pixels of space between the setup cards and the panes, with a browser assertion.

Tests: 4 unit tests; 6 browser tests using synthetic `DataTransfer` drops (a file on Chat is selected and its excerpt appears in the review, with nothing sent before or after declining; a file on Greenhouse previews without being selected and a second file is ignored with a notice; unsupported, oversized and Blended drops are refused; a drop outside a workspace is contained; a message on Today drafts a story that reaches the board only after Add to Inbox, and the drag carries no text; an unknown id drafts nothing). Totals: 122 unit, 25 browser (five consecutive clean runs each as Mac and as Linux), 27 gateway and release.

Limits: drops are synthesized in the page, so a real pointer drag from the desktop or between panes has not been exercised by a test; that is worth trying by hand. Touch devices have no drag source. This completes the workspace slices; next are review items L7 and L8, then to-dos with reminders.

## Command palette and shortcuts — 2026-11-15

Branch `feature/command-palette`, development identity `0.1.0-dev.21`. Second slice of the desktop workspace.

`browser/commands.mjs` is pure: `commandList(context)` builds the list from what is on screen (panes, focus, wide, profile, busy), `matchCommands` filters by plain substring words with a simple rank, and `shortcutFor(event, { mac, typing })` maps a key press to a shortcut name. The `shortcuts` table feeds both the handler and the help screen. `browser/commands-ui.mjs` draws the palette (`#palette`, a combobox with a listbox) and the help (`#shortcuts-dialog`), and maps each command id to a click on an existing control or a call into the workspace. A command runs only if it is on the current list, and it runs from the palette's `close` event because closing a dialog restores focus and would undo a command that moves it.

Rules worth keeping: the global key handler returns early when any dialog is open other than the palette's own toggle; plain keys (`/`, `?`) are ignored in text fields; workspace keys use Control on a Mac and Alt elsewhere because browsers reserve Command or Control with a digit; the send shortcut submits the same form, so the model-sharing review still appears. Mac detection must be case-insensitive: Chrome reports `macOS` in `userAgentData.platform` and `MacIntel` in `navigator.platform`. A first version missed that and showed Ctrl shortcuts on a Mac.

Tests: 7 unit tests; 7 browser tests using real key presses through `Page.press` (open, filter, arrow keys and run; layout, theme, profile and add-story commands; the right keys for this keyboard; no split commands at 390 pixels; plain keys only outside fields and workspace keys anywhere; the send shortcut stops at the sharing review; no shortcut works while a review is open and none approves it). Totals: 118 unit, 19 browser, 27 gateway and release. Local runs exercise the Mac key paths and CI the others; `PEA_DOM_PLATFORM=linux` (or `mac`) makes the page see that kind of computer, so both can be run on one machine. A first CI run failed because a test checked a command's effect 60 milliseconds after the palette closed; tests now wait for the effect itself.

Limits: Safari and Firefox are untested. Alt with a digit types a symbol on some non-Mac layouts when no handler takes it; the handler takes it everywhere, including in text fields. Drag and drop is the next slice.

## Split panes — 2026-11-15

Branch `feature/split-panes`, development identity `0.1.0-dev.20`. First slice of the desktop workspace.

`browser/workspace.mjs` is pure layout state: up to two of the three workspaces, which one has focus, and a split ratio clamped to 0.3–0.7. It normalizes anything read from storage and keeps nothing but those three fields (`localStorage` key `pea-workspace-v1`). `browser/workspace-ui.mjs` draws it over the existing panels, which are now wrapped in `#panes`: a split button in the header, Shift-click or Alt-click on a tab to open beside, a per-pane bar with Swap sides and Close, a divider that drags and answers arrow, Home and End keys, and focus that follows pointer or keyboard activity in a pane. Below 1,100 pixels it shows only the focused workspace and the split control is hidden by CSS. `tab()` in `app.mjs` now delegates to the workspace; the focused pane is still `activeTab`, so sending, voice and the navigation proposal are unchanged. In a split, panes are size containers and a container query collapses the Chat, Today and Greenhouse grids by pane width.

Behavior change outside the split: the app reopens on the last focused workspace instead of always Chat.

Tests: 8 unit tests for the layout state; 4 browser tests (side by side and back, Shift-click and replace rules, keyboard resize with limits and reload, a 390-pixel viewport showing one workspace and returning to two, and an approved story appearing in Today while Chat stays visible, with no request leaving the machine). Totals: 111 unit, 12 browser (ten consecutive clean runs), 27 gateway and release. Looked at in a browser at 1,500 pixels in dark and light and at 375 pixels.

Limits: dragging the divider with a real pointer was not exercised by a test, only the keyboard path. Read-aloud stops when focus moves between panes; letting it continue is a possible later improvement. No command palette, shortcuts or drag and drop yet; those are the next two slices. The shared test setup moved into `browser/tests/dom/harness.mjs` (`startStack`, `openConnectedPage`, `askModel`, `openReview`, `Page.setViewport`).

## Browser-level tests and gateway load fix — 2026-11-14

Branch `test/browser-level-reviews`, development identity `0.1.0-dev.19`.

`browser/tests/dom/harness.mjs` starts a synthetic OpenAI-compatible model, the real gateway through `local.py` with a token made for the run, and a headless Chrome driven over its debugging protocol using Node's built-in WebSocket. No package is added. `browser/tests/dom/reviews.test.mjs` has eight tests: declining the model-sharing review sends nothing; an email link, a Today story and a calendar file each appear only after approval, cancel changes nothing, and an approved email is not restored after reload; a proposed document only opens an editable draft and cannot be created without Google; a reply that claims an action gets the plain correction; a reply with two actions offers neither; a review opened straight after another closes stays open. The page's requests are recorded and none leaves the machine. Run with `node --test browser/tests/dom/*.test.mjs` (about three seconds). Without Chrome the tests skip; CI sets `PEA_DOM_REQUIRED` and now pins Node 22 through `actions/setup-node`.

Writing these exposed a gateway defect. `Gateway` inherited a listen backlog of five. One page load requests about twenty files at once, part of the burst was refused, a module failed to load and the app never attached its handlers. In a loop of eight fresh loads, two to four failed; with `request_queue_size = 128`, 48 of 48 started. `CLIENT_SLOTS` is also raised from 8 to 64: the backlog was the observed cause, and the slot limit is raised because twenty idle browser connections exhausted it in a new unit test. The model limit of two and the 20-second request deadline are unchanged. Two gateway tests cover idle connections and the over-limit refusal.

They also exposed a defect in `review()` in `browser/live-ui.mjs`. Closing a dialog fires its `close` event a moment later. When the next review opened before that event arrived, the event ran the new review's handler and cancelled it silently; the Approve button then did nothing. It failed safe, but an approval was lost about one time in ten under test timing, and back-to-back reviews (model sharing followed by a file review) are a normal path. The handler now ignores a `close` event that arrives while the dialog is open. The unlock dialogs for the board and the library also act on `close` (`board-ui.mjs`, `memory-ui.mjs`); they were read and not changed, and deserve the same test.

Harness notes for whoever extends it: every browser command, hook and test has a timeout; child processes are killed if they do not exit; temporary folders are removed on a best-effort basis; cleanup uses `Promise.allSettled`. The first CI run hung for ten minutes because removing Chrome's profile folder threw and skipped stopping the gateway. On a timeout the error lists every notice the app showed, since notices clear after 6.5 seconds.

From here on every feature carries a browser-level regression test in its own pull request; `CONTRIBUTING.md` states the rule. Checks: 103 unit tests, 8 browser tests (44 consecutive clean local runs after the fixes), 27 gateway and release tests. Not covered: Safari and Firefox, real devices, and any real provider.

## Reduced-motion styling fix — 2026-11-14

Branch `fix/reduced-motion-styles`, development identity `0.1.0-dev.18`. In `browser/styles.css` the `@media (prefers-reduced-motion: no-preference)` block opened at the end of the first line was never closed, so the 331 rules after it applied only when motion was allowed. An owner with Reduce Motion on saw a largely unstyled page. The block is now closed after its keyframes. For owners without that preference nothing changes. No later rule animates outside its own reduced-motion guard, so closing the block exposes no new motion.

The stylesheet is also formatted with Prettier 3 in the same change, because it could not be parsed before the fix. Evidence: the fixed file minified with esbuild before and after formatting is identical apart from a space after the colon in custom-property declarations, which browsers trim; no script reads a custom property. New `browser/tests/styles.test.mjs` fails on the old file and checks that every block is closed, that a reduced-motion block holds only animation, transition, transform and opacity, and that motion is declared only inside such a block.

Checked in a browser by reading the parsed rule tree, not by switching the operating-system setting: the in-app browser cannot emulate Reduce Motion. A real device with the setting on is still owner acceptance.
## Readable JavaScript source — 2026-11-14

Branch `format/readable-source`. Formatting only: every `browser/*.mjs` and `browser/tests/*.mjs` file was reformatted with Prettier 3 (`--single-quote --print-width 110`). No behavior, version or release identity changed. Evidence: each file minified with esbuild before and after is byte-identical, and `node --test browser/tests/*.test.mjs` passes 100 tests before and after. Long string literals (model guidance text) are unchanged and still exceed the line width.

Not formatted: `browser/index.html` (whitespace can be significant) and the Python sources. `browser/styles.css` could not be parsed by the formatter: the `@media (prefers-reduced-motion: no-preference)` block opened at the end of its first line is never closed, so every later rule sits inside it. That is a real defect for owners who enable reduced motion and is fixed, then formatted, in its own change.

Resume: the plan for release 0.1.0 is foundations (this change, the stylesheet fix, a browser-level test harness, review items L7 and L8), then the desktop workspace, then action parity. Rebase any open branch onto this commit before continuing, because every module's line numbers changed.

## Board backup browser round trip — 2026-11-13

The encrypted board backup slice, uncommitted at the time, was verified end to end using two isolated loopback preview origins and synthetic data. A synthetic story was encrypted, downloaded, restored into the empty second origin and unlocked successfully. A second restore attempt was refused while a board existed. Temporary test servers were stopped and the downloaded synthetic file was removed. The test origins may retain their synthetic encrypted IndexedDB records in the in-app browser. No real board, model, account or microphone was used. Physical-device testing and iPhone compatibility remain open. The prior 94 Web and 24 server test results apply; this check changed no application code. Run the staged boundary scan before any commit. Resume: continue parity and independently agree an interoperable cross-app profile contract.

## Encrypted board backup — 2026-11-13

Merged to main in #17 (written on `codex/interview-continuity-design`). The Today board can prepare a Web-only encrypted backup of both profiles' saved stories, including removed stories and results, using the board's existing passphrase. Restore verifies authenticated ciphertext and the board schema and atomically inserts only into an empty browser with no tab-only stories; it never merges or overwrites. Unlock separately after restore. Keys, permissions and the separate conversation library are excluded. There is no iPhone compatibility or automatic sync.

`node --test browser/tests/*.test.mjs` passed 94 tests, including synthetic backup round trip, wrong password, tampering, cancellation and concurrent/existing-storage refusal. `python3 browser/server/check_source.py` checked 52 files; `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` passed 24 with loopback; `git diff --check` passed. An isolated browser preview checked the backup/restore controls without real data; actual browser file download/restore and physical-device acceptance remain unverified. The temporary server was stopped. Run the staged boundary scan before any commit. Resume: test full file workflow in an isolated browser and continue cross-app interoperability design.

## Voice-friendly story refinement — 2026-11-13

Merged to main in #17 (written on `codex/interview-continuity-design`). The owner can submit “edit task one” or an equivalent numbered story command from Chat or Today to open the existing story editor. The editor offers browser dictation into a separate draft; after review, the owner chooses which field to replace and explicitly saves the story. Dictation cannot silently replace an existing draft; oversized replacements are rejected. Closing the editor stops recognition. Browser recognition may use an online service, and commands are reviewed before submission. No automatic model action, task dispatch or external write is added.

An isolated loopback preview created a synthetic task, opened it using a typed command, applied a synthetic replacement draft and verified the saved title. The temporary server was stopped; no microphone, real board or provider was used. Checks: `node --test browser/tests/*.test.mjs` (93 passed); `python3 browser/server/check_source.py` (52 files); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed with loopback); `git diff --check` passed. Physical microphone and mobile acceptance remain open. Run the staged boundary scan before committing. Resume: continue Web parity, including cross-app profile interoperability and device voice validation.

## Edit captured stories — 2026-11-13

Merged to main in #17 (written on `codex/interview-continuity-design`). Owners can edit a non-running, non-removed story's title, scope and completion criteria from its Today card. Profile/story identity and snapshot are rechecked at save; invalid or credential-like input is rejected without mutation. Existing output remains unchanged and is labeled as based on the earlier story. Editing does not dispatch work; existing encrypted board and conflict handling apply.

An isolated loopback preview created and edited a synthetic story and verified the revised scope and criteria on the board; the temporary server was stopped. No live model, real board, account or microphone was used. Checks: `node --test browser/tests/*.test.mjs` (93 passed); `python3 browser/server/check_source.py` (52 files); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed with loopback); `git diff --check` passed. Physical-device and encrypted-board editing acceptance remain open. Run the staged repository boundary scan before committing. Resume: continue Web parity; profile interoperability and actual-device voice remain unverified.

## Greenhouse voice screen — 2026-11-13

Merged to main in #17 (written on `codex/interview-continuity-design`). Greenhouse has a Voice chat entry using the existing reviewed speech screen. The screen names the current workspace/Greenhouse role, sends to the Greenhouse conversation and selected role, and optionally reads its completed response. Voice drafts remain separate by profile and workspace within the tab and are cleared on profile change/page disposal. Existing typed drafts block voice submission instead of being overwritten. No new model route, provider, automatic listening or locked-screen support is added.

An isolated browser preview submitted a synthetic typed transcript into Greenhouse without a connected model and verified a separate unsent Greenhouse voice draft did not appear in Chat. No microphone, real provider or private content was used. `node --test browser/tests/*.test.mjs` passed 92; `python3 browser/server/check_source.py` checked 52 files; `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` passed 24 with loopback; `git diff --check` passed. Actual microphone/audio, live Greenhouse provider, role switching and physical mobile remain acceptance work. Run the staged boundary scan before committing. Resume: continue parity, including interoperable encrypted profile transfer and real-device voice testing.

## Suggested navigation end-to-end check — 2026-11-13

The `codex/interview-continuity-design` navigation slice, uncommitted at the time, was checked in an isolated browser against a temporary loopback-only synthetic OpenAI-compatible model and gateway. A synthetic Chat request passed the normal local-model sharing review, the complete response displayed an Open Greenhouse button, and clicking it selected the Greenhouse tab without opening a file or starting a task. The temporary server was stopped. No real model, account, private profile or microphone was used. Real-provider compliance with the navigation proposal format and physical-device behavior remain unverified. Automated parser and gateway checks from the prior entry remain the applicable test evidence; run the staged boundary scan before any commit. Resume: continue independently testable Web parity work and validate real-device behavior; cross-app profile transfer remains unimplemented.

## Suggested workspace navigation — 2026-11-13

Merged to main in #17 (written on `codex/interview-continuity-design`). A completed model reply can offer one owner-clicked navigation button for Chat, Today or Greenhouse. The parser rejects mixed/multiple blocks, incomplete JSON, external destinations and additional fields. The button checks the originating profile and conversation and refuses while a request is active. It does not open files, change permissions or run tasks, and is not restored as an actionable proposal. Existing direct owner navigation commands continue to work without a model request.

Checks: `node --test browser/tests/*.test.mjs` (92 passed including strict navigation parser cases); `python3 browser/server/check_source.py` (52 files); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed with loopback); `git diff --check` passed. No real model, provider, microphone, personal content or native code was used. Actual model proposal rendering/button activation still needs a synthetic end-to-end browser check, and provider behavior is unverified. Run the staged public boundary scan before a commit. Resume: verify proposal UI with a synthetic model and continue independently testable parity slices; cross-app profile transfer remains unimplemented.

## Device voice and speed — 2026-11-13

Merged to main in #17 (written on `codex/interview-continuity-design`). Talk with PEA now lets the owner select a browser/device speech voice, set speed from 0.8× to 1.25× and preview it. Read reply and interview question playback use the selected voice; quiet-hour delivery still applies its existing rate and pitch adjustment. Only validated voice URI and rate are stored on this browser, shared across Personal and Work; no provider credentials or personal content are stored there. Missing voices fall back to the device default. This does not add a cloud voice integration or locked-screen voice.

The separate browser preview displayed the voice picker, available device voices and speed without playing audio or changing a setting. `node --test browser/tests/*.test.mjs` passed 91 tests including preference validation and storage-failure checks; `python3 browser/server/check_source.py` checked 52 files; `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` passed 24 tests with loopback; `git diff --check` passed. Actual audio output, platform-specific voices and mobile/AirPods behavior remain unverified. Run the staged repository boundary scan before committing. Resume: continue parity on independently testable Web slices, with cross-app profile transfer still requiring an agreed contract and native implementation.

## Interview question playback and dictation — 2026-11-13

Merged to main in #17 (written on `codex/interview-continuity-design`). Each interview field has a Read question control using the device voice and a Dictate answer control using the existing explicitly disclosed browser recognizer. Dictation is limited to empty fields and refuses to overwrite an answer added while listening. Closing the interview or changing steps/profile stops recognition; question playback stops on close and uses the existing tab/page cancellation. The owner reviews and saves manually. This is not continuous voice or native interview parity; browser recognition may use an online service.

Isolated preview verified the question controls and speech consent without enabling the microphone; physical microphone, speech service, playback and mobile acceptance remain. Checks: `node --test browser/tests/*.test.mjs` (89 passed); `python3 browser/server/check_source.py` (52 files); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed with loopback); `git diff --check` passed. Run the staged boundary scan before committing. No provider account, real microphone, real profile or native code was used. Resume: cross-app profile interoperability and reliable voice testing remain separate work.

## Reviewed profile import choices — 2026-11-13

Merged to main in #17 (written on `codex/interview-continuity-design`). Profile import defaults to filling missing answers only, preserving existing nonempty answers. An explicit alternate mode replaces all fields, including with blanks. A local review lists each changed field's before/after values before applying; unchanged imports make no update. Invalid profiles, mode changes and library/profile changes fail closed. The file remains a Web-only encrypted snapshot; no iPhone import or automatic sync is implemented.

Checks: `node --test browser/tests/*.test.mjs` (89 passed, including synthetic legacy/expanded imports and replacement with blanks); `python3 browser/server/check_source.py` (52 files); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed with loopback); `git diff --check` passed. Isolated preview verified the import UI and safe default without real accounts or data. Full browser file import/review, physical device testing and the staged repository scan remain before release/commit. Resume: independently agree and implement an interoperable cross-app transfer contract; avoid implying compatibility until both apps and synthetic cross-platform vectors are tested.

## Profile-only encrypted snapshots — 2026-11-13

Merged to main in #17 (written on `codex/interview-continuity-design`). Under Past chats & memory, the owner can export the active Personal or Work interview and persona to a passphrase-encrypted Web-only file, then import and explicitly review replacement in a matching Web profile. The snapshot excludes the other profile, history, keys and permissions; there is no merge, automatic sync or iOS compatibility. `profile-transfer.mjs` uses AES-256-GCM, PBKDF2-SHA256 at 310,000 iterations, random salt/IV, authenticated format marker and strict size/schema checks. A separate export passphrase is never stored. Existing library migration and consent boundaries remain. The local gateway's fixed asset list and release allowlist include the module; the development preview watcher restarted its server to load the allowlist.

Checks: `node --test browser/tests/*.test.mjs` (88 passed, including synthetic profile round trip and tampering); `python3 browser/server/check_source.py` (52 files); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed with loopback access); `git diff --check` passed. `python3 tools/check_repository.py` passed with the new module temporarily staged and was then unstaged. A separate preview verified the export controls and prepared a synthetic encrypted file; actual download/import and physical-device acceptance remain open. No real profiles, provider accounts or native code were used. Resume: conduct independent compatibility design and implementation with the iPhone maintainer before claiming cross-app transfer; verify review and conflict behavior with synthetic browser integration tests and run the staged boundary scan before a commit.

## Expanded interview — 2026-11-13

Merged to main in #17 (written on `codex/interview-continuity-design`), alongside prior Web changes. The three-step Web interview now asks the 13 owner-authorized standard questions separately and retains legacy Web fields and persona. The assistant's fictional home is a new field; the older owner-home answer remains distinct. Local library schema 2 accepts the expanded interview, while schema 1 remains readable. Saving to an unlocked schema 1 library asks the owner to review the upgrade and recommends an encrypted backup before rollback; older Web versions cannot open schema 2. Profile boundaries, sharing review and the 3,200-character introduction limit remain. No native-format import, cross-device synchronization or native wellbeing fields are implemented.

Tests: `node --test browser/tests/*.test.mjs` (87 passed including synthetic schema upgrade/encrypted round trip); `python3 browser/server/check_source.py` (51 files); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed with loopback access); `git diff --check` passed. An isolated browser preview verified the three steps and a synthetic tab-only save. An actual encrypted-library upgrade, rollback and physical device still require owner acceptance; no account, microphone, real interview answer or native source was used. Run `python3 tools/check_repository.py` on staged paths before any commit. Resume: implement interoperable, explicitly reviewed encrypted profile transfer with a versioned cross-app contract and synthetic fixtures, without touching private native source in this repository.

## Voice entry and compact cards — 2026-11-13

Merged to main in #17 (written on `codex/interview-continuity-design`), alongside the prior uncommitted interview and navigation work. Chat offers a prominent voice screen with a microphone control, editable transcript, explicit Send and optional device-voice playback. Browser/OS recognition can process audio online. Recognition needs explicit notice and user action and stops on close, hidden page or profile/tab change; it does not capture continuously or support locked-screen use. Permission-denial guidance is visible. A typed draft blocks voice submission rather than being overwritten. Mobile setup cards have reduced spacing. Existing model disclosure remains in force; no new model or speech provider is connected.

An isolated browser preview opened the voice interface without starting the microphone or using an account. Physical phone, microphone, permission denial in a real browser, AirPods, speech quality and provider response playback remain operator acceptance work. Run the four README checks, including loopback access for server tests; verify the full current branch and staged set before committing. Resume: finish the prior interview migration and cross-app contract; continue toward continuous, low-latency voice only after browser support, privacy and provider costs are established.

The composer also has a direct Voice chat button and styled Read reply / Stop controls. Voice setup help shows the exact current origin and explains browser/site, operating-system and speech-service permission paths; it does not claim to diagnose which one failed or change permissions. The voice screen and help were verified in an isolated preview, without capturing audio or changing browser permissions.

The composer actions and voice microphone now use consistent theme-colored inline SVG icons and matching button styling. An isolated dark-theme desktop preview verified the composer. This is a source change; physical mobile and light-theme acceptance remain outstanding.

The header subtitle now uses the app body font with the initials P, E and A highlighted in theme green. The dark desktop preview preserves the complete accessible brand text; physical mobile and light-theme acceptance remain outstanding.

## Interview continuity and navigation groundwork — 2026-11-13

Merged to main in #17 (written on `codex/interview-continuity-design`): the interview now states whether the browser library is unlocked for encrypted saving and explicitly says iPhone transfer is not available. `browser/docs/PROFILE-CONTINUITY.md` records the owner-authorized question wording and proposed privacy and conflict requirements, without personal answers. The actual Web wizard still has its earlier grouped questions; adding the matching individually stored questions needs a versioned library migration, preservation of existing entries (especially the older owner-home versus assistant-home distinction), rollback behavior and tests. Native import/export and cross-device sync are not implemented. No iPhone files were modified.

The Chat tab now uses a speech-bubble icon. A locally parsed, explicit owner command such as “open Greenhouse” or “take me to Today” switches among the existing three tabs without a provider call or any data action. Dictation must be reviewed and submitted first. This does not let a model independently navigate, open a particular document or run a task; contextual navigation still needs a reviewed proposal design. Navigation refuses while a request is running.

Checks after the changes: `node --test browser/tests/*.test.mjs` (85 passed); `python3 browser/server/check_source.py` (51 files); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed with loopback access; sandbox-only run failed on loopback permission); `python3 tools/check_repository.py` passed on the indexed set before these uncommitted changes. Browser and physical-device acceptance remain outstanding. No account, provider, real user data, native build or installed production service was used.

Resume: verify branch and uncommitted paths, rerun the public scan on the staged set before any commit, implement versioned independent interview fields and a migration preserving old data, agree and implement an interoperable encrypted profile contract in both independently owned products, then test with synthetic fixtures and devices. Do not claim synchronization or model-driven navigation until implemented and verified.

Updated 2026-11-08. Public web-only work in progress; native iOS remains the primary separate private codebase. Initial source was copied through an explicit allowlist into fresh Git history. The products now maintain separate source and test trees; neither needs duplicated web files or a sibling checkout. The native product keeps its own policy fixture and tests. `SPLIT-ORIGIN.json` records hashes of the initial exported web files, not a live runtime or access grant.

## Security review fixes (2026-11-11)

Branch `security-review-fixes-2026-11-11`, version `0.1.0-dev.2` (development). From the 2026-11-11 review: L1 (encoded dot segments refused in `Services.call`), L2 (build identity cached 60 s in the gateway), L4 (`RecursionError` caught; on Python 3.14 the decoder already raises a `ValueError`, so this matters only on older Pythons), part of M2 (`validCode`/`validRepo` moved to `connections.mjs` with tests), L5/L6 as documentation in `SECURITY.md`. M1 (full Drive, optional Gmail read) is accepted by the owner for the web app and documented, not changed. The local-model path was re-read: same-origin gateway only, gateway token only, loopback-only upstream, no credential forwarded; no change needed. A LAN model server still has to sit behind the gateway host's loopback (the gateway refuses non-loopback upstreams by design).

Not done: L3 (slow-connection limit), L7 (release revocation/downgrade warning), L8 (`appProperties` marker; needs a migration for existing files), and DOM-level tests that every external write follows an accepted review (needs a DOM test harness, which this no-dependency repo does not have).

Checks at this commit: 48 Node tests, 19 Python tests, `tools/check_repository.py` and `browser/server/check_source.py` pass locally. CI was not observed.

## Current scope

Responsive Chat / Today / Greenhouse; OpenRouter BYOK or a customer-owned local-model gateway; profile-bound Google previews/PEA folder; reviewed Docs/simple Forms, stories, specialist model and draft-PR workflows; structured profile interview, reviewed sourced memory and optional encrypted local conversation library; reviewed browser dictation/device speech; version footer, explicit feedback/release checks and local signed-package manager. Bamcio Ventures LLC attribution. See browser/docs/PARITY.md for unfinished work and browser/docs/CO-USE.md for cross-platform boundaries.

Web tests/checks/release numbering are independent of iOS. The public synthetic policy fixture is the web contract; native retains a vendored versioned snapshot and its own tests. No sibling repo is read or changed by web checks. No private source/history/credentials, installed owner integration or runtime data is published.

## Verification

Run the four commands in README from this repo. They parse source/links, scan the Git index, run browser conformance and synthetic gateway/signed-release checks. Public CI is read-only, has no provider/signing secrets, and never installs/deploys. The initial split receipt is recorded below after running against the fresh public tree. Actual account grants, model costs/availability, phones, microphone/AirPods, and packaged dependency installers remain separate acceptance work.

## Next slice

1. Design dependency packaging/bootstrap for macOS/Linux without coupling either product to the other's source.
2. Improve onboarding and explicit customer-owned connectivity; keep direct OpenRouter and local-model paths.
3. Richer document/action tools, secured public research, then reviewed encrypted sync/conflict handling. Encrypted browser-local conversation/sourced-memory persistence is now implemented independently.
4. Establish a production release signer and independently distributed public trust before a signed installer release. Current development source is installable manually; it is not a finished one-click package.
5. Add a Bamcio.com product listing and public GitHub install links when ready. Website publication is a separate product change.

Resume: verify Git head/status and README/AGENTS, run the independent checks, pick a bounded web slice and keep the native app untouched. Do not infer provider authority, private runtime state or deployment permission from this handoff.

## Initial split verification

The independent public tree passed 46 Node browser tests, 17 Python synthetic gateway/release checks, the 40-file program source/link/fixture check and the 53-file staged public boundary scan. The policy fixture matches the initial export digest. No native checkout, Apple SDK, user account, model inference, microphone or production signing key was used. Public CI will record its own result after publication; do not substitute these local results for it.

## Independent source baseline — 2026-11-08

The initial export is historical provenance, not a requirement to retain duplicate source in the native repository. Web development, checks and releases continue here; native development, cleanup and verification remain its maintainer's responsibility. Do not restore old cross-repository path or byte-equality checks. Platform parity requires independently implemented behavior and tests; private native source/specification documents are not copied into this public tree.

This is a documentation correction only: no application logic, policy fixture, dependency, release number, runtime or deployment changed. Source/link and public boundary checks validate the edit; CI provides its own result. The previously installed personal prototype is a separately managed deployment and is not maintained by pulling an unrelated checkout.

## Conversation continuity slice — 2026-11-08

Source on `codex/web-memory-parity`, based on the separate split-documentation refresh. `memory.mjs` owns schema/source validation, bounded search/recall and the encrypted vault; `memory-ui.mjs` owns explicit interview/library/memory controls. Chat/Greenhouse projection uses the same provider/local-model path with no additional inference call for recall. Development identity is `0.1.0-dev.2`; no runtime deployment or signed release is implied.

The library is opt-in, browser/origin-local and independent of the story board. Credentials and sharing grants never enter the archive. Work/Personal sources stay separate; Blended gets none. At most four owner-reviewed facts are offered after a separate sharing switch and model disclosure. New recalled sets or restored threads clear/re-key approval. Expired facts remain visible locally but leave model recall. Forgetting a source removes its derived facts. Concurrent tabs use a transactional revision check, no silent merge/overwrite. See browser/docs/MEMORY.md for caps, crash/lock and recovery limits.

Verification: 60 Node checks (14 new memory/vault/request-projection tests), 17 synthetic Python gateway/release checks, and the independent source/boundary scans. Isolated browser smoke covered interview save, preview conversation capture, exact-source memory review, encryption enable, explicit Lock, reload/unlock/restore and Work exclusion; mobile layout was checked at 390×844. A loopback synthetic model also verified exact-memory/interview disclosure before dispatch and the sharing-off review path. No account, microphone, real inference, iOS change or installed-service restart. Physical mobile and actual-provider acceptance still need owner testing.

Next: reviewed model action blocks and richer Docs workflows, then public research with DNS-resolved address validation, connection pinning, redirect/size/time bounds and untrusted-source projection. Never port hostname-only research checks to the server. Do not copy private source or its behavior guide into this public tree. Automatic sync, native archive import and encrypted backup/export remain unimplemented.

## Optional character delivery — 2026-11-08

Next independent slice on `codex/web-presence-parity`, layered after the continuity PR. `presence.mjs` maps the device's local clock to one of four coarse delivery hints; the owner enables it in Interview & persona per profile/tab. Off on reload/unlock/Lock. No location/precise clock/time zone is projected. The hint appears in normal provider review and its period participates in approval identity. Device Read reply asks for seven percent slower speech and slightly lower pitch during midnight–08:00; ordinary delivery otherwise. This is fictional character delivery, not asserted feelings or a generated life. No extra inference, listener, timer, automatic playback, new provider or archive migration. Development identity `0.1.0-dev.3`.

Verification: 65 Node tests, including five presence/transport checks; independent source and public boundary checks. Prior Python gateway/release suite is also rerun for the final branch. Browser smoke verified the explicit delivery toggle and Work/Personal separation. Sticky dialog headings also mask scrolled text at the top gutter. Device/browser voice interpretation remains acceptance work. The encrypted archive is still schema 1 and this toggle is intentionally tab-only. No native source, service or installed build changes.

## Continuity and navigation reconciliation — 2026-11-12

Branch `codex/parity-continuity-nav` reconciles the earlier public documentation, encrypted local library and time-of-day delivery work with web main security fixes from 2026-11-11. Conflict resolution preserves the later code validators and Drive/gateway security disclosures. The native iOS checkout is not a build dependency and no private source or behavior document is included. Development identity is `0.1.0-dev.4`.

Navigation now provides a compact workspace menu for New chat, Past chats & memory, Interview & persona, Connections & settings and Privacy & voice. The three workspace tabs expose selection and support arrow, Home and End keys. On the isolated browser preview, the menu and history entry opened at a narrow viewport. Browser/OS accessibility and physical-device acceptance remain separate work.

Checks: `python3 tools/check_repository.py` (59 indexed files), `python3 browser/server/check_source.py` (46 files), `node --test browser/tests/*.test.mjs` (67 passed) and `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (19 passed). No provider calls, customer data, microphone, native code changes or installed-service changes. Automatic sync, encrypted backup/export, richer document/action tools and secured public research remain open. The iOS product has evolved beyond the dated parity guide; compare behavior against current owner-approved native guidance before each future slice.

Resume: check current public main and this branch; run the four commands in README, then continue with reviewed actions and richer Google document workflows. For research, enforce resolved-address checks and connection pinning across redirects to block private destinations and rebinding. Do not copy native source or private documentation into the web repository.

## Reviewed story proposals — 2026-11-12

Branch `codex/reviewed-story-proposals`, based on web parity PR 4, adds a narrow owner-confirmed story proposal to the existing Today board. Model output is untrusted; one complete `pea-task` JSON block with only `task_add` and a valid title may be offered as a button. The owner sees the exact title and profile and must approve before adding; cancel has no effect. No due dates, reminders, completion, background work, external writes or automatic replay. Actions are not restored as actionable proposals after reload. `actions.mjs` filters action blocks from visible/spoken output, including streaming fragments, while preserving ordinary code fences. Claims that a task was already added receive an explicit no-action notice, and a successful approval shows a local receipt. Existing board persistence and profile guards remain in force.

An isolated browser with a synthetic local model verified provider review, the proposal button, cancel, approval into Today and no replay after returning to Chat. No account, real inference, microphone, iPhone source or installed service was used. Parser tests cover malformed/oversized/credential-like fields, multiple blocks, interrupted output and streaming visibility. Final checks: `node --test browser/tests/*.test.mjs` (71 passed); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (19 passed); `python3 browser/server/check_source.py` (48 files); `python3 tools/check_repository.py` (61 indexed files). More iOS parity remains: native to-do/reminders, calendar, email, richer documents, source research and encrypted synchronization. A model claim is not proof of a completed external action.

Resume: inspect PR 4 and this branch, run the four README checks, then continue with a reviewed email draft or richer documents. Do not copy native source or private documentation into this public tree; never deploy the web branch over the independently managed private prototype.


## Reviewed email drafts — 2026-11-12

Branch `codex/reviewed-email-draft` adds owner-reviewed, profile-bound email proposals. A completed `pea-email` block permits one explicit address and bounded subject/body, with no extra headers; a separate approval displays a link to the owner's mail app. PEA never sends and an action is not restored after reload. Model claims of sent email receive a no-send notice. Mixed or malformed actions are rejected. Client and URL-length handling vary; no contacts lookup, attachments, CC/BCC or direct Gmail draft is implemented. Development identity `0.1.0-dev.6`.

Checks: `node --test browser/tests/*.test.mjs` (73 passed), `python3 browser/server/check_source.py` (48 files), `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (19 passed), and `python3 tools/check_repository.py` on staged changes. Browser smoke used only a synthetic loopback model, verified exact draft review, cancel and approve revealing a mail link, and did not open the mail app or use real accounts. Browser/device mail-client and provider acceptance remain outstanding. No installed runtime or native source changed.

Resume: inspect public main and the review branch, run the four README checks, and continue with reviewed calendar or richer document actions. Public research needs resolved-address validation and connection pinning; never copy native source or private guidance into this repository.


## Reviewed document and form proposals — 2026-11-12

Branch `codex/reviewed-document-drafts`, based on public main after PR 6, adds model-proposed editable documents and simple forms to Chat and Greenhouse. One validated `pea-doc` block opens the existing editable draft only by owner click; the existing PEA-folder connection, exact create review and membership checks still govern file creation. No automatic write, publication, sharing, alternate destination or background task. Proposed action bodies are tab-only and not restored as actions. Forms are limited to one long-answer question per line. Development identity `0.1.0-dev.7`.

An isolated browser with a synthetic local model verified the action stays hidden until completed, the proposed title and contents open in editable fields, and disconnected Google cannot create a file. No real Google account or model, microphone, native code or runtime was used. Checks: `node --test browser/tests/*.test.mjs` (75 passed), `python3 browser/server/check_source.py` (48 files), `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (19 passed), `python3 tools/check_repository.py` (61 indexed files). Live Google creation, forms, provider behavior and physical device acceptance remain open.

Resume: inspect this branch and public main, run the four README checks, then continue reviewed calendar or richer document features. Public research needs resolved-address validation and connection pinning. No native source or private guidance belongs in the public repository.


## Reviewed calendar event drafts — 2026-11-13

Branch `codex/reviewed-calendar-draft`, based on public main after PR 7, adds profile-bound event proposals for Chat and Greenhouse. A single validated `pea-calendar` block requires explicit UTC start/end; the owner sees both browser-local and UTC times before approval reveals an iCalendar download link. This creates no calendar event and sends no invitations. The owner separately downloads and imports the file. Untrusted action blocks remain hidden and tab-only, not restorable actions. No recurrence, attendees, calendar writes or background work. Development identity `0.1.0-dev.8`.

An isolated browser with a synthetic local model verified exact title, local and UTC time review, cancel, and approval revealing a data-backed download link; no real account, provider, download or calendar import was used. Parser tests cover dates, mixed blocks, bounds, and iCalendar injection/UTF-8 folding. Checks: `node --test browser/tests/*.test.mjs` (77 passed), `python3 browser/server/check_source.py` (48 files), `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (19 passed), `python3 tools/check_repository.py` (61 indexed files). Actual browser downloads and calendar import, device handling, provider quality, and direct Google writes remain unverified. No installed runtime or native source changed.

Resume: inspect public main and this branch, run the four README checks, and work on richer document tools or reviewed calendar integrations. Public research requires resolved-address checks and connection pinning; keep private native source and documentation outside the public repository.


## Encrypted library backup and restore — 2026-11-13

Branch `codex/encrypted-library-portability` is based on calendar PR 8, not yet on main. It adds explicit encrypted conversation-library backup and restore to an empty browser. A backup is a point-in-time copy containing both Work and Personal conversations, reviewed memories and introductions; it excludes provider keys, grants, documents and the separate board. Restore authenticates and schema-checks the ciphertext, requires the passphrase and inserts transactionally only if no library exists. It never merges or overwrites; tab-only work blocks the UI restore. Unlock and model-sharing permissions remain separate. Development identity `0.1.0-dev.9`.

Synthetic tests cover encrypted round-trip across independent stores, wrong passphrase, tamper, cancel and existing-record conflict. Browser smoke created an empty synthetic encrypted library, verified disclosure and a backup download link, and confirmed restore is blocked when a library exists. No real data, download, file-picker restore, provider or device acceptance was used. Checks: `node --test browser/tests/*.test.mjs` (79 passed), `python3 browser/server/check_source.py` (48 files), `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (19 passed), `python3 tools/check_repository.py` (61 indexed files). Actual backup download and restore in multiple browsers/devices remain unverified. There is no native archive import, automatic synchronization, recovery of forgotten passphrases or merge.

Resume: review PR 8 and this stacked branch, run the README checks, then perform synthetic real-browser download/restore acceptance and continue parity. Never copy native source or private guidance into public web.


## Gateway module serving and operator acceptance — 2026-11-13

Branch `codex/gateway-acceptance` is stacked on the encrypted backup PR 9. It fixes a gateway static allowlist gap: the parity app imported action, presence and conversation-library modules that the gateway did not serve, although the development static server did. The gateway still serves an explicit limited set; a synthetic HTTP regression test now traverses module imports from the actual browser entry point and checks each is served, while confirming server source and private docs remain blocked. Development identity `0.1.0-dev.10`.

A synthetic-token loopback instance of the actual gateway loaded the app in an isolated browser and opened Conversations & memory; no real model, provider, account or deployed service was used. The packaged `browser/docs/OPERATOR-ACCEPTANCE.md` compiles local, private GCP/AWS, model route, data boundary, Google/GitHub, backup/recovery, device, update and rollback checks. It explicitly states that the single-token gateway is not a public multi-tenant service. Checks: `node --test browser/tests/*.test.mjs` (79 passed), `python3 browser/server/check_source.py` (49 files), `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (20 passed), `python3 tools/check_repository.py` (62 indexed files). Real infrastructure, provider, device and backup download/import acceptance remain outstanding. No runtime deployment occurred.

Resume: review stacked PRs 8 and 9 and this branch, then run the checklist against an owner-selected private installation. Keep secrets and private test results out of the public repository; public hosting requires a separate multi-user architecture and review.


## Product scope clarification — 2026-11-13

The user clarified that the locally installed PEA Web package is the primary product and support target; operator-managed Docker hosting on GCP or AWS is documentation guidance only. No Dockerfile, image, managed cloud deployment or validation is claimed. The operator checklist now reflects operator-designed edge access rather than treating every cloud deployment as a PEA-hosted public service. The self-hosting guide describes the current loopback/network-namespace constraint and notes the Cloud Run ingress mismatch, with links to the relevant Docker, Google and AWS documentation. No gateway behavior, service deployment or cloud resources changed. The earlier gateway fix and acceptance checklist remain on `codex/gateway-acceptance` stacked on PRs 8 and 9.

Resume: review the current PR chain, prioritize a local installable package, and treat container hosting as an operator-owned documented path. Do not claim a ready Docker image, validated cloud deployment, per-user authentication or automatic isolation.


## Local foreground quickstart — 2026-11-13

Branch `codex/local-quickstart` is stacked on the gateway/acceptance PR 10. `browser/server/local.py` supplies explicit `setup`, `check` and foreground `start` commands for the existing loopback gateway on macOS/Linux. Setup creates a private token only on request and refuses existing tokens and unsafe configuration directories; check verifies the token without showing it; start does not install a service, launch a browser, download a model or contact a provider. Optional arguments choose a configuration directory, port, loopback upstream and existing HTTPS proxy origin. The helper is included in the web source/package allowlist. It does not provide a production signer, finished installer, dependency bundle or cloud deployment. Development identity `0.1.0-dev.11`.

Synthetic tests cover private token creation/non-overwrite, unsafe modes/symlink rejection, no token output, invalid upstream/port and foreground loopback startup with no real model. Checks: `node --test browser/tests/*.test.mjs` (80 passed), `python3 browser/server/check_source.py` (51 files), `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed), `python3 tools/check_repository.py` (64 indexed files). A development package was built from the clean commit, signed with a disposable synthetic key, verified, staged, activated and started in a temporary installation; the local UI and action module returned HTTP 200. No real installation, device, provider or persistent service changes were made. Production-signed installation and cross-platform acceptance remain open; use the operator checklist.

Resume: review PRs 8, 9, 10 and this stacked branch; run the README checks and test the local helper from an independently verified package in a disposable installation. Next packaging work includes a reviewed dependency/bootstrap approach and production signing, without bundling user secrets or enabling unattended service changes.


## MCD-aligned delivery direction — 2026-11-13

The owner wants PEA Web delivered and updated in the style of MCD: a local package with version/changelog maintained in GitHub, regular updates and a clear relationship to native feature work. Review of MCD's documentation shows separately managed user data, explicit version/release checks, signed staging, operator approval, restart/health verification and rollback. PEA's release manager already verifies signatures and supports staged activation/manual rollback; the browser checks published releases, but it does not yet fetch/install releases or perform MCD-style health-gated updates. No production release or signing key exists. This slice adds a read-only **Compare with main** button that does not pull, install, infer commit ancestry or claim a different commit is a verified release. No browser/host updater, unattended restart or service privilege is introduced. Native iOS and Web releases remain independently implemented; a Web update cannot promise automatic iOS feature/data synchronization.

Resume: build a tested local delivery/update workflow in reviewed slices, preserve independent signing and version/changelog identity, and add update/rollback operator tests. Until that work and device acceptance are complete, describe MCD-like updating as a goal, not an available feature.


## Reviewed story scope and completion criteria — 2026-11-13

Branch `codex/story-scope-parity` is stacked on local startup PR 11. A model-proposed story may carry optional bounded scope and completion criteria, so discussed requirements are not lost. The review shows the exact profile, title, scope and criteria before the existing Today board creates an Inbox story; cancellation changes nothing, and no dispatch, reminder or external action is implied. Title-only proposals remain accepted. Action blocks are hidden, bounded, credential-checked, profile-bound and not restored as actionable proposals. Development identity `0.1.0-dev.12`.

A synthetic model/browser check covered proposal display, cancel and approval, and confirmed the Today card retained both fields. Checks: `node --test browser/tests/*.test.mjs` (81 passed), `python3 browser/server/check_source.py` (51 files), `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed), `python3 tools/check_repository.py` (64 indexed files). The operator acceptance checklist includes real-provider/device follow-up. No real provider, account, user data, native source or installed service was used.

Resume: review the stacked web PR chain and continue parity, including direct reviewed calendar actions, richer documents, safe research and interoperable encrypted sync. Local package/update management remains a separate active product priority; do not represent unfinished capabilities as deployed.


## Encrypted board conflict protection — 2026-11-13

Branch `codex/board-conflict-protection` is stacked on story scope PR 12. The encrypted Today board now compares its saved revision and writes within one IndexedDB transaction; a competing tab cannot silently replace a newer board. A stale tab locks further edits but retains its unsaved view and requires explicit review before unlocking/replacing it with saved data. Legacy records without a revision are compared by their encrypted contents on first save, then gain a revision without changing the encryption schema. Lock/cancel invalidates in-flight key derivation and queued encryption where possible; an already-committing transaction cannot be guaranteed canceled. No automatic merge or cross-device sync. Development identity `0.1.0-dev.13`.

Synthetic unit tests cover competing writers, retry refusal, successful reload, legacy upgrade conflict and canceled unlock/save. An isolated browser with two same-origin tabs and a synthetic board confirmed the conflict notice, retained unsaved card, reload warning and recovery of the first tab's saved card. Checks: `node --test browser/tests/*.test.mjs` (84 passed), `python3 browser/server/check_source.py` (51 files), `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed), `python3 tools/check_repository.py` (64 indexed files). No real provider, account, personal task data, native code or installed runtime was used. Real-device and backup/restore acceptance remain on the operator checklist.

Resume: review the stacked web PR chain and continue feature parity; do not assume merging a Web change synchronizes native iOS releases or data. Keep local packaging/update work and safe research boundaries visible in future slices.


## Guided setup and mobile-first polish — 2026-11-13

Branch `codex/mobile-ui-polish` is stacked on PR 13 and is served by the separately running development preview. The pea icon SVG has a transparent background. Chat/Today/Greenhouse use simpler compact headers, a centered conversation layout and touch-friendly setup/memory cards. The connection wizard guides OpenRouter, an existing customer-owned local model or Google into the existing explicit connection controls; Back and View all settings retain access to the full configuration. Choosing a route sends nothing. The interview is a three-step optional flow with progress, back/forward navigation and the existing profile-bound save and model-sharing controls. Development identity `0.1.0-dev.14`.

Browser checks used synthetic answers only: verified OpenRouter/local/Google wizard navigation, full settings, interview steps and save, desktop and 390px mobile layout, light/dark styling and Today navigation. Actual OAuth, model calls, physical-device accessibility and external writes were not tested. Checks: `node --test browser/tests/*.test.mjs` (84 passed), `python3 browser/server/check_source.py` (51 files), `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed), `python3 tools/check_repository.py` (64 indexed files). The operator checklist records physical-device and connected-service follow-up. No iOS source or installed production service changed.

Resume: review this branch and stacked PRs 8–13; test the guided flows on a physical phone and continue parity and the local-package update workflow. The private tailnet preview is a temporary operator runtime, not a packaged release.


## Formatting and connection-key guidance — 2026-11-13

Branch `codex/interface-formatting-sweep` is stacked on PR 14 and is served by the separate live preview. It increases small text and touch targets, separates actions from rules and each other, standardizes theme-aware selects, and fixes the header at 320px. OpenRouter and fine-grained GitHub setup include explicit links to the owner's provider key pages and click-to-paste controls; Google Web OAuth client ID and the local token also support explicit paste, and Google origin can be copied. Clipboard text is read only on a user click, stays in the field, and is not sent until the existing connection action; canceled/changed setup discards pending paste. Browser permission/fallback handling is surfaced beside the field. Fish Audio and ElevenLabs are not yet Web voice integrations: the wizard links to their official key guides and explicitly says not to paste unused keys. No key is fetched, stored or provider connected automatically. Development identity `0.1.0-dev.15`.

Browser checks used synthetic clipboard text to verify Google and GitHub paste and feedback, guided routes, memory spacing, Today/Greenhouse navigation, light/dark dropdown colors and no horizontal overflow at 320px. No real clipboard secrets, accounts, inference or paid speech was used. Checks: `node --test browser/tests/*.test.mjs` (84 passed), `python3 browser/server/check_source.py` (51 files), `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed), `python3 tools/check_repository.py` (64 indexed files). The operator checklist includes physical-device and permission-denied clipboard testing. Physical-device acceptance and functional Fish Audio/ElevenLabs voice integrations remain open. No iOS source or production service changed.

Resume: review this branch and stacked PRs 8–14. Continue with customer-owned voice provider integrations, including explicit data/cost review, restricted credentials, provider-specific transport/CORS constraints and synthetic tests; do not imply key guides are functional connectors. Continue local packaging/update work and test on a physical phone.


## Review fixes — 2026-11-13

Branch `claude/review-fixes-2026-11-13`, from main after PRs 8–15 were merged (`439f913`). Development identity `0.1.0-dev.16`. From a code review of the merged stack:

- Reply cap raised from 384 to 3,500 tokens (`replyLimit` in `connections.mjs`; gateway ceiling 4,096). The old cap cut email and document action blocks off, so they were hidden and never offered for review.
- `captureThread` saves a placeholder for credential-like message text and clips over-long text; a full library reports a specific message. `memory-ui.mjs` no longer marks the vault failed for these cases and retries refused threads after a conversation is forgotten.
- Both vaults derive keys with 600,000 PBKDF2 rounds. Record `version` selects the work factor (1 = 310,000, 2 = 600,000); version 1 records, including legacy boards without a revision, are re-keyed with a new salt inside the existing compare-and-write on unlock. Backups carry their version. An older build refuses a version 2 record without changing it.
- The model-review approval identity includes the exact file excerpt, so every auto-attached PEA-created file is reviewed once. Calendar and mail snapshot contents are deliberately still covered by the per-setting approval.
- `app.mjs` refuses to start in a frame. The gateway adds `X-Frame-Options`, `Cross-Origin-Resource-Policy` and `Cross-Origin-Opener-Policy`, and closes a connection that has not delivered a complete request within 20 seconds (earlier review item L3). Routine client disconnects no longer print tracebacks.

Not done: L7, L8, DOM-level review tests, a source formatting pass, and the remaining parity items in `browser/docs/PARITY.md`. The reply cap and re-key paths were exercised with synthetic tests and a local browser only; no real provider, account or saved personal library was used.

Resume: rebase any branch based on the pre-squash stack commits onto main before continuing, since this branch edits `memory.mjs`, `taskboard.mjs`, `live-ui.mjs`, `app.mjs` and `gateway.py`.


## Interview continuity branch rebased — 2026-11-13

The previously uncommitted work described above is now committed on `codex/interview-continuity-design` and rebased onto main after the review fixes (`c3f4cb3`). Conflicts were in `memory-ui.mjs`, `taskboard.mjs` and the memory tests. The board backup added on this branch now carries the record version, so a board saved at 600,000 PBKDF2 rounds exports and restores correctly. The three new files are listed in `browser/WEB-FILES.json` so the public boundary scan passes.

Since then: `profile-transfer.mjs` writes format `pea-profile-export-v2` at 600,000 rounds and still reads the earlier 310,000-round `v1` label (the sections above describe the earlier value); development identity is `0.1.0-dev.17` with a changelog entry covering this branch. Device acceptance listed above is still outstanding. The branch was then merged to main in #17.
