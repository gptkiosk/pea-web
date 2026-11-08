# Contributing

PEA Web is work in progress. Use an issue to discuss the intended behavior and acceptance criteria, then a focused branch/PR with relevant web-only tests. Keep the original mobile-friendly branding and make provider/data-sharing decisions explicit. No sibling/native repository or real user accounts are needed to develop or test.

Run the README checks and stage named source files. Add no keys, personal prompts, chat excerpts, private host details, raw errors, local archives or large generated artifacts. Use `example.invalid` identities and temporary fakes in tests. For policy changes, version the fixture and explain compatibility; do not silently update a native copy.

No new framework, hosted dependency, paid fallback, background agent or deployment should be introduced as an incidental refactor. Dependencies and a distributable installer are being designed; document requirements and licenses rather than bundling unverifiable binaries. Keep release signing outside CI and never make a model-accessible installer.

PRs should explain the concrete behavior change, relevant verification and remaining limits. Maintainers review before merging. Issue drafts and the in-app downloadable brief do not automatically create code changes. Contributions intentionally submitted for inclusion use this repository's Apache 2.0 license; third-party notices must be preserved. See [security](SECURITY.md) for sensitive reports.
