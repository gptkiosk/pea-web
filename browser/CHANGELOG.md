# PEA Web changelog

Notable user-facing changes. Versions follow semantic versioning; dated entries use Added, Changed and Fixed sections. Development builds are not published releases. The native iOS product has its own release process.

## [Unreleased]

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
