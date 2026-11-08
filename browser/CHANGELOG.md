# PEA Web changelog

Notable user-facing changes. Versions follow semantic versioning; dated entries use Added, Changed and Fixed sections. Development builds are not published releases. The native iOS product has its own release process.

## [Unreleased]

### Added

- Independent public web-only repository, Apache 2.0 licensing, own CI and co-use/dependency documentation. The private native checkout remains intact.

### Changed

- Footer identifies PEA as a Bamcio Ventures LLC product; private-host integrations can offer a Classic voice link.

## [0.1.0-dev.3] - 2026-11-08

### Added

- Optional local-time character delivery in Interview & persona: quiet hours, morning, daytime and evening, with softer device-speech speed/pitch during quiet hours.
- Profile-local explicit toggle, off after reload/unlock; coarse period only in model review, with no location, precise clock time, background timer or extra inference call.

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
