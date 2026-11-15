# PEA Web and native parity

Evidence date: 2026-11-12. Share behaviour and connection contracts; keep platform-appropriate layout and audio. This matrix distinguishes implemented source from real-account/device acceptance.

| Capability | Web source | Native iOS source | Remaining acceptance/work |
| --- | --- | --- | --- |
| Chat / Today / Greenhouse, cream and dark green | Responsive, original pea art, compact workspace menu, setup cards, guided connection/interview flows and keyboard-accessible tabs | Compact native controls | Real mobile-browser testing |
| OpenRouter text and specialist models | Independent Chat/collaboration/coding/image roles; reviewed routes | Chat and independent Greenhouse roles | Real model/provider availability |
| Customer local model | Authenticated same-origin gateway; Chat and Greenhouse text | Own-server Chat connector | Physical phone/VPN stream; native local Greenhouse |
| Reviewed email draft | Explicit address, exact review, optional mail-app link; never sends | Native mail-app draft and contact resolution | No web Contacts, attachments or CC/BCC; real-device mail-client acceptance |
| Calendar event draft | Explicit UTC event proposal, review and manual iCalendar download/import | Native event workflow | No direct calendar write, recurrence or attendees; real calendar/device import testing |
| Calendar/Gmail glance | Optional read-only Google scopes, bounded previews; sharing in Settings | Existing Calendar/Gmail adapters | Live Web OAuth/client verification |
| PEA Drive workspace | Root confinement, moved-in files, nested list, text/image/code/simple diagrams | Same root contract, PDF and richer import | Live cross-device folder/version tests |
| Docs and Forms | Documents from twenty templates plus a plain document: one `pea-doc` block with `doc_create` or `doc_update`, the whole text reviewed, then a formatted Google Doc in the PEA folder or a downloadable file when no folder is connected; replacement only if unchanged since PEA wrote it. Simple unpublished forms and plain editable drafts remain | Richer Docs/Sheets/Slides/Forms, briefs and receipt ledger | Port the remaining richer tools to Web |
| To-dos and reminders | Per-profile list beside the story board; owner edits by hand; a model proposes `task_add` (optional local due time and reminder) and `task_done` in one `pea-task` block of up to 8 rows, applied only after a review of the exact changes, with an account of what was and was not done; in-page reminders and optional system notification while the page is open; optional sharing of open and recently finished items with the model | To-do list with local notifications and the same `pea-task` operations | Notifications when the app is closed are not possible in a browser; iPhone accepts a few looser block shapes that Web refuses; to-dos tied to a blocked calendar event are not ported; real-device and real-provider acceptance |
| Phone links and copy boxes | `pea-open` with `open_call`, `open_text` and `open_directions`: the exact action reviewed, then an owner-pressed `tel:`, `sms:` or map link built by the app; fenced text shown as copy boxes and never read aloud | Call, text, FaceTime, directions and the owner's Shortcuts, with names looked up in Contacts; copy boxes | No Contacts in a browser, so a number is required; FaceTime and Shortcuts are iPhone-only; `tel:` and `sms:` links do nothing on a computer without a phone app; real-device acceptance |
| Story board | Voice/typed commands, reviewed model story proposal and dispatch, optional encrypted board with competing-tab conflict detection | Encrypted local archive | Device persistence/voice acceptance, sync |
| GitHub / image specialist | Reviewed draft PR and fixed-price image generation | Same reviewed workflows | Real write/image acceptance |
| Persona and interview | Three-step form with the 13 standard questions, optional question playback and reviewed per-answer dictation, profile-bound encrypted library and optional local-time delivery | Persistent introduction, interview and sourced memory | Native-compatible profile transfer, continuous voice-led interview, separately protected wellbeing questions, persistent presence preference and richer fictional history/life |
| Model configuration | Versioned, reviewed export/import, shared Drive document | Same portable contract; unsupported choices rejected | Automatic encrypted sync/conflict handling |
| Voice | Chat and Greenhouse voice screens, explicit reviewed dictation, selectable browser/device voice and speed, optional reply playback; stops when hidden; Fish Audio and ElevenLabs key guidance only | Native discussion, dictation, voice choices and Walk mode | Browser cloud/local speech engines and native background acceptance |
| Chat history and personal memory | Optional encrypted local library; search/continue, reviewed owner-message facts, bounded recent/relevant recall | Encrypted persistent archive, sourced recall | Browser/device backup and restore acceptance, native archive interoperability and opt-in cross-device synchronization |
| Android/non-iOS | Responsive HTTPS browser over customer VPN | iOS only | Device/browser/audio acceptance |

The browser is not yet feature-complete against native. A public release must label these gaps rather than present source checks as full parity. No developer-host relay, Open WebUI owner login, bundled provider key, membership-token workaround or customer runtime data is required. Background/locked-screen browser microphone reliability is not promised.

## Workspace navigation

On a screen at least 1,100 pixels wide the owner can show two of Chat, Today and Greenhouse side by side, resize them and swap or close either. This is a browser-only layout choice with no iPhone equivalent: it shows and sizes the existing workspaces and cannot open a file, approve a review or grant access. Every review behaves the same in one pane or two. The layout is stored on this browser as workspace names and a width. Going to a workspace that is already on screen focuses it; otherwise it replaces the focused pane. Reading a reply aloud still stops when focus moves to the other pane.

A command palette and keyboard shortcuts are also browser-only. Each command activates a control that is already on the page, the list is built by the app and never from model output, and no command approves a review, sends a message past the model-sharing review or grants access. While any dialog is open, including every review, shortcuts are ignored. Changing profile or starting a new chat is not offered while a request is running.

