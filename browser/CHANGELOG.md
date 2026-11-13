# PEA Web changelog

Notable user-facing changes. Versions follow semantic versioning; dated entries use Added, Changed and Fixed sections. Development builds are not published releases. The native iOS product has its own release process.

## [0.1.0-dev.11] - 2026-11-13

### Added

- Local foreground setup, token check and gateway startup helper for macOS/Linux. Existing tokens are never overwritten; no services or models are installed.
- Updates can explicitly compare the running commit with the configured public `main` branch, without pulling or installing changes.

### Limits

- Requires Python 3.11+ and separately configured model/provider access. This is not a finished signed installer or dependency bundle.

## [0.1.0-dev.10] - 2026-11-13

### Fixed

- The local gateway serves the complete browser module dependency graph, including the conversation library and reviewed action modules.

### Added

- An operator acceptance checklist for private installations, cloud-hosted private instances, device testing, external integrations, backup and rollback.

## [0.1.0-dev.9] - 2026-11-13

### Added

- Prepare a passphrase-encrypted conversation-library backup and restore it to an empty browser. Existing libraries are never overwritten; restoration does not merge or sync.

### Limits

- Backups include both profiles and exclude the story board, files, credentials and grants. The passphrase is required and cannot be recovered. Download and restore on real devices still need acceptance testing.

## [0.1.0-dev.8] - 2026-11-13

### Added

- Chat and Greenhouse can propose one calendar event for review. Approval reveals an iCalendar download link for manual import; PEA does not schedule it or invite anyone.

### Limits

- Explicit UTC start/end only, with local and UTC times shown for review. No recurrence, attendees, automatic import or direct calendar write. Calendar-app/device acceptance is still needed.

## [0.1.0-dev.7] - 2026-11-12

### Added

- Chat and Greenhouse can propose an editable document or simple form draft. A Google file is created only through the existing separately confirmed PEA-folder workflow.

### Limits

- One draft proposal per reply; forms contain long-answer questions only. No automatic creation, publication or sharing. Proposals are not restored as actions after reload.

## [0.1.0-dev.6] - 2026-11-12

### Added

- Model-proposed email drafts can be reviewed with the exact recipient, subject and body before an optional link opens the owner's mail app. PEA does not send email. Draft proposals are tab-only and not restored as actions.

### Limits

- One explicit address and one draft per reply; names, attachments, CC/BCC and automatic sending are not supported. Mail-app handling varies by browser and device.

## [0.1.0-dev.5] - 2026-11-12

### Added

- Model-proposed story titles can be reviewed and deliberately added to the Today board. Action-block text is withheld from visible and spoken replies; malformed or unsupported actions are never applied.

### Limits

- One title-only story proposal at a time. No automatic task execution, dates, reminders, email, calendar or document writes. Proposals are not revived after reload.

## [Unreleased]

### Added

- Compact workspace menu for new chats, history and memory, interview, connections and privacy; keyboard navigation for the Chat / Today / Greenhouse tabs.
- Reconciled the encrypted local conversation library and optional time-of-day delivery with the later web security fixes.


## [0.1.0-dev.2] - 2026-11-11

Development build. Security review follow-up (2026-11-11); no change to what the app asks Google for.

### Fixed

- Service routes refuse `.` and `..` path segments in every spelling (`..`, `%2e%2e`, backslashes) before any request is made, so a path can no longer be normalised onto another repository's route if a caller forgot to validate it first.
- The public build-identity endpoint computes its answer at most once a minute instead of running Git or re-hashing program files on every unauthenticated request.
- A deeply nested JSON body is answered as an ordinary invalid request on Python versions where it raised a recursion error.

### Changed

- The GitHub delivery checks for repository names and source files moved into the tested connections module, with tests.
- Security notes now state that Google's sign-in script runs in the page while you connect Google, that any other static host must send the gateway's security headers, and that full Drive and optional Gmail read are an intended, disclosed choice for this self-hosted web app.

### Added

- Independent public web-only repository, Apache 2.0 licensing, own CI and co-use/dependency documentation. The private native checkout remains intact.

### Changed

- Footer identifies PEA as a Bamcio Ventures LLC product; private-host integrations can offer a Classic voice link.

## [0.1.0-dev.3] - 2026-11-08

### Added

- Optional local-time character delivery in Interview & persona: quiet hours, morning, daytime and evening, with softer device-speech speed/pitch during quiet hours.
- Profile-local explicit toggle, off after reload/unlock; coarse period only in model review, with no location, precise clock time, background timer or extra inference call.

### Fixed

- Sticky dialog headings cover scrolled text in the top padding.

### Limits

- A fictional delivery cue, not human feelings or an autonomous life. Browser voices interpret speed/pitch differently; physical-device audio still needs acceptance. The encrypted archive schema is unchanged; this optional toggle is tab-only.

## [0.1.0-dev.2] - 2026-11-08

### Added

- Searchable Chat/Greenhouse library, structured profile interview and optional encrypted browser-local conversation/memory saving.
- Owner-reviewed facts sourced to exact owner-message quotes, separate model-sharing toggle and bounded recent/relevant recall with expiry.
- Explicit restore/fresh/forget/lock controls, per-profile boundaries and conflict detection for competing browser tabs.

### Changed

- Reconnecting OpenRouter preserves conversations. Restored context clears prior model approval; exact selected facts and bounded message history are shown before sharing.
- Preview assistant replies are excluded from live model context; source messages are never silently trimmed to satisfy archive limits.

### Limits

- Development source; no installed runtime update, native sync, backup/export or real-account acceptance is implied. See the memory guide before enabling local saving.

## [0.1.0-dev.1] - 2026-11-07

### Added

- Chat, Today and Greenhouse, OpenRouter BYOK and a customer-owned local-model gateway.
- Profile-bound Google context and PEA folder, reviewed document creation, task board and optional specialist/GitHub workflows.
- Version/build footer, local changelog, explicit release checks and reviewed suggestion drafts.
- Signed versioned program packages, locally approved activation and rollback to the previous verified version.

### Changed

- Centered top tabs across desktop and mobile, with more comfortable dropdown and chat padding.

### Limits

- Development source with public upstream and Apache 2.0. Production signing, dependency bundling and signed installer releases are not configured.
- Persistent browser chat/memory, automatic device sync and remaining native document tools are still in progress. See the parity guide.
