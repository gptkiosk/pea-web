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
| Docs and Forms | Editable model-proposed drafts and separately reviewed Docs and simple unpublished forms | Richer Docs/Sheets/Slides/Forms, briefs and receipt ledger | Port the remaining richer tools to Web |
| Story board | Voice/typed commands, reviewed model story proposal and dispatch, optional encrypted board with competing-tab conflict detection | Encrypted local archive | Device persistence/voice acceptance, sync |
| GitHub / image specialist | Reviewed draft PR and fixed-price image generation | Same reviewed workflows | Real write/image acceptance |
| Persona and interview | Three-step optional profile interview, encrypted library; optional reviewed local-time style/device speech | Persistent introduction, interview and sourced memory | Voice-led interview, persistent presence preference and richer native fictional history/life |
| Model configuration | Versioned, reviewed export/import, shared Drive document | Same portable contract; unsupported choices rejected | Automatic encrypted sync/conflict handling |
| Voice | Explicit reviewed dictation and device read-reply; stops when hidden; Fish Audio and ElevenLabs key guidance only | Native discussion, dictation, voice choices and Walk mode | Browser cloud/local speech engines and native background acceptance |
| Chat history and personal memory | Optional encrypted local library; search/continue, reviewed owner-message facts, bounded recent/relevant recall | Encrypted persistent archive, sourced recall | Browser/device backup and restore acceptance, native archive interoperability and opt-in cross-device synchronization |
| Android/non-iOS | Responsive HTTPS browser over customer VPN | iOS only | Device/browser/audio acceptance |

The browser is not yet feature-complete against native. A public release must label these gaps rather than present source checks as full parity. No developer-host relay, Open WebUI owner login, bundled provider key, membership-token workaround or customer runtime data is required. Background/locked-screen browser microphone reliability is not promised.

Next sequence: richer document/action tools → secured public research → customer-owned encrypted synchronization with conflict review → additional voice transports. Web library scope/limits are documented in [memory and recovery](MEMORY.md). Each slice must retain provider disclosure, profile boundaries and reviewed external writes.


## Reviewed story proposals

When an owner asks to capture a story, a model can propose one short title and optional scope and completion criteria. The owner selects **Review story** and explicitly approves the exact title, scope, completion criteria and profile before it is added to the Today board's Inbox. Cancellation changes nothing. A proposed story never starts work or sends messages; it follows the board's existing local/encrypted storage settings. The proposal is consumed after one successful addition, tied to its originating profile and conversation, and is not restored as an actionable item on reload.

This slice accepts one complete, narrowly structured `task_add` proposal with a title and optional bounded scope and completion criteria. Other fields, dates, reminders, completions, multiple blocks, credentials and malformed or interrupted blocks are rejected. Action blocks are withheld from displayed/read-aloud reply text, including while streaming. Ordinary code blocks remain visible. Claims that a story was already added receive an explicit no-action notice; a successful approval displays a local receipt. No retrieved material, persona or model output can approve an action. This is not yet parity for iPhone to-dos, reminders, direct calendar changes or richer Google document actions initiated by the model.


## Reviewed email drafts

A completed model proposal may offer a draft to one explicitly specified email address. Review shows the originating profile, exact address, subject and body. Cancel changes nothing; approval reveals a separate mail-app link, and the owner chooses whether to open and send it. PEA does not transmit email itself. The model cannot add headers or multiple recipients, and malformed, interrupted, oversized, credential-like or mixed action blocks are rejected. The model's action block is hidden from displayed and spoken replies and is not restored as an actionable draft after reload. Mail-client behavior and URL length limits differ; long drafts and physical mobile devices need acceptance testing. Contacts, attachments, CC/BCC and direct Gmail drafts are not implemented.


## Document and simple form proposals

A model can propose a title and content for a document or simple form in Chat or Greenhouse. The owner opens an editable draft; nothing is created by that action. The existing PEA folder flow separately requires a Google connection, a selected folder and an explicit creation review. Forms contain one long-answer question per line and remain unpublished. A model action cannot select a different folder or alter sharing. Malformed, mixed, oversized and credential-like proposals are rejected and not restored after reload. Real Google account behavior, richer formatting and other document types require additional work and acceptance testing.


## Reviewed calendar event drafts

Chat or Greenhouse can propose one event with explicit UTC start and end instants. The owner reviews the title, notes and both local-browser and UTC times. Approval reveals a download link for an iCalendar file; downloading and importing it are separate owner choices. PEA does not add an event, send invitations, or connect to a calendar for this workflow. Invalid dates, missing time zones, reversed or over-seven-day ranges, credentials, extra fields, incomplete and mixed actions are rejected. The proposal is not restored as an actionable item after reload. Browser downloads, third-party calendar import, recurrence, attendees and direct calendar writes need further work or acceptance testing.


## Encrypted library portability

The owner may prepare a passphrase-encrypted backup of the saved conversation library. The file includes both profiles and excludes provider credentials, permissions, files and the separate task board. Restore verifies the passphrase, authenticated ciphertext and library schema before a compare-and-insert to an empty browser; existing saved data and tab-only conversations are not overwritten. Unlock remains separate. This is a manual snapshot, not native archive compatibility, merging or automatic synchronization. Browser downloads and real-device restore need acceptance testing.


## Encrypted board conflict handling

The encrypted task board uses a transactional revision check so a stale tab cannot silently replace a newer saved board. On a conflict, that tab keeps its unsaved board visible and blocks further changes; the owner can copy anything needed before explicitly reviewing and reloading the saved board. Legacy encrypted board records are checked by their encrypted contents on their first subsequent save and upgraded with a revision. Lock or canceled unlock prevents pending work where possible. There is no automatic merge, cross-device synchronization or guarantee against a process stopping during a committed transaction.