Drag and drop is browser-only as well. A dropped file is opened by the same code and limits as the file picker (text or code, PNG, JPEG or WebP, under 4 MB, not in the Blended profile, not while a request runs). On Chat its text is also selected for the next request, which is still shown in the model-sharing review. A dragged message carries only its identifier; dropping it on Today fills in the story form and adds nothing. No drop sends, saves or approves anything.

The owner can type or dictate an explicit command such as “open Greenhouse” and submit it; the command switches to an existing workspace without a model request. A model may also suggest a Chat, Today or Greenhouse navigation button in its completed reply. Only the owner's click changes tabs. The proposal cannot include a URL, file, tool call or additional action; it is bound to the originating profile and conversation, is not restored after reload and cannot run while a request is active. Recognition still requires transcript review before submission. This does not open a specific document or execute a task.

Next sequence: richer document/action tools → secured public research → customer-owned encrypted synchronization with conflict review → additional voice transports. Web library scope/limits are documented in [memory and recovery](MEMORY.md). Each slice must retain provider disclosure, profile boundaries and reviewed external writes.


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

Local-time delivery is now a per-profile preference stored on the browser as two booleans. Not yet ported from iPhone: parsing a home city for weather and news, the character's history and daily life, and removing unprompted disclaimers.

## Reviewed email drafts

A completed model proposal may offer a draft to one explicitly specified email address. Review shows the originating profile, exact address, subject and body. Cancel changes nothing; approval reveals a separate mail-app link, and the owner chooses whether to open and send it. PEA does not transmit email itself. The model cannot add headers or multiple recipients, and malformed, interrupted, oversized, credential-like or mixed action blocks are rejected. The model's action block is hidden from displayed and spoken replies and is not restored as an actionable draft after reload. Mail-client behavior and URL length limits differ; long drafts and physical mobile devices need acceptance testing. Contacts, attachments, CC/BCC and direct Gmail drafts are not implemented.


## Documents from templates

`pea-doc` with `doc_create` carries a type, a title of up to 100 characters and up to 30 sections, each an optional heading of up to 120 characters and a body of up to 8,000, with 40,000 in total. The types are the same twenty as the iPhone app plus `document`. Letters, notes and bios have no title line or headings, and headings that are only layout hints are dropped. In a body a line starting "- " is a bullet and "[ ] " an empty checkbox. Every character is escaped when the text becomes HTML, so nothing a model writes can become markup. A rental agreement always ends with a not-legal-advice note, shown in the review as well.

The owner sees a one-line summary and the whole text. With Google and a PEA folder connected, approval makes one multipart upload that creates a Google Doc in that folder, marked as created by PEA; an unclear answer is reported as uncertain and never retried. Without a folder, approval offers the same HTML as a file and nothing is sent to Google. `doc_update` applies only to the document written earlier in this tab for the same profile and carries the whole new text; a Google Doc is replaced only if its version is unchanged and it is still marked as created by PEA.

Only the layouts for kinds named in the owner's message are sent to the model, up to three. Differences from iPhone: no choice of look (the plain Arial look only), no bold, italic or underline marks, no list of research sources appended, and the open document is tracked for the tab rather than saved.

## Document and simple form proposals

A model can propose a title and content for a document or simple form in Chat or Greenhouse. The owner opens an editable draft; nothing is created by that action. The existing PEA folder flow separately requires a Google connection, a selected folder and an explicit creation review. Forms contain one long-answer question per line and remain unpublished. A model action cannot select a different folder or alter sharing. Malformed, mixed, oversized and credential-like proposals are rejected and not restored after reload. Real Google account behavior, richer formatting and other document types require additional work and acceptance testing.


## Reviewed calendar event drafts

Chat or Greenhouse can propose one event with explicit UTC start and end instants. The owner reviews the title, notes and both local-browser and UTC times. Approval reveals a download link for an iCalendar file; downloading and importing it are separate owner choices. PEA does not add an event, send invitations, or connect to a calendar for this workflow. Invalid dates, missing time zones, reversed or over-seven-day ranges, credentials, extra fields, incomplete and mixed actions are rejected. The proposal is not restored as an actionable item after reload. Browser downloads, third-party calendar import, recurrence, attendees and direct calendar writes need further work or acceptance testing.


## Encrypted library portability

The owner may prepare a passphrase-encrypted backup of the saved conversation library. The file includes both profiles and excludes provider credentials, permissions, files and the separate task board. Restore verifies the passphrase, authenticated ciphertext and library schema before a compare-and-insert to an empty browser; existing saved data and tab-only conversations are not overwritten. Unlock remains separate. This is a manual snapshot, not native archive compatibility, merging or automatic synchronization. Browser downloads and real-device restore need acceptance testing.


## Encrypted board conflict handling

The encrypted task board uses a transactional revision check so a stale tab cannot silently replace a newer saved board. On a conflict, that tab keeps its unsaved board visible and blocks further changes; the owner can copy anything needed before explicitly reviewing and reloading the saved board. Legacy encrypted board records are checked by their encrypted contents on their first subsequent save and upgraded with a revision. Lock or canceled unlock prevents pending work where possible. There is no automatic merge, cross-device synchronization or guarantee against a process stopping during a committed transaction.

The owner can prepare and download a Web-only encrypted board backup containing both profiles' stories, including removed stories and results. It uses the board's existing passphrase and excludes the separate conversation library, keys and permissions. Restore authenticates and validates the backup before an atomic insert into an empty browser; it refuses to overwrite an existing board or tab-only stories. Unlock separately after restore. This is a manual snapshot, not a merge, automatic synchronization or iPhone-compatible backup. A forgotten passphrase cannot be recovered.
