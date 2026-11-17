# PEA Web changelog

Notable user-facing changes. Versions follow semantic versioning; dated entries use Added, Changed and Fixed sections. Development builds are not published releases. The native iOS product has its own release process.

## [0.1.0-dev.51] - 2026-11-16

### Added

- Move a profile in one encrypted file. In Past chats & memory, **Move this profile** writes a backup of the profile in view (interview answers, memories, to-dos, her history and days, and deck projects) sealed with a passphrase you choose, and brings such a file in. Before anything is written you see what the file will hold. Before anything is brought in you see every item that would be added. Bringing in only adds what is missing: nothing already here is changed or removed, and where the file and this browser differ, yours is kept and the difference is listed. Chats, files, keys, tokens, permissions and sharing switches never travel. A file belongs to one profile and is refused in the other. The iPhone app cannot read this file yet.

## [0.1.0-dev.50] - 2026-11-16

### Added

- Groundwork for a backup any PEA app can read: a documented, versioned format for one encrypted file per profile, holding interview answers, reviewed memories, to-dos, her history and days, and deck projects, with test files other apps can check themselves against. Nothing in the app writes or reads it yet; the buttons come in the next change. Keys, tokens, permissions, sharing switches and chats never travel in it.

## [0.1.0-dev.49] - 2026-11-16

### Added

- Deck projects, in Greenhouse. Give a deck a title, say what it is for and choose 3 to 10 slides. Your Chat model writes an outline in one request that you review first, and you read the outline before it is kept. A second reviewed request writes the points and speaker notes for each slide, which you also read before they are kept. You can rename, rewrite or delete any slide yourself. When every slide has a point, **Download the deck** gives one file that opens in any browser, moves a slide at a time and prints to a PDF, with speaker notes on screen and left out of print. Only the title, your brief and the outline are sent to your model. Work and Personal each keep up to 12 projects in this browser, without encryption. Nothing is created in Google or any other account.

## [0.1.0-dev.48] - 2026-11-16

### Added

- Read aloud with an ElevenLabs or Fish Audio voice. Under Connections → Voice providers, choose the provider, paste your own key, load your voices (or type a voice ID) and pick one. It needs your PEA gateway connected, because the words go from this tab to your gateway and from there to the provider. The first read-aloud with a voice shows a review: who gets the words, the provider's listed price as a dated quote, the 3,000-character limit and what the provider keeps. After you approve, later read-alouds in that tab and profile go without asking. Your key stays in the tab's memory only; a reload asks for it again. If the provider fails, PEA says why and reads nothing; it never switches to another voice on its own. A reply longer than 3,000 characters is not sent whole; choose the short version or the device voice.

### Fixed

- Choosing how to read a long reply could do nothing if the choice was opened again very quickly after being closed.

## [0.1.0-dev.47] - 2026-11-16

### Added

- Groundwork for ElevenLabs and Fish Audio voices: both PEA gateways (the local server and the Mac app) can now turn text into speech with your own provider key, and list that key's voices. Nothing in the app uses this yet; the voice settings and read-aloud come in the next change. The gateway contacts only the two providers' own addresses, keeps no key, and passes on none of the provider's own words.

## [0.1.0-dev.46] - 2026-11-16

### Added

- PEA can move, rename or remove an event it added to your Google calendar, after your review. This needs **Let PEA add events I approve** and **Include upcoming Calendar context**, so that your model is told which coming events PEA added (title and times only). The review shows the event as it is in your calendar at that moment and, for a change, what it will become. Only the title and times change; notes stay. Nothing happens if the event was edited elsewhere after the review opened. PEA never touches events you or others made, events with guests, or repeating events; for those, use your calendar app. A removal cannot be undone by PEA.
- When a reply says it moved or cancelled an event itself, PEA adds a plain correction.

## [0.1.0-dev.45] - 2026-11-16

### Added

