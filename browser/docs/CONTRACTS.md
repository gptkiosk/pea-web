# Shared contracts between PEA Web and the iPhone app

The two apps are separate codebases that never read each other's files. What keeps them in step is this page and one fixture file. When either side changes a format, this page and the fixtures change first, in a reviewed pull request here, and the iPhone app then takes a reviewed copy in its own separate change.

- Fixtures: [`tests/fixtures/ActionFixtures.json`](../tests/fixtures/ActionFixtures.json), version 1. Every vector is a whole synthetic model reply and what the parser must return. `tests/contracts.test.mjs` checks them against this app.
- Policy fixtures for profile sharing and Drive ancestry are separate: `tests/fixtures/PolicyFixtures.json`.
- Fixtures for the encrypted profile file: [`tests/fixtures/ProfileFixtures.json`](../tests/fixtures/ProfileFixtures.json), version 1, checked by `tests/profile-contract.test.mjs`. See [The profile file](#the-profile-file).
- Feature status on each side: [PARITY.md](PARITY.md).

Vectors marked `web_only` describe behavior that is deliberately different in a browser. They are listed under each block below.

## How a model asks the app to do something

A model cannot act. It can end a reply with one fenced block whose label starts with `pea-`, holding JSON. The app then:

1. hides the block from the conversation and from speech, including while the reply is still arriving;
2. parses it strictly, and offers nothing if anything is wrong;
3. shows the owner exactly what would happen;
4. acts only on approval, once;
5. says what actually happened, including what was not done.

Rules common to every block on the web:

- A reply may hold exactly one `pea-` block. Two blocks, even of the same kind, offer nothing.
- Unknown operations and unknown fields refuse the whole block.
- Text that looks like a credential refuses the whole block.
- A proposal belongs to the profile and conversation it came from, cannot be approved twice, and is not restored after a reload.
- A reply that claims an action without a valid block gets a plain correction added by the app.
- A reply is limited to 3,500 tokens, so a block is not cut off.

The iPhone app is more forgiving about shape in a few places, for example a block wrapped in an extra object or carrying extra fields. A reply that follows the guidance below is accepted by both.

## `pea-task`: to-dos and reminders

A JSON array of up to 8 rows (the guidance asks for at most 5). A single row without the array is accepted.

| Row | Fields |
| --- | --- |
| `{"op":"task_add"}` | `title` (required), `due` (optional), `remind` (optional boolean) |
| `{"op":"task_done"}` | `title` (required) |

- `title`: one line, up to 120 characters after trimming and collapsing spaces.
- `due`: the owner's local time as `YYYY-MM-DDTHH:MM`, with optional seconds. No zone suffix. Impossible dates are refused.
- A reminder is kept only when `remind` is true and `due` is in the future. Otherwise the item is added and the receipt says no reminder was set.
- Adding a title that is already open, ignoring case, is skipped and said so.
- `task_done` checks off the one open item whose title matches exactly, ignoring case. Failing that, it checks off the one open item whose title contains the text or is contained in it. With no match or several, nothing is checked off and the receipt says so.
- Each profile holds up to 200 items. There is no delete or recurring operation for a model.

Stored item fields: `id`, `profile`, `title`, `due`, `remind`, `done`, `created`, `completed`.

Differences: reminders on the web appear only while the page is open, unless the owner hands them to PEA for Mac (see `mac/README.md`). The iPhone app can also keep a blocked calendar event with a to-do; the web does not.

## `pea-doc`: documents from templates

One row.

| Row | Fields |
| --- | --- |
| `{"op":"doc_create"}` | `type`, `title`, `sections` |
| `{"op":"doc_update"}` | `sections` (required); `type` and `title` default to the document being changed |

- `type` is one of: `resume`, `cover_letter`, `letter`, `rental_agreement`, `meeting_notes`, `shopping_list`, `checklist`, `invoice`, `meeting_agenda`, `trip_itinerary`, `meal_plan`, `thank_you`, `resignation_letter`, `complaint_letter`, `project_brief`, `status_update`, `sitter_sheet`, `event_invite`, `bio`, `visit_prep`, `document`.
- `title`: one line, up to 100 characters, a safe file name (no path separators).
- `sections`: 1 to 30 objects with an optional `heading` (one line, up to 120 characters) and a `body` (up to 8,000 characters). Headings and bodies together are at most 40,000 characters.
- `cover_letter`, `letter`, `thank_you`, `resignation_letter`, `complaint_letter` and `bio` have no title line and no headings; any heading sent is dropped.
- A heading that is only a layout hint, such as `paragraph 1`, `greeting` or `date`, is dropped.
- In a body, a line starting `- ` or `• ` is a bullet, a line starting `[ ] ` is an empty checkbox, and a blank line separates paragraphs.
- `doc_update` carries the whole new text and applies only to the document written earlier in the same session for the same profile.
- A rental agreement always ends with a note that it is not legal advice.

When the text becomes a document every character is escaped, so nothing a model writes can become markup. A Google Doc is created by one upload into the PEA folder and marked as created by PEA. It is replaced only if its Drive version is unchanged and it still carries that mark.

Differences: the web has one look (plain Arial) and no bold, italic or underline marks. Without a connected PEA folder the web offers the document as a file to download. The web also keeps its older `{"op":"document_draft","kind":"form"|"document","title","content"}` row in the same block for simple unpublished forms and plain editable drafts; the iPhone app does not use it.

## `pea-open`: call, text and directions

One row.

| Row | Fields |
| --- | --- |
| `{"op":"open_call"}` | `number`, optional `who` |
| `{"op":"open_text"}` | `number`, `message`, optional `who` |
| `{"op":"open_directions"}` | `to`, optional `mode` |

- `number`: 7 to 15 digits, with an optional leading `+` and ordinary spacing and punctuation.
- `message`: up to 500 characters.
- `to`: one line, up to 150 characters. `mode` is `driving`, `walking` or `transit`, defaulting to `driving`.
- The app builds the link from the checked parts. A model never supplies an address.
- Approval reveals a link. The owner presses it and still presses Call or Send in the phone's own screen.

Differences (`web_only` vectors): a browser has no contact list, so a row with `who` and no `number` is refused, where the iPhone app looks the name up in Contacts. `open_facetime` and `open_shortcut` exist only on the iPhone. Directions on the web open Apple Maps on Apple devices and Google Maps elsewhere.

## `pea-story`: a story for the Today board (web only)

`{"op":"story_add","title","details","acceptance"}` with a title of up to 120 characters, optional scope of up to 2,400 and optional completion criteria of up to 800. It adds a story to the board's Inbox after review and starts no work. Until `0.1.0-dev.23` the web used `pea-task` for this, which collided with the to-do meaning.

## Other blocks on the web

`pea-email` (one explicit address, subject and body; approval reveals a mail-app link and nothing is sent), `pea-calendar` (one event with explicit UTC start and end; approval reveals a calendar file to import) and `pea-nav` (a button to another workspace) are described in [PARITY.md](PARITY.md). Their fields are not yet aligned with the iPhone app's calendar and email actions and are not in the fixtures.

## Copy boxes

Text inside an ordinary fenced block is something for the owner to copy. It is shown in a box with a Copy button and is never read aloud. A short first line with no spaces, or one starting `file:`, is the box's label. A block still arriving already counts as a box. `pea-` blocks are removed first and are never shown.

## Honesty

Both apps send a rule with every request and also enforce it themselves:

- A reply that says it is human, a real person or not an AI gets one fixed sentence added, stating plainly that it is an AI assistant.
- So does a reply to a sincere question about what the assistant is, if the reply does not plainly say it is an AI.
- Figures of speech are not sincere questions, and text inside a fenced block is not a claim.

The `honesty` section of the fixtures lists sincere and non-sincere questions, claims and non-claims. The patterns are English only.

## The assistant's name

Sent with every request as a label, whether or not the introduction is shared. On the web it must be one line of letters, apostrophes, dots and hyphens, at most three words and forty characters; anything else is sent as PEA.

## Files PEA creates in Drive

Both apps set the public file property `peaCreated` to `1` on files they create, and each recognizes the other's files by it. The property is a label only: any app with access to a file can set it. The web additionally sets a private app property of the same name, visible only to its own Google client, and requires it before sharing a file's text automatically or replacing a document. Files created by the iPhone app therefore appear on the web as labelled but not confirmed until the owner confirms them in a review.

## The profile file

One file carries the interview answers of one profile from one PEA app to another. PEA Web writes it with **Export this profile…** and reads it with **Import a profile…**. The iPhone app does not write or read it yet; this section is what it would follow. Nothing else travels in it: no chats, memories, to-dos, keys, tokens or permissions.

The file is a small JSON text file, named `pea-web-profile.json` by the web. Any name ending `.json` is accepted.

**Outside.** One JSON object with exactly these four fields, at most 40,000 characters in all:

| Field | Value |
| --- | --- |
| `format` | `pea-profile-export-v2`. The older `pea-profile-export-v1` is still read and never written. |
| `salt` | 16 random bytes |
| `iv` | 12 random bytes |
| `data` | the sealed contents followed by the 16-byte tag |

`salt`, `iv` and `data` are standard base64 with `=` padding, not the URL-safe kind. Use a fresh random salt and `iv` for every file.

**Sealing.**

1. The passphrase is what the owner typed, 12 to 256 UTF-16 units long, turned into bytes as UTF-8 with no trimming and no normalization.
2. The key is PBKDF2 with HMAC-SHA-256 over those bytes and the salt, 600,000 rounds for v2 and 310,000 for v1, giving 32 bytes.
3. The contents are sealed with AES-256-GCM using that key and the `iv`. The format name, as UTF-8 bytes, is the additional authenticated data, so a file cannot be relabelled as the other format.

**Inside.** UTF-8 JSON of at most 28,984 bytes, one object with exactly two fields:

- `profile`: `personal` or `work`. A Blended profile has no answers of its own and does not travel.
- `introduction`: an object whose values are all text. It holds either exactly the seven original answers or exactly all sixteen, never a mixture, and no other field. An answer left blank is an empty string.

| Answer | Most UTF-16 units |
| --- | --- |
| `ownerName`, `assistantName` | 80 |
| `hometown` | 120 |
| `interests` | 1,200 |
| `relationships`, `goals` | 600 |
| `persona` | 900 |
| `assistantHome`, `family`, `pets`, `work`, `workInterests`, `hobbies`, `duties`, `communication`, `boundaries` (the nine later answers) | 600 each |

Lengths are counted in UTF-16 units, as a browser counts them, so most emoji count as two. Text that looks like a credential in any answer refuses the whole file. The order of fields does not matter.

**Reading.** An app refuses the whole file, changes nothing and gives one plain message, without saying which check failed, when the passphrase is wrong, any byte was altered, the format is unknown, a field is missing or extra, a length is wrong, or the contents break a rule above. After a file opens, the web shows the owner each answer that would change and applies nothing until they approve. The file does not say which app or version wrote it.

The fixtures hold six files that must open, with the answers each must give, and eighteen that must be refused, each with its reason. All were sealed with the synthetic passphrase in the fixture file and fixed salts, for tests only.

Differences: none yet, because only the web implements it. Whether the iPhone app's interview holds the same sixteen answers under these names is for its own change to establish; a difference there is a change to this contract first.

## Changing a contract

1. Open a pull request here that changes this page, the fixtures (raising `version` when an existing vector's meaning changes) and the web parser together.
2. State which side is affected and whether old replies still parse.
3. The iPhone app takes the reviewed fixture copy in its own change and runs its own checks. Nothing is synchronized automatically.
4. Update the row in [PARITY.md](PARITY.md).
