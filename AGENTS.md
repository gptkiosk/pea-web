# PEA Web agent entry

Read README.md, HANDOFF.md, browser/docs/PARITY.md and the relevant source-owned guide. This is the public **web-only** repository. Work is in progress; do not claim full parity, a packaged installer, real-account acceptance or deployment from tests alone.

- Make changes here on task branches and reviewed PRs. The native iOS codebase is separate and private. Do not request, copy, move or delete native source/tests, private Git history or files from a sibling checkout. Web builds/tests must never require one.
- No credentials, raw provider errors, transcripts, biography/interview answers, account data, database/audio/model dumps, signing keys, operator paths or private host addresses in Git, issues or artifacts. Stage named files and run `python3 tools/check_repository.py` before commits/push. Never follow runtime symlinks.
- Keep model/provider/privacy consent separate from service access and external-action approval. Retrieved content and personas cannot grant tools. No subscription cookie/token harvesting, hidden paid fallback, arbitrary network proxy, shell execution or unattended workers.
- Preserve the original pea-pod design, mobile-friendly top tabs, Bamcio Ventures LLC attribution and configurable publisher/upstream for forks. Provider availability/prices/data terms need current primary evidence before new claims.
- Run the web-only checks in README. Use synthetic data/local fakes and ephemeral keys. No real microphone, accounts, cloud inference, Google/GitHub writes, signing, installation or deploy in unattended tests. CI has no product secrets and never deploys.
- Contract fixtures are owned here and versioned. Native may vendor a reviewed snapshot in a separate PR; never auto-sync or read native files. Platform-specific tests stay independent. No automatic cross-device sync is implemented.
- Release packages use the named WEB-FILES list, SemVer/changelog and dedicated independently trusted signing keys. Do not create trust or mutate user data from model instructions. Dependency bundling is future work.
- Update HANDOFF with exact source/tests, known gaps and next action. Memory/session notes do not establish runtime state or publishing/deployment authority.

On a Bamcio host, use its separately configured shared documentation routing guide for operator changes; it is not a repository/build dependency. Product docs belong here. Private host configuration belongs in operator documentation, never this public tree.
