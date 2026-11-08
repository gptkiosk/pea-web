# Public web product boundary

`gptkiosk/pea-web` is the public Apache 2.0 source for the work-in-progress web product. PEA Web has its own history, checks, package version/changelog and release process. Bamcio Ventures LLC is the publisher. The separately distributed native iOS product stays private and independently tested; its source, private history, owner runtime and installed server integration are not in this repository.

This was an additive, explicit allowlisted copy into fresh history. Nothing was moved/deleted from the private checkout: existing native fixture/test paths, source, private documentation cross-references and any legacy web files it currently needs remain intact. New work here does not require changes there. `SPLIT-ORIGIN.json` at the repository root is an initial export-hash receipt, not a live content manifest or runtime grant.

The public web repo owns the synthetic policy contract fixture. Native retains a versioned vendored snapshot and its own tests. Changes require explicit compatibility review and separate adoption; no build fetches or reads a sibling repository. See [fixture policy](../tests/fixtures/README.md).

`pea-config-v1` carries only profile/role/model identifiers, and the authenticated local-model contract is `/v1/models` plus streamed `/v1/chat/completions`. Neither transfers credentials, privacy grants, conversations or tasks. See [co-use](CO-USE.md). Protocol reuse does not publish native code or imply automatic synchronization.

The code and original artwork in this public repository are Apache 2.0; [LICENSE](../LICENSE) and [NOTICE](../NOTICE) accompany program packages. Third-party services, model weights, frameworks and native software retain their own terms. Dependency bundling, a production signer, signed installer releases and the Bamcio.com product listing are later milestones, not claims established by the repository split. See [dependencies](DEPENDENCIES.md) and [release guide](RELEASES.md).
