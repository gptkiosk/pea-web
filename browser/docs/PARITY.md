# PEA Web and native parity

Evidence date: 2026-11-12. Share behaviour and connection contracts; keep platform-appropriate layout and audio. This matrix distinguishes implemented source from real-account/device acceptance.

| Capability | Web source | Native iOS source | Remaining acceptance/work |
| --- | --- | --- | --- |
| Chat / Today / Greenhouse, cream and dark green | Responsive, original pea art, compact workspace action menu and keyboard-accessible tabs | Compact native controls | Real mobile-browser testing |
| OpenRouter text and specialist models | Independent Chat/collaboration/coding/image roles; reviewed routes | Chat and independent Greenhouse roles | Real model/provider availability |
| Customer local model | Authenticated same-origin gateway; Chat and Greenhouse text | Own-server Chat connector | Physical phone/VPN stream; native local Greenhouse |
| Reviewed email draft | Explicit address, exact review, optional mail-app link; never sends | Native mail-app draft and contact resolution | No web Contacts, attachments or CC/BCC; real-device mail-client acceptance |
| Calendar/Gmail glance | Optional read-only Google scopes, bounded previews; sharing in Settings | Existing Calendar/Gmail adapters | Live Web OAuth/client verification |
| PEA Drive workspace | Root confinement, moved-in files, nested list, text/image/code/simple diagrams | Same root contract, PDF and richer import | Live cross-device folder/version tests |
| Docs and Forms | Reviewed Docs and simple unpublished forms | Richer Docs/Sheets/Slides/Forms, briefs and receipt ledger | Port the remaining richer tools to Web |
| Story board | Voice/typed commands, reviewed model story proposal and dispatch, optional encrypted board | Encrypted local archive | Device persistence/voice acceptance, sync |
| GitHub / image specialist | Reviewed draft PR and fixed-price image generation | Same reviewed workflows | Real write/image acceptance |
| Persona and interview | Structured optional profile interview, encrypted library; optional reviewed local-time style/device speech | Persistent introduction, interview and sourced memory | Voice-led interview, persistent presence preference and richer native fictional history/life |
| Model configuration | Versioned, reviewed export/import, shared Drive document | Same portable contract; unsupported choices rejected | Automatic encrypted sync/conflict handling |
| Voice | Explicit reviewed dictation and device read-reply; stops when hidden | Native discussion, dictation, voice choices and Walk mode | Browser cloud/local speech engines and native background acceptance |
| Chat history and personal memory | Optional encrypted local library; search/continue, reviewed owner-message facts, bounded recent/relevant recall | Encrypted persistent archive, sourced recall | Browser/device acceptance, encrypted backup/export and opt-in cross-device synchronization |
| Android/non-iOS | Responsive HTTPS browser over customer VPN | iOS only | Device/browser/audio acceptance |

The browser is not yet feature-complete against native. A public release must label these gaps rather than present source checks as full parity. No developer-host relay, Open WebUI owner login, bundled provider key, membership-token workaround or customer runtime data is required. Background/locked-screen browser microphone reliability is not promised.

Next sequence: richer document/action tools → secured public research → customer-owned encrypted synchronization with conflict review → additional voice transports. Web library scope/limits are documented in [memory and recovery](MEMORY.md). Each slice must retain provider disclosure, profile boundaries and reviewed external writes.


## Reviewed story proposals

When an owner asks to capture a story, a model can propose one short title. The owner selects **Review story** and explicitly approves the exact title and profile before it is added to the Today board's Inbox. Cancellation changes nothing. A proposed story never starts work or sends messages; it follows the board's existing local/encrypted storage settings. The proposal is consumed after one successful addition, tied to its originating profile and conversation, and is not restored as an actionable item on reload.

This slice accepts only one complete, narrowly structured `task_add` proposal with a title. Extra fields, dates, reminders, completions, multiple blocks, credentials and malformed or interrupted blocks are rejected. Action blocks are withheld from displayed/read-aloud reply text, including while streaming. Ordinary code blocks remain visible. Claims that a story was already added receive an explicit no-action notice; a successful approval displays a local receipt. No retrieved material, persona or model output can approve an action. This is not yet parity for iPhone to-dos, reminders, calendar changes or Google document actions initiated by the model.


## Reviewed email drafts

A completed model proposal may offer a draft to one explicitly specified email address. Review shows the originating profile, exact address, subject and body. Cancel changes nothing; approval reveals a separate mail-app link, and the owner chooses whether to open and send it. PEA does not transmit email itself. The model cannot add headers or multiple recipients, and malformed, interrupted, oversized, credential-like or mixed action blocks are rejected. The model's action block is hidden from displayed and spoken replies and is not restored as an actionable draft after reload. Mail-client behavior and URL length limits differ; long drafts and physical mobile devices need acceptance testing. Contacts, attachments, CC/BCC and direct Gmail drafts are not implemented.