- PEA can add an event you approve straight to your Google calendar. It is off until you tick **Let PEA add events I approve** under Connections → Google and sign in again, because it needs a wider Google permission than the read-only one: to see, create, change and delete events on calendars you own. The review shows the title, notes, both times and the account; approving adds one event to your main calendar, with nobody invited and no notices sent, and shows a receipt with a link to it. If the answer is lost and you try again, PEA reuses the same event id so that Google refuses a second copy. Without the permission an approved event is still a file you import yourself. PEA cannot yet move or delete an event.

### Changed

- The assistant is now told that an event is added only by your approval, and the correction PEA adds when a reply claims to have scheduled something says the same.

## [0.1.0-dev.44] - 2026-11-16

### Added

- Her days, in Past chats & memory: short dated lines about your assistant character's own days, so that what she says tomorrow fits what she said today. **Write her week** sends one request, which you review first, and your model writes a line for each of eight days (the last three, today and the next four) set in her home and history; you read every line before any is kept. You can also let her keep a short note when she talks about her own day in Chat. That is off until you turn it on; each note is one plain sentence, you are told each time one is kept, and none is taken from a reply written while a web page is shared. Lines are fiction for light conversation, for the Personal profile only, kept in this browser without encryption for 14 days, and each can be deleted. The lines for the days around today go with your Chat messages only while "Share my introduction" is on.

## [0.1.0-dev.43] - 2026-11-16

### Added

- Her history, in Past chats & memory: short cards about your assistant's character, set in the home you chose for her in the interview. Your own model writes them in one request that you start and review; you may add one public page about the place for its real history, read by your PEA server after its own review. You read every card before any is kept, and can delete any card or all of them. Cards are fiction for light conversation, for the Personal profile only, and are kept in this browser without encryption. In Chat at most two cards go with a message, mostly when you ask about her, and only while "Share my introduction" is on; the model-sharing review lists every card that may be sent.

## [0.1.0-dev.42] - 2026-11-16

### Added

- "At a glance" at the top of Today: the weather now, your next calendar event, how many to-dos are open (with how many are overdue or due later today, and the next one), and the three newest headlines. Each line appears only when its card below has something, and pressing a line opens that card. The summary only repeats what Today already shows: it contacts nothing, and none of it is given to your model.

### Fixed

- "Add to Inbox", "Apply command" and "Dictate command" on the story board could stay disabled after a reply finished, if the board had been redrawn while the request was running. They now come back as soon as the request ends.

## [0.1.0-dev.41] - 2026-11-16

### Added

- Headlines on Today, from feeds you add. Paste the address of any site's RSS or Atom feed, approve it once, and its newest titles appear in a list, newest first across all your feeds (up to 8 feeds, 20 titles from each, 30 shown). Your PEA server reads a feed when you add it and each time you press **Refresh**, and never on its own, so it needs the server connected (Connections → Local model). Each title links to its page in your browser; **Read in Chat** reads that page through the usual approve-this-address review.
- Headlines are shown to you only. They are never given to your model and are not saved; only each feed's address and name are kept in this browser, for every profile, until you remove it.

### Changed

- The page reader in both gateways now also accepts feeds (`application/rss+xml`, `application/atom+xml`, `application/xml`, `text/xml`). Everything else about it is unchanged.

## [0.1.0-dev.40] - 2026-11-16

### Added

- Reading a public web page in Chat. Type `read https://…` yourself, or ask about a page and let your model suggest its address; either way PEA first shows you the exact address and what the site will learn, and reads nothing unless you approve. It needs your PEA server connected (Connections → Local model), because the server does the reading. PEA keeps up to 6,000 characters of the page as plain words, shows them above the chat, and gives them to your model only when you send your next message and approve the usual review. **Stop sharing** removes the page; so does a new chat or changing profile. The page is not saved with your chats.
- If a page has moved, PEA asks again with the new address instead of following it.

### Changed

