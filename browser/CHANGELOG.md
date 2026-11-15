# PEA Web changelog

Notable user-facing changes. Versions follow semantic versioning; dated entries use Added, Changed and Fixed sections. Development builds are not published releases. The native iOS product has its own release process.

## [0.1.0-dev.24] - 2026-11-15

### Added

- Ask for a document and PEA can write one from twenty common kinds: resume, cover letter, letter, rental agreement, meeting notes, shopping list, checklist, invoice, meeting agenda, trip itinerary, meal plan, thank-you note, resignation letter, complaint letter, project brief, status update, sitter sheet, event invitation, bio and visit prep sheet, or a plain document.
- You read the whole text before anything is written. With a PEA folder connected, approval creates a formatted Google Doc there in one step. Without one, approval gives you the document as a file to download and nothing goes to Google.
- You can ask for changes to a document written in the same conversation. PEA replaces a Google Doc only if nobody has edited it since; otherwise it leaves it alone and says so.
- A rental agreement always ends with a note that it is not legal advice.

### Changed

- To-do confirmations are worded a little differently, for example "Added to your list" and "Left as it was".

## [0.1.0-dev.23] - 2026-11-15

### Added

- A to-do list on Today, separate from the story board. Add an item with an optional due time and reminder, check it off, reopen it, remove it, or clear the finished ones. Personal and Work each have their own list of up to 200.
- You can ask in Chat or Greenhouse to add or check off to-dos. PEA shows the exact changes and nothing happens until you approve; afterwards it says what was done and what was not, for example when it could not tell which item you meant. A model cannot delete items.
- Reminders appear inside PEA when their time comes, and as a system notification too if you choose that. They only appear while PEA is open in this browser; nothing runs in the background.
- A switch under the list lets your model see your open and recently finished to-dos for the current profile. It is off to begin with, and turning it on asks you to review what is shared again.
- "Add a to-do" in the command palette.

### Changed

- To-dos are kept with the story board: in this tab, or in the same encrypted record if you turned that on. A board with to-dos cannot be opened by an earlier build, which refuses it without changing it; a board without to-dos is saved exactly as before. Make an encrypted backup before trying an older build.
- Model proposals for a story now use a block named `pea-story`. `pea-task` now means to-dos, as it does in the iPhone app.

## [0.1.0-dev.22] - 2026-11-15

### Added

- Drop a text, code or image file onto Greenhouse to open it, the same as Open locally. Drop it onto Chat to also select its text for your next message; you still see the exact excerpt in the review before anything is sent.
- Drag a message onto Today, or onto the Today tab, to start a story from it. The title and scope are filled in for you to edit, and nothing is added until you choose Add to Inbox.
- A file dropped anywhere else no longer makes the browser leave the app to display it.

### Changed

- Side-by-side workspaces now sit a little below the setup cards instead of touching them.

## [0.1.0-dev.21] - 2026-11-15

### Added

- A command palette: press Command-K on a Mac or Ctrl+K elsewhere, or choose Commands in the menu, then type a few letters and press Return. It can go to a workspace, open one beside another, start a new chat, add a story, open past chats, the interview, connections or privacy, and switch theme or profile.
- Keyboard shortcuts: Control-1, 2, 3 on a Mac (Alt elsewhere) for Chat, Today and Greenhouse; Command or Ctrl with backslash for the second workspace; Command or Ctrl with Return to send; slash to start writing; question mark for the list. The menu has a Keyboard shortcuts entry.
- Commands and shortcuts only press controls already on the page, so every review still appears. They do nothing while a review or any other dialog is open, and plain keys are ignored while you are typing.

## [0.1.0-dev.20] - 2026-11-15

### Added

- On a wide screen two workspaces can sit side by side, for example Chat next to Today. Use the split button beside the theme switch, or Shift-click a tab to choose which workspace opens beside the current one. Drag the divider or use the arrow keys on it to resize; each pane scrolls on its own and can be swapped or closed from its bar. The layout is remembered on this browser as workspace names and a width, nothing else.
- With Today beside Chat, a story you approve appears on the board while the conversation stays in view.

### Changed

- Narrow screens are unchanged: one workspace at a time with the same top tabs, and no split control. The app now reopens on the workspace you last used instead of always opening on Chat.

## [0.1.0-dev.19] - 2026-11-14

### Fixed

