# PEA Web changelog

Notable user-facing changes. Versions follow semantic versioning; dated entries use Added, Changed and Fixed sections. Development builds are not published releases. The native iOS product has its own release process.

## [0.1.0-rc.4.dev.34] - 2026-11-22

### Added

- **Talk about the episode you have open.** While an episode is open in the numbered list, its checked brief now goes with your Chat messages, so you can ask "what is this episode about?" or "what did they say about the lamp?" and your model answers from the brief.
  - The first time, the usual sharing review shows the brief exactly as it is sent. After that the brief of whichever episode you have open goes along without asking again.
  - Your model is told the brief is quoted evidence about what the episode said, never instructions; to say which show and date a claim comes from; not to present a claim as settled fact; and that only lines marked as quotes are the publisher's own words.
  - Sections go with their addresses (1.2.1, 1.2.2…), so you and your model can name the same one.
  - Going back to shows, or closing the list, stops it. The list says so while an episode is open.
  - The list of what PEA did names the brief it included.

### Notes

- Chat only. Greenhouse messages do not carry a brief.
- A reply written with a brief in view can still offer the usual reviewed proposals. Briefs come from the curator's checked pipeline, and PEA has already refused any that hold markup, links or instructions; a web page you read is treated more strictly because a stranger wrote it.
- Only the open episode's brief is sent, at most 3,200 characters. Nothing else from the catalog is.

## [0.1.0-rc.4.dev.33] - 2026-11-22

### Added

- **I type, you talk.** A mode for when you can listen but not speak, such as working with headphones in. You type as usual and PEA reads each reply aloud.
  - Turn it on with the **I type, you talk** button beside Read reply, in Chat or Greenhouse. It is off every time you open PEA, so PEA never talks out loud unexpectedly. While it is on the box you type in says "Type — PEA will answer aloud…".
  - It never listens. The microphone is not used and no permission is asked for.
  - It uses the voice you already chose: your device's voice, or your provider voice if you set one up.
  - A long reply is read whole by the device voice without the usual question about length. A provider voice charges by length, so that question is still asked for it.
  - While PEA is speaking, a red **Stop speaking** button appears. It ends the reading and leaves the mode on.
  - Reading carries on while you work in another window. Sending a new message or turning the mode off ends it.
  - Your model is told the reply will be heard, so it writes for listening: plain sentences, no tables. Text to copy still goes in a box that is shown and not read. Voice chat with reading on tells it the same.
  - Answers a reply offers are read after it with their numbers, and numbered lists from navigation are read too.

### Notes

- Outside this mode nothing changed: a reply is read only when you press Read reply or use voice chat, and reading stops when the page is hidden.
- A browser may refuse to speak in a tab it has put to sleep. That is the browser's choice and PEA cannot override it.
- Unlike the iPhone app, a browser cannot tell PEA that headphones were unplugged, so the reading does not stop by itself when they are.

## [0.1.0-rc.4.dev.32] - 2026-11-21

### Added

- **Numbered navigation through your shows: Show, Episode, Section.** With a show followed in Curated sources, the same fixed commands the iPhone app uses now work on the web, typed or spoken. PEA matches your words by rule and answers on the page; no model reads the command.
  - **Shows:** "list shows", "back to shows", "Show 1", "first podcast", "episodes for show 2", or "list episodes for" a show's name.
  - **Episodes:** "1.2", "one point two", "show 1 episode 2", "episode 2", "next episode", "previous episode", "latest", "oldest episode", "more episodes", "back to episodes". Five to a page, newest first.
  - **Sections:** an episode's sections are the points of its checked brief, six at most. "1.2.3", "one point two point three", "section 2", "next section", "back to episode". An address is also found inside a sentence, as in "No, this would be 2.4.3, is there a section there?"; a version number such as "version 1.2.3" is left alone.
  - **Where am I:** says the section, episode and show you are on, with the way back.
  - **Digging in:** opening a section sends your model that section's own words, with the episode's title, show and date, as your next message.
  - The numbered panel now has buttons under it for the usual next moves, and each row shows a second line. Pressing anything stops reading aloud first.

### Changed

- "Show", "podcast" and "episode" now mean your followed shows. Headlines keep "feed" and "headline". A bare "1.2" means an episode once you follow a show with briefs, and a headline otherwise.

### Notes

- **Not here:** citations and web search. "1.2.3.c.1", "list citations" and "search 1.2.3" are recognised and answered in plain words that PEA Web cannot do them yet; nothing is sent.
- A brief is not yet shared with your model as background. Only the one section you open is sent, inside your message.
- Episode titles and section text stay on the page until you open a section.

## [0.1.0-rc.4.dev.31] - 2026-11-21

### Added

