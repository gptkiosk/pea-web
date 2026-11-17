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

## First release candidate prepared — 2026-11-17

**Branch `release/0.1.0-rc.1`, version `0.1.0-rc.1`, channel `prerelease`.** The owner chose a pre-release for the first signed release, because nothing has been accepted against real accounts, keys or a model.

- `browser/release.json`: version `0.1.0-rc.1`, channel `prerelease`. `browser/CHANGELOG.md`: a dated entry that says what a pre-release does and does not claim.
- No code changed.

Steps after this is merged, each needing the owner's go-ahead where it publishes something:

1. Tag the merge commit `v0.1.0-rc.1` and push the tag (the builder requires the tag to be exactly the build commit).
2. From a clean checkout of that commit: `python3 browser/server/releases.py build --output <folder outside the repository>`. It writes `pea-web-0.1.0-rc.1.tar.gz` and `pea-web-0.1.0-rc.1.manifest.json`.
3. The owner signs the manifest on their machine: `ssh-keygen -Y sign -f <their private key> -n pea-release <folder>/pea-web-0.1.0-rc.1.manifest.json`, which writes `.manifest.json.sig`.
4. Verify the signature here against `browser/server/allowed_signers` before anything is published.
5. Publish a GitHub pre-release for the tag with the three files.
6. Next change: development version `0.1.0-rc.1.dev.1` on the `development` channel, and a signed channel in `update.py`.

Known gaps:

- `0.1.0-rc.1` sorts above every `0.1.0-dev.N`, so later development builds are numbered `0.1.0-rc.1.dev.N`, which sorts between `rc.1` and `rc.2`.
- Local runs of the whole browser suite on this Mac now fail one or two unrelated tests in some runs with "The browser did not answer" or a timeout, a different test each time (seen 2026-11-17 in three of five runs; CI passed). There are about 25 test files, each starting its own Chrome, run side by side. Limiting how many run at once (`node --test --test-concurrency=N`) is the likely remedy and has not been tried.
- While `main` carries the `prerelease` channel (between this merge and step 6), an installed checkout following `main` reports itself as a pre-release build.

## Release signer published — 2026-11-17

**Branch `feature/release-signer`, development identity `0.1.0-dev.54`.** The owner created a dedicated Ed25519 release key on their own machine and sent only the public line and its fingerprint. The private key was never seen here.

- `browser/server/allowed_signers`: one line, `pea-release namespaces="pea-release" ssh-ed25519 …`. Fingerprint `SHA256:4r7cfvtmy7paakJoPFEqAtxI6EP6Huol+A13TVV43J8`, recomputed here from the public key and matching what the owner sent.
- `browser/docs/RELEASES.md`, `README.md`, `PARITY.md`, `DEPENDENCIES.md`: say the signer exists and no signed release is published.
- Tests: 2 in `browser/server/test_releases.py` (`PublishedSigner`): the file names exactly one Ed25519 key whose fingerprint is the documented one, and a signature by any other key is refused against it.

Known gaps:

- No signed release exists. The fingerprint is published only in this repository; the owner should also state it somewhere independent.
- `update.py` still follows the unsigned development channel.
- If the key is ever replaced, the file, the fingerprint in the guide and the test constant change together in one reviewed pull request.

Next action: the owner chose a pre-release; see the section above.

## Update command for an installed checkout — 2026-11-17

**Branch `feature/update-command`, development identity `0.1.0-dev.53`.** Second half of the owner's request for updates that keep their setup. Owner's choices: one command first (no button in the app, so the gateway still cannot install anything); development updates now, signed releases once the owner has made the signing key.

- `browser/server/update.py`: `check`, `apply`, `rollback`. `inspect` (top of a PEA Web checkout, `origin` is the official repository from its own `release.json`, no tracked changes), `find_target` (fetches `main`, refuses a diverged copy, lists up to 20 commit subjects), `healthy` (`/api/build-info` on loopback must give the exact commit and version with `modified` false), `launchd_restart` (`launchctl kickstart -k` on one loaded job of this user; refuses beforehand if not loaded), `move` (`git reset --keep`, restart, health check, put back and restart on failure), `record`/`last` (`~/.config/pea/updates/last-update.json`, mode 600 in a 700 folder). No arbitrary command is ever run: only `git` and `launchctl` with fixed arguments.
- `browser/docs/RELEASES.md`: "Updating a checkout on the development channel".
- Tests: 8 in `browser/server/test_update.py`, against throwaway repositories and a stand-in PEA on loopback, with the restart injected: refusals, finding the target, a kept update, a failed health check put back, a restart failure put back, a local change never overwritten, the health rule, and the command's own refusals. No network and no real service.

Known gaps:

- No signature is checked. That is the owner's stated interim choice; `update.py` says so each time. The signed path needs, in order: the owner creates a dedicated Ed25519 release key and commits its public half as the allowed signer; a first tagged release is built with `releases.py build`, signed by the owner and published on GitHub; then `update.py` gains a `stable` channel that takes the newest signed release, verifies the manifest signature and that the tag is the signed commit, and only then moves.
- macOS launchd only. On another system the owner updates by hand.
- Not run by CI against a real service, and until this change is merged it has not been run against the owner's installed copy.
- If the new version changes a served-file list or server code, the restart covers it. There are no data migrations to run; a future change that needs one must not ship through this path unnoticed.
- The operator's own label, folders and addresses are not in this repository and must stay out of it.

Next action: done; see the section above.

## Remembered choices in Connections — 2026-11-17

**Branch `feature/remember-choices`, development identity `0.1.0-dev.52`.** The owner asked for settings that remain across updates, "like done with MCD". Owner's choices: remember choices but never secrets; a one-command updater first (next pull request); development updates now and signed releases once the owner has made the signing key.

- `browser/preferences.mjs` (pure): the fixed list. Per profile (`personal`, `work`, `blended`): `chat`, `collaboration`, `coding` model ids, `role`, `shareIntro`, `shareCalendar`, `shareMail`, `shareTodos`, `sharePeaFiles`, `githubRepo`. For all profiles: `google.client` and the three Google boxes. `validChoices` rebuilds from that list, so nothing else can be written; anything that looks like a credential is dropped. Storage `localStorage` `pea-connections-v1`.
- `browser/live-ui.mjs`: a profile's session starts from its remembered choices; `remember()` runs after each change of a listed choice; the Google inputs are filled at start; `#choices-forget`. `allowData` is deliberately not on the list and starts off in every tab. The image model is not remembered (its list is loaded separately).
- Not changed: keys, tokens and the Google sign-in stay in tab memory; the sharing approval is still per tab, so the first message after a reload is reviewed.
- Tests: 2 unit tests in `browser/tests/preferences.test.mjs`; 2 browser tests in `browser/tests/dom/preferences.test.mjs` (choices return after a reload and reconnect, the connection token is never saved, sharing is still reviewed, choices are per profile, forgetting works). Assets now 53.

Known gaps:

- The chosen PEA Drive folder is not remembered; it is chosen again after Google sign-in.
- A remembered model that the provider no longer lists shows as not chosen, with no notice.
- Choices applied through "Review & apply choices…" (shared configuration) are saved only at the next change.
- Forgetting removes the saved copy; a later change in the same tab saves that tab's choices again.

Next action: done in the section above.

## Portable backup, part 2: Move this profile — 2026-11-16

**Branch `feature/backup-buttons`, development identity `0.1.0-dev.51`.** Owner's choices as in part 1.

