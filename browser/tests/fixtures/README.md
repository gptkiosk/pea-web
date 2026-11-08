# Policy contract snapshots

`PolicyFixtures.json` is synthetic contract version 1, owned by this public PEA Web repository. It covers explicit profile sharing, expiry/projection and app-enforced Drive ancestry. No account credentials or user data are included. Initial snapshot SHA-256: `8925f9b292b6cfda12e648a98e15ca9ce644a1b3565c99882a9187241501dcab`.

The private iOS product keeps a vendored snapshot and runs its own Swift tests against that copy. It does not download web fixtures during a build, and web CI does not read native files. Web checks never read a private/native path. The private checkout retains its existing local fixture/test copies and paths; no deletion or native adoption is required by this additive split. The existing iOS fixture and test are unchanged by this web slice.

To revise a contract: discuss the behavior and compatibility impact, version the snapshot, update the relevant web tests, and request a separate iOS vendoring/test PR with the reviewed source revision and digest. Security fixes need explicit review on both products. Do not silently synchronize fixtures or weaken a policy to make versions match. Additional product-specific tests remain independent.
