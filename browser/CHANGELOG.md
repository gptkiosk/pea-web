# PEA Web changelog

Notable user-facing changes. Versions follow semantic versioning; dated entries use Added, Changed and Fixed sections. Development builds are not published releases. The native iOS product has its own release process.

## [0.1.0-rc.4.dev.73] - 2026-11-25

### Added

- **Built-in lookups, each with a switch.** Under Curated sources on Today (menu, then Knowledge sources) there is now a switch for Weather, Headlines, TV shows, Wikipedia, Scholarly papers and Web search. All start on. Switch one off and PEA asks that service nothing: typing "papers on …" or pressing a button a model offered opens no review and tells you the lookup is off, the weather card puts its forecast away and stops refreshing, and Headlines will not add or refresh a feed. The Chat model is no longer told it can offer a lookup that is off, and is told to say plainly that it is switched off if you ask.
- The switches are kept in this browser, hold across reloads and updates, and travel in the Backup & restore file.

## [0.1.0-rc.4.dev.72] - 2026-11-25

### Added

- **Six more debate questions**, fourteen in all: AI and work, free speech and platform moderation, digital privacy and public safety, housing costs, nuclear power, and universal basic income. Each shows a short case for both sides.
- **Switch sides.** A button on the debate bar (or typing "switch sides") has PEA defend the position you started with while you argue against it. **Switch back** returns to the usual arrangement.
- **Start a debate by typing or saying it.** "Start a debate", "let's debate", "debate me" or "play devil's advocate" opens the debate window. "Debate me on nuclear power" opens it with that question chosen. A message such as "Argue with me: …" followed by an argument of twelve words or more starts the debate at once with your message as written. "Wrap up" asks for the summary and "end debate" ends it. Talk about debates, such as "what is a debate?", is left alone.
- **Talk** on the debate bar opens Chat's voice room, since a debate is a lot of typing.

### Changed

- In a debate PEA's written turns are longer and follow a set shape: where your argument stands strongest, the counterargument, answers to what you asked, then one or two questions. When the reply will be read aloud (voice chat or I type, you talk) PEA is asked for four to six plain sentences ending in one question.

## [0.1.0-rc.4.dev.71] - 2026-11-24

### Added

- **Start a debate.** A new Debate tile on Chat's welcome (and "Start a debate" in the command palette) lets you pick a question people really disagree on, say where you stand, and have PEA argue the other side with you, one question at a time. Eight questions are built in, each shown with a short case for both sides: conflict minerals, voting, fast fashion, AI and creative work, green energy, crime, billionaire philanthropy and animal agriculture. You can also write a question of your own.
- While a debate is on, a bar over Chat names the question and has **Sum up** (the strongest points on each side, what stayed in dispute and where you seem to have landed, with no winner named) and **End debate**. A new chat ends it too. Each profile has its own.
- PEA is told to say first what is strong in your view, to concede good points, never to invent a figure, study, quotation or source, not to take the opposite extreme either, and that the other side is a role you asked for, not its own opinion. It is told not to argue for harm to people; it offers a neutral account instead. A model can still be wrong, so check what matters.

### Changed

- On a phone the five welcome tiles are three over two.

## [0.1.0-rc.4.dev.70] - 2026-11-24

### Added

- **Backup & restore can carry your keys, if you tick the box for that file.** "Also put my keys in this file" adds the OpenRouter key, GitHub token, web search keys and voice provider key that are in the tab when the file is made. The box is off every time, a file with keys needs a passphrase of 16 or more characters, and the review names each key and says plainly that anyone with the file and its passphrase could use them. No key is ever shown.
- **Keys come back after a review of their own.** OpenRouter and GitHub go back into their fields and wait for Connect, which checks them with the provider as usual; a search or voice key is held in the tab at once. Nothing is sent anywhere by restoring. Because keys live in the tab only, a restore that also changes settings asks you to reload first and restore from the same file again for the keys.
- Never in any file: the connection token and your Google sign-in.

## [0.1.0-rc.4.dev.69] - 2026-11-24

### Added

- **An update shows what it is doing.** While PEA updates from the Versions & updates window there is a progress bar and five steps (note where you are, put the program files in place, restart PEA, check it answers on that version, finished) with a tick on each as it is done, and "PEA is restarting; this page will reconnect by itself" while it is out of reach. If the new version does not come back healthy the list shows where it stopped and that the version you had was put back.
- **A log of the last update**, folded under "What PEA did, step by step": each line with its time, in PEA's own words. It stays after a reload.
- **Your settings are checked across an update.** Before an update starts PEA notes a mark for each setting saved in this browser; after you reload it compares and says "all N are exactly as they were", or names any that differ. An update replaces program files only; this shows it.
- **Go back to the previous version from the app.** After an update from here, "Go back to …" returns to exactly the version that update replaced, after a review that says what changes and what does not. It is offered only while the installed copy is still the one that update left, and PEA keeps the version you have if the older one does not come back healthy. Before this it could only be done with the update command.
- **"Back up everything first…"** in the same window opens Backup & restore in Settings.

### Changed

- While an update or a go-back is under way its own buttons are put away, so it cannot be asked for twice.
- A proxy in front of PEA that answers for it while it restarts (a private-network address, for example) is now understood as "restarting", not "working on it".

