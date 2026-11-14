# Your machine, your models

After installation or changes, use the [operator acceptance checklist](OPERATOR-ACCEPTANCE.md) for local, private-cloud and device checks.

PEA Web can use OpenRouter directly or a customer-owned local model server. The app purchase never includes model usage. Local inference avoids provider API fees but needs suitable hardware, electricity and compatible model licensing. The local package is the primary delivery and support target. An operator may choose to host their own container on GCP or AWS using the guidance below; cloud hosting is documentation only, not a bundled or managed PEA service. The current gateway has one shared token and does not supply multi-tenant accounts or isolation.

## Local preview

From the PEA repository root:

```sh
python3 -m http.server 18769 --bind 127.0.0.1
```

Open `http://127.0.0.1:18769/browser/`. This static preview supports opt-in cloud connections. Local-model connection needs the gateway below. Do not expose the development file server to the Internet.

## Local foreground quickstart

On macOS/Linux with Python 3.11+, from this source checkout or an independently verified installed release, run:

```sh
python3 browser/server/local.py setup
python3 browser/server/local.py check
python3 browser/server/local.py start
```

Open `http://127.0.0.1:18770/browser/`. Setup only creates `~/.config/pea/connection-token` with private permissions and refuses to overwrite an existing file. Check verifies the existing token locally without displaying it or contacting a model. Start runs in the foreground, bound to loopback; Ctrl-C stops it. To use a local model, start one separately and enter the token from your private file into your own PEA client. For cloud models, connect your own OpenRouter key through the interface. No model is downloaded, service registered, browser opened automatically or provider contacted by the helper. If you already have a token, skip setup and run check/start. `--help` describes optional config directory, port, upstream and HTTPS proxy origin.

## Local model gateway

Requirements: Python 3.11+ on macOS/Linux, a supported browser, and an already running loopback OpenAI-compatible text model API. Ollama commonly uses port 11434; LM Studio commonly uses 1234. Configure and start the model server yourself. PEA does not install models, execute generated code or change machine services.

Create a token outside the repository. The command refuses to overwrite an existing file and never prints its value:

```sh
mkdir -p "$HOME/.config/pea"
python3 browser/server/gateway.py --token-file "$HOME/.config/pea/connection-token" --create-token
python3 browser/server/gateway.py --token-file "$HOME/.config/pea/connection-token" --upstream http://127.0.0.1:11434 --port 18770
```

Open `http://127.0.0.1:18770/browser/`. In Connections → Local model, enter the token from your private token file and load models. In Models, choose a **Local** model for Chat and/or Greenhouse. No OpenRouter key is needed for those selections. OpenRouter, image generation, Google and GitHub remain separate opt-in connections.

The gateway binds only to 127.0.0.1. Its upstream is restricted to a loopback IP and a fixed `/v1` API, with no arbitrary proxy destination, redirects, forwarded customer bearer token, shell/tools or cloud fallback. It exposes only authenticated `GET /v1/models` and `POST /v1/chat/completions`. Listed models expire after an hour; explicitly refresh the model list. Limits: 8 concurrent HTTP clients, 2 model operations, 128 KB requests, 64 plain text messages/64,000 characters, 4,096 maximum output tokens, 20 seconds to deliver a complete request, 180-second stream deadline and 2 MB response ceiling. The browser requests replies of up to 3,500 tokens, so that a reviewed email or document proposal is not cut off, and has a smaller response cap.

The gateway has no conversation database or request-content logging. Your upstream model software can have its own logs; inspect its settings. Stopping a client cannot guarantee the upstream has already stopped GPU work. The gateway has no API billing because it never contacts a model cloud provider.

## Phone/tablet and private VPN

Run a TLS reverse proxy you control on your private VPN, forwarding one **HTTPS origin** to the loopback gateway, preserving its streaming response and request Host/Origin. Start the gateway with `--public-origin https://your-private-host.example` using your actual origin. No listener is opened on the public network by this flag. Keep the upstream model port private. Do not enable port forwarding to publish it on the Internet.