- `browser/backup-ui.mjs`: `installBackup({ profile, review, isBusy, notice, memory, todos, canon, days, decks })` returns `{ render, profileChanged }`. Back up: passphrase, `gatherBackup`, review (`describeBackup`), `sealBackup`, a blob link. Bring in: `openBackup`, profile must match, `planRestore`, review (`describeRestore`), then a check that what is here is still what was compared, then the library first and the other stores after. A failure part-way says what was already added.
- Store methods added for this: `memory-ui` `portable()` and `bringIn({ introduction, memories })`; `memory.mjs` `bringInMemories` and `broughtInTitle`; `todos-ui` `portable()` and `bringIn(list)`; `canon-ui` `bringIn(cards)`; `days-ui` `entries()` and `bringIn(lines)`; `decks-ui` `all()` and `bringIn(list)`. Each validates the result with its own saved-copy rule and assigns new local ids.
- `browser/index.html`: `#portable-section` in the library dialog. Assets now 52.
- Tests: 1 more unit test (brought-in memories) in `browser/tests/backup.test.mjs`; 3 browser tests in `browser/tests/dom/backup.test.mjs`. They seal a file in the test with `backup.mjs`, bring it in through the page, back the profile up from the page and open that file in the test: the contents match what was brought in. Checked by removal: skipping the review fails all three; accepting another profile's file fails the profile test; adding a differing item fails a unit and a browser test.

Known gaps:

- The iPhone app has not adopted the format, so this moves a profile between browsers only. Never tried between two real browsers on two devices; the tests use one browser with separate contexts.
- Adding to five stores is not one transaction. The library goes first because it is the only step expected to refuse; if a later step failed, earlier ones stay and the message says so. Bringing the file in again adds only what is missing.
- With the saved board locked, to-dos are left out of a backup and not brought in, and the review says so. With 40 conversations already saved, memories are not brought in.
- Answers and memories brought in while encrypted saving is off live in the tab only; the note says so.
- A brought-in history card changes the card set, so the next Chat message asks for the sharing review again. Sharing switches, the notes switch for her days, and voice or model choices do not travel.
- No file in the PEA Drive folder, no automatic sync, no replacing or deleting from a file.

Next action: the parity sequence in `browser/docs/PARITY.md` is complete on the Web side. What remains is the owner's: acceptance tries with real accounts, keys and a model; the iPhone app adopting the shared formats; the 0.1.0 acceptance run and signing key.

## Portable backup, part 1: the format — 2026-11-16

**Branch `feature/portable-backup`, development identity `0.1.0-dev.50`.** Owner's choices: Web defines the shared format (the iPhone's own backup format is not available to read); one file per profile carrying interview answers and memories, to-dos, her history and days, and deck projects; combining adds what is missing and never changes or removes; the file is downloaded and chosen by hand. This pull request is the rules, the test files and the contract page only. Nothing in the app calls it yet.

- `browser/backup.mjs` (pure): `backupFormat` (`pea-backup-v1`), `backupLimits`; `validBackup(content)` (exactly eight fields; each item is checked by the app's own rule for its saved copy: `validIntroduction`, `validTodo`, `validSavedCanon`, `validSavedDays`, `validSavedDecks`); `gatherBackup({...})` (app shapes to the travelling shape, one profile, no ids); `sealBytes`, `sealBackup`, `openBackup` (PBKDF2-SHA-256 600,000 rounds, AES-256-GCM, format name authenticated; one refusal message for every fault); `planRestore(current, incoming, { now, memoryRoom })` (additions only, with `same`, `differ`, `noRoom`, `skipped` per section); `describeBackup`, `describeRestore`.
- `browser/tests/fixtures/BackupFixtures.json`, version 1: 5 accepted and 36 refused files. It was produced by a script kept outside the repository, from `backup.mjs` with fixed salts; the vectors therefore prove the reader agrees with the writer, not that an independent implementation agrees with either.
- `browser/docs/CONTRACTS.md`: "The backup file". `browser/tests/fixtures/README.md` updated.
- Tests: 3 contract tests in `browser/tests/backup-contract.test.mjs`, 4 unit tests in `browser/tests/backup.test.mjs`.

Known gaps:

- No buttons. Part 2 must gather from, and add to, five stores: the encrypted library (answers and memories, which needs the library unlocked and a conversation to hold brought-in quotes, because a saved memory must cite a saved message), the to-do store, and the three `localStorage` stores for cards, lines and decks.
- The iPhone app has not seen this format. Nothing here is "iPhone-readable" until its own change adopts it; until then the file moves a profile between browsers only.
- No second implementation has checked the fixtures. No file in the PEA Drive folder, no automatic sync, no merge beyond adding.
- A brought-in memory keeps its expiry from the other device; an expired one is left out.

Next action: done in the section above.

## Deck projects — 2026-11-16

**Branch `feature/deck-projects`, development identity `0.1.0-dev.49`.** Owner's choices: I design it for Web (the iPhone's behavior was not described and its source was not read); a finished deck is a file to download, not Google Slides.

