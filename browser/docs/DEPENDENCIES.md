# Dependencies and packaging status

PEA Web is **work in progress**. The primary delivery and support target is an installable local package. This is currently a source repository with manual setup, not a finished dependency bundle or hosted service. Operator-managed Docker deployment on GCP or AWS is a documented, best-effort path, separate from the supported local package. No ready-to-run image, Dockerfile or cloud deployment has been supplied or validated. The release manager packages the program files and supports signed verification/rollback; it does not install model software, system runtimes, VPNs or third-party accounts. No production release signer or signed installer is supplied yet.

| Use | Current dependency | Bundled here? |
| --- | --- | --- |
| Browser interface | Modern browser with ES modules, Fetch streams, Web Crypto and IndexedDB | Source/assets only; no npm bundle/framework |
| Loopback static preview | Python 3.11+ standard-library HTTP server | Python is installed separately |
| Local model gateway | Python 3.11+ on macOS/Linux | Gateway source; no third-party Python packages |
| Local inference | Your own loopback OpenAI-compatible model server and compatible model weights | No; choose/install/license them separately |
| Provider model access | Explicit customer OpenRouter key/account, catalogue and privacy/cost review | No key, credits or subscription entitlement |
| Google context/docs | Your own public Web OAuth client/API setup and per-user consent; optional Google Identity browser SDK | Client code only; SDK loads from Google on deliberate connection |
| GitHub output | Optional customer repository and narrowly scoped token, reviewed draft PR | No developer token or repository write authority |
| Phone/browser access | Your own valid HTTPS reverse proxy/private VPN and exact allowed origin | No; no hosted relay |
| Source checks/tests | Node.js 20+, Python 3.11+, Git and OpenSSH signing support; loopback sockets | Synthetic tests only, no provider secrets |
| Package signing/version manager | POSIX macOS/Linux, Python and OpenSSH `ssh-keygen -Y` | Program tooling only, no production signing key |
| Native iPhone client | Separately distributed PEA app | No native source, Apple SDK or native tests needed here |

Windows users can inspect the static source in a browser, but the POSIX package manager and supported local gateway setup target macOS/Linux. Native Windows packaging is not claimed. Hardware/electricity/provider usage and third-party terms remain the user's responsibility. Read [co-use](CO-USE.md) for the shared folder/model-server contracts and data that is not synced.

## Next packaging slice

Design a reviewed per-platform bootstrap/package that checks runtime versions, uses verified upstream distributions, keeps keys/user data out of program directories, preserves updates/rollback, and explains optional model/VPN/Google setup. Choose launch/service integration deliberately. The installer must not require the private iOS source, copy an operator's personal environment, run generated code, enroll strangers into the developer's Mac or make model-accessible software installation possible.

No automatic dependency download, model install, device sync, signing trust or service enrollment is enabled by cloning this repository. A development package and a complete end-user installer are different deliverables.