- **Curated sources, on Today.** The podcasts a curator has prepared for PEA, as the iPhone app has them. Each new episode comes with a short brief.
  - **Browse:** nothing is fetched until you approve. Then PEA reads the curator's one list, the same file for everyone, and shows each source's name, description, how often it publishes, its newest titles and its terms.
  - **Follow:** following a show fetches its list of episodes and the briefs of its five newest. They are kept in this tab only; the shows you follow are remembered in this browser.
  - **Checked before use:** every file must match the size and SHA-256 fingerprint the curator's list promised, be strict JSON in the stated form, and hold no markup, link, hidden character or instruction. A file that fails is not shown, not kept and never put in a prompt, and a list that fails leaves the last good one in place.
  - **Paused and removed sources:** a paused source says so and fetches nothing new. A source the curator removed is unfollowed with a plain note.
  - **What PEA did:** the same list of steps as elsewhere, with counts.
- **Request a podcast.** Under Curated sources. You type the show's name and its feed or website; PEA prepares a filled-in request on the catalog's GitHub page for you to open and submit. Nothing is sent from PEA, and nothing about you or your chats is included.

### Changed

- The page and both servers now allow one more address, the catalog's (`https://gptkiosk.github.io`). It is contacted only after you approve browsing.

### Notes

- **Not yet:** briefs are not used in conversation, and numbered navigation still walks Headlines, not these shows. Those come next. Digests, whole transcripts from the publisher, topics, scientific citations and the storage settings of the iPhone app are not on the web.
- The published catalog is format 1.3. A newer minor version is read with its unknown members ignored, so briefs that later carry citations will still read; the citations will not be shown until the web reader learns them.
- The request form on GitHub is the catalog project's own. If that project has not published its form yet, GitHub opens a plain new issue with the title filled in.
- The host of the catalog (GitHub Pages) sees your internet address and which shows' files it asked for. The review says so before the first request.

## [0.1.0-rc.4.dev.30] - 2026-11-20

### Added

- **Numbered navigation, by voice or by typing.** A short fixed set of commands now moves through numbered lists. PEA matches your words by rule and answers on the page itself; no model reads the command or decides what it meant, so "1.2" always means the same thing. The list appears in a small panel over the page, and in the voice room, with rows you can press.
  - **Feeds:** "list feeds", "back to feeds", or "can you give me a list of the feed names to choose from" shows Feed 1, Feed 2… from your Headlines.
  - **Headlines:** "feed 1" or "headlines for feed 1" lists 1.1, 1.2… Jump with "1.2", "one point two", "feed 1 headline 2", "headline 2", "next headline", "previous headline", "latest headline" or "back to headlines". "Show", "podcast" and "episode" are understood as the same words, since a podcast is a feed too.
  - **Read it:** with a headline open, "read it" opens the usual review of its exact address before anything is read.
  - **Points:** "list points" shows the numbered points of PEA's newest reply. "Point 2", "dig into point 2" or "next point" sends your model that point's own words as your next message. Pressing a point does the same.
  - In the voice room the answer is shown in the room and read with your device's voice when reading aloud is on, and the room stays open for the next number.
- Your model is asked, in one more sentence of PEA's instructions, to number the points of a list.

### Notes

- **Not here: podcast briefs and web search.** PEA Web has neither, so there are no episode key points to walk and nothing to search. "Search point 2" and "fact check point 2" answer in plain words that PEA Web cannot search the web, and send nothing.
- Headline titles stay in this tab, as before. A navigation command and its list are never put in a conversation or sent to a model, and lists are read aloud with the device voice only, never a provider voice.
- A command is recognised only when the whole message is one. "What shows should I watch tonight?" is still a message to your model.

## [0.1.0-rc.4.dev.29] - 2026-11-20

### Added

- **Answers you can press or say by number.** When PEA needs you to pick between a few set answers, the newest reply now shows them as numbered buttons under it, and the voice room shows the same buttons.
  - Press one, or say or type its number: "2", "two", "option two", "the second one", "the last one". PEA sends that answer's own words as your next message, so your model never has to guess what "two" meant, and a note tells you which answer went.
  - Saying the answer's own words works too. Anything else you say is sent as it is, as your own answer.
  - When a reply is read aloud, its answers are read after it with their numbers.
  - Only the newest reply's answers can be picked. Once the conversation moves on they are gone.

### Notes

- Picking an answer only sends a chat message, through the same send and the same sharing review as typed words. It approves nothing: every action still has its own review.
- Your model is told how to offer set answers in one more paragraph of PEA's instructions, which you can read in the sharing review. A reply written with a web page in view offers none, as with every other proposal.
- A number is matched by fixed rules in the page, not by a model. Words that speech recognition often writes for a number ("to", "for", "won") count only after "option" or "number".

## [0.1.0-rc.4.dev.28] - 2026-11-20

### Added

