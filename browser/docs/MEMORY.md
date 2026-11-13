# Conversations and memory on this browser

Evidence date: 2026-11-08. Development source, verified with synthetic offline tests and an isolated browser preview. No provider, Google account, physical phone or native archive was used for this slice.

## Keep the useful parts

Open **Conversations & memory** above the three workspace tabs. Each Work or Personal profile has its own searchable Chat and Greenhouse conversations. Completed and interrupted threads stay in the current tab by default. Starting a fresh thread keeps the earlier eligible one in this local library. Reconnecting OpenRouter does not erase it.

Choose **Unlock / enable encrypted saving** to retain the library across reloads on this browser/origin. First-time setup includes the current eligible tab-only library and interview answers. After reload, unlock and explicitly choose **Continue**; no conversation is silently restored into a model request. An unlock of an existing saved library replaces current tab-only library contents after review, rather than attempting an unreviewed merge.

Local saving and model sharing are independent. Restoring a conversation clears cached model approval. The next request reviews the provider, privacy/pricing choice, introduction, recalled facts and actual bounded recent-message context. Up to 12 recent completed messages are eligible; interrupted and preview assistant replies are excluded. There is no model call for search, interview, memory selection or encryption.

## Interview and persona

The app-guided form covers your preferred name, assistant name, home city/region, interests, relationships, goals and character style. Every answer is optional, length-limited and profile-bound. Save explicitly. Answers are tab-only unless encrypted saving is enabled. **Share my introduction** in Connections controls whether biographical answers, including the assistant nickname, can reach that profile's model. Persona style has its own visible place in the provider review. Fictional backstories cannot grant tools or external-action permission.

## Optional local-time delivery

In **Interview & persona**, enable the local-time switch to vary delivery through quiet hours (midnight–08:00), morning, daytime and evening according to this device's clock. A coarse character hint is shown in the same provider review; no precise time, time zone or location is included. Changing period triggers a new style review on the next request. This is fictional conversational performance, never a claim that the assistant has human feelings or an autonomous off-screen life.

Device **Read reply** keeps your chosen browser voice. During quiet hours, it asks for seven percent slower speech and a slightly lower pitch; other periods retain ordinary delivery. Browsers/voices may interpret those values differently. No second model request, automatic playback, timer, new microphone permission or background audio is added.

The switch is per-profile and tab-only, off by default and reset on reload/unlock/Lock. It is not part of the encrypted archive or portable model configuration. Saved persona wording is still independent of this optional delivery cue. Physical phone/headset expression needs owner acceptance.

## Sourced, owner-reviewed memory

Select **Remember from my message**, choose a message in the active Chat or Greenhouse thread, quote its exact words, and write the useful fact. Only a completed owner message can be a source. Review the fact and quote before saving. Assistant replies, retrieved text and model instructions cannot automatically create facts or grant permissions.

Memory sharing starts off and returns to off on reload/unlock. When enabled, local selection proposes at most four facts from the same profile. Relevance matches rank ahead of recency; the last 30 days carry more weight. Ordinary facts leave recall after 90 days. **Durable** facts remain eligible until forgotten, but facts older than 30 days need a topical match. Expiry excludes recall; it does not delete the record. Review exact selected facts in the next provider disclosure. A changed set triggers review again. There is no automatic sharing into Blended or another profile. Turning memory sharing off stops new recall; earlier conversation messages may still contain facts already discussed. Start a fresh thread for a clean message history.

Forget a memory to remove it from future recall. Forgetting its source conversation also removes memories derived from it. These explicit local actions require confirmation and do not delete provider copies, remote files or other browsers' copies. Existing saved source messages are not silently trimmed away to make space.

## Storage and recovery boundaries

The library and story board are separate encrypted stores with separate passphrases. The library uses IndexedDB, AES-256-GCM, PBKDF2-SHA256 with 310,000 iterations, a random 16-byte salt and fresh 12-byte IV per write. The format label is authenticated. Keys and passphrases stay in page RAM. Only schema-bound transcripts, interview fields and sourced facts enter the encrypted payload; connection keys/tokens, account grants, files and generated images do not.

A library is bounded to 40 conversations, 200 messages per conversation, 150 facts, and about 1.9 MB of encoded plaintext. Messages are limited to 12,000 characters and facts/quotes to 600 each. Malformed or credential-like contents fail saving with a visible warning, preserving the last valid encrypted record. This is heuristic rejection, not complete secret detection. Finish or resolve a failed save before replacing a conversation. No automatic oldest-item deletion occurs.

Saves serialize. A revision comparison and write occur in one IndexedDB transaction, so competing tabs cannot silently replace a newer saved revision. On conflict, stop editing, preserve any needed unsaved text, Lock, then unlock the current saved copy. The app does not merge competing revisions. A crash/reload may retain the last completed save; an in-flight final response is not guaranteed to have been saved. Interrupted placeholders are labelled in the saved reader and never replayed as complete model replies.

**Lock** clears unlocked library transcripts, interview fields, memory selections and recalled-context approval from the page. Browser page disposal also clears them. Hiding a tab alone does not lock it: on mobile that is too easy to trigger unintentionally. Stop a request and wait for a local save before locking. A compromised or unlocked page can read unlocked content; encryption at rest does not protect against hostile extensions or malicious same-origin code.

An explicit encrypted library backup can be prepared and downloaded; it contains both Personal and Work libraries and excludes the task board, documents, credentials and sharing permissions. Keep the backup file and its library passphrase safe. On an empty browser, choose the file, enter the passphrase and confirm restore. The file is authenticated and schema-checked before a transactional insert; an existing saved library is never overwritten. Unlock separately to review. This is a point-in-time manual copy, not a merge or automatic synchronization. There is no forgotten-passphrase recovery, native-database import, automatic cross-device history synchronization or cryptographic erasure guarantee. Clearing site data, changing origin or losing the passphrase can lose access. Keep the same trusted HTTPS origin when updating. A program rollback does not roll back IndexedDB; future schema changes require a separate migration plan. Current schema version is 1. See [co-use](CO-USE.md), [parity](PARITY.md) and [release boundaries](RELEASES.md).
