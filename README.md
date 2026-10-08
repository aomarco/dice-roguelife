English | [한국어](README.ko.md) | [日本語](README.ja.md)

# Dice Roguelife — standalone, bring your own AI

A text roguelike where dice decide your world, character and fate, and an AI narrates your life.
Die, return in a new body, and carry something forward. This modified checkout runs in a normal browser:
**no Claude subscription or artifact account is required.**

## Start playing

Install Node.js 20.19+, 22.13+, or 24+ and run these commands in this directory:

```sh
npm ci
npm start
```

Open **http://localhost:3000**, then **Settings → AI connection**:

1. Choose a provider or local model server.
2. Paste your API key, if required.
3. Enter the exact model ID from your provider (Azure: deployment name).
4. Save the connection. The optional connection test makes one API call.
5. Start a life and play.

Dependencies are already installed in this checkout. Subsequent launches need only `npm start`.
The server builds the page at startup. Keep the server running while playing.
Use the same browser, hostname and port each time: browser storage is tied to that origin.

## Providers

| Connection | Available presets |
| --- | --- |
| Dedicated protocols | OpenAI, Anthropic API, Google Gemini, Azure OpenAI, Perplexity Sonar |
| Compatible services | OpenRouter, Groq, DeepSeek, Mistral, xAI, Together, Fireworks, DeepInfra, Cerebras, NVIDIA NIM, Hugging Face |
| Local models | Ollama, LM Studio, llama.cpp, vLLM |
| Custom | Editable compatible endpoint and model ID, or a supported native protocol |

Presets provide endpoint configuration, not a guarantee that every model supports every feature.
Use a chat/text model capable of following JSON instructions. Enable JSON mode only when supported.
Turn streaming off if your endpoint does not support it. Remote endpoints must use HTTPS;
local model servers can use HTTP on localhost. No API key is required for keyless local servers.
Azure needs its resource base URL, such as `https://YOUR-RESOURCE.openai.azure.com`, and a deployment name.
Bedrock and Vertex IAM authentication are outside this version.

Model IDs are editable rather than tied to a hard-coded catalogue. Choose your provider's actual available model.
For Ollama, first download a model and run Ollama; enter that model's name in the app.

## Cost and keys

API services bill your API account independently of chat subscriptions. Local inference can avoid provider fees.
You control the maximum output tokens, prompt byte limit and retries. Retries default to **zero**;
malformed replies do not silently cause more narration calls or switch providers.
Summaries and life reviews are separate model calls. AI portrait selection is opt-in because it makes extra calls. An optional summary model also serves the Fast tier;
Standard and Deep use your narration model. Usage shows reported tokens for successful calls, not exact costs.

Keys remain in memory by default and must be entered again after reloading. Remembering a key is opt-in and
stores it **unencrypted on this device**. Keys are kept separately from game saves and exports.
The loopback relay avoids browser CORS restrictions and does not persist keys on disk.

## Saves, images and migration

Saves, settings and uploaded portraits/backgrounds persist in IndexedDB in this browser.
They survive reloads, but clearing browser data removes them. There is no automatic cloud synchronization.

- Export game backups from **Saves → Save file**; import the same files into another installation.
- Existing Claude artifact save exports use the same format and can be imported here.
- Export images and tags from the Images tab; upload images and import tags in another installation.
- Export stories as Markdown or HTML; HTML exports embed the images they display.
- Manual tags and portrait matching work locally. Enable image analysis to use auto-sort with a vision-capable model (up to 8 MB per image).

The screen and stories support English, Korean and Japanese. The original game features remain:
dice checks, luck, worlds, rewrites, branches, objections, quests, messengers, memory and Life Reviews.
See the [original gameplay guide](https://wonjoonseol-ws.github.io/dice-roguelife/) for game mechanics;
its Claude installation instructions apply only to the original artifact version.

## Development and updates

```sh
npm run build       # standalone HTML, and the optional artifact build
npm run lint        # syntax, ESLint, formatting and translations
npm run test:api    # relay/protocol tests, no paid calls
npm test            # game and standalone browser tests
```

Install the test browser once with `npx playwright install chromium`.
See [STANDALONE.md](STANDALONE.md) for architecture, credentials, adapter extension and verification limits.
Existing [ARCHITECTURE.md](ARCHITECTURE.md) sections describe the original game and artifact storage.

Export backups before updating. Stop the server, review/merge upstream changes, run `npm ci`, and restart
with `npm start`. This checkout contains local modifications; upstream `git pull` may require a merge.
Do not replace it with an upstream Claude-only release HTML file.

To change the port in PowerShell: `$env:PORT=3001; npm start`. Changing the origin changes which browser saves you see.
This relay is intended for local use, not public hosting.

## Optional Claude artifact mode

The existing Claude adapter still runs when the page is published inside a Claude artifact.
Build with `npm run build` and publish `dist/dice-roguelife.html` with the original db/sample/user/assets/downloads
capabilities. That mode uses the artifact's storage and subscription; API connection controls are for standalone mode.

## License

[MIT](LICENSE). Original game by wonjoonSeol-WS; this checkout adds standalone provider support.
