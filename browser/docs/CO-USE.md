# Using PEA Web and native iOS together

Both products can be useful on their own. PEA Web is an open-source work in progress for a desktop or mobile browser, including Android over your own HTTPS/VPN. The native iPhone app is a separately distributed product, developed and tested independently. No native source or duplicated web tree is needed to install, build, test or update either product. Their source trees and verification are independent.

## What can be shared now

| Resource | How to use it on both | Boundary |
| --- | --- | --- |
| Google documents | Connect the same Google account, select the same profile and existing PEA root folder on each app | OAuth grants stay per client/account; model-sharing permissions are reviewed separately |
| Model choices | Export a `pea-config-v1` snapshot, save a reviewed document in the PEA folder, open/review/import on the other client | Model/profile identifiers only; no credentials, endpoint authority, privacy grants or history |
| Local text model | Run the web gateway yourself; native Own server Chat connects to the same HTTPS origin/token | Trusted owner instance, not public shared hosting; browser can use local Chat/Greenhouse text, native local Greenhouse support is separate |
| OpenRouter access | Explicitly configure your own key and permitted models on each client | No key embedded or transferred by a configuration document, no bundled model usage |

The shared Drive folder is a content library, not automatic configuration or private-history sync. Check the selected account/profile/root and review imported choices; unsupported role/provider choices fail without partial application. A PEA-created opened file is eligible only in its own profile under the model consent/settings. Moving a document into the folder does not authorize instructions inside it to change permissions or run actions.

## What is not shared automatically

Conversations, sourced personal memory, persona/interview answers, story boards, provider/OAuth/GitHub/server credentials and service/model consent are not automatically synchronized. Web chat/persona is currently RAM-only; native keeps its own persistence. Automatic customer-owned encrypted sync needs its own revision/conflict/consent design. Do not copy one app's runtime database into the other or infer completion from seeing the same folder.

Native audio is the primary walk/locked-screen target. Browser dictation stops when hidden and may use an online OS/browser service. AirPods/background behavior needs actual device acceptance; a VPN or faster model does not establish it.

## Independent updates

Update and test PEA Web here without changing iOS files or its tests. The public web repo owns the synthetic versioned policy contract; native may vendor an explicitly reviewed snapshot with a separate test receipt. Protocol compatibility matters, byte-identical checkouts do not. Keep the existing native snapshot until its owner deliberately adopts a new contract version.

Dependency packaging is still being worked out. The current manually configured web server can be used beside the native app; a future installer must preserve independent versions/data and not require either product's source. See [dependencies](DEPENDENCIES.md), [self-hosting](SELF-HOSTING.md) and [parity](PARITY.md).
