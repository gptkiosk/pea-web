# PEA Web

**Personal Executive Assistant · A Bamcio Ventures LLC product**

**Work in progress.** An open-source web companion with Chat, Today and Greenhouse, OpenRouter **bring your own key (BYOK)**, optional customer-owned local inference, and cream/pea-green or dark-green themes. This is a development source repository, not a finished installer or hosted AI service. A locally installed package is the primary supported delivery target; dependency packaging and smoother setup are a later milestone. Docker hosting on GCP or AWS is an operator-managed documentation path, not a bundled managed service.

![PEA pea-pod mascot](browser/assets/pea-mascot.svg)

Use PEA Web by itself, or alongside the separately distributed native PEA iPhone app. No iOS source, Apple tools, developer Mac, bundled provider key or paid membership token is needed here. The iOS app remains a separate product and codebase. No model usage is bundled: provider API charges/limits and any free-model data-use conditions are yours to review.

## Try the interface

Requirements: Python 3.11+ and a modern browser. From this repository:

```sh
git clone https://github.com/gptkiosk/pea-web.git
cd pea-web
python3 -m http.server 18769 --bind 127.0.0.1
```

Open `http://127.0.0.1:18769/browser/`. It starts disconnected with clearly labelled sample data. In **Connect your accounts**, explicitly connect your OpenRouter key and select a model, or follow the local-model setup below. Keys stay in the tab's memory. This plain file server is for looking at the interface with sample data: it sends none of the gateway's security headers and serves the whole checkout. Use the local quickstart below before entering real keys or connecting accounts. Do not expose this development file server publicly. Use HTTPS for a phone browser; a private VPN alone does not secure an HTTP browser origin.

## Local foreground quickstart

On macOS or Linux with Python 3.11+, from the PEA Web source directory or verified installed release:

```sh
python3 browser/server/local.py setup
python3 browser/server/local.py check
python3 browser/server/local.py start
```

Open `http://127.0.0.1:18770/browser/`. Setup creates a private token in `~/.config/pea` and refuses to replace an existing one. Start runs in the foreground until Ctrl-C; it does not install a service, download a model or contact an AI provider. You can configure OpenRouter in the app, or connect your own separately running local model below. For a local-model connection, open your token file privately and enter its value in your own client; the helper does not display it. Run `python3 browser/server/local.py --help` for an alternate configuration directory, port or loopback upstream. This is a source/verified-release helper, not yet a finished signed installer.

## Use your own local model

Run an OpenAI-compatible model server yourself on loopback first, then start PEA's bounded local gateway (macOS/Linux):

```sh
mkdir -p "$HOME/.config/pea"
python3 browser/server/gateway.py --token-file "$HOME/.config/pea/connection-token" --create-token
python3 browser/server/gateway.py --token-file "$HOME/.config/pea/connection-token" --upstream http://127.0.0.1:11434 --port 18770
```

Open `http://127.0.0.1:18770/browser/`. Enter your private connection token under **Local model**, load the model list and choose a Local model. The create-token command refuses to overwrite a token. Local inference needs suitable hardware and compatible model licensing; this repository does not install model software or weights. There is no automatic cloud fallback.

For iPhone/Android/VPN access, use your own valid HTTPS reverse proxy and exact gateway public origin. [Self-hosting guide](browser/docs/SELF-HOSTING.md) · [Operator acceptance checklist](browser/docs/OPERATOR-ACCEPTANCE.md) · [Using web and iOS together](browser/docs/CO-USE.md) · [Dependencies and packaging plan](browser/docs/DEPENDENCIES.md).

## Current capabilities and limits

- Responsive Chat / Today / Greenhouse with independent collaboration, coding and image choices, reviewed provider/privacy/price boundaries.
- Optional Google Calendar/Gmail previews and an app-enforced PEA Drive folder, reviewed Docs/simple Forms and recoverable cleanup.
- Reviewed story board, optional encrypted browser-local story persistence, safe source/diagram/image views, and optional GitHub draft-PR delivery.
- Searchable profile-bound conversations, structured interview and reviewed sourced memories, with optional passphrase-encrypted browser-local saving. Keys and grants remain tab-only. [Memory and recovery guide](browser/docs/MEMORY.md). Automatic device sync and richer native document tools remain unfinished.
- Browser dictation may use an online browser/OS service; locked-screen microphone/AirPods reliability is not promised. Native iPhone is the primary Walk target.
- Explicit version/changelog/feedback controls and a tested signed-package/rollback manager. No production release signer, finished dependency bundle or signed public installer is supplied yet. Never trust a signing key merely because it accompanies an archive.

[Detailed feature guide](browser/README.md) · [Parity and roadmap](browser/docs/PARITY.md) · [Changelog](browser/CHANGELOG.md) · [Release/rollback guide](browser/docs/RELEASES.md) · [Security](SECURITY.md).

## Develop and test

No npm dependencies, provider secrets, Apple SDK or sibling checkout are needed. Tests use synthetic services and temporary signing keys; they do not exercise real accounts or paid inference.

```sh
python3 tools/check_repository.py
python3 browser/server/check_source.py
node --test browser/tests/*.test.mjs
python3 -m unittest discover -s browser/server -p 'test_*.py' -v
```

Node.js 20+ is needed only for tests; Git and OpenSSH signing support are also used by release tests/build tooling. See [contributing](CONTRIBUTING.md), [agent entry](AGENTS.md) and [handoff](HANDOFF.md). Feedback is a reviewed GitHub draft or PR, never an automatic upload of chats or diagnostics.

Apache 2.0 · [LICENSE](LICENSE) · [NOTICE](NOTICE). Copyright 2026 Bamcio Ventures LLC. Product information: [Bamcio](https://bamcio.com/). The public repository is the source/install reference; a Bamcio.com product listing follows when the product is ready.
