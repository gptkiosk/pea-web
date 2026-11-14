# PEA Web working handoff

## Board backup browser round trip — 2026-11-13

The uncommitted encrypted board backup slice was verified end to end using two isolated loopback preview origins and synthetic data. A synthetic story was encrypted, downloaded, restored into the empty second origin and unlocked successfully. A second restore attempt was refused while a board existed. Temporary test servers were stopped and the downloaded synthetic file was removed. The test origins may retain their synthetic encrypted IndexedDB records in the in-app browser. No real board, model, account or microphone was used. Physical-device testing and iPhone compatibility remain open. The prior 94 Web and 24 server test results apply; this check changed no application code. Run the staged boundary scan before any commit. Resume: continue parity and independently agree an interoperable cross-app profile contract.

## Encrypted board backup — 2026-11-13

Uncommitted on `codex/interview-continuity-design`. The Today board can prepare a Web-only encrypted backup of both profiles' saved stories, including removed stories and results, using the board's existing passphrase. Restore verifies authenticated ciphertext and the board schema and atomically inserts only into an empty browser with no tab-only stories; it never merges or overwrites. Unlock separately after restore. Keys, permissions and the separate conversation library are excluded. There is no iPhone compatibility or automatic sync.

`node --test browser/tests/*.test.mjs` passed 94 tests, including synthetic backup round trip, wrong password, tampering, cancellation and concurrent/existing-storage refusal. `python3 browser/server/check_source.py` checked 52 files; `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` passed 24 with loopback; `git diff --check` passed. An isolated browser preview checked the backup/restore controls without real data; actual browser file download/restore and physical-device acceptance remain unverified. The temporary server was stopped. Run the staged boundary scan before any commit. Resume: test full file workflow in an isolated browser and continue cross-app interoperability design.

## Voice-friendly story refinement — 2026-11-13

Uncommitted on `codex/interview-continuity-design`. The owner can submit “edit task one” or an equivalent numbered story command from Chat or Today to open the existing story editor. The editor offers browser dictation into a separate draft; after review, the owner chooses which field to replace and explicitly saves the story. Dictation cannot silently replace an existing draft; oversized replacements are rejected. Closing the editor stops recognition. Browser recognition may use an online service, and commands are reviewed before submission. No automatic model action, task dispatch or external write is added.

An isolated loopback preview created a synthetic task, opened it using a typed command, applied a synthetic replacement draft and verified the saved title. The temporary server was stopped; no microphone, real board or provider was used. Checks: `node --test browser/tests/*.test.mjs` (93 passed); `python3 browser/server/check_source.py` (52 files); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed with loopback); `git diff --check` passed. Physical microphone and mobile acceptance remain open. Run the staged boundary scan before committing. Resume: continue Web parity, including cross-app profile interoperability and device voice validation.

## Edit captured stories — 2026-11-13

Uncommitted on `codex/interview-continuity-design`. Owners can edit a non-running, non-removed story's title, scope and completion criteria from its Today card. Profile/story identity and snapshot are rechecked at save; invalid or credential-like input is rejected without mutation. Existing output remains unchanged and is labeled as based on the earlier story. Editing does not dispatch work; existing encrypted board and conflict handling apply.

An isolated loopback preview created and edited a synthetic story and verified the revised scope and criteria on the board; the temporary server was stopped. No live model, real board, account or microphone was used. Checks: `node --test browser/tests/*.test.mjs` (93 passed); `python3 browser/server/check_source.py` (52 files); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed with loopback); `git diff --check` passed. Physical-device and encrypted-board editing acceptance remain open. Run the staged repository boundary scan before committing. Resume: continue Web parity; profile interoperability and actual-device voice remain unverified.

## Greenhouse voice screen — 2026-11-13

Uncommitted on `codex/interview-continuity-design`. Greenhouse has a Voice chat entry using the existing reviewed speech screen. The screen names the current workspace/Greenhouse role, sends to the Greenhouse conversation and selected role, and optionally reads its completed response. Voice drafts remain separate by profile and workspace within the tab and are cleared on profile change/page disposal. Existing typed drafts block voice submission instead of being overwritten. No new model route, provider, automatic listening or locked-screen support is added.

An isolated browser preview submitted a synthetic typed transcript into Greenhouse without a connected model and verified a separate unsent Greenhouse voice draft did not appear in Chat. No microphone, real provider or private content was used. `node --test browser/tests/*.test.mjs` passed 92; `python3 browser/server/check_source.py` checked 52 files; `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` passed 24 with loopback; `git diff --check` passed. Actual microphone/audio, live Greenhouse provider, role switching and physical mobile remain acceptance work. Run the staged boundary scan before committing. Resume: continue parity, including interoperable encrypted profile transfer and real-device voice testing.

## Suggested navigation end-to-end check — 2026-11-13