- **The list of what PEA did, for calendar, mail, GitHub and decks.** The same list with icons now appears for four more kinds of work:
  - **Calendar changes:** under the reply that proposed the event. Your approval, Google adding, changing or removing the event, and the note that nobody was invited and no notices were asked for. For a change or removal it also shows the check that the event is still the one you reviewed, and stops there if it is not.
  - **Calendar and mail refresh:** under **Refresh connected services** in Upcoming on Today. How many coming events and newest inbox items were read, as counts only, and a plain line for any source that could not be read.
  - **GitHub delivery:** under the delivery button in Connections. The repository check, your review, the second check that the repository has not changed, the new branch, the files added and the draft pull request. If it stops part way the list says a branch, files or a pull request may exist.
  - **Deck projects:** under the deck form in Greenhouse. Your review, the model it was sent to, how long the answer took, the outline or slides read from it, and whether you kept them.
- A debug chat export lists calendar work under its reply as `Calendar · …`, as it already does for documents.

### Notes

- The lists hold counts and names PEA already showed you in the review. No account address, mail sender, subject or preview, event from the refresh, source file text, token or model wording is put in a list, and a service's own error words never are.
- Nothing about what is sent to Google, GitHub or a model changed.

## [0.1.0-rc.4.dev.27] - 2026-11-20

### Added

- **The list of what PEA did, for page reading, pictures and documents.** The same list with icons that sits over each reply now appears for three more kinds of work, starting when you approve the review:
  - **Reading a web page:** over the page card in Chat. Your approval, a page that has moved and your approval of the new address, the read by your PEA server, and how many characters were kept.
  - **Pictures:** over the picture in Greenhouse. The price check against your ceiling, your review of the prompt and price, the provider it was sent to, and the picture that arrived with its type and size.
  - **Documents:** under the reply that proposed the document. Your review, then either the file prepared in your browser, or the document created or replaced in your PEA folder and the folder list read again.
- The last line turns while PEA waits. A list folds to one line when the work is done and stays open when it was stopped or did not finish, with a line saying so. A site's or provider's own error words are never shown in it.
- A debug chat export also carries the document list under the reply that proposed it.

### Changed

- The list over a reply now stays open when the request was stopped or did not finish, so the reason is in view.

## [0.1.0-rc.4.dev.26] - 2026-11-20

### Added

- **What PEA is doing, step by step, over each reply.** While PEA works on a reply in Chat or Greenhouse, a short list with an icon on each line shows what it has done so far: what went with your message (your introduction, how many memories, a file excerpt, calendar events, mail items, your to-do list, a page you read, earlier messages), whether you reviewed the sharing or an earlier approval was used, which model it was sent to and where, how long the first words took, and that the reply is being written. The last line turns while PEA waits or writes. When the reply is done the list folds to one line, "What PEA did · 4 steps · 6 s", which you can open again. A request you stopped, or one that did not finish, says so.
- **Export this chat, with optional debug detail.** The workspace menu has **Export this chat…**. It makes a plain text file of the Chat conversation in this profile, in your browser; nothing is sent anywhere, and the dialog says the file is not encrypted. Tick **Include debug detail** and each reply also carries what PEA did for it: the steps shown over the reply, exact times in milliseconds, the model's id and where it runs, how large the request and the reply were, which instructions went with it, whether PEA added its own correction, and what was offered for review. It holds no keys and none of the shared context's words. The record exists only until the page is reloaded, so older replies say there is none.
- Every line is something the page itself did and timed. A reply's own words cannot add a line, so a model cannot claim work that was not done. The list shows counts and names only, is kept in this tab only, and is never saved, put in a backup or sent to a model.

## [0.1.0-rc.4.dev.25] - 2026-11-20

### Changed

- **The project engine's address is asked for in general words.** PEA for Mac's **Project Engine…** dialog now says to paste the address of your MCD server, on this Mac or in the cloud, after installing and starting it, and says first that MCD is optional: PEA does not need it, and it adds an agent project and assignment engine to your assistant. The Projects card and its "no engine" sentence say the same. The dialog, the gateway's help, Self-hosting and the Mac guide no longer show an example address or port, because PEA assumes none: an engine can be anywhere its owner put it. The rules for an accepted address are unchanged.

## [0.1.0-rc.4.dev.24] - 2026-11-19

### Added

- **PEA for Mac: a Project Engine setting.** The menu has **Project Engine…**. You give the address of your own engine (MCD or RCD: `http://` on this Mac, or `https://` and the name of another machine of yours), then choose the file holding the access the engine issued for PEA. The app checks that the file is a regular file only you can read with the right shape, and keeps its path. It never shows, copies or stores what the file holds. If PEA is running it restarts at the same address; reload the page and Projects on Today is connected. **Disconnect** in the same dialog ends it and leaves the file alone. Removing the file also ends the access at once. Neither engine issues this access yet, so there is nothing real to choose until the engine side exists.

## [0.1.0-rc.4.dev.23] - 2026-11-19

### Added