## [0.1.0-rc.4.dev.68] - 2026-11-24

### Added

- **Backup & restore: everything in one encrypted file.** A new tile in Settings writes one passphrase-encrypted file holding what PEA keeps in this browser: your settings (model choices, sharing switches, Google client ID and repository name, provider and device voice, weather place, headline feeds, the sources you follow, presence, the notes and saved-chats switches, window arrangement) and, for both Work and Personal at once, interview answers, memories, to-dos, PEA's history and days, and deck projects. Restoring shows every setting it would replace and every item it would add before anything changes; items are only added, settings are replaced and take effect after a reload. It is for a reinstall, a move to another browser or cleared browser data; an update of PEA does not need it.
- The file never holds provider or service keys, the connection token, chats, files, the story board, permissions or "may retain or train" consents. Chats and the board keep their own encrypted backups. A setting that looks like a key is left out and named.
- Settings shows when a backup file was last made in this browser.

## [0.1.0-rc.4.dev.67] - 2026-11-24

### Changed

- **Today is a list of short rows.** Each section (Upcoming, Inbox, Weather, Curated sources, Headlines, To-do list, Story board, Projects, Created by PEA) is one row with its name, a line about it, its state and a chevron, and opens in place. When Today has the window to itself on a wide screen the rows are two columns. The "Quick glance" label that did nothing is gone, and Story board and Created by PEA have the same heading as the rest.
- **Adding a to-do is tidier**: the words on a line of their own, then when, "Remind me" and Add. "Also show a system notification" and Today's other actions are buttons, not link-style text.
- **Harvest with nothing in it is a card** that says what will appear there, and its lists are framed like the rest of PEA.
- **The footer is one slim line of small buttons** (Changelog, Updates & rollback, Suggest an improvement, Source commit). On a phone it is two short rows, not a tall block.
- **On a phone every dialog is a sheet that rises from the foot of the screen**, as wide as the screen, with a smaller heading and the close button always in reach while you scroll. The command palette stays a small card near the top.
- **The line under “Ideas grow in good company.”** now reads “A curious mind. A scrutinous advocate. Distilled vetted ideas…”.
- **Dialogs on a computer** have a smaller heading with a line under it that stays put while the rest scrolls, their fold-out sections look like rows you can press, and "Upstream releases" (before, "Review upstream releases") and the palette's "Keyboard shortcuts" are buttons. Dialogs fade in; with reduced motion they appear at once.

## [0.1.0-rc.4.dev.66] - 2026-11-24

### Changed

- **The top of PEA is one row.** The brand is at the left, Chat, Today, Greenhouse and Harvest are in the middle, and the profile and the menu are at the right. The two status pills ("Choose a model · Set up" and "Saved on this browser · Manage") are no longer in the bar: they are the first two rows of the menu, as Model and Memory, each with its button. Until a Chat model is chosen the bar shows one "Set up" button; it goes once you have one.
- **The profile is a menu that drops down under its button**, with a tick on the profile in use, in place of the system pop-up that covered the bar. The bar's menus slide down, show one at a time, and close on Escape or a press anywhere else.
- **The theme switch is the last row of the menu** and names the theme it switches to.
- **On a phone, or any narrow or short window, PEA has a slim bar that stays at the top** (brand, profile, menu) with the four workspaces as one row under it. The page title row and the two status cards that took the top third of the screen are gone. The menu opens as a sheet across the screen.
- **Chat on a phone fills the screen, with a small writing box at the foot** and its buttons as one row of icons (their names remain for screen readers and as tooltips). The large "Talk with PEA" button is left out there, as on a computer; Voice chat is the microphone in the row.
- **Greenhouse's actions are buttons**, not link-style text, and the deck form's labels sit over their fields. A pane's "Swap sides" and "Tuck up" are small buttons in every pane.
- **A short message on a phone is a bar across the foot of the screen**, not a tall box over the middle of it.

## [0.1.0-rc.4.dev.65] - 2026-11-23

### Fixed

- **A message sent in the first moment after the page loads waits for your saved chats to open.** They open just after loading; on a slow machine that could land in the middle of a first request and redraw the chat under it. The wait is a few milliseconds on an ordinary machine.
- **Interview answers typed in that same first moment are kept.** Opening the saved chats refilled the interview form from what was saved and could wipe a name just typed.

## [0.1.0-rc.4.dev.64] - 2026-11-23

### Changed

- **The assistant is called PEA, not "her".** Past chats & memory now reads "PEA’s history", "PEA’s days" and "What you have told PEA"; buttons, reviews, notices and the list of what PEA did follow ("Write PEA’s week…", "Included PEA’s days around today"). The same goes for what your model is told when it writes the character's history and days, and for the small set of interests and people PEA deals out: none of it says "she" or "her" any more. Cards and days already written keep their own words; write them again if you want them to match.

## [0.1.0-rc.4.dev.63] - 2026-11-23

### Changed

