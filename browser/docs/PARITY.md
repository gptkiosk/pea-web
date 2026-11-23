# PEA Web and iPhone parity

Evidence date: 2026-11-15, Web `0.1.0-dev.27`. This page is the one place that says what each app has. Formats the two apps share are defined in [CONTRACTS.md](CONTRACTS.md) and checked by shared fixtures. The apps keep their own layout and audio; behavior and formats are what must match.

How to read the status columns:

- **Built**: in the source and covered by automated tests on that side.
- **Not yet**: planned, with the release it is planned for.
- **Not possible** or **By design**: a platform limit or a deliberate difference.
- Nothing on the Web side has been through real-device or real-account acceptance yet. That is tracked in [OPERATOR-ACCEPTANCE.md](OPERATOR-ACCEPTANCE.md) and is the last step before a release, not a row here.

## Shared features

| Feature | Web | iPhone | Differences and what is left |
| --- | --- | --- | --- |
| Chat, Today and Greenhouse workspaces | Built | Built | Layout differs by design |
| OpenRouter models with separate roles | Built | Built | None known |
| Owner's own local model | Built, Chat and Greenhouse | Built, Chat only | iPhone has no local Greenhouse |
| Model-sharing review before every new disclosure | Built | Built | Web re-reviews when a file excerpt, name or setting changes |
| To-dos with reminders (`pea-task`) | Built | Built | Web reminders appear only while the page is open, unless the owner hands them to PEA for Mac, which shows them as notifications |
| Documents from 20 templates (`pea-doc`) | Built | Built | Web has one look, no bold or italic; Web offers a file when no folder is connected |
| Replace a document only if unchanged | Built | Built | None known |
| Call, text and directions (`pea-open`) | Built, needs a number | Built, looks names up in Contacts | No Contacts in a browser |
| FaceTime and Shortcuts | Not possible | Built | iPhone only |
| Copy boxes, never read aloud | Built | Built | None known |
| Never passes as human, enforced by the app | Built, English | Built | None known |
| Assistant's name sent with every request | Built | Built | iPhone also always sends the owner's first name; Web sends it only with the shared introduction |
| Time-of-day delivery, remembered | Built | Built | None known |
| Interview and persona | Built, 13 questions in a form | Built, spoken | Web has no continuous voice-led interview or separately protected wellbeing questions |
| Email draft (`pea-email`) | Built, opens the mail app | Built, with Contacts and an optional Shortcut | Formats not yet aligned; Web has no CC, BCC or attachments |
| Calendar | Built: an approved event is added to the main Google calendar when the owner has granted the wider permission, otherwise a file to import | Built, changes the calendar directly | Web changes or deletes only events it added itself, never the owner's other events. No guests, recurrence, all-day events or other calendars. Formats not aligned with iPhone |
| Calendar and Gmail glance | Built, read-only | Built | None known |
| PEA Drive folder | Built | Built, with PDF and richer import | Web has no PDF import. Web trusts only its own private mark on files; files the iPhone app created show as not confirmed until the owner confirms them |
| Simple forms | Built | Built | None known |
| Sheets and Slides editing, receipt ledger | Not yet, after 0.2 | Built | |
| Curated sources and briefs | Partly built: browse the curator's list, follow a show, keep the checked briefs of its three newest episodes in this browser across reloads (none to five by choice), with a permanent number for each show, a switch per show, topic filters, an optional check by itself every six hours, a list of the newest kept episodes, a detail page for each show (pin an episode, rename the show, check it alone), a storage limit the owner chooses, a Talk from briefs switch, another catalog address read through the PEA server, and prepare a podcast request | Built | Web uses a brief, and the kept digest after it, in conversation only for the episode open in the numbered list. No publisher transcripts, topics, citations, retention settings or background refresh. See "Curated sources" below |
| Story board | Built, with model proposals (`pea-story`) | Built | Web-only block name |
| GitHub draft pull request and image specialist | Built | Built | None known |
| Model configuration export and import | Built | Built | Same portable format |
| Voice | Built with browser speech, and read-aloud with the owner's ElevenLabs or Fish Audio key through the owner's gateway | Built with native speech and Walk mode | Web provider voices need the gateway, read a whole reply before speaking (no streaming), and have one fixed model each. No provider speech recognition, no voice-led conversation with a provider voice beyond read-aloud, no locked-screen voice in a browser. Voice settings were not compared with the iPhone's |
| Conversation history and reviewed memories | Built, encrypted on this browser | Built, encrypted archive | Archives are not interchangeable yet |
| Moving interview answers between apps (profile file) | Built: export and import, web to web | Not yet | The file format is now a shared contract with fixtures ([CONTRACTS.md](CONTRACTS.md#the-profile-file)); the iPhone app has to adopt it in its own change before a file can go either way |
| Encrypted backup and restore | Built, Web-only files for the library and the board. Web also writes and brings in a shared per-profile backup file, defined here with test files; bringing in only adds | Built, one file per profile in the PEA folder | The shared format is Web's proposal: the iPhone app does not read or write it, and its own backup file was not compared. No file in the PEA folder and no automatic sync |
| Weather | Built: a card on Today for one place the owner types | Built | Web asks Open-Meteo directly from the browser after a review; shown to the owner only, never given to a model; free service is for non-commercial use |
| Public research | Partly built: one public page at a time in Chat, by the owner's typed address or a model's suggestion, each exact address approved first; kept as plain words and shared with a model only under the sharing review | Built | Web has no search, follows no links, reads no PDFs, and offers no actions from replies written while a page is shared. Needs the PEA server connected. iPhone behavior not compared |
| Headlines | Built: a card on Today listing titles from RSS or Atom feeds the owner adds; read by the PEA server on Add and Refresh only | Built | Web has no built-in sources and no news service; shown to the owner only, never given to a model. iPhone behavior not compared |
| Home card | Built as "At a glance" at the top of Today: weather now, next connected-calendar event, open to-dos, three newest headlines | Built | Web's is a summary of the cards already on Today and asks nothing of anyone; the iPhone card's contents were not compared |
| Her history cards | Built: the owner's model writes them in one reviewed request, from her home in the interview and optionally one public page; every card is reviewed before it is kept; at most two go with a Chat message | Built | Written from the owner's description of the iPhone behavior, not from its source. Web reads at most one public page the owner names, where the iPhone uses a few Wikipedia pages it finds; web keeps cards in the browser unencrypted and outside the profile file; web selection of cards is by tag and topic words, English only |
| Dated entries about her days (life timeline) | Built as "Her days": a week the owner's model writes in one reviewed request, plus notes from Chat that the owner turns on | Built | On iPhone these come from what she says in chat; how it recognises them was not compared. On web the model marks a note with a `pea-life` block and the app keeps one clean sentence. The written week is a web addition the owner asked for. No timeline view beyond the dated list |
| Deck projects | Built to a Web design: a reviewed outline, then reviewed slides, edited by the owner and downloaded as one file | Built | Designed for Web without the iPhone app's behavior to hand, so the two were not compared. Web makes no Google Slides or PowerPoint file, uses no images or themes, and does not revise a single slide with the model |
| Automatic sync between devices | Not yet | Not yet | |

## Web only

| Feature | Notes |
| --- | --- |
| Two workspaces side by side | Wide screens only |
| Command palette and keyboard shortcuts | Never active while a review is open |
| Drag and drop of files and messages | A drop never sends, saves or approves |
| Works on Android and other browsers | Over HTTPS to the owner's own gateway |
| Local package with signed releases | First signed pre-release `v0.1.0-rc.1` published 2026-11-17; no stable release yet. An installed checkout can update to a signed release with one command, or from the app when its operator turns that on |
| Mac launcher app (menu bar and Dock) | Development build only, unsigned; opens PEA in the normal browser. See `mac/README.md` in the repository |

## Not built on either side

Gmail drafts through the API, Sheets documents from a model, resume import, food or ride ordering, refresh while the app is closed, recurring reminders, and deleting to-dos by voice or by a model.

## Keeping the two in step

1. A feature is built on one side with tests.
2. If it has a format a model writes, the format goes into [CONTRACTS.md](CONTRACTS.md) and vectors go into the shared fixtures, in the same change.
3. The other side builds it from the contract and takes a reviewed copy of the fixtures.
4. The row here changes when each side lands. A new iPhone feature starts as a row with Web "Not yet".

## What a release must say

The browser is not yet feature-complete against native. A public release must label these gaps rather than present source checks as full parity. No developer-host relay, Open WebUI owner login, bundled provider key, membership-token workaround or customer runtime data is required. Background/locked-screen browser microphone reliability is not promised.

## Her life and her way of writing

Web deals the assistant's character a set of five interests and five people from its own list (`browser/life.mjs`), turns a different one up each day, tells the model to use them rarely and never the same one twice running, and writes her history and week around the same set. In Chat the model is also asked for plain human writing: no long dashes, no emoji unless the owner uses them, no lists in ordinary talk, no stock phrases. Both apps keep the same line on what PEA is: it does not volunteer that it is an AI, never claims to be human, and answers a sincere question plainly. What the iPhone app does for her life and style is not recorded here.

## Scholarly papers

The iPhone app looks up papers in OpenAlex alongside its web search and attaches them to science claims (as the owner described it; its code was not read). Web has one reviewed search at a time (`browser/research.mjs`, `browser/research-ui.mjs`): the owner types "papers on …" or presses a button the model offered, reviews the exact search words and address, and the PEA server asks OpenAlex once with no key. The titles, authors and the start of each abstract are kept as plain words in the tab and go to the model only with the next reviewed Chat message. There is no automatic lookup, no attaching of papers to a brief's claims and no web search.

## Wikipedia and TV show lookups

The iPhone app has built-in lookups for weather, local news, TV shows and Wikipedia, each with a switch and a health dot (as the owner described it; its code was not read). Web already had weather and news feeds. It now also has Wikipedia and TV shows as reviewed lookups in Chat (`browser/research.mjs`): "wikipedia …" or "tv show …", or a button the model offers; one request each through the PEA server to `en.wikipedia.org` or `api.tvmaze.com`; the answer kept as plain words with its source and licence and shared only with the next reviewed message. Web has no per-lookup switch or health dot, no list of followed TV shows, and nothing is looked up unasked.

## Web search

The iPhone app searches the web with the owner's own Brave or Browserbase key and summarises pages into web briefs (as the owner described it; its code was not read). Web has one reviewed search at a time with either key (`browser/research.mjs`, `browser/research-ui.mjs`, gateway route `/v1/search`): "search for …" in Chat or a button the model offers, a review of the exact words and provider, one request through the PEA server, and up to five results with their extracts kept as plain words in the tab until the next reviewed Chat message. Brave is asked through its LLM Context endpoint, which Brave names for results a model will read; Browserbase through its Search endpoint with excerpts. Web makes no separate "web brief" by a model, fetches no result page by itself, and keeps no result beyond the tab.

## What the owner tells her

With a switch the owner turns on, Web keeps a few of the owner's own Chat sentences about their life for 60 days in the saved library (version 3), picked by a fixed rule with no model involved, and gives up to four that fit to a later Chat conversation (`browser/memory.mjs`, `browser/memory-ui.mjs`). This is Web's own design; nothing here was taken from or checked against the iPhone app.

## I type, you talk

Both apps have this mode (the iPhone side as its owner described it; its code was not read). It is off on every launch; the owner types and every reply is read aloud with the voice already chosen; the microphone is never used; a Stop speaking control appears while PEA talks; a new message ends the reading; and the model is told the reply will be heard. Differences on Web: the reading does not stop when headphones are unplugged, because a page cannot see that; only numbered navigation lists are spoken among PEA's own fixed replies; a long reply is read whole by the device voice, while a provider voice still asks about length; and the reading continues while the page is hidden.

## Set answers and numbers

When a reply needs the owner to pick between a few set answers, Web shows them as numbered buttons under the newest reply and in the voice room. A pressed button, a number said or typed, or the answer's own words all send that answer's exact words as the owner's next message; anything else is sent as the owner's own answer. The number is matched by fixed rules in `browser/choices.mjs`, never by a model, and picking an answer approves nothing. What the iPhone app does here is not recorded.

## Curated sources

Both apps read the same public catalog (`gptkiosk/pea-knowledge-processor`, format 1.3) and must apply the reader's contract in that project's `docs/APP-CONTRACT.md`. Web applies its checks to `store.json`, a followed source's `items.json` and briefs (`browser/knowledge.mjs`), and runs that project's golden brief corpus and its hostile store and brief files. Web fetches only after the owner approves, only on Browse, Follow or Refresh, and keeps briefs in the tab. Web has **Request a podcast**, which prepares a filled-in request on the catalog's GitHub page. Not on Web: briefs chosen by search for a conversation, digests, transcripts from the publisher, topics, scientific citations and live scholarly lookups, the briefs index, retention and storage settings, refresh in the background, and the option to download every source. The iPhone side is as its owner described it; its code was not read.

## Numbered navigation

The iPhone app walks followed shows by number in four levels: Show → Episode → Section → Citation, with search and fact-check of a section (as the owner described it; its code was not read). Web has all four levels over the shows followed in Curated sources (`browser/shownav.mjs`): "list shows", "Show 1", "1.2", "1.2.3", "section 2", "next episode", "where am I", with the same priority order and the same addresses. Citations are the ones the catalog's format 1.4 briefs carry (`citationsOf`, checked by Web's own rules because the published schema does not describe them): listed and opened by address, shown with the pipeline's reading labelled as the pipeline's, and shared with the model as labelled lines while their section is open. "Check studies" and "search 1.2.3" open the reviewed OpenAlex lookup or the reviewed web search with the section's sentence as the words; nothing is asked before the owner approves. The iPhone app also attaches papers it finds live in chat to a section as citations, grounds vague asks ("the actual study") against the open section, runs OpenAlex and a web search together, and falls back to OpenAlex when its search allowance is used up; Web does none of these and has no search allowance. While an episode is open, Web shares that one brief with the model in Chat as quoted, labelled evidence, after the sharing review (`briefInPlay`); the iPhone app chooses up to three briefs by search, which Web does not. Web uses the same kind of fixed grammar (`browser/numbered.mjs`) over what it has: Feed → Headline from the Headlines card ("list feeds", "feed 1", "1.2", "next headline", "read it"), and the numbered points of the newest reply ("list points", "point 2", "next point"). Commands are matched by rule on the page, never by a model; headline titles are not sent to a model; a point is sent on as its own words. "Search point 2" and "fact check point 2" are refused in plain words. Web reads a publisher's transcript only when the owner asks to go deeper and approves its address (`browser/transcript.mjs`): up to three passages nearest the open section are shown and shared word for word, kept in the tab only; the iPhone app fetches it by itself and keeps it on the device.

## What PEA did for a reply

Web shows a list of steps with icons over each reply while PEA works on it, and folds it to one line when the reply is done. The steps are what the page itself sent and timed: counts and names of what went with the message, the approval used, the model and where it runs, the time to the first words and the time to write. A request that was stopped or did not finish says so. The list is built by `browser/activity.mjs` from the request, never from a reply's words; it is kept in the tab only and is not saved, backed up or sent to a model. It covers conversation replies in Chat and Greenhouse. Reading a web page (over the page card), a picture (over it in Greenhouse) and an approved document (under the reply that proposed it) have the same kind of list, built a step at a time by the code doing the work and started at the owner's approval. So do a calendar change (under the reply), a refresh of calendar and mail (in Upcoming), a GitHub delivery (under its button) and a deck request (under the deck form). Project engine requests have none. **Export this chat…** in the workspace menu makes a plain text file of the Chat conversation in the browser. With **Include debug detail** each reply also carries its steps and a fuller record (`trailDebug`): times in milliseconds, model id, request and reply sizes, the instructions included, and the outcome. No keys and none of the shared context's words are in it. What the iPhone app shows or exports is not recorded here.

## Projects from the owner's project engine

Browser-only, with no iPhone equivalent. Where the gateway's operator connected a project engine (see Self-hosting), Today has a Projects card: the engine's projects, one project's stories with state, agent, model, run time and cost, and a form that leaves a draft after a review. A model may suggest a draft, which only fills the form. PEA cannot plan, approve, start or pay for a project, and no model sees what the engine answers. It is tested against a stand-in engine only; no real engine has answered it.

## Workspace navigation

On a screen at least 1,100 pixels wide the owner can show two of Chat, Today and Greenhouse side by side, resize them and swap or close either. Each profile keeps its own arrangement in this browser. This is a browser-only layout choice with no iPhone equivalent: it shows and sizes the existing workspaces and cannot open a file, approve a review or grant access. Every review behaves the same in one pane or two. The layout is stored on this browser as workspace names and a width. Going to a workspace that is already on screen focuses it; otherwise it replaces the focused pane. Reading a reply aloud still stops when focus moves to the other pane.

Settings, Past chats & memory and Privacy & voice on Web open on a home of tiles and show one section at a time (`browser/settings-ui.mjs`); the menu has a Knowledge sources entry that goes to Curated sources on Today, and a show asked about by name in Chat is listed as rows to press; help, commands and keyboard shortcuts are one menu entry that also finds a setting by what it is for. Links to settings are browser-only (`browser/settings.mjs`): a fixed list of places; the owner's typed words, a message of PEA's own that names a place, a model's `pea-nav` block of the exact shape `{"op":"settings","place":…}` (a button only) and the address `#settings/<place>` can each open one. On a wide screen the panel opens beside the workspace and the model is told which panel is open so it can guide the owner; it cannot see or change a setting. Going to a place fills no field and grants nothing.

A command palette and keyboard shortcuts are also browser-only. Each command activates a control that is already on the page, the list is built by the app and never from model output, and no command approves a review, sends a message past the model-sharing review or grants access. While any dialog is open, including every review, shortcuts are ignored. Changing profile or starting a new chat is not offered while a request is running.

Drag and drop is browser-only as well. A dropped file is opened by the same code and limits as the file picker (text or code, PNG, JPEG or WebP, under 4 MB, not in the Blended profile, not while a request runs). On Chat its text is also selected for the next request, which is still shown in the model-sharing review. A dragged message carries only its identifier; dropping it on Today fills in the story form and adds nothing. No drop sends, saves or approves anything.

The owner can type or dictate an explicit command such as “open Greenhouse” and submit it; the command switches to an existing workspace without a model request. A model may also suggest a Chat, Today or Greenhouse navigation button in its completed reply. Only the owner's click changes tabs. The proposal cannot include a URL, file, tool call or additional action; it is bound to the originating profile and conversation, is not restored after reload and cannot run while a request is active. Recognition still requires transcript review before submission. This does not open a specific document or execute a task.

Next sequence after 0.1.0: secured public research with weather and the Home card → her history and daily life → direct calendar changes → additional voice transports → deck projects → iPhone-readable backup and reviewed synchronization. Web library scope/limits are documented in [memory and recovery](MEMORY.md). Each slice must retain provider disclosure, profile boundaries and reviewed external writes.


## Reviewed story proposals

When an owner asks to capture a story, a model can propose one short title and optional scope and completion criteria. The owner selects **Review story** and explicitly approves the exact title, scope, completion criteria and profile before it is added to the Today board's Inbox. Cancellation changes nothing. A proposed story never starts work or sends messages; it follows the board's existing local/encrypted storage settings. The proposal is consumed after one successful addition, tied to its originating profile and conversation, and is not restored as an actionable item on reload.

The owner can edit a non-running, non-removed story's title, scope and completion criteria on its card or by submitting a command such as “edit task one”. In the editor, optional browser dictation fills a separate draft; the owner reviews it and explicitly chooses which field to replace before saving. Browser recognition may use an online service. Existing output is preserved and identified as based on the story at the time it was generated; edits do not dispatch work. The active profile and unchanged story are checked again at save, and the board's existing optional encrypted saving and conflict handling apply.

This slice accepts one complete, narrowly structured `story_add` proposal in a `pea-story` block with a title and optional bounded scope and completion criteria. Other fields, dates, reminders, completions, multiple blocks, credentials and malformed or interrupted blocks are rejected. Action blocks are withheld from displayed/read-aloud reply text, including while streaming. Ordinary code blocks remain visible. Claims that a story was already added receive an explicit no-action notice; a successful approval displays a local receipt. No retrieved material, persona or model output can approve an action. This is not yet parity for iPhone to-dos, reminders, direct calendar changes or richer Google document actions initiated by the model.


## To-dos and reminders

`pea-task` means the same thing in both apps: a JSON array of `{"op":"task_add","title","due","remind"}` and `{"op":"task_done","title"}` rows. `due` is the owner's local time written `YYYY-MM-DDTHH:MM`, not UTC. Titles are one line of up to 120 characters without credentials, and each profile holds up to 200 items. Adding a title that is already open is skipped and said so. Checking off needs one clear match: an exact title, or failing that a single partial match; otherwise nothing is checked off and the receipt says which request was unclear. A reminder is kept only for a future due time. There is no delete or recurring operation for a model.

Web refuses the whole block if any row has an unknown operation or field, a malformed due time, or more than 8 rows, and if the reply contains any other action block. The owner sees every change in one review and approves or cancels all of it. The open items are sent to a model only under a per-profile switch that starts off; changing it asks for the model-sharing review again, and later changes to the list are then sent without a new review, as with calendar and mail snapshots. The Blended profile has no list.

Story proposals moved to their own `pea-story` block with `story_add`, so the two never collide.

## Phone links and copy boxes

`pea-open` carries one row. `open_call` and `open_text` take a `number` of 7 to 15 digits and an optional `who` used only as a label; a text also takes a `message` of up to 500 characters. `open_directions` takes `to` (up to 150 characters) and a `mode` of driving, walking or transit. A row with a name and no number is refused, because a browser cannot look a name up; so are `open_facetime`, `open_shortcut`, unknown fields and anything credential-like. The app builds the link from the checked parts and percent-encodes them, so a model never supplies an address and a place name cannot change where a link goes. The owner reviews the action, with a text shown word for word, and approval only reveals a link. Directions open Apple Maps on Apple devices and Google Maps elsewhere, in a new tab without a referrer, and only when pressed; the review says the place is sent to that service. Nothing is restored after reload.

Text inside an ordinary fenced block is a copy box: shown with its label and a Copy button, and left out of Read reply. A block still arriving already shows as a box. PEA's own action blocks are removed before this and are never shown or copyable.

## Honesty and the assistant's name

Every request carries a short rule: never say or imply being human, answer that question plainly, and keep stories about the character's own life as light conversation rather than fact or advice. The app does not rely on the model obeying. After each completed reply it adds one fixed sentence when the reply claims to be human or denies being an AI, or when the owner sincerely asked what PEA is and the reply did not plainly say it is an AI. Figures of speech such as "are you even human" do not count as sincere, text inside fenced blocks is not treated as a claim, and the sentence is added at most once. The sentence is part of the message, so it is also read aloud.

The assistant's name from the interview is sent with every request as a label, independently of the introduction-sharing switch. It is shown in the model-sharing review and is part of the approval identity. Only one line of letters, apostrophes, dots and hyphens in at most three words and forty characters is accepted; anything else, including text that reads as an instruction, falls back to PEA. The owner's own name still travels only with the shared introduction.

Local-time delivery is now a per-profile preference stored on the browser as two booleans. Not yet ported from iPhone: parsing a home city for weather and news, and removing unprompted disclaimers.

## Reviewed email drafts

A completed model proposal may offer a draft to one explicitly specified email address. Review shows the originating profile, exact address, subject and body. Cancel changes nothing; approval reveals a separate mail-app link, and the owner chooses whether to open and send it. PEA does not transmit email itself. The model cannot add headers or multiple recipients, and malformed, interrupted, oversized, credential-like or mixed action blocks are rejected. The model's action block is hidden from displayed and spoken replies and is not restored as an actionable draft after reload. Mail-client behavior and URL length limits differ; long drafts and physical mobile devices need acceptance testing. Contacts, attachments, CC/BCC and direct Gmail drafts are not implemented.


## Documents from templates

`pea-doc` with `doc_create` carries a type, a title of up to 100 characters and up to 30 sections, each an optional heading of up to 120 characters and a body of up to 8,000, with 40,000 in total. The types are the same twenty as the iPhone app plus `document`. Letters, notes and bios have no title line or headings, and headings that are only layout hints are dropped. In a body a line starting "- " is a bullet and "[ ] " an empty checkbox. Every character is escaped when the text becomes HTML, so nothing a model writes can become markup. A rental agreement always ends with a not-legal-advice note, shown in the review as well.

The owner sees a one-line summary and the whole text. With Google and a PEA folder connected, approval makes one multipart upload that creates a Google Doc in that folder, marked as created by PEA; an unclear answer is reported as uncertain and never retried. Without a folder, approval offers the same HTML as a file and nothing is sent to Google. `doc_update` applies only to the document written earlier in this tab for the same profile and carries the whole new text; a Google Doc is replaced only if its version is unchanged and it is still marked as created by PEA.

Only the layouts for kinds named in the owner's message are sent to the model, up to three. Differences from iPhone: no choice of look (the plain Arial look only), no bold, italic or underline marks, no list of research sources appended, and the open document is tracked for the tab rather than saved.

## Document and simple form proposals

A model can propose a title and content for a document or simple form in Chat or Greenhouse. The owner opens an editable draft; nothing is created by that action. The existing PEA folder flow separately requires a Google connection, a selected folder and an explicit creation review. Forms contain one long-answer question per line and remain unpublished. A model action cannot select a different folder or alter sharing. Malformed, mixed, oversized and credential-like proposals are rejected and not restored after reload. Real Google account behavior, richer formatting and other document types require additional work and acceptance testing.


## Adding an approved event to Google Calendar

With **Let PEA add events I approve** ticked at Google sign-in, PEA asks Google for `calendar.events.owned` (see, create, change and delete events on calendars the owner owns; narrower than `calendar.events`, which covers every calendar) instead of the read-only permission, and only that box asks for it. If Google's answer does not include it, nothing changes: events stay files. When it is granted for the current profile, approving a `pea-calendar` proposal sends one request that adds the event to the account's main calendar with the title, notes and the two reviewed instants, no guests, `sendUpdates=none`, and a mark (`extendedProperties.private.peaCreated`, kept on the owner's copy of the event) that a later slice will use to recognise PEA's own events. Any app the owner has given calendar access could set the same mark, so it is a label, not proof. The review names the account. Each proposal uses one event id for every try, so a retry after a lost answer is refused by Google as a duplicate and shown as already added. Google's reference says it cannot guarantee every repeated id is caught when an event is created, so this is strong protection against a double entry, not a promise. Google's own error text is never shown. A reply written while a web page is shared can offer no event, as with every other action. Not built: changing or deleting events, guests, recurrence, all-day events, other calendars, and a choice of file when the permission is granted. Not checked against a real Google account.

## Changing or removing an event PEA added

PEA asks Google for the coming events on the main calendar that carry its mark for the current profile. One counts as PEA's own only if it also has an id of the kind PEA chooses, a set start and end, no guests and no repetition. While the calendar snapshot is shared with the model, up to eight of them are listed with a short ref, title and times; no event id is sent. A `pea-calendar` block with `calendar_change` (ref, title, start, end) or `calendar_delete` (ref) is offered for review only if the ref names an event in that list. Opening the review fetches the event again, so the owner sees it as it is now. On approval PEA fetches it once more, stops if its version differs from the reviewed one, and sends the change with that version as a condition (`If-Match`), with `sendUpdates=none`. A change sets the title and times only. The mark is a label that any app with access to the calendar could set, so it narrows what is offered and the review is what authorizes. Not built: changing notes, events with guests, repeating or all-day events, the owner's other events, undo. Not checked against a real Google account.

## Reviewed calendar event drafts

Chat or Greenhouse can propose one event with explicit UTC start and end instants. The owner reviews the title, notes and both local-browser and UTC times. Approval reveals a download link for an iCalendar file; downloading and importing it are separate owner choices. PEA does not add an event, send invitations, or connect to a calendar for this workflow. Invalid dates, missing time zones, reversed or over-seven-day ranges, credentials, extra fields, incomplete and mixed actions are rejected. The proposal is not restored as an actionable item after reload. Browser downloads, third-party calendar import, recurrence, attendees and direct calendar writes need further work or acceptance testing.


## Encrypted library portability

The owner may prepare a passphrase-encrypted backup of the saved conversation library. The file includes both profiles and excludes provider credentials, permissions, files and the separate task board. Restore verifies the passphrase, authenticated ciphertext and library schema before a compare-and-insert to an empty browser; existing saved data and tab-only conversations are not overwritten. Unlock remains separate. This is a manual snapshot, not native archive compatibility, merging or automatic synchronization. Browser downloads and real-device restore need acceptance testing.


## Encrypted board conflict handling

The encrypted task board uses a transactional revision check so a stale tab cannot silently replace a newer saved board. On a conflict, that tab keeps its unsaved board visible and blocks further changes; the owner can copy anything needed before explicitly reviewing and reloading the saved board. Legacy encrypted board records are checked by their encrypted contents on their first subsequent save and upgraded with a revision. Lock or canceled unlock prevents pending work where possible. There is no automatic merge, cross-device synchronization or guarantee against a process stopping during a committed transaction.

The owner can prepare and download a Web-only encrypted board backup containing both profiles' stories, including removed stories and results. It uses the board's existing passphrase and excludes the separate conversation library, keys and permissions. Restore authenticates and validates the backup before an atomic insert into an empty browser; it refuses to overwrite an existing board or tab-only stories. Unlock separately after restore. This is a manual snapshot, not a merge, automatic synchronization or iPhone-compatible backup. A forgotten passphrase cannot be recovered.
