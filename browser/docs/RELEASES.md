# Versions, feedback and reversible program updates

PEA Web is a separate open-source product. Its repository, package versions, changelog, release signing and Linux web/server checks are independent of the private iOS app. This public web repository uses Apache 2.0 and its own upstream. A production signer, dependency bundle and signed installer release are not configured. The separately distributed native product is outside this repository and its license.

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

Ship the archive, manifest and detached `.sig`. Users obtain and check the public signing-key fingerprint through an independent trusted channel before installation; a key downloaded beside an untrusted archive cannot establish trust. The public `allowed_signers` entry has the form `pea-release namespaces="pea-release" ssh-ed25519 PUBLIC_KEY`. No production public key is supplied yet. The initial installer/source is itself a trust bootstrap and must also come from a verified source.

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

## Rollback and interrupted switches

```sh
# Save work and stop the gateway first, then:
python3 browser/server/releases.py rollback --root "$HOME/PEA-Web-program" --confirm
# Restart deliberately and verify /api/build-info again.
# If list reports pendingRecovery after an interrupted switch:
python3 browser/server/releases.py recover --root "$HOME/PEA-Web-program"
```

Rollback re-verifies the previous signed program and swaps the two pointers. It does not revert conversations, Drive files, model data or other user data. A changed program is refused rather than silently trusted. Recovery completes/undoes the pointer bookkeeping according to the atomic switch; unexpected manual pointer changes require local inspection. There is no automatic health-based rollback. Keep current and previous versions; older staged directories are not automatically deleted in this first manager. Existing external backup policy remains separate.

## Suggestions and PRs

The footer offers a themed suggestion/bug form. **Prepare draft** shows the exact user-entered title, description and public build identity before sharing. No conversation, account details, documents, keys, logs or host identifiers are attached automatically. Credential-pattern rejection is an additional guard, not complete redaction; review your own text. Download the Markdown brief for a contributor's fork/PR, or open a prefilled GitHub issue and choose whether to submit it. A suggestion does not automatically become code or an approved PR. A maintainer/contributor implements it on a branch, runs the web-only checks and submits a reviewed PR. The customer's configured GitHub work repository/token is never used for product feedback.

Release checks are also explicit: the browser contacts only the configured public GitHub latest-release endpoint, without product credentials or chats. GitHub still receives normal network metadata. Release text is displayed as plain text; the app never executes it, downloads code or changes the installed version. A published stable release must exist before this check can offer an update; source publication alone is not an installer release.

## Independent policy contract

The public web repo owns the synthetic policy contract fixture. iOS vendors a versioned snapshot and retains its own tests. See [fixture provenance](../tests/fixtures/README.md). Neither repository requires a sibling checkout or cross-repo byte equality. Each product determines its own source layout; this release process never modifies a native checkout. A contract change requires an explicit versioned compatibility review and separate iOS adoption; similarity does not authorize data sharing.