- **Projects on Today, for a PEA connected to your project engine (MCD or RCD).** Built and tested against a stand-in engine: neither engine answers PEA yet, so on your own copy the card says there is no engine until the engine side exists and the gateway is started with its address.
  - **Watch.** Opening the card lists the engine's projects. Choosing one shows its stories as read-only cards with the state, agent, model, run time and cost of each, a line of totals, and "Waiting for you in the engine" where a story needs your decision there. A cost the engine does not report is shown as not known, a subscription run as "on a subscription", and nothing is estimated. Nothing is asked of the engine until you open the card or press Refresh.
  - **Draft.** A form with the engine's templates, a title, what the project is for, and optional limits. "Review the draft…" shows exactly what will be sent; approving leaves a draft in the engine and starts nothing. Planning, approval, spending and every run stay in the engine's own pages.
  - **From chat.** Where an engine is connected, PEA may suggest a project. "Review project: …" only fills the form on Today; you choose the template, read the review and send it. A model cannot choose the template, start anything or see progress. If a reply claims to have created or started a project, the app adds that it did not.
  - **Harvest.** A suggestion waits in Harvest like any other; once you send the draft, its receipt stays there with "Show projects". A project the engine says has ended is listed in Harvest with its stories, time and cost once you have looked at it.
  - What the engine answers is shown as plain text, cut to size, and is never given to your model. A refusal is told in PEA's words; the engine's own error text is not shown.

## [0.1.0-rc.4.dev.22] - 2026-11-19

### Added

- **A gateway connection to your project engine (MCD or RCD), off unless you start the gateway with it.** This is the plumbing only: nothing in the app uses it yet, and neither engine answers it yet. A gateway started with `--projects-url` and `--projects-token-file` can be asked five named things at `/v1/projects`: list templates, list or read projects, read a project's progress, and leave a draft. It cannot plan, approve, start, pause or pay for anything; those stay in the engine's own pages. The engine may be on this machine (plain HTTP to a loopback address) or on another machine you name (HTTPS, certificate checked). The engine's credential is read from a private file for each request and never reaches the browser. Both gateways follow the same rules in `contract.json` and pass the same new conformance tests against a stand-in engine.

## [0.1.0-rc.4.dev.21] - 2026-11-19

### Changed

- **Each profile remembers its own arrangement.** Personal, Work and Blended each keep which workspaces are open, their order and their widths, and switching profile brings that profile's arrangement back. The arrangement you already had carries on as Personal's. A profile you have not arranged yet starts from what is on screen and keeps it as its own from then on. As before, it is kept in this browser only and holds workspace names and widths, nothing else.

## [0.1.0-rc.4.dev.20] - 2026-11-19

### Changed

- **Receipts in Harvest for approved stories and to-dos say what was done and lead to it.** An approved story's receipt now names the story ("Added to Today: …") in the reply and in Harvest, where it used to say only "Added to Today". In Harvest, a story's receipt has "Show the story board" and a to-do receipt has "Show the to-do list": each brings Today in (beside Harvest on a wide screen) and opens that card. The button only shows the card; it adds and changes nothing. Receipts last as long as the conversation is open in this tab.

## [0.1.0-rc.4.dev.19] - 2026-11-19

### Added

- **A peek at a tucked-up workspace.** Point at a dashed chip, or reach it with the keyboard, and a small panel under it says what that workspace holds: how long the conversation is and its last line for Chat and Greenhouse, the at-a-glance lines for Today, and what is waiting for review in Harvest. It is words only (nothing in it can be pressed), shows at most four short lines already on the page, and goes away when the pointer leaves, on Escape, or when the chip is pressed. It replaces the tooltip on the Harvest chip.

### Changed

- **The workspace chips have their own row, centred under the bar.** The bar now holds the brand, the connection and library status, and the controls at every desktop width; the chips sit in the middle of the window on the row below. On a window narrower than about 1100 pixels the status text is shortened rather than moved to a row of its own. Phones and small windows keep their top tabs unchanged.

## [0.1.0-rc.4.dev.18] - 2026-11-19

### Added

- **Links in replies can be pressed.** Only a plain `https` address becomes a link. It opens in a new tab that cannot reach back into PEA, and the site's name is shown beside the link's words; words that are themselves a different address are replaced by the real one. Anything else (other schemes, an address with a sign-in part, a local name) stays text. In a reply written with a web page you asked PEA to read in view, addresses are never made pressable.
- **Tables, struck-out words and lines to tick.** A ticked or unticked line is shown as a small box; it is a picture of the model's list, not a control.
- **Coloured code.** A code window that names its language shows comments, quoted text, numbers and common words in different colours.
- **Small charts and diagrams, drawn by PEA.** A block the model labels `chart`, with one "Label: number" per line, is drawn as bars. A block labelled `diagram`, written "First --> Second --> Third", is drawn as boxes joined by arrows. Each keeps a Copy button for its text. Anything that does not fit the simple form stays a code window.
- The model is told it may use these.

### Changed

- Nothing in a reply loads from the web. Pictures at web addresses are still not shown, because showing one would send its address, and anything a model put in it, to that site.