- The app sometimes opened as a page whose buttons did nothing. The local gateway kept only five connections waiting, a browser asks for about twenty files at once, and a refused file meant the app never started. Reloading usually worked. The gateway now accepts the whole burst, and serves 64 connections at once instead of 8 so a second tab or a phone beside a desktop is not turned away.
- A review that opened straight after another one closed could be cancelled without a word, because the first dialog reported that it had closed a moment late. Nothing was approved by mistake, but an approval could be lost and the request had to be repeated. Late reports are now ignored.

## [0.1.0-dev.18] - 2026-11-14

### Fixed

- With Reduce Motion turned on in the browser or operating system, most of the interface lost its styling: layout, colors, dialogs and the mobile view. A motion-only style block was never closed, so everything after it applied only when motion was allowed. The setting now removes animation and nothing else.

## [0.1.0-dev.17] - 2026-11-13

### Added

- The interview asks thirteen separate questions, each with optional Read question and Dictate answer controls, and states whether answers are being saved on this browser.
- An interview profile can be moved between browsers as a passphrase-encrypted file. Import fills only empty answers by default, or replaces every field after a field-by-field review.
- The Today board has an encrypted backup and restore, and captured stories can be edited by hand, by an "edit task" command or by reviewed dictation.
- Chat and Greenhouse have a voice screen with an editable transcript and explicit Send. A device voice and speed can be chosen for read-aloud.
- "Open Greenhouse" or "take me to Today" switches tabs without a model request, and a completed reply may offer one navigation button for the owner to click.

### Changed

- The saved library uses schema 2 for the expanded interview. A schema 1 library stays readable and is upgraded only after an owner review.
- Profile files use 600,000 PBKDF2 rounds; files from an earlier development build still open.

### Limits

- Profile files, board backups and library backups are Web-only snapshots. iPhone cannot import them and nothing synchronizes automatically.
- Browser speech recognition may use an online service. Physical-device and real-account acceptance are still outstanding.

## [0.1.0-dev.16] - 2026-11-13

### Fixed

- Replies may now run to 3,500 tokens (the gateway accepts up to 4,096), so reviewed email and document proposals are no longer cut off before they can be offered. The provider review shows the cap.
- A full conversation library, an over-long reply or a reply that resembles a credential no longer stops saving for the rest of the session. Such text is replaced or shortened in the saved copy only.

### Changed

- Encrypted library and board keys use 600,000 PBKDF2 rounds. Existing records are re-keyed on their next unlock; an older build then refuses the upgraded record without changing it.
- Each PEA-created file opened under the Drive source setting is shown in its own model review before its excerpt is shared.
- The page refuses to run inside a frame. The gateway adds framing and cross-origin isolation headers and closes connections that do not deliver a complete request within 20 seconds.

### Limits

- Higher reply caps raise the possible cost of one reply on paid models. Calendar and mail snapshot contents are still not re-reviewed on refresh.

## [0.1.0-dev.15] - 2026-11-13

### Changed

- Improved type sizes, dialog and action spacing, theme-aware dropdowns, and narrow-phone layouts across the workspace.
- Guided setup includes GitHub, provider key-creation links, paste controls for supported connections, and Google origin copy.

### Limits

- Clipboard access depends on browser permission and secure context; direct field paste remains available. Fish Audio and ElevenLabs are not yet integrated in PEA Web; their setup screen links to provider guidance without accepting unused keys.

## [0.1.0-dev.14] - 2026-11-13

### Changed

- A cleaner mobile-first workspace uses compact setup and memory cards and a transparent pea icon for both themes.
- Guided connection setup helps choose OpenRouter, a customer-owned local model or Google; full settings remain available. The optional interview is organized into three skippable steps.

### Limits

- Connection choices still require the customer's own credentials, server or Google OAuth setup. No account is connected and no data is shared by choosing a wizard option.

## [0.1.0-dev.13] - 2026-11-13

### Fixed

- Encrypted story boards detect competing browser-tab saves instead of silently overwriting a newer board. Unsaved changes remain visible until the owner chooses whether to reload.
- Locking or canceling while the board is being unlocked or saved cancels pending work where possible.

### Limits

- Conflicts require manual recovery; there is no cross-device sync or automatic merge.

## [0.1.0-dev.12] - 2026-11-13

### Added

- Reviewed story proposals can include the discussed scope and completion criteria, which appear on the Today board after approval.

### Limits

- Proposals never start work, schedule reminders or make external changes. Empty scope and completion criteria remain optional.

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
