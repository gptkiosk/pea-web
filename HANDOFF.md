# PEA Web working handoff

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