## [0.1.0-rc.4.dev.17] - 2026-11-19

Third step of the workspace redesign.

### Added

- **Harvest, a fourth workspace.** It gathers everything PEA has proposed in this profile's Chat and Greenhouse conversations: under "Waiting for your review", each proposal with its own Review button; under "Grown from these conversations", what you approved that leaves something to show, such as a link or a receipt. A proposal no longer scrolls out of sight with its reply.
- **A count on the Harvest chip** says how many proposals are waiting, also while Harvest is tucked up, and pointing at the chip lists them.

### Changed

- Reviewing from Harvest is the same review as from the reply, which keeps its own button. Nothing is added, written or sent until you approve it, exactly as before.
- The top bar is one row from 1500 pixels wide; under that the status sits on a second row, so it is no longer cut short. On a phone the four tabs fit by leaving out their small pictures.

## [0.1.0-rc.4.dev.16] - 2026-11-19

Second step of the workspace redesign.

### Changed

- **The chips in the top bar now work the panes.** On a wide screen, pressing a dashed chip brings that workspace in beside what is open and puts you in it. Pressing the chip of a workspace that is open but not in use moves you to it. Pressing the chip of the one you are in tucks it up, as long as another is open. Pressing a chip twice quickly leaves that workspace alone in the window.
- **Three workspaces at once** on a window 1500 pixels wide or more; two from 1100. When there is no room for another, the new one takes the place of the pane furthest from the one you are in. A narrower window shows the one in use with a neighbour and keeps the rest of the arrangement for later.
- **Move panes.** Drag a pane by its name in its bar, or with three open use the arrow buttons there. With two, "Swap sides" remains. A pane keeps its width when it moves.
- **Resize between every pair.** With three panes there are two dividers; each changes only the two panes beside it, by dragging or with the arrow keys, and no pane can be squeezed thinner than about a fifth of the window.
- The arrangement, including the three widths, is remembered on this browser as before: names and widths only.
- On a phone or a small window the chips are still tabs.

## [0.1.0-rc.4.dev.15] - 2026-11-19

### Changed

- **PEA greets you as itself.** A small model answered "Hello" with "I'm PEA, an AI assistant. Not human, not real, just code and conversation." The guidance sent with every request used to open by telling the model it is an AI; it now opens with its character, asks it to talk to you as someone it knows and to use your name when your introduction gives it, and tells it not to open with a disclaimer or describe itself as code or "not real".
- **What has not changed:** PEA never says or implies it is human. Asked sincerely whether it is a person or an AI, it says plainly that it is an AI assistant, and the app still adds that sentence itself when a reply claims otherwise or avoids the question.

## [0.1.0-rc.4.dev.14] - 2026-11-19

First step of the workspace redesign.

### Changed

- **PEA is one fixed window on a screen with room.** A single slim bar across the top holds the logo, the three workspaces as chips, the status of your connection and your library, and the profile, side-by-side, theme and menu controls. It replaces the tall header, the page title and the two large setup cards, which took about a third of the window.
- **Every workspace fills the rest of the window and scrolls inside itself.** Chat, Today and Greenhouse are frames; the page itself no longer scrolls. On its own, Chat keeps a comfortable reading width in the middle.
- **Chips show what is open.** A chip is filled while its workspace is in the window and dashed while it is tucked up in the bar. In side-by-side view "Close" is now "Tuck up".
- **The writing box in Chat is compact from the start.** "Talk with PEA" is no longer a large button above it; "Voice chat" in the row under the box opens the same thing.
- A narrower desktop window puts the status under the chips. Phones and small windows keep the ordinary page with its top tabs.

## [0.1.0-rc.4.dev.13] - 2026-11-19

### Added

- **PEA shows that it is working.** While a reply is being written, PEA's own picture and three small bobbing peas sit under it, in Chat and in Greenhouse. Before the first words arrive the picture hops and it reads "PEA is thinking…"; once the reply is arriving the picture only rocks a little and it reads "Still writing…". It goes when the reply is complete, and is not shown on a reply that was stopped or failed. With reduced motion switched on in your system, the picture, the peas and the words are shown without movement.

## [0.1.0-rc.4.dev.12] - 2026-11-19

### Added

- **The OpenRouter key can be kept in your encrypted library.** Under Connections → OpenRouter there is a new box, "Keep this key in my encrypted library", off by default and available while the library is unlocked. Ticked, the key is sealed with your library passphrase on this browser. Unlocking the library after a reload or an update brings it back: PEA asks OpenRouter to confirm the key and list its models, and requests no inference. Locking the library removes the key from the tab.
- "Disconnect locally" and unticking the box each remove the kept copy. A key OpenRouter no longer accepts is removed when it is tried.

### Changed