- `browser/decks.mjs` (pure): `deckLimits` (12 projects a profile, 3 to 10 slides, title 90, brief 600, purpose 160, 5 points of 160, notes 500); `deckTitle`, `deckBrief`, `slideCount`; `outlinePrompt`, `outlineRequest`, `parseOutline(raw, count)` (rows of exactly `title,purpose`; at least 3); `slidesPrompt`, `slidesRequest`, `parseSlides(raw, outline)` (rows of exactly `n,bullets,notes`; every slide needs a point; titles always from the outline); `editedSlide` (the owner's edit, refused not cut); `validSavedDecks`, `deckWritten`; `deckHTML(deck)` (every word escaped, no script, its own `default-src 'none'` rule, a slide per screen and per printed page); `deckFileName`; the four `describe…` texts. `canon.mjs` now exports `objects`, the scanner both use.
- `browser/decks-ui.mjs`: `installDecks({ profile, review, run, compose, isBusy })` returns `{ render }`. Storage `localStorage` `pea-decks-v1`, one list holding both profiles' projects; only the current profile's are shown, none in Blended. Each model step is `compose` (reviewed) then a second review before keeping. The download link is a `data:` address rebuilt on each draw.
- `browser/index.html`: `#decks-section` card in Greenhouse under the collaboration card. `browser/styles.css`: `.deck-list`, `.deck-slide`. `browser/app.mjs`: wiring and redraw on profile change. Assets now 50.
- Tests: 7 unit tests in `browser/tests/decks.test.mjs`; 4 browser tests in `browser/tests/dom/decks.test.mjs`. Checked by removal: no escaping in the file fails a unit and a browser test; keeping the outline without its review fails all four browser tests; showing every profile's projects fails the profile test.

Known gaps:

- No real model has written an outline or slides. Whether models keep to the JSON shape and the "no invented figures" rule is untested; PEA checks shape and length, not truth.
- Projects are outside the encrypted library, so Work deck text sits unencrypted in this browser's storage and is not cleared by locking the library. Moving them into the library is a possible follow-up.
- The file is plain: one built-in look, no images, charts, themes or slide numbers in print. No Google Slides or PowerPoint file. Navigation is scrolling with snap, with no script.
- Slides cannot be added or reordered, only renamed, rewritten or deleted. The model rewrites all slides at once, not one.
- A reply cut off by the 3,500-token cap loses its last slides, and then nothing is kept; ten wordy slides could reach it.
- English-only wording in the prompts and the file.

Next action: started in the section above.

## Voice providers, part 2: settings and read-aloud — 2026-11-16

**Branch `feature/voice-read-aloud`, development identity `0.1.0-dev.48`.** Owner's choices as in part 1: through the gateway, one spending review per tab, on failure say why and stay silent.

- `browser/speech.mjs` (pure): `speechLimits` (3,000 characters, counted as code points like the gateway), `speechProviders` (name, dated price quote, what the provider keeps, key advice), `validSpeechKey`, `validVoiceId`, `speechChoice` (what is saved: provider, voice id, name; never a key), `voiceRows`, `speechText` (refuses over-long text; never cuts it), `speechFailure(provider, status, reason)`, `describeSpeechReview`.
- `browser/speech-ui.mjs`: `installSpeech({ voices, speak, localKey, profile, review, notice })` returns `{ render, read(text), stop(), chosen() }`. Key in a variable only; choice in `localStorage` `pea-provider-voice-v1`. Approval is per profile, provider and voice, for the tab; changing provider, key or voice clears it. Changing provider clears the key. Playback is Web Audio (`decodeAudioData`), so the page's content rules did not change. `#provider-voice-note` carries `data-state` `idle`, `asking` or `playing`.
- `browser/local-model.mjs`: `voices(key, provider, providerKey)` and `speak(key, { provider, key, voice, text }, signal)`; the two paths were added to its fixed list.
- `browser/app.mjs`: `stopVoices()` (device speech and provider speech) is used wherever speech was cancelled; `playReply` hands the text to `speech.read` when a provider is chosen, and never to the device voice afterwards; the long-reply choice no longer loses its selection to a late close report. `browser/index.html`: the Voice providers group. Assets now 48.
- Tests: 8 unit tests in `browser/tests/speech.test.mjs`; 4 browser tests in `browser/tests/dom/speech.test.mjs` using `startStack(..., { voices })`, which starts a stand-in provider (`startFakeVoices`, `shortSound`) and passes `--speech-test-port` to whichever gateway is under test. The test browser now starts with sound allowed without a click. Checked by removal: skipping the review, falling back to the device voice on failure, and keeping the key across providers each fail tests.

- Test setup: `startGateway` in `browser/tests/dom/harness.mjs` now tries again on another port, up to three times, when a gateway does not start, and the error carries the gateway's own last words. Test files run side by side and could be handed the same free port; that failed the Swift job on main once (run for `9e8965c`, re-run afterwards) and three local runs on 2026-11-16. The cause is inferred from the symptom, not observed directly.
- Test setup: the same start check now reads the page it fetches to the end. `index.html` passed 64 KB in this change (65,431 to 67,115 bytes), and an unread answer of that size made every browser test file fail on CI's Node 22.23.4 with an internal `assert(!this.paused)`; it did not reproduce on Node 22.22.3 locally. The gateway's output is captured in a file in the run's temporary folder.

Known gaps:

- No real key and no real provider sound. The stand-in returns a short WAV labelled `audio/mpeg`; real MP3 from either provider has not been played through this path.
- Sound starts only when the whole answer has arrived. Speed and pitch settings for the device voice do not apply to a provider voice.
- If the browser holds sound back (no click on the page yet), PEA says so after the request, which may already have been billed.
- Prices in the review are a dated quote typed into `speech.mjs`; they will go stale and need the provider's page read again before any change.
- The voice choice is one per browser, not per profile; the approval is per profile.
- One voice request at a time across the whole gateway; Fish Audio lists only the key's own voices.
- The voice-led conversation screens use Read aloud after a reply, so they follow the same path; this was not exercised with a provider voice in tests.

Next action: done in the section above.

## Voice providers, part 1: speech in both gateways — 2026-11-16

**Branch `feature/voice-transports`, development identity `0.1.0-dev.47`.** Owner's choices: both providers go through the owner's gateway; one spending review per tab; on failure say why and stay silent (no change of voice). This pull request is the gateway half only. Nothing in the browser calls it yet. The iPhone source was not read.

Why the gateway: checked on 2026-11-16 with unauthenticated preflight requests, ElevenLabs answers browsers from any origin, and Fish Audio's `/v1/tts` answers a preflight with 404, so a page cannot call it. The owner chose one design for both.

- `browser/server/contract.json` `speech`: paths `/v1/speak` (`provider, key, voice, text`) and `/v1/voices` (`provider, key`); 3,000 characters of text; key and voice patterns; 6 MB of audio, 2 MB of list, 100 voices, 60 seconds, one request at a time; providers `elevenlabs` (`api.elevenlabs.io`, model `eleven_flash_v2_5`) and `fish` (`api.fish.audio`, model `s2.1-pro`) with their fixed paths and key header.
- `browser/server/gateway.py`: `validate_speech`, `speech_voices`, `Gateway.speech_call` (HTTPS with the default certificate checks, one clock for the whole request), `SpeechRefusal`; answers audio as `audio/mpeg` or `{voices: [{id, name}]}`; a provider failure is 502 with `reason` `key`, `credit`, `busy`, `voice` or `failed`; 429 when one is already running. `--speech-test-port PROVIDER=PORT` for tests only.
- `mac/Sources/PEAGatewayCore/Speech.swift` (`SpeechRules`: `validate`, `outbound`, `voicesIn`, `reason`) and `Gateway.swift` (`Client.speak`, `Gateway.outbound`, `speechTestPorts`). The session's challenge handler now lets the system check a server's certificate and still refuses every request for credentials. `pea-gateway` takes `--speech-test-port`.
- Tests: 6 new conformance tests in `browser/server/conformance/run.py` with a stand-in `Voices` server (33 tests; both gateways pass); 1 Python unit test; 3 Swift unit tests (20 in `RulesTests`).
- Checked once by hand, not in any suite: each gateway asked each real provider for voices and speech with a made-up key, and all eight answers were the plain "rejected this key" refusal. That exercises the real HTTPS path and nothing else.

Known gaps:

- No real key has been used, so real audio has never come back through either gateway. The request bodies follow the providers' references as read on 2026-11-16 (ElevenLabs convert and voices; Fish Audio text-to-speech and model list). Neither reference states the audio content type; the gateways accept `audio/mpeg`, `audio/mp3` and `application/octet-stream`.
- Fish Audio's list shows only the key's own voices (`self=true`); a public voice needs its id typed in. The reference does not say outright that `reference_id` is the model's `_id`.
- Prices as listed that day, for the review text in part 2: ElevenLabs Flash $0.04 per 1,000 characters; Fish Audio `s2.1-pro` $15 per million UTF-8 bytes. Neither provider's pages read said whether API text is used for training; ElevenLabs keeps history unless an enterprise zero-retention mode is used.
- ElevenLabs' reference says not to expose a key in client-side code. Here the key is the owner's own, typed into their own tab and sent to their own gateway; part 2 should recommend a key limited to text-to-speech with a credit limit, which ElevenLabs documents.
- The model per provider is fixed in the rules file. One voice request at a time for the whole gateway.
- Audio is buffered whole, not streamed, so a long reply starts speaking only when all of it has arrived.

Next action: done in the section above.

## Changing and removing PEA's own events — 2026-11-16

**Branch `feature/calendar-own-changes`, development identity `0.1.0-dev.46`.** Second of the two calendar pull requests. The iPhone source was not read.

- `browser/connections.mjs`: the calendar route also allows `/events/{id}` for ids matching `eventId`; `call()` takes `match` (sent as `If-Match`) and returns nothing for an answer with no content; `ownEvent(e, profile)` (the rule for what PEA may touch), `Services.ownEvents` (list by `privateExtendedProperty` for mark and profile, 90 days, 12 at most), `ownEventNow` (fetch one, refuse if not PEA's), `changeEvent` (PATCH title and times, `If-Match`, 412 and 404/410 explained), `deleteEvent` (DELETE, `If-Match`, 410 counts as removed).
- `browser/actions.mjs`: `calendarEdits(raw)` (one `pea-calendar` block, `calendar_change` with exactly `ref,title,start,end` or `calendar_delete` with exactly `ref`; ref is `e1` to `e99`), `calendarEditGuidance`, `claimsCalendarEdit`.
- `browser/live-ui.mjs`: `s.ownEvents` filled by `refreshToday` with refs in order; `sharedOwnEvents()` (shared calendar switch on, permission granted, snapshot under 15 minutes old, 8 at most) is both what the model is sent and what a ref can mean; the guidance is added only then; the first message carrying them asks for the sharing review again. `ownEvent(ref)`, `currentOwnEvent(id)`, `editEvent(event, edit)` (fetches again, compares the version, then changes or deletes).
- `browser/app.mjs`: `finishReply` keeps an edit only if its ref resolves, storing the event id at that moment; proposal kind `calendar-edit`; review titles "Change this event in your calendar?" and "Remove this event from your calendar?"; `calendarEdited` receipts; correction for claimed changes.
- Tests: 7 more unit tests (5 in `connections.test.mjs`, 2 in `actions.test.mjs`); 4 more browser tests in `browser/tests/dom/calendar.test.mjs`, where the stand-in Google now filters by mark, serves one event, and honours `If-Match`. Checked by removal: allowing guests fails tests 5 and 7; honouring refs without sharing fails test 8; dropping the version check and `If-Match` fails tests 5, 6 and 7. The removal test found that an answer with no content crashed `call()`; fixed.

Known gaps:

- Never run against a real Google account. Read on 2026-11-16 from Google's reference: patch, delete and get accept `calendar.events.owned` and (patch, delete) `sendUpdates=none`; delete answers with an empty body and 410 if already deleted; `privateExtendedProperty` may repeat and all must match; the versions guide describes `If-Match` with 412 for update and delete but does not name patch, which is why PEA also compares the version itself just before sending.
- Between that last comparison and Google acting there is still a moment in which an edit elsewhere could land if Google ignored `If-Match` on patch.
- The mark is a label, not proof (see the section below). An event another app marked would be offered, and the owner's review is the safeguard.
- Notes cannot be changed. Events with guests, repeating or all-day events are refused. A removal cannot be undone from PEA.
- Refs are positions in the list at the last refresh; they are resolved when the reply finishes. Events more than 90 days ahead, or beyond the first eight, cannot be named.
- English-only detection of "I moved/cancelled…" claims.

Next action: additional voice transports, per the parity sequence, or an acceptance try of the calendar steps with a test Google account.

## Adding approved events to Google Calendar — 2026-11-16

**Branch `feature/calendar-direct`, development identity `0.1.0-dev.45`.** Owner's choices: PEA may add events, and later change or delete only events it added itself; the wider Google permission is a separate opt-in box. This is the first of two pull requests: add only. The iPhone source was not read.

- `browser/connections.mjs`: `eventId`, `newEventId()` (`pea` + 32 hex, valid base32hex), `eventLink()` (only `https://www.google.com` or `https://calendar.google.com`), `Services.addEvent(token, profile, draft, id)` (POST `/calendar/v3/calendars/primary/events?sendUpdates=none&fields=id,status,htmlLink`; body `id, summary, description, start.dateTime, end.dateTime, extendedProperties.private { peaCreated, peaProfile }`; 409 returns `{ already: true }`; an answer with another id or `cancelled` is refused). `call()` now puts the HTTP status, and nothing else, on the `ServiceError`.
- `browser/live-ui.mjs`: `calendarWriteScope`; `#google-calendar-write` asks for it in place of the read-only scope; `s.google.calendarWrite` is set only from the scopes Google actually granted; `eventAccount()` (account email or null) and `addEvent(draft, id)` (through `run`, then refreshes Today).
- `browser/app.mjs` `proposalButton`: with `eventAccount()` the review is "Add this event to your calendar?" and names the account; after approval it re-checks profile, conversation, proposal and account, then adds. `eventIds` keeps one id per reply; `calendarAdded` turns the button into a receipt. Both are cleared with the other proposals and are not restored after reload. Without the permission the file flow is unchanged.
- `browser/actions.mjs` `calendarGuidance` and the "did not schedule" correction were reworded. `browser/index.html`: the new box and its explanation.
- Tests: 4 unit tests in `browser/tests/connections.test.mjs`; 4 browser tests in `browser/tests/dom/calendar.test.mjs` against a stand-in Google (sign-in script, account, folder list, calendar) answered by the test. `harness.mjs` routes can now answer with other text, see the request, and allow a sign-in header. Checked by removal: ignoring the granted scopes fails test 3; a new id per try fails test 2.

Known gaps:

- Never run against a real Google account. Read on 2026-11-16 from Google's Calendar API reference (events insert, events list, the Events resource, the errors guide and the scopes page): `calendar.events.owned` authorizes both insert and list; a caller-chosen id is base32hex, 5 to 1024 characters; a repeated id answers 409 `duplicate`, though Google says it cannot guarantee every collision is caught at creation; a `dateTime` with an offset needs no `timeZone`.
- `extendedProperties.private` is private to the owner's copy of the event, not to this Google client (unlike Drive's `appProperties`). Another app with calendar access could set PEA's mark. The second pull request must treat it as a label and still show the owner the exact event before any change.
- Add only. No change or delete, guests, recurrence, all-day events, time zone names (instants are UTC) or other calendars.
- With the permission granted there is no way to get the file instead.
- Google's token allows seeing, changing and deleting events on every calendar the account owns for up to an hour; PEA's own code limits itself to adding to the main one.
- The box is not remembered per profile; it is read when the owner presses Connect.

Next action: done in the section above.

## Her days — 2026-11-16

**Branch `feature/her-days`, development identity `0.1.0-dev.44`.** Owner's choices: both a model-written week and notes from Chat; notes are kept with a notice, not approved one by one. The iPhone source was not read.

- `browser/days.mjs` (pure): `dayLimits`; `dayKey`, `dayName` (local calendar days); `weekDays`, `weekPrompt`, `weekRequest`, `parseWeek` (one clean line per asked-for day, at least 3); `noteGuidance`, `dayNote(raw, now)` (exactly one `pea-life` block, the only PEA block in the reply, fields `op,text,when`, when yesterday/today/tomorrow); `addNote` (3 a day, no repeats), `addWeek` (replaces written lines for its days, keeps Chat notes), `pruneEntries` (14 back, 7 ahead, 40 lines), `validSavedDays`, `daysContext` (3 days either side, about 1,500 characters), `describeWeekRequest`, `describeWeek`.
- `browser/days-ui.mjs`: `installDays(...)` returns `{ render, pick(), noteFrom(raw), count() }`. Storage `localStorage` `pea-days-v1` = `{ notes, entries: [{ day, text, from }] }`, Personal only. Turning notes on has its own review.
- `browser/live-ui.mjs` `chat`: `hooks.days()` only on Chat with `shareIntro`; context and, when notes are on, `noteGuidance` are appended to the system message. The fingerprint holds only whether days and notes are shared, so a new line does not ask again; the review shows the current lines.
- `browser/app.mjs` `finishReply`: `days.noteFrom(raw)` runs only when `offer` is true (complete and not written with a page shared) on Chat. `browser/canon-ui.mjs` exposes `cards()`. `browser/index.html`: `#days-section`. Assets now 46.
- Tests: 10 unit tests in `browser/tests/days.test.mjs`; 5 browser tests in `browser/tests/dom/days.test.mjs` (nothing without home, Personal and approval; one request with none of the owner's other answers; unsafe lines and unasked days dropped; second review; delete and reload; notes off by default and reviewed when turned on; a note is kept with a notice and hidden from the reply; it returns marked as fiction without a new review; repeats, unsafe notes and notes beside another action are not kept; nothing with sharing off, with a page shared, or in Work).

Known gaps:

- No real model has written a week or a note through this. Whether models use the `pea-life` block sensibly is untested.
- Notes are the model's words kept without per-note approval, by the owner's choice; the checks are on shape and content, not truth or taste. A note cannot be tied to what the reply's visible text said.
- A note is honoured whenever notes are on, even if that request did not carry the guidance (for example sharing was just turned off).
- English weekday names; days follow the browser's local date. No timeline view beyond the list.
- Lines are outside the encrypted library and are not cleared by locking it.

Next action: direct calendar changes, per the parity sequence, or try her history and her days with a real model first.

## Her history cards — 2026-11-16

**Branch `feature/her-history`, development identity `0.1.0-dev.43`.** Design follows the owner's written description of the iPhone behavior (the model writes the cards in one owner-triggered request; about 26 cards, 8 on the place and 18 invented; 0 to 2 cards per chat message). The iPhone source and its notes file were not read; the prompt and rules here are this repository's own.

- `browser/canon.mjs` (pure): `canonLimits` (6 to 40 cards, 26 asked for, text 420, facts 6000, 2 per message, gap 8); `homeAnswer`; `historyPrompt({ home, persona, facts })` and `historyRequest`; `parseCanon(raw)` (complete top-level objects of the first JSON array, so a cut-off reply keeps whole cards; drops over-long, tagless, credential-like, address-bearing or `pea-` cards; assigns `card-N` ids); `validSavedCanon`; `askedAboutHer` (English patterns); `selectCards(cards, message, sinceLast)`; `canonContext`; `describeHistoryRequest`; `describeCards`.
- `browser/canon-ui.mjs`: `installCanon(...)` returns `{ render, pick(message), sent(count), count() }`. Storage `localStorage` `pea-canon-v1` = `{ made, cards }`, Personal only, unencrypted. Flow: optional reviewed read of one page (`live.readPage`, redirects not followed) → `live.compose` review and request → `parseCanon` → "Keep these cards?" review → save.
- `browser/live-ui.mjs`: new `compose({ title, about, system, user })`, a reviewed one-off request to the profile's Chat model that adds nothing from chat, interview or services and returns the text; callers wrap it in `run`. In `chat`, `hooks.canon(text)` is consulted only on the Chat surface with `shareIntro` on; chosen cards are appended to the system message, the kept set's stamp is in the approval fingerprint, and the review lists the whole set. `hooks.canonSent(count)` is called on dispatch.
- `browser/memory-ui.mjs`: `context()` also returns `assistantHome`. `browser/index.html`: `#canon-section` in the library dialog. Assets now 44.
- Tests: 12 unit tests in `browser/tests/canon.test.mjs`; 5 browser tests in `browser/tests/dom/canon.test.mjs` (nothing without home, Personal and approval; exactly one request with none of the owner's other answers or chat; hostile and malformed cards dropped and nothing a model wrote runs; second review before saving; delete and reload; a bad reply or a declined set keeps nothing; the place page has its own review and its words are shown before sending; two cards at most in Chat, none when sharing is off, none in Work).

Known gaps:

- No real model has written cards through this yet, so the prompt's quality, and whether 26 cards fit a given model's reply cap (3,500 tokens), are untested. A cut-off reply keeps the whole cards that arrived if there are at least six.
- PEA cannot check that a model kept to the page's facts or invented no real person; the owner's review is the only check.
- One page the owner names, not several pages PEA finds. No year field and no timeline view.
- Cards are outside the encrypted library, its backup and the profile file, and are not cleared by locking the library.
- Card selection and "asked about her" are English only.
- Dated entries about her days (the iPhone's life timeline, and the owner's request that she know recent and coming days) are not built.

Next action: dated entries about her days, then direct calendar changes, per the parity sequence.

## The Home card: "At a glance" on Today — 2026-11-16

**Branch `feature/home-card`, on `main` after Headlines (#43) was merged; development identity `0.1.0-dev.42`.** Owner's choice: a summary at the top of Today, built from what is already on the page.

- `browser/home.mjs` (pure): `homeLines({ weather, event, todos, headlines, now })` gives the lines in a fixed order, each naming the card it came from; `todoLine` counts open, overdue and due-later-today to-dos by the local day; text is put on one line and cut at 160 characters.
- `browser/home-ui.mjs`: `installHome` draws `#home-card` once per moment of change. A line is a button that opens and scrolls to its card.
- Sources, all already in the page: `installWeather(...).summary()`, `installTodos(...).open()` (this profile's open items; none in Blended), `installHeadlines(...).top(3)`, and the first event of a connected calendar (`schedules[profile].calendarOn`); the sample event is never shown. Weather, to-dos and headlines call a `changed` hook after they draw; `renderSchedule` and opening Today redraw it too.
- No request is made for the summary and nothing in it is passed to `live.chat`. Assets now 42.
- Tests: 5 unit tests in `browser/tests/home.test.mjs` (215 unit in all); 2 browser tests in `browser/tests/dom/home.test.mjs`: empty until a card has something; to-do, weather and headline lines appear and go as their cards change; a headline title with markup is text; a line opens its card; only the Headlines card contacted the stand-in site, once; no summary text in a model request; to-dos follow the profile.
- Fix carried in the same change: `busyChanged` in `browser/app.mjs` now also calls `board.render()`. Before, a board redraw during a request left `#board-capture`, `#board-command-run` and `#board-mic` disabled after it ended (seen once in CI as a timeout in the drag-and-drop test). Guarded by "the board’s buttons come back when a request ends…" in `browser/tests/dom/dragdrop.test.mjs`, which fails without the fix; 75 browser tests in all.
- CI note: on 2026-11-16 two runs failed only because headless Chrome did not start on the runner; the same commits passed in parallel runs. Not a product fault.

Known gaps:

- The calendar line was not exercised with a connected Google calendar in tests (no real accounts in tests); it reuses the event title and start text the Upcoming card already shows.
- Overdue and due-today counts refresh when Today is opened or a card changes, not on a timer.
- What the iPhone Home card shows is unknown here; this is the owner's stated web design, not a comparison.

Next action: her history and daily life, per the parity sequence, or an independent review of the reader first.

## Headlines on Today — 2026-11-16

**Branch `feature/headlines`, development identity `0.1.0-dev.41`.** Owner's choices: feeds the owner adds (no news service, no built-in list); shown to the owner only; refreshed only on a click; the Home card is to be a summary at the top of Today and is the next slice.

- Rule first: `contract.json` `reader.contentTypes` gained `application/rss+xml`, `application/atom+xml`, `application/xml`, `text/xml`, and `reader.accept` names them. Both gateways read the list from the contract, so no gateway code changed. Conformance reads four feed-typed pages on both gateways (still 26 plus 1 opt-in). Assets now 40.
- `browser/feeds.mjs` (pure): `readFeed` (RSS 2.0, RSS 1.0/RDF and Atom by a bounded scan with `indexOf`, no DOM and no XML parser; titles reduced to one plain line through `pageText`; 20 items a feed), `headlineLink` (https to a named site only; the reading address is the same without its fragment and must pass `pageAddress`), `mergeHeadlines` (newest first, 30), `validSavedFeeds`, `describeFeed`, `headlineDate`.
- `browser/feeds-ui.mjs`: `installHeadlines`. Saved in `localStorage` `pea-headlines-v1` as `{feeds:[{url,name}]}`, for the browser, not per profile; titles are held for the tab only. Add = review, one read, must parse as a feed. Refresh = one read per feed, one at a time. A moved feed is reported with its new address and not followed. Returns `top(n)`, `refreshedAt()`, `count()` for the coming Home card.
- **Read in Chat** calls `research.read(address, 'feed', name)`; `describeRead` has a `feed` wording. Headlines are not passed to `live.chat` anywhere.
- Tests: 12 unit tests in `browser/tests/feeds.test.mjs` (210 unit in all); 5 browser tests in `browser/tests/dom/headlines.test.mjs` against the stand-in site: nothing asked before approval or without Refresh or on reopening; one request per read with nothing of the owner's; titles are text (markup and script in a title do nothing; non-https links are not links); only address and name saved; no headline in any model request; Read in Chat goes through the page review; non-feeds, moved feeds, errors and private names refused in PEA's words; one failing feed leaves the rest.

Known gaps:

- Only UTF-8 feeds (the reader's rule), up to 2 MB. No images, summaries or categories. No discovery of a site's feed from its home page. Feeds that need a sign-in or a non-443 port cannot be added.
- The feed list is per browser, not per profile, as with weather.
- `application/xml` and `text/xml` mean the reader will now return any small public XML document as text. It is still one GET to a public https site with nothing of the owner's.
- Not tried against a real feed through the app by anyone. No independent security review. Not compared with the iPhone app.

Next action: the Home card: a summary at the top of Today (weather now, next event, to-dos due today, top headlines) built only from what the page already holds.

## Public research, part 2: the page's review and reading flow — 2026-11-16

**Branch `research/page-flow`, development identity `0.1.0-dev.40`.** The app now uses the reader from part 1. No gateway or contract rule changed; `contract.json` only lists the two new served files (assets now 38).

- `browser/research.mjs` (pure): `pageAddress` (the page's own check of an address, the same shape the server accepts; the server stays the authority and also refuses private names), `readProposals` (one `pea-read` block, exactly `{"op":"read","url"}`), `ownerRead` (the owner's whole message is `read https://…` or `fetch https://…`), `readGuidance`, `claimsRead`, `pageText` (HTML to plain words with its own small scanner, no DOM: scripts, styles, menus, footers, forms' controls, frames and drawings dropped; entities decoded; invisible and text-reordering characters removed; cut to 6,000 characters), `readFailure` (PEA's own words per status; the server's and site's wording is never shown), `describeRead` (the review text).
- `browser/research-ui.mjs`: `installResearch`. One kept page per tab, tied to the profile it was read in; shown in `#context-page` above the chat with **Stop sharing**; dropped on profile change and when the chat is replaced. A redirect is a second review naming the new address; three approved reads at most. A page whose kept words look like a credential is not kept.
- `browser/local-model.mjs`: `LocalModel.read(key, url)` calls `/v1/read`; the answer must echo the address asked for.
- `browser/connections.mjs` `body({ page })`: the words go in the system message, labelled as untrusted quoted data from a stranger. `browser/live-ui.mjs`: Chat only; the page is part of the sharing fingerprint, so a new or changed page always brings the "Before sharing with your model" review back, and the review shows the address and the exact words. `readGuidance` is sent only in Chat and only when the server's token is connected.
- The rule "retrieved content cannot grant tools" is enforced in `app.mjs` `finishReply`: a reply that was requested while a page was shared (`sourcedReplies`) has no proposal parsed from it at all, of any kind, and says so if it carried an action block.
- `browser/server/releases.py`: the package file limit is now `MAX_FILES = 200` (was 100, with 101 for the manifest's list); `WEB-FILES.json` reached 101 names. No release exists yet, so no installed verifier is affected.
- Tests: 14 unit tests in `browser/tests/research.test.mjs` (198 unit in all); 6 browser tests in `browser/tests/dom/research.test.mjs` against a stand-in site (`startFakeSite`, and `startStack(reply, { site })` in the harness, which starts the gateway with `--reader-test-site` / `--reader-test-resolve`; for Python that means `gateway.py` directly, since `local.py` has no test options). They check: nothing is read on a proposal or a cancel; the site gets one request with no cookie, authorization, referer or origin; nothing from the page runs or loads; hidden text is shown to the owner; the model gets the words only after the review; a sourced reply offers no button; a moved page asks again; private, missing, secret-bearing and empty pages are refused in PEA's words; profile change and new chat drop the page. Removing the sourced-reply rule makes its test fail (checked by hand once).

Known gaps:

- No search. No link following (the kept words carry no link addresses). No PDF, images or script-rendered pages. Only the first 6,000 characters of words are kept.
- Text a browser would hide (for example `display:none`) is kept and shown, not removed; the owner sees it in the chip and in the review.
- The no-action rule covers replies requested while a page is shared. After **Stop sharing**, earlier replies written with the page are still in the chat history sent to the model; every action still needs its own review.
- A model can be led by one page to suggest another address only after the page is no longer shared; the owner reviews the exact address each time. Nothing private should be in an address; the review says so but cannot check it.
- The reader and this flow have had no independent security review. Not compared with the iPhone app's research behavior.
- Run by hand in a browser only through the automated tests' stand-in site, plus one live read on the owner's preview if they try it.

Next action: headlines and the Home card (the rest of the old parity row), or an independent review of the reader first.

## Public research, part 1: the gateway's page reader — 2026-11-15

**Branch `research/gateway-reader`, development identity `0.1.0-dev.39`.** The owner chose public research as the next 0.2 piece. This part is the gateway side only; no page code calls it yet.

- Rule first: `contract.json` gained `reader`. `POST /v1/read {"url"}` with the token. Answers: 200 `{"outcome":"page","url","type","text"}`; 200 `{"outcome":"redirect","url","location"}` (never followed); 400 for an address outside the grammar; 422 when the name leads to a refused address; 429 when two reads are already running; 502 for everything about the site (not found, unreachable, error status with `status`, not text, compressed, over 2 MB, not UTF-8, over 15 seconds, redirect to somewhere not allowed).
- Address grammar, identical in both: `https://name[:443][/path][?query]`, printable ASCII, at most 2,000 characters, no user name, other port, fragment or backslash; the name needs a dot and a final label starting with a letter, so no numeric address in any form; final labels in `refusedSuffixes` are refused.
- Addresses: every address the name resolves to must be outside `refusedNetworks` (loopback, private, link-local, carrier-grade NAT, documentation, multicast, reserved, IPv4-mapped, NAT64, 6to4, Teredo, unique-local). The connection goes to the first checked address, not to the name again; TLS is verified against the name.
- Sent to the site: `Host`, the fixed `User-Agent` and `Accept` from the contract, `Accept-Encoding: identity`, `Connection: close`. Nothing of the owner's.
- `browser/server/gateway.py`: `reader_target`, `reader_refuses`, `PinnedConnection`, `Gateway.read_page` with one timer that cuts the connection at 15 seconds. `mac/Sources/PEAGatewayCore/Reader.swift`: `ReaderRules`, `PageRead` (Network.framework to the checked address, explicit certificate check, own response and chunk reader).
- Test stand-ins, on both gateways and never set by `local.py` or the Mac app: `--reader-test-site NAME.example=PORT` and `--reader-test-resolve NAME.example=ADDRESS[,ADDRESS]`. Names must end in `.example`, which is otherwise a refused suffix.
- Tests: conformance now 26 plus 1 opt-in, passing on both gateways: page types, exact request headers, redirects reported and five bad ones refused, error pages not passed on, nine kinds of non-page refused, a dead site, two slow reads cut off and a third refused with 429, 13 names leading to refused addresses, 47 addresses outside the grammar, 13 malformed bodies, token and origin checks. `PEA_CONFORMANCE_LIVE=1` runs the one test that uses the internet; it was run once by hand on each gateway and passed (a real page read, a public name that points at this machine refused, four bad certificates refused). Swift unit tests: 3 new (grammar, addresses, chunks).

Known gaps:

- Nothing in the app uses the reader yet. Part 2 is the page: a model proposes an address, the owner approves that exact address, the text is reduced to plain words in the page, and it is shared with the model only under the model-sharing review. Retrieved text must never be able to grant an action.
- The reader has had no independent security review. Name lookups use the system resolver; a system-wide proxy or VPN is not consulted or detected.
- Only UTF-8 pages are read. No PDF, no images, no JavaScript-rendered pages, no search engine.
- The live test depends on third-party sites and is not run in CI.

Next action: part 2 as above, with browser-level regression tests against the stand-in site.

## Weather on Today — 2026-11-15

**Branch `feature/weather-card`, development identity `0.1.0-dev.38`.** First web piece of "public research, weather, headlines, Home card". Owner's choices: weather first; Open-Meteo as the source.

- Evidence read on 2026-11-15 from open-meteo.com (terms, pricing, forecast and geocoding documentation): free service needs no key and is for non-commercial use only, under 10,000 calls a day; data is CC BY 4.0 and needs a credit; logs may hold network addresses and coordinates and are deleted after 90 days; the operator is in Switzerland. The National Weather Service (US only) and MET Norway (asks browsers not to call it directly) were read and not chosen.
- `browser/weather.mjs` (pure): `placeQuery`, `placesURL`, `readPlaces` (at most five, positions rounded to two decimals), `forecastURL`, `readForecast` (strict; any surprise throws), `describeWeather`, `validSavedWeather`, `weatherConsent`.
- `browser/weather-ui.mjs`: the card. The first request in a page waits for a review; a saved place (`localStorage`, `pea-weather-v1`, place and unit only) is fetched on load, on Refresh, and on returning to a tab whose forecast is over 30 minutes old. Requests carry no credentials or referrer and follow no redirect. Turning off removes the saved place.
- `browser/index.html` and `browser/server/contract.json`: the card's markup; `connect-src` gains the two Open-Meteo addresses (both gateways read the contract); `weather.mjs` and `weather-ui.mjs` are in the served file list.
- Tests: `browser/tests/weather.test.mjs` (5) and `browser/tests/dom/weather.test.mjs` (2 browser tests with the service faked by the harness: off by default, decline, agree, lookup, markup in a place name shown as text, forecast, units, credit, nothing in a chat request, failed and malformed refresh, reload, turn off, not found, lookup failure).

Known gaps:

- The automated tests never contact Open-Meteo. The real service was asked once by hand from the command line for a well-known city: both answers passed `readPlaces` and `readForecast` in both units, and both addresses allow a browser page on another origin.
- One place, shared by every profile on this browser, saved unencrypted. No hourly view, no alerts, no weather in what a model sees.
- The non-commercial limit is stated in the review; nothing enforces it. A commercial deployment needs Open-Meteo's paid plan, which uses a different address and a key and is not supported.

Next action: the rest of this parity row (public research through a gateway fetcher that checks resolved addresses, headlines, Home card), which needs a contract change and both gateways.

## The profile file as a shared contract — 2026-11-15

**Branch `contracts/profile-file`, development identity `0.1.0-dev.37`.** The owner asked where to find an iPhone export to import; there is none, because the import reads only the web's own file. This slice writes that file's format down so the iPhone app can adopt it. No app behavior changed.

- `browser/docs/CONTRACTS.md`, section "The profile file": the four outer fields, PBKDF2-HMAC-SHA-256 (600,000 rounds for v2, 310,000 for v1), AES-256-GCM with the format name as additional data, the inner `profile` and `introduction`, the seven original and nine later answers with limits in UTF-16 units, and what must be refused.
- `browser/tests/fixtures/ProfileFixtures.json`, version 1: 6 files that must open and 18 that must be refused, sealed with a synthetic passphrase stored in the file and fixed salts. `browser/tests/profile-contract.test.mjs` (3 tests) checks every vector and that the stated limits equal `introductionLimits` and `profileFormats`.
- `browser/profile-transfer.mjs` is unchanged; it already behaved this way.

Known gaps:

- The iPhone app was not read. Whether its interview has the same sixteen answers under these names is unknown and is for its own change to establish.
- No export exists on the iPhone, so the owner still cannot move a profile from it. The vectors were made with Node's crypto and checked with the browser's; no third implementation has read them.

Next action, on the private iPhone side and not from this repository: take a reviewed copy of the fixture file, add an export (and import) that passes it, and report any field that does not fit as a contract change here first.

## The Mac app's update check — 2026-11-15

**Branch `mac/update-check`, development identity `0.1.0-dev.36`.** Owner's choices: checked only on a click; tells the owner and links to the release page, nothing more.

- `mac/Sources/PEALauncherCore/Updates.swift`: `Updates.isNewer` and `Updates.check` follow `browser/releases.mjs` and the check in `release-ui.mjs`: latest release of the configured repository, not a draft or pre-release, tag shaped `v…` and a readable version, and a page address that must equal that repository's own release page for the tag. A stable build also looks its own version up, and a 404 is reported as possibly withdrawn. Every surprise is a plain failure with no link. `GitHubReleases` is the real source: only `https://api.github.com/repos/…`, no cookies, credentials, cache or redirects, 500 KB limit, user agent `PEA`.
- `Launcher.checkForUpdates(from:)`, `Launcher.channel`. Menu item **Check for Updates…**, shown when the build names a repository; the result is an alert with Open Release Page when there is one.
- Tests: `mac/Tests/PEALauncherCoreTests/UpdatesTests.swift`, 7 with a stand-in for GitHub (ordering as on the web, newer, same, older, withdrawn, 14 malformed answers, 5 error statuses, offline, invalid repositories ask nothing, the real source refuses every other address) and 1 that uses the network only when `PEA_LIVE_UPDATE_REPOSITORY` is set. That one was run once by hand against a public repository with releases and passed. `swift test` 28, 1 skipped.

Known gaps:

- This repository has published no release, so the check against it has only been seen to fail politely. The menu item and its alert have not been looked at.
- No automatic check and no download, by the owner's choice. The version comparison exists twice, in `releases.mjs` and `Updates.swift`, with the same test cases but no shared fixture.

Next action: the web features listed for 0.2 in PARITY.md. The owner's steps are unchanged: try the app, the reminders and this menu item by hand; rehearse `mac/SIGNING.md`.

## Reminders as Mac notifications — 2026-11-15

**Branch `mac/reminder-notifications`, development identity `0.1.0-dev.35`.** First 0.2 piece after the Mac app. Owner's choices: the notification shows the to-do's title and is kept by macOS; reminders from every profile are handed over.

- Rule first: `browser/server/contract.json` gained `reminders` (path `/v1/reminders`, fields `id`, `title`, `due`, at most 64 items, id pattern, 120-character one-line title, `due` a whole number of milliseconds up to year 3000). `GET` answers `{"available":bool}`; `POST {"reminders":[…]}` replaces the whole list and answers `{"available":bool,"scheduled":n}`. Both need the token, host and origin checks like the model routes.
- `browser/server/gateway.py`: `validate_reminders`; the list is checked and dropped, and the answer is always not available. `browser/server/conformance/run.py`: `test_reminders_are_checked_the_same_way_and_need_the_token` (21 tests now), passing on both gateways.
- `mac/Sources/PEAGatewayCore`: `Reminder`, `ReminderSink`, `Contract.validateReminders`, the two routes, `Gateway.Options.reminders`. Only reminders still ahead are passed to the sink; the gateway keeps and logs nothing.
- `mac/Sources/PEALauncherCore/Reminders.swift`: `ReminderCenter` (on only when the owner's switch is on and the system permits; remembered in defaults; turning off withdraws) and `SystemNotifications` (`UNUserNotificationCenter`, identifiers `pea-reminder-<id>`, calendar trigger, shown in the foreground too). `Launcher.setReminders`, `remindersOn`, `canRemind`. Menu item **Show Reminders as Notifications**, present only in a packaged app.
- `pea-gateway --reminders-file PATH`: test-only stand-in that writes accepted lists to a file. The browser test harness uses it in Swift mode.
- Page: `remindersForMac` in `todos.mjs`; `LocalModel.reminders`; `todos-ui.mjs` adds the switch `#todo-mac-on` on Today, a review before the first hand-over, re-sending whenever the list changes, and no sending while the saved board is locked or the page has no token. The choice is kept in `localStorage` under `pea-mac-reminders-v1`. When the Mac has the list, the browser's own system notification is skipped.
- Tests: Swift 21 (2 new for the rules, 2 new for the center and the running app with a fake notification service); unit tests for the list and the request; `browser/tests/dom/mac-reminders.test.mjs` with 3 browser tests (one for a gateway that cannot take reminders, two that need `PEA_GATEWAY=swift`: agree, decline, every profile, check off, turn off, reload and reconnect).

Known gaps:

- **No real notification has been shown.** Whether macOS grants notification permission to the unsigned build, what the notification looks like, and the menu item itself are unchecked. The owner tries this by hand.
- The page's token is not kept across a reload, so after one the Mac keeps its last list until the local model is connected again. A to-do checked off in that window still notifies.
- Clicking a notification does not open PEA. No recurring reminders. The Mac holds at most 64, the soonest.
- The to-do review in Chat and the Today text were reworded slightly; no other web behavior changed.

Next action: the owner rebuilds with `mac/build.sh`, turns both switches on and adds a reminder a few minutes ahead. Then the remaining 0.2 items: update check, and the web features listed for 0.2 in PARITY.md.

## The Mac app, steps 5 and 6 of 6: the launcher app and the signing guide — 2026-11-15

**Branch `mac/launcher-app`, development identity `0.1.0-dev.34`.** Stacked on step 4.

- `mac/Sources/PEALauncherCore`: `Launcher` (status, remembered port and model address, start, stop, move to another port, change the model address, find a free port) and `TokenStore` (`KeychainTokenStore` as a generic password in the login Keychain, this device only, not synchronized; `MemoryTokenStore` for tests; `ConnectionToken.make`, 32 random bytes as 43 URL-safe characters). The token is made on first use and is never written to a file, a preference, a log or an address.
- `mac/Sources/PEAMac/PEAMacApp.swift`: a SwiftUI `MenuBarExtra` and a small status window. Actions: Open PEA (default browser), Copy Connection Token (marked as concealed for clipboard managers), Local Model Address… (loopback only), a port offer when the port is busy with an explanation that another port is a separate browser site, Start at Login (`SMAppService`), Releases (from `release.json`'s repository, so a fork points at itself) and Quit. No web view.
- `PEAGatewayCore`: `Gateway.stop(done:)` now drops open connections and reports when the port is free, so the app can restart on the same port; open connections are tracked by object, not counted.
- `mac/build.sh`: release build, then `mac/build/PEA.app` with the binary, the web files named in `contract.json`, `server/contract.json`, `release.json`, a `build-info.json` stamp (commit and whether the tree was modified), `LICENSE`, `NOTICE`, an `Info.plist` (identifier `com.bamcio.pea.mac`, overridable with `PEA_BUNDLE_ID`; local networking only) and an icon made from `pea-icon.svg` with tools that ship with macOS. It never signs. The gateway source and tests are not copied into the app.
- `mac/SIGNING.md`: the owner's steps for Developer ID signing, notarization, stapling and a disk image, with the things to expect on first use. **None of it has been run.**
- CI `mac` job: also runs `mac/build.sh` and checks the bundle.
- Tests on this Mac: `swift test` 17 of 17 (12 gateway, 5 launcher). The launcher tests start a real gateway on a spare port, fetch the page, check the model route needs the token, stop, confirm the port is closed, restart on the same port, and run a second launcher into the busy port and move it. The Keychain test uses a service name made for the run and removes it; it skips where no Keychain is usable.
- The built app on this Mac: launches; stores its token in the Keychain; found port 18770 held by the existing preview and ended up serving on 18771; `/` answers 200, `/v1/models` 401 without the token, `/api/build-info` gives the stamped version and commit; the window shows status, version, model address and Open PEA with nothing clipped.

Known gaps:

- The menu contents, the port-change dialog, the token-copied dialog, the model-address dialog, the Dock icon and Start at Login were **not** checked by an automated look: the screen-control session was interrupted. The window was seen once; the move to port 18771 happened outside the check. These need the owner's eyes.
- Connecting PEA in the browser to a real local model through the app has not been done.
- Built for this Mac's processor only. No sandbox, no update check, no reminders as notifications. The window also appears when opened at login.
- A development token item named "PEA connection token" now exists in the login Keychain of the Mac this was built on.

Next action: the owner tries `mac/build/PEA.app`, then rehearses `mac/SIGNING.md`. After that, the remaining 0.2 items: reminders as system notifications (now built, see above), update check, and the web features listed for 0.2 in PARITY.md.

## The Mac app, step 4 of 6: the browser suite on the Swift gateway — 2026-11-15

**Branch `mac/browser-suite-on-swift`, development identity `0.1.0-dev.33`.** Stacked on step 3.

- `browser/tests/dom/harness.mjs`: `PEA_GATEWAY=swift` starts `mac/.build/debug/pea-gateway` (or the file named by `PEA_GATEWAY_BINARY`) in place of `local.py`, with a token file the harness writes itself. Nothing else in the suite changes, so all 56 browser-level tests drive the app through the Swift gateway. The default is still the Python gateway and the `web` job is unchanged.
- The `mac` CI job now also installs Node 22 and runs the browser suite with `PEA_GATEWAY=swift`.
- Results on this Mac: 56 of 56 against Swift in eight runs one after another and in six runs two at a time; 56 of 56 against Python; 56 of 56 against Swift with the page pretending to be Linux.
- Heavy load, measured for both gateways: with three whole suites running at once (three Chromes), tests time out waiting for the browser on **both** gateways (Python in 11 of 12 runs, Swift in 12 of 12, before the connection fix in step 3). That is the machine, not a gateway, and running suites side by side is not supported. It did lead to the connection-counting defect recorded under step 3, which was real.
- In passing, on step 2's branch: the drag-and-drop test clicked Add to Inbox before the app had re-enabled it after a reply, and failed once in CI. It now waits for the button.

Known gap: the comparison under heavy load was not repeated after the connection fix.

Next action: step 5, the Mac app itself (menu-bar and Dock launcher, Keychain token, port handling, open in browser, start at login, `mac/build.sh` for an unsigned build).

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