The uncommitted `codex/interview-continuity-design` navigation slice was checked in an isolated browser against a temporary loopback-only synthetic OpenAI-compatible model and gateway. A synthetic Chat request passed the normal local-model sharing review, the complete response displayed an Open Greenhouse button, and clicking it selected the Greenhouse tab without opening a file or starting a task. The temporary server was stopped. No real model, account, private profile or microphone was used. Real-provider compliance with the navigation proposal format and physical-device behavior remain unverified. Automated parser and gateway checks from the prior entry remain the applicable test evidence; run the staged boundary scan before any commit. Resume: continue independently testable Web parity work and validate real-device behavior; cross-app profile transfer remains unimplemented.

## Suggested workspace navigation — 2026-11-13

Uncommitted on `codex/interview-continuity-design`. A completed model reply can offer one owner-clicked navigation button for Chat, Today or Greenhouse. The parser rejects mixed/multiple blocks, incomplete JSON, external destinations and additional fields. The button checks the originating profile and conversation and refuses while a request is active. It does not open files, change permissions or run tasks, and is not restored as an actionable proposal. Existing direct owner navigation commands continue to work without a model request.

Checks: `node --test browser/tests/*.test.mjs` (92 passed including strict navigation parser cases); `python3 browser/server/check_source.py` (52 files); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed with loopback); `git diff --check` passed. No real model, provider, microphone, personal content or native code was used. Actual model proposal rendering/button activation still needs a synthetic end-to-end browser check, and provider behavior is unverified. Run the staged public boundary scan before a commit. Resume: verify proposal UI with a synthetic model and continue independently testable parity slices; cross-app profile transfer remains unimplemented.

## Device voice and speed — 2026-11-13

Uncommitted on `codex/interview-continuity-design`. Talk with PEA now lets the owner select a browser/device speech voice, set speed from 0.8× to 1.25× and preview it. Read reply and interview question playback use the selected voice; quiet-hour delivery still applies its existing rate and pitch adjustment. Only validated voice URI and rate are stored on this browser, shared across Personal and Work; no provider credentials or personal content are stored there. Missing voices fall back to the device default. This does not add a cloud voice integration or locked-screen voice.

The separate browser preview displayed the voice picker, available device voices and speed without playing audio or changing a setting. `node --test browser/tests/*.test.mjs` passed 91 tests including preference validation and storage-failure checks; `python3 browser/server/check_source.py` checked 52 files; `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` passed 24 tests with loopback; `git diff --check` passed. Actual audio output, platform-specific voices and mobile/AirPods behavior remain unverified. Run the staged repository boundary scan before committing. Resume: continue parity on independently testable Web slices, with cross-app profile transfer still requiring an agreed contract and native implementation.

## Interview question playback and dictation — 2026-11-13

Uncommitted on `codex/interview-continuity-design`. Each interview field has a Read question control using the device voice and a Dictate answer control using the existing explicitly disclosed browser recognizer. Dictation is limited to empty fields and refuses to overwrite an answer added while listening. Closing the interview or changing steps/profile stops recognition; question playback stops on close and uses the existing tab/page cancellation. The owner reviews and saves manually. This is not continuous voice or native interview parity; browser recognition may use an online service.

Isolated preview verified the question controls and speech consent without enabling the microphone; physical microphone, speech service, playback and mobile acceptance remain. Checks: `node --test browser/tests/*.test.mjs` (89 passed); `python3 browser/server/check_source.py` (52 files); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed with loopback); `git diff --check` passed. Run the staged boundary scan before committing. No provider account, real microphone, real profile or native code was used. Resume: cross-app profile interoperability and reliable voice testing remain separate work.

## Reviewed profile import choices — 2026-11-13

Uncommitted on `codex/interview-continuity-design`. Profile import defaults to filling missing answers only, preserving existing nonempty answers. An explicit alternate mode replaces all fields, including with blanks. A local review lists each changed field's before/after values before applying; unchanged imports make no update. Invalid profiles, mode changes and library/profile changes fail closed. The file remains a Web-only encrypted snapshot; no iPhone import or automatic sync is implemented.

Checks: `node --test browser/tests/*.test.mjs` (89 passed, including synthetic legacy/expanded imports and replacement with blanks); `python3 browser/server/check_source.py` (52 files); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed with loopback); `git diff --check` passed. Isolated preview verified the import UI and safe default without real accounts or data. Full browser file import/review, physical device testing and the staged repository scan remain before release/commit. Resume: independently agree and implement an interoperable cross-app transfer contract; avoid implying compatibility until both apps and synthetic cross-platform vectors are tested.

## Profile-only encrypted snapshots — 2026-11-13

