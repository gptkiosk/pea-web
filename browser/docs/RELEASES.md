# Versions, feedback and reversible program updates

PEA Web is a separate open-source product. Its repository, package versions, changelog, release signing and Linux web/server checks are independent of the private iOS app. This public web repository uses Apache 2.0 and its own upstream. A release signer exists (see below); a dependency bundle and a signed installer release are not published yet. The separately distributed native product is outside this repository and its license.

## Build identity and release discipline

`release.json` is the version/channel/public-repository configuration. Use SemVer, a dated nonempty entry in [CHANGELOG.md](../CHANGELOG.md), a clean committed checkout and an immutable `v<version>` tag for a published release. A `development` build is explicitly marked as such. The organization defaults to Bamcio Ventures LLC and remains configurable for forks.

The bordered footer shows the version, environment, web commit, connected gateway commit and modified/unknown state. Static previews without a stamp honestly report unknown identity; generate a preview stamp with `identity --write browser/build-info.json` when desired. Never commit that generated file. Packaged files are checked against the installed manifest for the modified indicator. That indicator is local diagnostics, not an independent authenticity guarantee; activation verifies the release signature.

```sh
python3 browser/server/releases.py identity
python3 browser/server/releases.py build --output /tmp/pea-release
# For a clean development checkout only:
python3 browser/server/releases.py build --development --output /tmp/pea-dev-release
```

The builder reads the explicit `WEB-FILES.json` source list. It refuses dirty source and symlinks, and emits a deterministic `.tar.gz`, file-hash manifest and stamped build identity. No Git history, iOS code, keys, conversation records, user data or model weights are packaged. The manifest declares data schema 1: this installer updates program files only and runs no data migrations. Release assets must be reviewed and signed before publication. CI tests have no signing secrets and do not publish or deploy.

## Sign and establish trust

Use a dedicated PEA Web Ed25519 signing key, held separately from source and CI. Never reuse another product's private signing key. On the maintainer's trusted signing machine:

```sh
ssh-keygen -Y sign -f /secure/location/pea-web-release-key -n pea-release /tmp/pea-release/pea-web-VERSION.manifest.json
```

Ship the archive, manifest and detached `.sig`. Users obtain and check the public signing-key fingerprint through an independent trusted channel before installation; a key downloaded beside an untrusted archive cannot establish trust. The public `allowed_signers` entry has the form `pea-release namespaces="pea-release" ssh-ed25519 PUBLIC_KEY`. The project's release signer was created on 2026-11-17 and its public half is [`browser/server/allowed_signers`](../server/allowed_signers). Its fingerprint is `SHA256:4r7cfvtmy7paakJoPFEqAtxI6EP6Huol+A13TVV43J8`; check it with `ssh-keygen -lf` on the key in that file. The private key is held by the publisher, outside this repository and CI. A fingerprint read from the same place as the file proves only that the two agree: before trusting a release, compare it with a copy the publisher gives through another channel. No signed release has been published yet. The initial installer/source is itself a trust bootstrap and must also come from a verified source.

## Install, inspect, activate, verify

Supported manager hosts: macOS or Linux with Python 3, Git for source builds, and OpenSSH with `ssh-keygen -Y` signature support. Windows can serve the static app separately; this POSIX version manager is not a Windows installer.

Choose a **new program-only install root outside the checkout and all user data**. Keep connection tokens, private configuration, browser archives/backups and model weights outside it. Downloading is deliberate; the assistant has no installation endpoint or signing authority.

```sh
python3 browser/server/releases.py init --root "$HOME/PEA-Web-program" --allowed-signers /trusted/pea-web-allowed-signers
python3 browser/server/releases.py stage --root "$HOME/PEA-Web-program" --archive /downloads/pea-web-VERSION.tar.gz --manifest /downloads/pea-web-VERSION.manifest.json --signature /downloads/pea-web-VERSION.manifest.json.sig
python3 browser/server/releases.py list --root "$HOME/PEA-Web-program"
# Save active work and stop the gateway using your normal service control first.
python3 browser/server/releases.py activate --root "$HOME/PEA-Web-program" --release vVERSION-COMMIT12 --confirm
```

Staging verifies the pinned signature, archive and per-file digests before extracting bounded regular files. Paths, links, extra/duplicate/missing archive entries and incompatible data schemas are refused. Activation re-verifies the staged program, records a recovery journal, retains `previous`, and atomically changes `current`. Commands are serialized with a per-install lock. No package script is executed and no service is restarted automatically.

Start the gateway from `current/browser/server/gateway.py` with your existing external token file and loopback-model arguments, following [self-hosting](SELF-HOSTING.md). The running gateway resolves its actual release directory at launch; changing the pointer does not hot-replace files under an old process. Verify `GET /api/build-info` and a synthetic connection check after deliberately restarting, then refresh the browser. Keep the same trusted HTTPS origin to retain access to origin-bound encrypted browser storage. Changing the URL is not a data migration. Keys held only in tab RAM need reconnecting after refresh.

## Updating a checkout on the development channel

An owner who runs PEA Web from a git checkout of the official repository, kept running by a launchd job, can update it with one command. It is separate from the signed-release manager above and less strict: it trusts the official repository over HTTPS and names an exact commit, and it checks no signature. Use it to follow development; use signed releases when they exist and you want that assurance.