- **"Set up" is a guided setup.** The button on Chat opens "Set up PEA": six steps, each a big button that says what is already known (connected, the Chat model, device voice, no key, off). Start or Continue goes to the first step that is not set up. The steps are: connect a model (a switch between "On this machine" and "OpenRouter"), choose your models (Chat, Greenhouse collaboration, Greenhouse coding), voice, web search, Google, and knowledge sources.
- **One section at a time, with a way on.** Each step shows only the part of Settings it is about, under a progress bar with the step's name and one line of help. Back and Next stay at the bottom; Next reads "Skip" until the step is set up, and says what it found ("✓ Local model connected"). "All settings" leaves the guide for the usual Settings home. Finish returns to the list of steps.
- The guide uses the controls Settings already has. It reads no key, fills no field and connects nothing by itself; every step can be skipped. The earlier chooser ("Set up your connections", five routes) is gone; GitHub is under All settings.

## [0.1.0-rc.4.dev.62] - 2026-11-23

### Fixed

- **Fish Audio voices load.** "Load voices" asked Fish Audio only for voices made by the key's own account, so an account that had made none got an empty list. PEA now also asks for Fish Audio's page of licensed English voices (voices whose rights Fish Audio says it has secured), and lists them under their own heading below any voices of your own. Any other voice on fish.audio still works by pasting its ID. Voices that are still training are left out.

### Changed

- **Voice providers shows one step at a time.** Choose a provider, then its key, then "Load voices" and the voice list, then "Try this voice…". Each step appears when the one before it is done, and pasting a whole key moves on at once. What loading found is said next to the button, above the list. The key field is named for the provider, and the voice ID field says where to find an ID.
- **Gateway rule (both gateways):** `POST /v1/voices` accepts `{provider, key, library: true}` for a provider whose rules name a library page; it is one fixed request, and nothing in it chooses a path, a language or a page. A gateway older than this refuses it, and PEA then lists your own voices only.

## [0.1.0-rc.4.dev.60] - 2026-11-23

### Changed

- **Actions in settings and tool windows are buttons.** "Continue in chat", "Forget conversation…", the way back from a section, "Set a passphrase…", "Fresh Chat…" and every other action that was drawn as green link-style text now has a button's shape: a border, rounded ends, padding, and at least 44 pixels of height. "More" under a shortened text is a small button. Links to other sites stay links.

## [0.1.0-rc.4.dev.59] - 2026-11-23

### Fixed

- **A model no longer has to guess which shows you follow.** Told only that sources exist, a small local model answered "here are the shows you follow" with eight it had made up. While "Talk from briefs" is on, each Chat request now names the shows you really follow, with how many episodes are kept, and says they are the only ones. The review before sending lists those names. With the switch off, the model is told only how many there are and to say it cannot see the list.
- **PEA answers more of these questions itself.** Any short question about podcasts, the curated or knowledge sources, or the shows you follow now gets PEA's own list with rows to press, and never reaches a model. A show asked about by name still opens its episodes.
- The model is also told never to claim it listened to a show.

## [0.1.0-rc.4.dev.58] - 2026-11-23

### Changed

- **Chats are saved as you go, with no passphrase.** A reload used to empty the chat unless you had set a passphrase and typed it again. PEA now makes a key that stays in this browser and saves your conversations, interview answers and memories with it. After a reload the chat you had open is there again, and nothing is asked.
- **Anyone who can use this browser profile can open saved chats.** The saved record is sealed, not readable as a plain file, but the key is in the same browser. Privacy & voice and Past chats & memory now say so.
- **A passphrase is still there for more.** "Set a passphrase…" in Past chats & memory moves everything under a passphrase and removes the browser's key; PEA then asks for it after each reload, as before. Keeping a provider key between reloads, and making a library backup, need a passphrase.
- If you already use a passphrase, nothing changes for you.

### Added

- **An empty Chat lists your newest saved chats.** Up to five, newest first; one press continues one. A new chat stays new after a reload, with the earlier ones listed under it.
- **Save chats on this browser**, a switch in Past chats & memory. Turning it off deletes what was saved, after a review, and stops saving.

## [0.1.0-rc.4.dev.57] - 2026-11-23

### Added

- **Ask about a show by name and get its episodes to press.** "What do you have from the Harbor Voices podcast?", "what's new on Harbor Voices?", "the latest from Harbor Voices" and "open Harbor Voices" now open that show's episodes as numbered rows in Chat, answered by PEA itself. The whole name works, and so do its first two words or more.
- **A podcast you do not follow is said plainly, with your shows to press.** Asked about a podcast that is not one of yours, PEA says so and lists the shows you do follow as rows, with the way to follow more. Before, the question went to your model, which said it had never heard of the show and suggested others.

### Changed

- **Your model is now told the knowledge sources exist.** Every Chat request says that PEA has Curated sources, whether you follow any, that the model knows an episode only when its brief is in the request, and that it must never deny a show or invent one, pointing you to "list shows" instead. It is told how many shows you follow and never their names.

## [0.1.0-rc.4.dev.56] - 2026-11-23

### Fixed

- **Fields in Settings were cramped and out of line.** A note under a dropdown touched it, a label sat as far from its own field as from the one above, and Paste dropped to its own line under the key field. In Settings, Past chats & memory and Privacy & voice a label now sits close above its field, a note sits clear under it, the next label starts clear of both, and Paste sits beside its field and ends where the other fields end. "More" sits directly under the text it expands.
- In Past chats & memory, a section showed stray "More" buttons that belonged to text on the window's home.

## [0.1.0-rc.4.dev.55] - 2026-11-23

### Added