- While a web page is shared, PEA offers no action buttons (email drafts, documents, to-dos and the rest) from the model's replies. Words on a stranger's page must not be able to steer you into an action. Stop sharing the page and ask again to act on what you learned.
- PEA does not search the web, follow links, run a page's scripts, or read PDFs and pages that only work with scripts.
- A release package may now name up to 200 web files instead of 100; this version has 101. No release has been published yet, so no installed copy is affected.

## [0.1.0-dev.39] - 2026-11-15

### Added

- Groundwork for public research: both gateways can now read one public web page when asked with the connection token. Nothing in the app asks yet, so there is nothing new to see. The reader only fetches `https://` pages from named public sites, never follows a redirect, never contacts a private or local address, sends nothing of yours to the site, and returns text only, up to 2 MB.

## [0.1.0-dev.38] - 2026-11-15

### Added

- Weather on Today. Type a town or city, agree to a short review, and choose the place you meant; Today then shows the temperature, conditions, wind and the next three days. It is off until you turn it on. Your browser asks Open-Meteo, a public weather service, directly: it sees your network address and the place, rounded to about a kilometre. The weather is shown to you only and is never given to your model. Open-Meteo's free service is for personal, non-commercial use. **Turn weather off** removes the saved place.

### Changed

- The page may now contact two more addresses, `api.open-meteo.com` and `geocoding-api.open-meteo.com`, and only for the weather card.

## [0.1.0-dev.37] - 2026-11-15

### Added

- The encrypted profile file that **Export this profile…** writes is now a documented, shared format with test files, so the iPhone app can adopt it. Nothing changes in the app yet: a profile still cannot be imported from an iPhone until the iPhone app writes this file.

## [0.1.0-dev.36] - 2026-11-15

### Added

- PEA for Mac can check for a newer release. **Check for Updates…** in its menu asks GitHub for the latest published release of the configured repository, only when you choose it, and tells you what it found. If a newer version exists it offers to open the release page in your browser. Nothing is downloaded or installed by the app, and it never checks on its own.

## [0.1.0-dev.35] - 2026-11-15

### Added

- Reminders as Mac notifications. With PEA for Mac, a reminder can now appear even when the browser tab is closed. It needs two switches, both off to begin with: **Show Reminders as Notifications** in the Mac app's menu, and **Also remind me through PEA for Mac** under To-dos on Today, which first shows exactly what will be handed over. The Mac is given the title and time of each open reminder in your Personal and Work profiles, and macOS keeps them in plain form outside the browser's encrypted storage. Turning either switch off withdraws them. Not yet seen working on a real Mac with the unsigned build.

### Changed

- The gateway rules gained a reminders route, `/v1/reminders`, which needs the connection token. The Python gateway checks a list the same way and answers that reminders are not available.

## [0.1.0-dev.34] - 2026-11-15

### Added

- PEA for Mac, as an unsigned development build: a menu-bar and Dock app that runs PEA on your Mac without Python or Terminal and opens it in your normal browser. It keeps the connection token in your Keychain, lets you set the local model address, can start at login, and offers another port when 18770 is taken. Build it with `mac/build.sh`. There is no signed download yet; the owner's signing steps are in `mac/SIGNING.md`.

## [0.1.0-dev.33] - 2026-11-15

### Added

- The browser-level tests can be served by the Swift gateway (`PEA_GATEWAY=swift`), and are in CI on a Mac, so the whole app is checked end to end against it.

## [0.1.0-dev.32] - 2026-11-15

### Added

- The gateway rewritten in Swift, in a new `mac/` folder, as the base of a Mac app that will need no Python and no Terminal. It reads the same rules file as the Python gateway and passes the same conformance suite. There is no app to download yet.

### Changed

- Both gateways now refuse a chat request with a repeated key, `NaN` or `Infinity`, text that is not UTF-8 or holds half of a surrogate pair, and any request that repeats a header deciding access (`Host`, `Origin`, `Authorization`, `Content-Length`, `Content-Type`, `Transfer-Encoding`). The app never sends any of these.