```sh
python3 browser/server/update.py check
python3 browser/server/update.py apply --launchd-label YOUR.LAUNCHD.LABEL --confirm
python3 browser/server/update.py rollback --launchd-label YOUR.LAUNCHD.LABEL --confirm
```

`--checkout` names the installed checkout when the command is run from another copy, and `--url` says where PEA answers on this machine (default `http://127.0.0.1:18770`).

`check` changes nothing. `apply` refuses, and says why, when the folder is not the top of a PEA Web checkout; its `origin` is not the official repository named in its own `release.json` (forks and other remotes are never updated this way); a tracked file has been changed; the installed copy has commits the official main branch does not; the launchd job is not loaded; or PEA is not currently running the installed version at `--url`. Otherwise it moves the checkout to the newest commit of the official main branch, restarts the job, and waits for `/api/build-info` to report exactly that commit and version on an unmodified copy. If that does not happen, the previous commit is put back and restarted, and the command says so. A record of the last update is kept in `~/.config/pea/updates` (private to you) so `rollback` can return to the version before it.

What stays: everything outside the checkout. Browser storage belongs to the address PEA is served at, so the library, board, to-dos, remembered choices and other saved data are untouched as long as the address stays the same. The connection token and configuration folder are not read or changed. Keys held only in a tab are entered again after you reload, as always. The command runs no data migration and no script from the repository other than itself.

Nothing runs it for you. There is no timer, the web app has no route to it, and a model cannot start it.

## Rollback and interrupted switches

```sh
# Save work and stop the gateway first, then:
python3 browser/server/releases.py rollback --root "$HOME/PEA-Web-program" --confirm
# Restart deliberately and verify /api/build-info again.
# If list reports pendingRecovery after an interrupted switch:
python3 browser/server/releases.py recover --root "$HOME/PEA-Web-program"
```

Rollback re-verifies the previous signed program and swaps the two pointers. It does not revert conversations, Drive files, model data or other user data. A changed program is refused rather than silently trusted. Recovery completes/undoes the pointer bookkeeping according to the atomic switch; unexpected manual pointer changes require local inspection. There is no automatic health-based rollback. Keep current and previous versions; older staged directories are not automatically deleted in this first manager. Existing external backup policy remains separate.

## Older and withdrawn versions

```sh
# Mark a staged version as one that must not be used. Its files are kept.
python3 browser/server/releases.py revoke --root "$HOME/PEA-Web-program" --release v0.1.0-0123456789ab --reason "Short reason"
# Deliberately select a version older than the one in use, after making backups:
python3 browser/server/releases.py activate --root "$HOME/PEA-Web-program" --release v0.1.0-0123456789ab --confirm --allow-older
```

`activate` refuses a version older than the one in use unless `--allow-older` is given, because an older program may refuse to open a library or board saved by a newer one. `rollback` to the previous version needs no extra flag. A withdrawn version cannot be selected or rolled back to, and `list` shows withdrawn versions with their reasons. The withdrawn list is kept on this machine in `revoked.json` under the install root; it is your own record, not a signed notice from the publisher.

In the app, **Check for updates** tells a stable build when its own version is no longer among the published releases, or is newer than the latest published stable version. Either can mean the version was withdrawn. The check only reads public release information and never installs anything.

## Suggestions and PRs

The footer offers a themed suggestion/bug form. **Prepare draft** shows the exact user-entered title, description and public build identity before sharing. No conversation, account details, documents, keys, logs or host identifiers are attached automatically. Credential-pattern rejection is an additional guard, not complete redaction; review your own text. Download the Markdown brief for a contributor's fork/PR, or open a prefilled GitHub issue and choose whether to submit it. A suggestion does not automatically become code or an approved PR. A maintainer/contributor implements it on a branch, runs the web-only checks and submits a reviewed PR. The customer's configured GitHub work repository/token is never used for product feedback.

The Updates panel also offers **Compare with main**: an explicit read-only GitHub check shows whether the running commit matches the public `main` branch. A different commit is not proof of ancestry, a release, or an update that can be installed safely. The check sends no chats or credentials; GitHub receives normal network metadata. No source checkout, package, service or customer data is changed.

Release checks are also explicit: the browser contacts only the configured public GitHub latest-release endpoint, without product credentials or chats. GitHub still receives normal network metadata. Release text is displayed as plain text; the app never executes it, downloads code or changes the installed version. A published stable release must exist before this check can offer an update; source publication alone is not an installer release.

## Independent policy contract

The public web repo owns the synthetic policy contract fixture. iOS vendors a versioned snapshot and retains its own tests. See [fixture provenance](../tests/fixtures/README.md). Neither repository requires a sibling checkout or cross-repo byte equality. Each product determines its own source layout; this release process never modifies a native checkout. A contract change requires an explicit versioned compatibility review and separate iOS adoption; similarity does not authorize data sharing.


## MCD-aligned delivery direction

The intended customer experience follows MCD's product pattern: version and changelog maintained in GitHub, reviewed releases, a clear update panel, program/data separation and a recoverable previous version. PEA Web and the native iOS app remain separate codebases and releases. Features and integrations can be ported and tested on their respective schedules; a Web update does not automatically synchronize iOS behavior or data. Published signed releases, automated package retrieval, an operator-controlled in-app update helper, health-gated restart/rollback and an independently trusted production signer are not implemented here yet. The current local helper and signed staging manager are building blocks, not a complete MCD-style updater. Following `main` as source is different from installing a verified, versioned release.
