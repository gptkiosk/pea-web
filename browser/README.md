# PEA Web — Personal Executive Assistant

A responsive customer-owned web companion with Chat, Today and Greenhouse centered across the top on desktop and mobile. Original pea-pod branding, cream/pea-green and dark-green themes. Works with your OpenRouter BYOK or your own local model through the PEA gateway. No bundled inference, developer relay or dependency on the developer’s Mac. The separately distributed native iOS app is a one-time-purchase client; model API usage is separate.

Start with [self-hosting and phone/VPN setup](docs/SELF-HOSTING.md), [operator acceptance checklist](docs/OPERATOR-ACCEPTANCE.md), then [implemented parity and remaining work](docs/PARITY.md) and [versions, packaged updates, rollback and feedback](docs/RELEASES.md). This is the public Apache 2.0 web source, maintained independently of the private iOS product. It is work in progress; dependency packaging is a later milestone. See [using both products](docs/CO-USE.md) and [dependencies](docs/DEPENDENCIES.md).

## Implemented here

- Responsive original PEA artwork with transparent icon, guided connection and interview flows; Chat / Today / Greenhouse, Work/Personal boundaries, clearly labelled synthetic-first preview, locally rendered text/code/images/simple diagrams. No document/code execution.
- Separate streaming Chat and collaboration/coding/image choices. OpenRouter privacy and price review, per-profile remembered choices, no hidden retry or paid fallback. Free endpoints may require retention/training consent; API access differs from memberships.
- Optional customer-owned loopback model gateway, authenticated from web/native clients over customer HTTPS/VPN. Same-origin browser route, fixed upstream, no shell/tools/cloud fallback. Local inference requires adequate hardware and compatible model licensing.
- Today Calendar/Inbox peeks first, every section collapsible. Optional live read-only Google previews; model sharing controls are separate in service settings. Failed/stale source refreshes are excluded from model context.
- Google Web OAuth with explicit broader Drive permission, per-profile root selection/creation, fresh ancestry/version checks, manually moved-in files, reviewed Docs/simple Forms creation, rename and recoverable batch Trash. PEA-created **opened** text supplies a bounded same-profile snapshot by default; imported text needs Discuss. File access never grants model/provider permission.
- Chat and Greenhouse can propose one calendar event with explicit UTC times; review precedes downloading a file for manual calendar import. No automatic calendar write or invitations.
- Chat and Greenhouse can propose editable Google document or simple unpublished form drafts; creation requires a connected PEA folder and separate confirmation.
- Email drafts with one explicit address can be reviewed before opening the owner’s mail app; PEA never sends them. Draft actions are not restored on reload.
- Story capture, queue, voice/typed commands, transparent fit proposals, reviewed model dispatch and recoverable removal/restore. A model may propose one story with optional scope and completion criteria in Chat or Greenhouse; you review the exact details before adding it to Today. Optional passphrase-encrypted local board persistence with competing-tab conflict detection; no unattended workers or automatic merge.
- Optional GitHub token limited to the customer’s repository: exact source review, unique new directory/branch and draft PR only. No overwrite, merge or code execution. Fixed-price single-image requests fail closed on ambiguous pricing.
- Explicit encrypted conversation-library backup and restore to an empty browser; no automatic sync, merge or overwrite. Backup contains both profiles and excludes the task board, files, credentials and grants.
- Searchable profile-bound Chat/Greenhouse library, structured interview, source-linked owner-reviewed facts, recent-first bounded recall and optional encrypted local saving. No automatic memory promotion or cross-profile sharing.
- Versioned model configuration snapshots, explicit review/import/export, and shared Drive documents across web/native clients. Credentials and privacy grants are excluded. This is not automatic sync.
- Optional local-time character/device-speech delivery, per-profile and tab-only. Coarse style hint is reviewed with the model; no extra model call or background audio.
- Dictation into Chat, Greenhouse and board fields after a speech-service disclosure; transcript review before Send/Apply. Device/browser Read reply and Stop. Profile/tab/visibility changes end capture without auto-restart.

## Boundaries

Keys, OAuth/GitHub/server tokens, selected excerpts and generated images stay in this tab’s RAM and clear on reload. Conversations, structured interview and reviewed facts are tab-only unless you explicitly enable the separate encrypted local library; see [memory and recovery](docs/MEMORY.md). Google/GitHub retain explicitly created files. The optional board saves only encrypted story records in IndexedDB using AES-256-GCM and PBKDF2-SHA256 (310,000 iterations, random salt/IV); its passphrase/key stay in RAM. No forgotten-passphrase recovery. An unlocked/compromised origin can read unlocked data.

Native retains richer document/action tools, research, presence and native audio. Web now has its own independent encrypted library; automatic cross-device synchronization and remaining native parity are still open; see the [parity matrix](docs/PARITY.md). Sharing a Google folder/model server does not synchronize chats, memories, tasks, credentials or service permissions.

Browser speech may be processed online by the browser/OS service; no on-device STT or locked-screen/AirPods guarantee. Keep the web screen open. Native iPhone is the primary Walk target. File limits: 4 MB local/8 MB live, 500 Drive files, 50 folders, 16 ancestry hops. Sheets preview is first-sheet CSV, Forms preview is definition JSON; diagrams support a safe arrow chain. Image preview is not automatic image understanding. Save generated images before reloading.

## Source tests

From the repository root:

```sh
node --test browser/tests/*.test.mjs
python3 -m unittest discover -s browser/server -p 'test_*.py' -v
```

Tests use synthetic data and loopback fake providers. They cover strict, non-executing story proposals and hidden action-block projections, shared policy fixtures, pinned/bounded transports, provider refusals, source projections, story commands/encryption/recovery, stale dictation callbacks, portable configuration and gateway authentication/origin/request boundaries. They do not prove real Google grants/writes, provider availability/billing, GitHub writes, native installation, physical phones, microphone/AirPods or public hosting readiness.

## Web-only checks and distribution

```sh
python3 browser/server/check_source.py
node --test browser/tests/*.test.mjs
python3 -m unittest discover -s browser/server -p 'test_*.py' -v
```

Run from the web repository root. These use synthetic local services and ephemeral test signing keys, never real accounts or inference. iOS source/tests are not required. See [public split](docs/OPEN-SOURCE.md), [release guide](docs/RELEASES.md) and [changelog](CHANGELOG.md). This development source is not a signed installer release.