## [0.1.0-dev.31] - 2026-11-15

### Added

- A black-box conformance suite for the gateway, `browser/server/conformance/run.py`. It starts a gateway as a separate process with a synthetic model server behind it and checks, over plain HTTP, everything a PEA gateway must do and refuse: the file list, host and origin checks, the token, model list filtering, every chat refusal, streaming limits, connection limits and the request deadline. It imports nothing from the gateway, so the Mac app's gateway will be held to exactly the same tests. It runs in CI.

### Changed

- A request whose address begins with two slashes is now refused. Before, the answer depended on the Python version: some served the file as if one slash had been sent.

## [0.1.0-dev.30] - 2026-11-15

### Changed

- No change to how the app behaves. The gateway's rules (which files it serves, the security headers on every answer and every limit) now live in one file, `server/contract.json`, which the gateway reads when it starts. This prepares for a Mac app that will follow exactly the same rules.

## [0.1.0-dev.29] - 2026-11-15

### Changed

- No change to how the app behaves. This build adds stability tests and an acceptance checklist for the first release. The tests cover model failures, a reply cut off mid-stream, Stop, leaving the page during a request, a 30-turn conversation, full lists, a 4 MB file, two tabs on one encrypted board, and an encrypted library across a reload. They found no new defects.
- The requirements now name the browsers the interface is built for: Chrome and Edge 111 or later, Safari 16.4 or later and Firefox 121 or later.

## [0.1.0-dev.28] - 2026-11-15

### Added

- The release manager can mark a staged version as withdrawn (`revoke --release ... --reason ...`). A withdrawn version can no longer be selected or rolled back to; its files are kept.
- Selecting a version older than the one in use is refused unless you add `--allow-older`, because an older program may refuse data saved by a newer one. Rollback to the previous version still works as before.
- Check for updates now warns when a stable build's own version is no longer published, or is newer than the latest published stable version, since either can mean it was withdrawn.

### Changed

- Files PEA creates in your Google Drive folder now carry a private mark that only PEA's own Google connection can set, beside the visible "created by PEA" label. Only the private mark lets PEA share a file's text with your model automatically when you open it, or replace a document with a revision. Any app with access could set the old label.
- Files created before this version show "Labelled as created by PEA · not confirmed". A new **Confirm files PEA created…** button lists them for you to review; confirming adds the private mark and changes nothing else. Until then they are treated like files you added yourself.

## [0.1.0-dev.27] - 2026-11-15

### Changed

- Documentation only. The parity page now shows, feature by feature, what PEA Web and the iPhone app each have, what is planned and what is deliberately different. A new contracts page describes the formats the two apps share, backed by a set of shared test cases.

## [0.1.0-dev.26] - 2026-11-15

### Added

- PEA never passes as human. Every request tells the model so, and PEA checks each reply itself: if a reply says it is a person, or sidesteps a sincere question such as "are you an AI?", PEA adds one plain sentence saying it is an AI assistant.
- The name you give the assistant in the interview now goes with every request, so it answers to that name even when the rest of the interview is not shared. The model-sharing review shows the name, and changing it asks you to review again. A name must be up to three words of letters; anything else is treated as PEA.

### Fixed

- Copying from a copy box now always confirms with a short notice. The button's own "Copied" label could disappear straight away.

### Changed

- The local-time delivery switch is remembered on this browser for each profile instead of turning off on every reload.

## [0.1.0-dev.25] - 2026-11-15

### Added

- Ask PEA to call or text a number, or to get directions. You see exactly what will open, including every word of a text; after you approve, a link appears for you to press. PEA never places a call, sends a text or opens a map itself, and you still press Call or Send on your phone.
- A browser has no contact list, so PEA asks for the number instead of looking up a name. FaceTime and Shortcuts stay iPhone-only.
- Text a reply gives you to copy, such as an outline, a message to paste or code, now appears in a box with a Copy button. Read reply skips those boxes and reads only the words around them.

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