- **Knowledge sources is in the menu.** It takes you to Curated sources on Today, where you browse the curator's shows and follow the ones you want. Until now the only way there was to know it was on Today.
- **Asking which shows PEA knows gets a true answer.** "Can you list the podcast shows you know about?", "what podcasts do you know?" and similar questions are now answered by PEA itself from the shows you follow. With none followed it says so and offers a button to Curated sources; before, the question went to your model, which made shows up.

### Changed

- **Every window under the menu now works like Settings.** Past chats & memory opens on eight big tiles (Past chats, Memories, What you have told her, Her history, Her days, Interview file, Profile file, Library backup) and shows one section at a time with a way back. Privacy & voice is three tiles of short points in place of three long paragraphs, each with a button to the setting it describes; every statement it made is still there. The interview's three steps are buttons, so any step is one press away. Switches, taller fields and buttons, and two-line explanations with "More" now apply in all of them and in Export this chat.
- Past chats are one press further away than before: open the window, then Past chats.

### Fixed

- In the interview, the "Read question" button beside each answer was labelled "Dictate answer", so every question showed two buttons with the same name.

## [0.1.0-rc.4.dev.54] - 2026-11-23

### Fixed

- **The settings button now appears when your model mislabels it.** Asked how to connect Google, a model offered the button as a block labelled "json", so PEA showed the raw code and nothing to press. When a reply holds exactly one such block, labelled "json" or not labelled, and it is exactly a navigation offer and nothing else, PEA now reads it as the button and no longer shows the code. Only navigation is read this way, because it can do no more than open a panel; every other kind of action still needs its exact label.
- Your model is now told the exact label to use, and to name the most exact place (Google, not Connections, for Gmail or Calendar).

## [0.1.0-rc.4.dev.53] - 2026-11-23

### Added

- **Go deeper: the publisher's own words for a section.** A brief gives you the claims; the publisher's transcript gives you what was actually said. Where the catalog says where a publisher keeps its transcript, a section now has a **Go deeper** button (or say "go deeper", "read the transcript", "what exactly did they say").
  - **Review first.** PEA shows the one address and its size. Nothing is read until you approve, and declining asks nobody.
  - **One request, through your PEA server,** to the publisher's own file. The curator's catalog does not carry transcripts; it only says where they are.
  - **What you see:** up to three passages nearest the section, word for word, with the time and the speaker where the publisher gives them.
  - **With Chat:** while that section is open, those passages go with your message as labelled quotation, after the usual review, in place of the digest. Your model is told to quote them exactly and not to claim knowledge of the rest.
  - **The rest of the episode is instant.** The transcript is kept in this tab, so going deeper on another section of the same episode asks nobody. It is not saved, is in no backup, and a reload forgets it.
  - **Kinds of file:** captions (WebVTT, SubRip), plain text, Markdown, and web pages, including pages that write the transcript as loose lines.
- Your PEA server's reader now accepts caption and Markdown files as well as pages. This is in the shared contract, and both the Python and the Mac server pass the same tests for it.

### Changed

- The most of one episode that goes with a Chat message is now 4,200 characters, up from 3,200, to make room for passages.
## [0.1.0-rc.4.dev.52] - 2026-11-23

### Changed

- **No more sourdough.** A model asked to invent a life reaches for the same hobby every time: sourdough and its starter. PEA now leaves it out of what it keeps and says about her, in three places:
  - **When it is written.** A card for Her history, a line for Her days or a note from Chat that is about sourdough, a bread starter or baking bread is not kept, and the model is told not to write one.
  - **When it is sent.** A card or line kept before this rule is never chosen and never goes with a Chat message.
  - **When PEA starts.** Such cards and lines are dropped from what this browser kept.
- It is decided by fixed words on the page, not by a model. Buying bread, a starter of soup or baking biscuits are untouched, and so is anything you wrote about her yourself.

## [0.1.0-rc.4.dev.51] - 2026-11-23

### Changed