Uncommitted on `codex/interview-continuity-design`. Under Past chats & memory, the owner can export the active Personal or Work interview and persona to a passphrase-encrypted Web-only file, then import and explicitly review replacement in a matching Web profile. The snapshot excludes the other profile, history, keys and permissions; there is no merge, automatic sync or iOS compatibility. `profile-transfer.mjs` uses AES-256-GCM, PBKDF2-SHA256 at 310,000 iterations, random salt/IV, authenticated format marker and strict size/schema checks. A separate export passphrase is never stored. Existing library migration and consent boundaries remain. The local gateway's fixed asset list and release allowlist include the module; the development preview watcher restarted its server to load the allowlist.

Checks: `node --test browser/tests/*.test.mjs` (88 passed, including synthetic profile round trip and tampering); `python3 browser/server/check_source.py` (52 files); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed with loopback access); `git diff --check` passed. `python3 tools/check_repository.py` passed with the new module temporarily staged and was then unstaged. A separate preview verified the export controls and prepared a synthetic encrypted file; actual download/import and physical-device acceptance remain open. No real profiles, provider accounts or native code were used. Resume: conduct independent compatibility design and implementation with the iPhone maintainer before claiming cross-app transfer; verify review and conflict behavior with synthetic browser integration tests and run the staged boundary scan before a commit.

## Expanded interview — 2026-11-13

Uncommitted on `codex/interview-continuity-design`, alongside prior Web changes. The three-step Web interview now asks the 13 owner-authorized standard questions separately and retains legacy Web fields and persona. The assistant's fictional home is a new field; the older owner-home answer remains distinct. Local library schema 2 accepts the expanded interview, while schema 1 remains readable. Saving to an unlocked schema 1 library asks the owner to review the upgrade and recommends an encrypted backup before rollback; older Web versions cannot open schema 2. Profile boundaries, sharing review and the 3,200-character introduction limit remain. No native-format import, cross-device synchronization or native wellbeing fields are implemented.

Tests: `node --test browser/tests/*.test.mjs` (87 passed including synthetic schema upgrade/encrypted round trip); `python3 browser/server/check_source.py` (51 files); `python3 -m unittest discover -s browser/server -p 'test_*.py' -q` (24 passed with loopback access); `git diff --check` passed. An isolated browser preview verified the three steps and a synthetic tab-only save. An actual encrypted-library upgrade, rollback and physical device still require owner acceptance; no account, microphone, real interview answer or native source was used. Run `python3 tools/check_repository.py` on staged paths before any commit. Resume: implement interoperable, explicitly reviewed encrypted profile transfer with a versioned cross-app contract and synthetic fixtures, without touching private native source in this repository.

## Voice entry and compact cards — 2026-11-13

Uncommitted on `codex/interview-continuity-design`, alongside the prior uncommitted interview and navigation work. Chat offers a prominent voice screen with a microphone control, editable transcript, explicit Send and optional device-voice playback. Browser/OS recognition can process audio online. Recognition needs explicit notice and user action and stops on close, hidden page or profile/tab change; it does not capture continuously or support locked-screen use. Permission-denial guidance is visible. A typed draft blocks voice submission rather than being overwritten. Mobile setup cards have reduced spacing. Existing model disclosure remains in force; no new model or speech provider is connected.

An isolated browser preview opened the voice interface without starting the microphone or using an account. Physical phone, microphone, permission denial in a real browser, AirPods, speech quality and provider response playback remain operator acceptance work. Run the four README checks, including loopback access for server tests; verify the full current branch and staged set before committing. Resume: finish the prior interview migration and cross-app contract; continue toward continuous, low-latency voice only after browser support, privacy and provider costs are established.

The composer also has a direct Voice chat button and styled Read reply / Stop controls. Voice setup help shows the exact current origin and explains browser/site, operating-system and speech-service permission paths; it does not claim to diagnose which one failed or change permissions. The voice screen and help were verified in an isolated preview, without capturing audio or changing browser permissions.

The composer actions and voice microphone now use consistent theme-colored inline SVG icons and matching button styling. An isolated dark-theme desktop preview verified the composer. This is a source change; physical mobile and light-theme acceptance remain outstanding.

The header subtitle now uses the app body font with the initials P, E and A highlighted in theme green. The dark desktop preview preserves the complete accessible brand text; physical mobile and light-theme acceptance remain outstanding.

## Interview continuity and navigation groundwork — 2026-11-13

Uncommitted work on `codex/interview-continuity-design`: the interview now states whether the browser library is unlocked for encrypted saving and explicitly says iPhone transfer is not available. `browser/docs/PROFILE-CONTINUITY.md` records the owner-authorized question wording and proposed privacy and conflict requirements, without personal answers. The actual Web wizard still has its earlier grouped questions; adding the matching individually stored questions needs a versioned library migration, preservation of existing entries (especially the older owner-home versus assistant-home distinction), rollback behavior and tests. Native import/export and cross-device sync are not implemented. No iPhone files were modified.

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

Open before this branch is proposed: `profile-transfer.mjs` derives its key with 310,000 rounds while the vaults now use 600,000; the development version and changelog have no entry for this work; the browser and device acceptance listed above is still outstanding. The branch is local only and has not been pushed.