Android, iPhone, tablets and desktop browsers open the same private HTTPS address ending in `/browser/`; the layout is responsive. Each browser enters its own server token, which stays in that tab’s memory. Use a trusted VPN and valid certificate. HTTPS is needed for normal browser microphone use on phones; the VPN alone does not turn HTTP into a secure browser origin.

Native iOS PEA: choose **My own server**, use the same HTTPS origin (without `/browser/`), enter the connection token and select a listed model. Its existing OpenAI-compatible local connector uses the gateway’s `/v1` contract. This compatibility has synthetic HTTP/request tests; a physical iPhone/VPN/AirPods test is still required. Native Greenhouse currently uses OpenRouter; browser Greenhouse can use local text models.

A shared server token is a bearer credential for one trusted instance, not a per-person identity or permission system. Friends/strangers should run their own instance. Rotate the file and restart the gateway to revoke old clients. A public hosted service would need per-user accounts, isolation, rate limits and operational controls before release.

## Operator-managed Docker and cloud hosting

This is guidance for operators exploring Docker on a VM or container platform; it is not a supplied image, tested deployment recipe, managed service or promise of platform support. **The repository currently has no Dockerfile, published container image or cloud deployment template.** The local package remains the primary product. Operators are responsible for their own hosting, TLS, access control, upgrades, backups, cloud costs and testing. Use the [acceptance checklist](OPERATOR-ACCEPTANCE.md) and record the actual image/source revision and platform used.

The gateway binds `127.0.0.1` inside its own network namespace and only connects to a loopback model upstream. A normal Docker bridge gives each container its own loopback; simply publishing the gateway port or putting a model in another ordinary bridge container does not make either loopback reachable. A workable design needs a deliberately reviewed proxy/network namespace arrangement that can reach the gateway, and a model upstream in the gateway's loopback namespace if local inference is wanted. Do not weaken the gateway's loopback and origin checks just to make deployment work. See [Docker bridge networking](https://docs.docker.com/engine/network/drivers/bridge/) and [port publishing](https://docs.docker.com/engine/network/port-publishing/).

For GCP, a privately operated VM running containers is a potential route once the operator supplies and validates an image and network design. Cloud Run's ingress container must listen on `0.0.0.0` and its assigned `PORT`, so the current loopback-only gateway cannot be the ingress container unchanged; a reviewed ingress proxy or a separate architecture would be needed. See [Google's container runtime contract](https://docs.cloud.google.com/run/docs/container-contract). For AWS, an operator-managed VM is another potential route. ECS containers in the same `awsvpc` task share localhost, but an ingress/proxy, the gateway and any model must be arranged and tested deliberately; see [AWS task networking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-networking-awsvpc.html). Neither example is a tested deployment or a product commitment to provide cloud infrastructure.

For an Internet-reachable deployment, the operator must design and verify authentication at the edge, isolation, TLS, abuse/rate controls and secret handling appropriate to the intended users. The shared gateway token alone does not provide per-user identity or isolation. Keep model endpoints private and decide who can use the instance before exposing anything. A private VPN is a simpler option for a single owner, but is not a requirement imposed on every operator-designed deployment. PEA does not presently provide a ready-made public multi-user security architecture.

## Configuration and documents across devices

Use the same Google identity, profile and PEA root folder on each device. Google Web OAuth and native OAuth are different client types; their grants/tokens stay on each device. Documents in that folder are the common content library. PEA rechecks root/ancestry/version before access; broader Drive permission is disclosed because Google does not restrict its token to one folder.

Connections → Shared configuration exports the `pea-config-v1` snapshot: profile and role/model identifiers only. Save it as a reviewed configuration document in PEA, open it on another device, and review/apply there. Browser can load a document with **Use as configuration**. Native exposes the same JSON review in Greenhouse tools and can create a configuration document. Connect matching catalogues first; a configuration cannot authenticate, change sharing permissions, connect an endpoint, run a task or send a message. Unsupported native local Greenhouse choices are refused without partial application. Local server URL/token are configured separately on each device.

This is explicit snapshot import/export, **not automatic configuration sync**. Save a newly named revision instead of overwriting another device’s work. Chats, sourced personal memory and boards are not synchronized between devices yet. Automatic encrypted sync with revision conflicts is a separate parity milestone; never imply the shared folder has synchronized private history.