- **Google settings follow the order you do them in,** as four numbered steps: your Google client ID (with the origin to copy and the link to Google's console), what PEA may ask Google for and the button that continues to Google, your PEA folder, and what this profile shares with your model. The switches used to come first and the client ID field after them.
- **Models & OpenRouter is three numbered steps:** your key (with the switch to keep it, then Verify), your models, and sharing and data.
- Every field, switch, button and sentence is the same as before; only the order changed and the step headings were added. One sentence under Local model said to choose a model "above"; it now says where: under Models & OpenRouter.
- An explanation that holds a link or an address to copy is no longer cut to two lines, so the link is never hidden behind **More**.

## [0.1.0-rc.4.dev.50] - 2026-11-23

### Changed

- **Settings opens on a home of big tiles.** Connections used to be one long list of nine folded sections. It now opens on nine large tiles (Models & OpenRouter, Local model, Images, Google, GitHub, Web search, Voice providers, PEA updates, Shared configuration), each with one line on what it is for. Three of them also say where they stand: whether your server is connected, whether a search key is entered, and your model connection.
- **One section at a time.** Pressing a tile shows that section alone, under its own title, with **← All settings** to go back. Anything that takes you to a setting (a link, an error's button, your model's button, the update window) lands in this view.
- **Switches instead of small checkboxes** in Settings, Privacy & voice and the library, and taller fields and buttons.
- **Less text at first sight.** A long explanation is cut to two lines with a **More** button. Nothing was removed: the whole text is one press away, and every review still shows what it always showed.
- **Help, commands and shortcuts are one menu entry.** The menu had Commands at the top and Keyboard shortcuts at the bottom. It now has one **Help & commands** entry, and is grouped: your chats, then you and your settings, then help.
  - Type what you want to do or set up ("brave key", "calendar", "backup") and it finds the setting and takes you there, as well as the commands it always had.
  - **Keyboard shortcuts** is a button inside it, and the shortcut list has a button back.
- Shortcuts and the command list now work while a settings panel is open beside the page.

## [0.1.0-rc.4.dev.49] - 2026-11-23

### Added

- **PEA can take you to the setting you need.** Seventeen places in PEA's settings now have a name PEA can send you to, from Web search and Google to Privacy & voice, your encrypted library and Curated sources.
  - **Ask in your own words.** In Chat, type "open web search settings", "take me to the Google setup", "where do I enter my Brave key?" or "how do I connect Google?" and PEA opens that section. It is matched by fixed rules on the page; no model is asked. Ordinary questions ("open my calendar", "where is my passport") still go to your model.
  - **From an error.** When PEA tells you something needs a setting ("Enter one in Connections → Web search"), the message now carries an **Open Web search** button that takes you there.
  - **From your model.** When you ask how to set something up, your model may offer an **Open Google settings** button. It opens only when you press it.
  - **Beside your chat.** On a wide screen, a panel opened this way sits at the side of the page instead of over it, scrolled to the section with its title marked. Chat stays in use, so you can ask PEA what to do next while you look at the fields. On a narrow screen it opens over the page as before.
  - **Guided setup.** While a settings panel is open beside the chat, your model is told which one and what it holds, to guide you one step at a time. It cannot see or change any setting, and is told never to ask you to paste a key or password into the chat.
  - **By address.** `#settings/web-search` at the end of PEA's address opens that section, so a place can be bookmarked or written in a guide. The address names a place and carries nothing else.
- Going to a setting only opens, scrolls and marks a section. It fills no field, approves nothing and grants nothing.

## [0.1.0-rc.4.dev.48] - 2026-11-23

### Added

- **Citations for a section, by address.** The curator's catalog now attaches published papers to some sections of an episode. Where a section has them, PEA shows them as a fourth level under the section: `6.2.1.c.1`.
  - Open a section and press **Citations (2)**, or say "list citations", "citation 1", "next citation", "citations for 6.2.1" or the address itself. "Where am I" names the citation you have open.
  - A citation shows the paper's title, journal, year and how often it is cited, what it found, how it bears on the section, and a link that opens the paper in your browser.
  - Every citation is labelled for what it is: a paper the curator's pipeline found by searching, which the episode did not name and nobody checked by hand. PEA says the pipeline's reading of it ("supports the claim", "mixed evidence", "related, not a direct test of the claim" and so on) as the pipeline's, not as fact.
  - While a section is open, its citations go with your Chat messages as labelled lines alongside the brief, after the usual review. Your model is told what they are and not to say the episode cited them.
  - The catalog's published schema does not describe citations yet, so PEA checks each one itself and leaves out any that is not exactly in the expected form.
- **Check studies, from a section.** A section now has a **Check studies** button (or say "check studies", or "check studies for 6.2.1"). It opens the same review as "papers on …", with the section's own sentence as the search words; nothing is asked until you approve. It is free and needs no key.

### Changed

- **"Search 6.2.1" now searches.** It used to answer that PEA Web cannot search the web. It now opens the web search review with the section's sentence as the words, using the search key you entered under Connections. Without a key it says so.

## [0.1.0-rc.4.dev.47] - 2026-11-22

### Added

- **Web search with your own key, at Brave Search or Browserbase.** Under Connections there is a new section, **Web search**, with a field for each key and a choice of which to search with when you have both.
  - In Chat, type "search for tide tables in Lisbon" (or "web search …", "search the web for …"), or press **Search the web** when your model offers it.
  - Nothing is searched until you review the exact words and the provider. Declining asks nobody.
  - Your PEA server makes the one request. Your key goes from the page to your server and from there only to the provider; the server does not keep or log it. PEA never retries and never switches to the other provider.
  - Up to five results are kept as plain words in this tab: each page's title, site, address and up to three extracts. They are shown to you and shared with your model only with your next Chat message, after the usual review. They are not saved with your chats.
  - Your model is told it may offer a search only while a key is in the tab, that a search may cost you money, and never to say it searched.
  - A key is held in this tab only. Tick **Keep my search keys sealed in my encrypted library** to have them back after you unlock; they are in no backup. **Forget my search keys** removes them from both.
  - If the provider rejects the key, is out of credit or is busy, PEA says so in its own words; the provider's wording is not shown.

### Changed

- **The PEA server has a new route for search**, written into the shared contract and conformance suite first. Both the Python and the Mac gateway follow it: one fixed request to the named provider's own host, nothing in a request chooses the host, path or options, bounded in time and size, sharing the one provider slot with speech.

### Not included

- **Prices are yours to check.** When read on 22 November 2026, Brave listed search at $5 per 1,000 requests with monthly free credit and did not state a price for the endpoint PEA uses; Browserbase listed 1,000 searches a month free and $1 per 1,000 for the fast mode PEA asks for.
- Brave's terms do not allow storing results beyond transient use, so PEA keeps them in the tab only.
- No separate "web brief" written by a model, and no result page is fetched by itself. To read one page in full, use "read https://…".
- Not tried against the real providers: I have no key of yours and made no real search.

## [0.1.0-rc.4.dev.46] - 2026-11-22

### Added

- **Look something up on Wikipedia.** In Chat, type "wikipedia lighthouse keeper" (or "look up … on Wikipedia"), or press **Look up on Wikipedia** when your model offers it. PEA keeps the start of the one article Wikipedia's own search finds first, with its title, short description and page address.
- **Look up a TV show.** Type "tv show Severance", or press **Look up TV show** when your model offers it. PEA keeps the one show TVmaze's search matches: its kind, language, genres, status, dates, where and when it is shown, episode length, rating, next episode when listed, summary and page address.
- Both work like the paper lookup:
  - Nothing is asked until you review the exact search words and the exact address. Declining asks nobody.
  - Your PEA server makes the one request, with no key, no cookie, no sign-in and nothing from your chats, and never retries.
  - The answer is kept as plain words in this tab, shown to you, and shared with your model only with your next Chat message after the usual review.
  - The kept words name their source and licence (Wikipedia, CC BY-SA 4.0; TVmaze, CC BY-SA) and tell your model to say where they come from, and that the match may not be the subject you meant.
  - Your model can only offer the button, and is told not to say it looked anything up.

### Not included

- English Wikipedia only, and only the first article its search finds.
- No list of TV shows you follow, no switch per lookup, and nothing is looked up unasked.

## [0.1.0-rc.4.dev.45] - 2026-11-22

### Added

- **Look up scholarly papers.** In Chat, type "papers on sleep and memory" (or "studies about …", "find research on …"), or press **Look up papers** when your model offers it. PEA searches OpenAlex, a public index of scholarly works, for up to five papers.
  - Nothing is asked until you review the exact search words and the exact address. Declining asks nobody.
  - Your PEA server makes the one request, with no key, no cookie, no sign-in and nothing from your chats. It needs the server connected under Connections.
  - PEA keeps each paper's title, year, first authors, journal, citation count, whether it is open access, its DOI and the start of its abstract, as plain words in this tab. It shows them to you and shares them with your model only with your next Chat message, after the usual review.
  - PEA does not read the papers themselves. The list says so, and tells your model that a listing is not proof of a claim.
  - Your model can only offer the button. It is told not to say it searched, and not to cite a study from memory as if it had looked it up.
  - A search that fails or finds nothing keeps nothing, says so, and is never retried.

### Not included

- OpenAlex allows searches without a key from a small daily allowance shared by everyone at your internet address: about 100 searches a day when checked on 22 November 2026. PEA does not use an OpenAlex key.
- Papers are not looked up automatically and are not attached to a curated brief's claims.
- The list comes from OpenAlex's own ranking. PEA does not judge the quality of a paper.

## [0.1.0-rc.4.dev.44] - 2026-11-22

### Added

- **Use another catalog.** Under Curated sources there is a new section, **Advanced: use another catalog**. Enter the public https address of a catalog in PEA's knowledge format, and after a review PEA uses it in place of the usual one.
  - This page can only reach the addresses it was built with, so your PEA server reads the other catalog's files for it: one public file at a time, over https, with no cookie, no account and nothing about you or your chats. The server must be connected under Connections.
  - Every file is checked exactly as the usual catalog's is (size, fingerprint, form and text rules) before PEA uses it.
  - Changing catalog starts over: your followed shows, their numbers, pins, names and kept files from the catalog in use are removed from this browser. The review says so first.
  - **Back to the usual catalog** returns, also after a review.
  - Addresses that are not a plain public https address in lower case are refused in plain words, and nothing is asked.
  - Request a podcast is offered only for the usual catalog.

### Changed

- **The PEA server's page reader also accepts JSON.** The rule is in the shared contract and the conformance suite, and both the Python and the Mac gateway follow it. The reader's other rules are unchanged: one GET to a named public host on port 443, no credentials, no redirects followed, bounded in size and time, never a private or local address.

### Not included

- The other catalog's host sees your server's internet address and which shows you follow, as the usual one sees your browser's.
- Without the PEA server connected, another catalog cannot be refreshed; what was kept stays usable.
- One catalog at a time.

## [0.1.0-rc.4.dev.43] - 2026-11-22

### Added

- **Talk from briefs.** A switch in Curated sources, shown once you follow a show and on until you turn it off. On, an open episode's brief and digest go with a Chat message, after the usual review, as before. Off, nothing from a curated episode goes with a Chat message; you can still walk shows, episodes and sections by number. The choice is remembered in this browser.

### Not included

- On the iPhone app this switch also routes questions about a show or topic to the right brief when no episode is open. The web shares a brief only for the episode you have open, so the switch covers only that.

## [0.1.0-rc.4.dev.42] - 2026-11-22

### Added

- **A storage limit for curated sources.** A new section, **Storage in this browser**, shows how much of this browser's storage the kept files use and lets you choose the most they may use: 0.5, 1 or 2 MB. It starts at 1 MB.
  - When the files do not fit, the digests of the oldest episodes are left out first, then those episodes' briefs. Pinned episodes are kept first, and a pinned episode's brief is never left out.
  - Nothing leaves the open tab. What did not fit is missing only after a reload, and the next Refresh fetches it again.
  - The section says in plain words how many digests or episodes did not fit, or that everything is kept.
  - If the browser itself has less room than you allowed, PEA keeps a smaller set instead of nothing; if it will keep nothing at all, PEA says so.

### Changed

- The limit used to be a fixed 3 MB, with every digest dropped at once when it was passed. It is now your choice, and files are left out one at a time, oldest first.

### Not included

- The iPhone app offers 5 to 100 MB. A browser gives one site about 5 MB in all for this kind of storage, so the web choices are smaller.
- Nothing is evicted from the open tab, and there is no per-show storage figure.

## [0.1.0-rc.4.dev.41] - 2026-11-22

### Added

- **Digests for curated shows.** A digest is the curator's longer checked account of an episode: its strongest claim, talking points with their times, figures, what is disputed, exact quotes and who took part. For each kept episode PEA now fetches the digest along with the brief.
  - Every digest is checked like a brief before use: its size and fingerprint against the curator's list, its form, its text rules, and that it is the digest of that episode. One that fails is left out, and the episode is still kept and talked about from its brief.
  - With an episode open, a Chat message now carries the brief and then what the digest adds, as labelled lines ("Point (at 4:54): ..."), with nothing the brief already said repeated. Brief and digest together stay within the same limit as before, and the review before sharing shows exactly what is sent.
  - Your model is told that only lines marked Quote or Exact quote are the publisher's own words, and to say a line marked Disputed as disputed.
  - Digests are kept across reloads with the briefs. If everything together is too much for this browser, digests are the first to be left out and come back with the next Refresh.
  - The detail page says for each kept episode whether PEA has its brief and digest or its brief only.

### Changed

- The review before browsing now says that following a show fetches the brief and the longer digest of each kept episode.
- If you already follow shows, press Refresh once to fetch their digests.

### Not included

- Publisher transcripts are not fetched, so PEA cannot go deeper than the digest; it can give the time and you can open the original.
- A digest is used only for the episode you have open. Digest chapters, glossary, suggested questions and recap cards are not used yet.

## [0.1.0-rc.4.dev.40] - 2026-11-22

### Added

- **A detail page for each curated show.** Every card has a **Details** button. Opening it fetches nothing.
  - **Status and About:** whether you follow it and its number, the curator's overview, who publishes it, how often, what the curator publishes for it, its terms and credit, and a link to the show's own page that only you can open.
  - **Kept in this browser:** each kept episode with its date and a link to the original.
  - **Pin an episode.** A pinned episode stays kept while the curator still lists it, even when you keep fewer or newer episodes arrive. Up to five per show.
  - **Check this show now** asks the catalog for the curator's list and this one show.
  - **Your name for it.** Rename a show for yourself. Its number, its briefs and the curator's own name are unchanged, and an empty name gives the curator's name back.
  - **Follow** or **Unfollow** from the same page.

### Not included

- A pin lasts only while the curator lists the episode. The catalog lists a show's few newest episodes, so a pinned one goes when it leaves that list.
- Still not on the web: a storage limit with eviction, another catalog address, digests and transcripts, and the Talk from briefs, Web briefs and Scholarly papers switches.

## [0.1.0-rc.4.dev.39] - 2026-11-22

### Added

- **Curated sources keep what they fetched.** The checked briefs of your followed shows now stay in this browser, so after a reload they are ready without pressing Refresh and without asking the catalog for anything. Each kept file is checked again, exactly as a fetched one is, before it is used; one that no longer passes is left out until the next Refresh.
- **Stay current.** A new switch, off until you turn it on. With it on, PEA checks the catalog for your followed shows by itself while it is open, at most every six hours, and again when you come back to the tab if a check is due.
- **A switch on each followed show: Use in conversation.** Off, the show keeps its number and its briefs but is not fetched and is not offered when you say "list shows" or walk by number. On again, it is back at once and is checked.
- **Topic buttons** above the list filter it by the curator's topics. They work on the list already here and fetch nothing.
- **What PEA has learned lately:** the ten newest kept episodes across the shows in use, each with a link to the original that only you can open.
- Each card now shows the publisher and kind, how many episodes the curator has and about how long they run, its topics, an **Added** mark on followed shows and the date of the newest kept episode.

### Changed

- A show the curator lists with nothing to talk about yet is no longer offered. A show you already follow always stays listed.
- The review before browsing now says that briefs are kept in this browser in plain form, since they are public files, and describes Stay current.

### Not included

- From the iPhone app's Knowledge sources screen, not yet on the web: the source detail page (pin an episode, rename a show, check one show), a storage limit with eviction, another catalog address, digests and transcripts, the Talk from briefs, Web briefs and Scholarly papers switches, and the built-in lookups and health topics shown on that screen.
- The public catalog publishes format 1.3 today. Format 1.4 files (citations) are not read yet.

## [0.1.0-rc.4.dev.38] - 2026-11-22

### Added

- **She can remember what you tell her, for a while.** Under Past chats & memory there is a new section, **What you have told her**, with one switch: *Keep short notes of what I tell her in Chat*. It is off until you turn it on, separately for Personal and Work.
  - With it on, PEA keeps a few of your own sentences from Chat: statements about your life, such as "My sister is visiting on Friday." PEA picks them by a fixed rule. No model chooses or writes them, and nothing a model says is ever kept.
  - Each note is kept for 60 days, up to 60 at a time for a profile. You see every one, with the day you said it and the day it will be forgotten, and can forget one or all of them.
  - In a later conversation, up to four notes that fit what you are talking about go to your chosen model with a Chat message, in your own words, so she can ask how something went. The review before sharing lists them. Notes from the conversation you are in are not repeated into it.
  - Notes are stored with your saved conversations: encrypted when encrypted saving is on, otherwise in this tab only. They are in an encrypted library backup and in no other file. Forgetting a conversation forgets its notes.

### Changed

- **The saved library has a version 3.** The first note kept in an unlocked library upgrades it, after the review that turns the switch on says so. Older versions of PEA Web cannot open an upgraded library. A library with no notes stays exactly as it was.

### Not included

- The rule that picks sentences reads English only and is simple: a first-person statement that is not a question or a request. It will sometimes keep a sentence that is not about your life and miss one that is.
- Notes are not in the one-file profile backup, and they do not move between devices.
- Whether a model uses the notes with tact was not measured against a real model.

## [0.1.0-rc.4.dev.37] - 2026-11-22

### Added

- **A more varied life for your assistant.** She used to drift toward one hobby and return to it in every conversation. Now PEA deals her a set of five interests and five people from a wider list of twenty and twelve, such as bouldering, film photography, a quiz team, a garden plot, learning Portuguese, a neighbour whose dog she walks and a friend abroad who sends voice notes.
  - Each day a different interest and a different person are on her mind, so a week covers all of them and no day repeats the last.
  - Your model is told to say nothing about her own life in most replies, to mention one thing only when it fits or when you ask, not to return to an interest it already raised in the conversation, not to make one hobby her whole personality, and to be more curious about your life than talkative about hers.
  - The cards of her history and the lines of her week are now written around the same set, spread across it, with no interest, food or person on more than two.
  - You see her set under **Her history** and can deal her a different one. It is fiction made by PEA itself: no request is made for it, and nothing about you is in it.
  - It goes with Chat messages only in the Personal profile and only while you share her story, under the same switch as before. The sharing review shows it.
- **A plainer way of writing.** In Chat your model is now asked to write the way a person talks to someone they know: commas and full stops instead of long dashes; no emoji or symbols unless you use them first; no headings, bullets or bold in ordinary talk; no praise for the question, no summing up at the end, no stock phrases such as "I'm here to help" or "As an AI". Greenhouse work is laid out as before.

### Notes

- **What did not change:** PEA still never claims to be human, and still answers plainly, in one sentence, when you sincerely ask whether it is a person or an AI. It already did not volunteer this, and the new style rule also keeps "As an AI" out of ordinary replies.
- These are instructions to your model. How closely a given model follows them was not measured.

## [0.1.0-rc.4.dev.36] - 2026-11-22

### Changed

- **Enter sends.** In Chat and Greenhouse, Enter now sends your message and Shift+Enter makes a new line, as in other chats. Enter still finishes a word you are composing with an input method (Japanese, Chinese and others) without sending.

### Added

- **Every navigation option PEA says can also be pressed.** The numbered list now carries a button for each next move it names, so you can press instead of saying or typing:
  - An open episode: Next episode, Previous episode, Episodes, Shows, Where am I.
  - An open section: Next section, Previous section, Back to episode, Episodes, Shows, Where am I.
  - An open headline: Next headline, Previous headline, Back to headlines, Feeds, beside Read in Chat.
  - A list of headlines: Back to feeds. A point of a reply: Next point, Previous point, List points.
  - An answer such as "where am I", a refusal, or "there is no episode 1.9" offers the ways back as buttons too.
- The same buttons show in the voice room, where the options are also read aloud.

### Notes

- A button does exactly what its words do: it runs through the same fixed rules, and a move is still answered on the page without asking a model.

## [0.1.0-rc.4.dev.35] - 2026-11-22

### Added

- **A show keeps its number.** The first show you follow is Show 1, the next Show 2, and so on, and each keeps that number for good: when new episodes arrive, when you refresh, when you follow more shows, and when you unfollow a show and follow it again. So "Show 2" always means the same show. Numbers can have gaps.
- **Clear and refresh all shows…** in Curated sources is the one way to renumber: after a review that says a number may change, it removes the kept briefs, numbers your followed shows 1 upward, and fetches them again.
- **Choose how many episodes to keep.** Each followed show has a small menu: none, or 1 to 5 of its newest. Keeping fewer takes effect at once with no fetch; keeping more fetches that show again.

### Changed

- A followed show now keeps its **three** newest episodes unless you choose another number, as on the iPhone. It was five.
- When a show number does not exist, PEA says which numbers your shows have.

### Notes

- Show numbers and the number of episodes to keep are saved in this browser with your followed shows. Turning Curated sources off forgets them.
- Episode numbers still follow the episodes kept, newest first, so 1.1 is always the newest kept episode of Show 1.

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