- The kept key is a separate sealed record beside the library, not part of it: it is in no library backup, profile file or backup file, and never in readable form in the browser's storage. Each profile keeps its own. GitHub tokens, voice provider keys and Google access are still never kept.
- The review shown before unlocking a saved library now says that a kept OpenRouter key is restored.

### Fixed

- Unlocking the library a moment after locking it could fail with "Library unlock was cancelled". The browser reports a dialog's closing slightly late, and that late report from the previous unlock was taken as a cancellation of the new one. It is now ignored while the dialog is open again.

## [0.1.0-rc.4.dev.11] - 2026-11-19

Nothing in the app changed.

### Fixed

- Two guides still said that no file format existed for carrying a profile between the Web and iPhone apps. They now say what is true: the profile file and the backup file are defined in the shared contracts page and PEA Web reads and writes both; the iPhone app does not yet, so moving a profile from the iPhone waits on an export there.

## [0.1.0-rc.4.dev.10] - 2026-11-19

### Added

- **One press to use the only local model.** When your PEA server lists exactly one model and Chat has none chosen, the connection card and the Local model settings show "Use <model> for Chat". PEA still never chooses a model by itself, offers nothing when there are several, and sends nothing to the model when you choose.
- **Find a model.** When more than eight models are loaded, a box above the model lists narrows all three as you type. Every word typed must appear in the model's name or id, in any order and any case: "nemotron" shows the Nemotron models, "haiku" the Haiku ones. A model already chosen always stays in its list. A line under the box says how many match.

## [0.1.0-rc.4.dev.9] - 2026-11-19

### Changed

- **Chat is a fixed window with one scrolling conversation.** On a screen with room, once a conversation starts the page itself no longer scrolls: the conversation scrolls in its own box and the writing box stays under it. The frame around it is drawn tighter and the writing box is smaller, to leave the room to the conversation. Chat's opening screen, Today and Greenhouse on their own, and phones keep the ordinary scrolling page.
- **Two workspaces side by side are fixed frames.** Each fills the height of the window and scrolls inside itself; the page behind them does not move. In a narrow frame the buttons under Chat's writing box show their icons only, on one row, with their names as tooltips.
- **The conversation follows its newest message** while a reply arrives, in Chat and in Greenhouse. Scroll up to read and it stays where you are, with a "Latest" button to go back. Sending a message follows again.
- **Replies are laid out as text.** Headings, numbered and bulleted lists, quotes, bold, italics and inline code are shown as such. Code keeps its window with a Copy button and now scrolls sideways instead of wrapping. Nothing a model writes becomes a link, an image or any other element.
- **Every message has a Copy button** for the whole message, shown when you point at it (always shown on a touch screen).

### Fixed

- Connected but with no Chat model chosen, the connection card showed "Chat ·" followed by a blank. It now says "Connected · no Chat model chosen yet" and "Chat · choose a model in Set up".

## [0.1.0-rc.4.dev.8] - 2026-11-19

### Changed

- **The footer shows the version alone,** such as "v0.1.0-rc.4.dev.8", in the ordinary typeface. It adds a few plain words only when something is unusual: the server runs a different commit, files were changed since the commit, or the source is not verified. The full identity line (environment, web and server commits, clean or modified) appears when the version is pointed at, and the commit is in Versions & updates and behind "Source commit".

## [0.1.0-rc.4.dev.7] - 2026-11-19

### Changed

- **Versions & updates is laid out afresh.** The window now opens with this copy's version in large type and one plain line about the build. Updating sits in the same card, with one main button at a time: Connect, then Update, then Reload. "Check for updates" is beside it. Published releases, their notes and the changelog have their own section below.
- **Release notes and the changelog read as text.** Headings, lists and paragraphs are set in the reading typeface; only commands are fixed-width.
- **One reload button after an update,** where there were two.
- **The review before an update** is set in the reading typeface. Its words are unchanged.

## [0.1.0-rc.4.dev.6] - 2026-11-19

Nothing in the app changed.

### Fixed

- Two project tests saved the interview the instant the page opened, before the library had finished reading its storage, and one failed now and then on a slow test machine. They now wait for the library to be free.

## [0.1.0-rc.4.dev.5] - 2026-11-19

### Added

- **PEA can remember its own connection token.** Under Local model there is a new box, "Remember this token on this browser", off by default. Ticked, the token is kept in this browser's storage for this address and PEA connects by itself after a reload, so an update no longer ends with pasting the token again. Anyone who can open that browser on that device can then use that PEA server. "Forget local token", unticking the box and "Forget remembered choices" each remove it. A token the server no longer accepts is forgotten.

### Changed

- Only this one token can be kept. The OpenRouter key, GitHub token, voice provider keys and Google access still live in the tab's memory only.
- "Forget local token" now disconnects every profile open in the tab, not just the current one.

## [0.1.0-rc.4.dev.4] - 2026-11-18

Nothing in the app changed.

### Fixed

- A project test added a to-do the instant the page opened, before the list was ready, and failed now and then on a slow test machine. It now waits for the list.

