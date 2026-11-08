# PEA Web working handoff

Updated 2026-11-08. Public web-only work in progress; native iOS remains the primary separate private codebase. Initial source was copied through an explicit allowlist into fresh Git history. The products now maintain separate source and test trees; neither needs duplicated web files or a sibling checkout. The native product keeps its own policy fixture and tests. `SPLIT-ORIGIN.json` records hashes of the initial exported web files, not a live runtime or access grant.

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

Verification: 65 Node tests, including five presence/transport checks; independent source and public boundary checks. Prior Python gateway/release suite is also rerun for the final branch. Device/browser voice interpretation remains acceptance work. The encrypted archive is still schema 1 and this toggle is intentionally tab-only. No native source, service or installed build changes.
