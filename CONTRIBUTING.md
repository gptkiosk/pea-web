# Contributing

PEA Web is work in progress. Use an issue to discuss the intended behavior and acceptance criteria, then a focused branch/PR with relevant web-only tests. Changes under `mac/` also need the Swift tests and the gateway conformance suite described in [mac/README.md](mac/README.md); a gateway rule is changed in `browser/server/contract.json` and the conformance suite, then in both gateways. Keep the original mobile-friendly branding and make provider/data-sharing decisions explicit. No sibling/native repository or real user accounts are needed to develop or test.

Run the README checks and stage named source files. Add no keys, personal prompts, chat excerpts, private host details, raw errors, local archives or large generated artifacts. Use `example.invalid` identities and temporary fakes in tests. For policy changes, version the fixture and explain compatibility; do not silently update a native copy.

Every feature is guarded by regression tests in the same pull request: unit tests for its logic, and a browser-level test in `browser/tests/dom/` for anything the owner sees or approves. Those tests drive the real gateway and a headless Chrome against a synthetic model, with no packages to install; they are skipped locally when no Chrome or Chromium is found and required in CI. For an action a model can propose, the test must show that nothing happens before approval, that cancel changes nothing, that approval acts once, and that nothing is restored after reload.

JavaScript under `browser/` is formatted with Prettier 3 using `--single-quote --print-width 110`. It is a contributor tool only: run it with `npx` and do not add it, a lockfile or a configuration file to the repository. Keep formatting changes in their own pull request, separate from behavior changes.

No new framework, hosted dependency, paid fallback, background agent or deployment should be introduced as an incidental refactor. Dependencies and a distributable installer are being designed; document requirements and licenses rather than bundling unverifiable binaries. Keep release signing outside CI and never make a model-accessible installer.

PRs should explain the concrete behavior change, relevant verification and remaining limits. Maintainers review before merging. Issue drafts and the in-app downloadable brief do not automatically create code changes. Contributions intentionally submitted for inclusion use this repository's Apache 2.0 license; third-party notices must be preserved. See [security](SECURITY.md) for sensitive reports.