## [0.1.0-rc.4.dev.3] - 2026-11-18

### Added

- **A page says when it is out of date.** PEA can be updated while a page stays open, and the open page keeps showing the older version. Versions & updates now says which version PEA runs and which one the page is showing, with a Reload this page button, and the footer shows "Reload for v…". The page looks when the window opens and when you come back to the tab. Nothing reloads by itself.

## [0.1.0-rc.4.dev.2] - 2026-11-18

### Fixed

- In Versions & updates, "Check for an update to install" was set in from the text above it. It now lines up.

## [0.1.0-rc.4.dev.1] - 2026-11-17

Development build after the fourth release candidate. Nothing in the app changed.

### Changed

- The version is back on development numbering now that `0.1.0-rc.4` is published.

## [0.1.0-rc.4] - 2026-11-17

Fourth release candidate. Like the first three, it is a pre-release: everything in it passed the automated checks, and none of it has yet been accepted against real accounts, provider keys or a real model. It puts updating where people look for it.

### Changed since 0.1.0-rc.3

- **Updating is in the Versions & updates window.** "Update this copy" sits under this copy's version, with Check for an update to install and the Update button. Before, they were under Connections → PEA updates.
- **The window says what is missing.** When the server connection token is not connected (it is never saved, so that is the case after every reload), the window says so and offers Connect this PEA…. That opens Local model with the token field ready, and once you connect you are brought back to the Versions window.
- Connections keeps a short "PEA updates" entry that opens the Versions window.
- Release notes and the changelog are shown as plain sentences, without Markdown marks.

### Fixed

- In the Versions window, Compare with main ran into Review upstream releases with no space between them.
- A project test of the backup file could fail by chance on the encrypted text.

The entries below give the detail for each development build.

## [0.1.0-rc.3.dev.2] - 2026-11-17

Development build. The update buttons move to where people look for them.

### Changed

- **Updating is in the Versions & updates window.** "Update this copy" now sits under this copy's version, with Check for an update to install and the Update button. Before, they were under Connections → PEA updates, and the Versions window only pointed there.
- **The window says what is missing.** When the server connection token is not connected (it is never saved, so that is the case after every reload), the window says so and offers Connect this PEA…. That opens Local model with the token field ready, and once you connect you are brought back to the Versions window.
- Connections keeps a short "PEA updates" entry that opens the Versions window.
- Release notes and the changelog are shown as plain sentences. Before, the Markdown marks and link addresses were shown as typed.

### Fixed

- In the Versions window, Compare with main ran into Review upstream releases with no space between them.

## [0.1.0-rc.3.dev.1] - 2026-11-17

Development build after the third release candidate. Nothing in the app changed.

### Changed

- The version is back on development numbering now that `0.1.0-rc.3` is published.

### Fixed

- A project test of the backup file looked for the word "tea" in the encrypted text and once found those three letters there by chance. It now looks for phrases that encrypted text cannot contain.

## [0.1.0-rc.3] - 2026-11-17

Third release candidate. Like the first two, it is a pre-release: everything in it passed the automated checks, and none of it has yet been accepted against real accounts, provider keys or a real model. It corrects what the first try of the Update button turned up.

### Fixed since 0.1.0-rc.2

- **Versions & updates found no release while only release candidates were published.** It reported "Unable to check releases". A copy that is not on a stable version now looks at the newest published release of either kind and says when it is a pre-release.

### Changed

- **Versions & updates leads to the Update button.** A line under the check opens Connections with PEA updates showing.
- The window's explanation says what is true: where the operator has turned it on, PEA's gateway installs a signed release after your review, and the page itself never downloads or runs program code.
- The project's browser tests start a test browser again when it fails to come up on a slow test machine.

The entries below give the detail for each development build.

## [0.1.0-rc.2.dev.3] - 2026-11-17

### Fixed

- **Versions & updates found no release while only release candidates were published.** It asked GitHub for the "latest" release, which leaves pre-releases out, and reported "Unable to check releases". A copy that is not on a stable version now looks at the newest published release of either kind and says when it is a pre-release. A stable copy still looks only at stable releases.

### Changed

- **Versions & updates now leads to the Update button.** A line under the check opens Connections with PEA updates showing. Before, nothing in that window said where an update is installed.
- The window's explanation no longer says the browser cannot install anything. It says what is true: where the operator has turned it on, PEA's gateway installs a signed release after your review, and the page itself never downloads or runs program code.
- When GitHub cannot be reached the message says so, and no longer suggests there may be no release.

## [0.1.0-rc.2.dev.2] - 2026-11-17

Nothing in the app changed.

### Changed

- The project's browser tests start a test browser again, up to three times, when it fails to come up, and open a blank page once more when the browser is slow to answer. A slow test machine had failed the checks on main twice with no fault in the app.

## [0.1.0-rc.2.dev.1] - 2026-11-17

