# Interview and profile continuity: proposed cross-app contract

Status: design only. PEA Web and PEA for iPhone do not yet exchange interview answers or assistant personas. The existing Web encrypted library backup is a Web-only format. A common Drive folder and the portable model configuration do not synchronize private profiles. Do not treat this document as an implemented wire format.

## Outcome

An owner can answer the same interview on either platform, review the resulting personal and assistant profile, and carry it to the other device without retyping. The interview must have one owner-approved, versioned, publicly shareable question and field catalogue; neither platform should copy implementation code from the other. Platform-specific presentation can differ, but question meaning, field mapping and profile behavior need independent conformance tests. The current Web fields are not evidence that the question sets already match.

The profile needs room for the owner's chosen name, interests, important relationships and preferences, as well as the assistant's chosen name, persona and explicitly fictional backstory. Work and Personal boundaries need an explicit mapping agreed by both products, including how any shared assistant identity is represented. Blended context must not be treated as an independent source of permission.

## Owner-approved interview wording

The owner authorized sharing these questions, but not personal answers or private application code. The Web wizard asks these separately; its saved fields are not yet a native-compatible exchange format. The city is the assistant's chosen fictional home, distinct from an older Web answer about the owner's home.

1. First, what should I call you?
2. And what would you like to call me? I’m Pea by default, like the vegetable, but I’ll answer to any name you choose. You can say keep it.
3. Here is something I would love. Pick a city for me to call home. Choose one you are curious about, or one you have history in yourself. I will keep up with its news, events and history, learn its neighborhoods, and bring things up now and then, the way a friend from there would. Which city, and which neighborhood if you like? You can say skip.
4. Tell me about your family. Who is at home, and who is closest to you?
5. Do you have any pets? Their names and a little about them help me.
6. Who are your closest friends or other people who matter in your life?
7. What do you do for work, and what part of it matters most to you?
8. What topics or goals in your work do you want to keep up with?
9. What are you curious about outside of work?
10. What do you do for fun, or when you finally get time for yourself?
11. What do you most want me to take off your plate? What would make me great at this job?
12. How should I talk to you? Short and to the point, or chatty? Formal or relaxed? When should I speak up, and when should I stay quiet?
13. Is there anything I should never bring up or never do?

The iPhone also has a separate optional wellbeing section with a separate storage and consent boundary. Do not add health answers to the general profile or transfer until their independent handling has been designed and reviewed.

## Exchange and recovery requirements

- The customer controls the transport and explicitly chooses the source, destination and profile. A file in their PEA folder is a possible transport; account access alone does not enable synchronization or model sharing.
- Encrypt and authenticate private contents on the device before storing or transferring them. The independently reviewed versioned format must specify encryption, authenticated metadata, key derivation, limits and cross-platform test vectors. Never invent compatibility from a shared algorithm name.
- Do not transfer provider keys, OAuth tokens, sharing approvals, connector grants, payment settings or device credentials. Neither persona text nor imported content can grant a tool or authorize a model request.
- Preview exactly which profile and fields will be imported; provide an explicit choice for conflicts. Preserve the previous local data until the owner confirms a valid import. Detect competing revisions and never silently overwrite a newer profile. A lost passphrase is not recoverable by the application.
- Imported material stays separate from model disclosure. Each device must independently review the provider, actual context and applicable sharing settings before sending any private data.
- Reject corrupted, oversized, unknown-version and unauthenticated data without partial updates. A later implementation needs independent synthetic fixtures and tests for both products, including existing-profile conflicts, older versions and consent exclusion. Do not use real interviews or live accounts in automated tests.

## Delivery sequence

1. Obtain an owner-approved shareable interview/field catalogue and a platform-neutral exchange specification. Agree on field ownership, migrations, merge behavior and the cryptographic envelope with the independent iPhone maintainer.
2. Implement the reviewed contract in each product independently, with synthetic compatibility vectors and local tests; preserve existing encrypted archives and rollback behavior.
3. Test explicit import/export and conflict cases across Web and a physical iPhone, then separately test any customer-owned Drive transport. Only describe automatic sync if revision handling and failure recovery are actually implemented and accepted.

Until these steps are complete, the interview is browser-local and optional encrypted saving must be enabled to retain its answers across reloads. See [memory and recovery](MEMORY.md) and [using both apps](CO-USE.md).