Development build after the second release candidate. Nothing in the app changed.

### Changed

- The version is back on development numbering now that `0.1.0-rc.2` is published.

## [0.1.0-rc.2] - 2026-11-17

Second release candidate. Like the first, it is a pre-release: everything in it passed the automated checks, and none of it has yet been accepted against real accounts, provider keys or a real model.

### Added since 0.1.0-rc.1

- **Updating to a signed release.** The update command can install only a published release whose manifest is signed by the release key your copy already trusts, and whose tag is exactly the signed commit.
- **An Update button in the app.** On a copy whose operator has turned it on, Connections → PEA updates shows the exact version on offer and installs it after your review, with the previous version put back if PEA does not come up healthy.
- **Withdrawing a release.** The publisher can list a release as withdrawn in a signed list; it is then never offered, and anyone already on it is told why.

### Changed

- The project's browser tests now run at most four at a time, because starting every test browser at once overloaded the test machine now and then.

The entries below give the detail for each development build.

## [0.1.0-rc.1.dev.3] - 2026-11-17

### Added

- An Update button in the app. Under Connections → PEA updates, a copy whose operator has turned this on can update itself: **Check for updates** shows the exact version on offer, whether it is a signed release or an unsigned development build, and what changed; **Update to …** asks for your review and then installs exactly that version. PEA restarts, the page reconnects by itself and says what happened, and the previous version is put back if PEA does not come up healthy. Your conversations, saved data, settings and connection token are not touched. It is off unless PEA was started with the installed copy and its service named; otherwise the page says updating is not set up. Nothing in a request can choose where an update comes from, and your assistant cannot start one. PEA for Mac's own gateway always answers that it is not available.

## [0.1.0-rc.1.dev.2] - 2026-11-17

### Added

- A release can be withdrawn. The publisher keeps a signed list of versions that must not be installed. On the signed channel the update command never offers a withdrawn release, and it tells anyone already on one, with the publisher's reason. If nothing newer is published, `--allow-older` goes back to the newest release that was not withdrawn. The list must be signed by the release key, and one older than a list your machine has already seen is refused, so a withdrawal cannot be quietly taken back.

## [0.1.0-rc.1.dev.1] - 2026-11-17

### Added

- A signed channel for the update command. `--channel release` installs only a published release whose manifest is signed by the release key your copy already trusts, and whose tag is exactly the commit that signature names. Only the small signed manifest is downloaded; the files come from the official repository at that exact commit. Pre-releases are considered only when you add `--prerelease`. A copy that is already newer than the newest release is left alone. The unsigned development channel remains the default and says each time that it checks no signature.

### Changed

- Development builds after the first release candidate are numbered `0.1.0-rc.1.dev.N`, so that every later build sorts after `0.1.0-rc.1` and before `0.1.0-rc.2`.

## [0.1.0-rc.1] - 2026-11-17

First release candidate, and the first release signed with the project's release key. It is a pre-release: every feature below passed the automated checks, but none has yet been accepted against real accounts, provider keys or a real model. Use it to try PEA Web, not to rely on it.

### Added

- Everything in the development builds up to `0.1.0-dev.54`, listed below. In short: Chat and Greenhouse with your own models, the encrypted library and board, to-dos and reminders, reviewed documents, email drafts and calendar events (added to Google Calendar when you allow it), weather, headlines and the summary on Today, one public page read at a time, her history and days, provider voices for reading aloud, deck projects, a backup that moves one profile, remembered choices in Connections, and an update command for an installed copy.

### Changed

- The channel is `prerelease`. Development continues after this as `0.1.0-rc.1.dev.N`.

## [0.1.0-dev.54] - 2026-11-17

### Added

- The public key of PEA Web's release signer, and its fingerprint in the releases guide, so a future signed release can be checked. The private key is held by the publisher and is not in this repository. No signed release has been published yet.

## [0.1.0-dev.53] - 2026-11-17

### Added

- An update command for a PEA Web installed as a git checkout of the official repository. `check` shows what is installed and what is available. `apply` moves the copy to the newest commit of the official main branch, restarts the service, and keeps the update only if PEA comes back reporting exactly that commit and version; otherwise the previous version is put back. `rollback` returns to the version before the last update. A person runs it; nothing updates on a timer, and the web app and models cannot reach it. Your browser data, connection token and remembered choices are not touched. This is a development channel with no signature check; signed releases remain the stricter path.

## [0.1.0-dev.52] - 2026-11-17

### Added

- Connections remembers your choices on this browser, so a reload or an update no longer makes you set them again: the Chat and Greenhouse models, the Greenhouse role, the sharing switches, the Google client ID and its boxes, and the GitHub repository name, each per profile where it applies. After you reconnect, the models you chose before are selected by themselves. Keys, tokens and passwords are never saved and are entered again after a reload. The "may retain or train" box always starts off. The first message in a new tab still shows the sharing review. **Forget remembered choices** removes them.

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
