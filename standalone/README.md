# Dice Roguelife standalone (optional add-on)

> **The main way to play is the Claude artifact** (see the [README](../README.md)): no install, no API key.
> This add-on is for people who would rather run the game on their own computer with an API key or a local model.
> It is **community-maintained**, and the provider presets are not tested against every paid service.

## What you need

- [Node.js](https://nodejs.org/) 22.13 or later, and [Git](https://git-scm.com/)
- An API key from an AI provider, or a model running on your computer (Ollama, LM Studio, llama.cpp, vLLM)

## Start

```sh
git clone https://github.com/wonjoonSeol-WS/dice-roguelife.git
cd dice-roguelife
npm ci
npm start
```

Open **http://localhost:3000**, then **⚙ Settings → AI connection**: choose a provider, paste your API key (not
needed for local models), enter the provider's exact model ID, and **Save connection**. **Test connection** makes one
API call. Keep the server running while you play. To use another port: `PORT=3001 npm start` (PowerShell:
`$env:PORT=3001; npm start`).

## Providers

Presets for OpenAI, Anthropic, Google Gemini, Azure OpenAI and Perplexity (each in its own request format), plus
OpenRouter, Groq, DeepSeek, Mistral, xAI, Together, Fireworks, DeepInfra, Cerebras, NVIDIA NIM and Hugging Face
(OpenAI-compatible), and the local servers Ollama, LM Studio, llama.cpp and vLLM. **Custom** takes any
OpenAI-compatible endpoint. Remote endpoints must use HTTPS; local servers can use HTTP on localhost.

Use a model that follows JSON instructions well. Turn on JSON mode only if the model supports it, and turn off
streaming if the endpoint doesn't support it. **Fast** in ⚙ Settings uses the optional summary model; Standard and
Deep use the narration model.

Logins that reuse a chat subscription (Claude Pro/Max through Claude Code, ChatGPT through Codex, Gemini CLI) are not
supported: their providers' terms don't allow it in other apps. If you have a Claude subscription, play the artifact.

## Costs and keys

API calls are billed to your API account. Like the artifact, the game makes extra calls for summaries and Life
Reviews, and a reply it can't read is retried up to twice. Network retries for rate limits and server errors are off
by default (⚙ Settings). The usage line in Settings shows the tokens providers report.

Your key stays in the page's memory and is typed again after a reload, unless you tick **Remember key on this
device**, which keeps it **unencrypted** in this browser. Keys never go into saves or exports, and the server never
writes them to disk.

## Saves and images

Saves, settings and images are kept on disk in `standalone/data/` (a SQLite file and an `assets` folder), not in the
browser. Clearing browser data doesn't touch them, and any browser on this computer sees the same saves. To back up,
stop the server and copy the folder. To keep them elsewhere, set `DR_DATA` to a folder path.

Moving from the artifact: export your saves (Saves → Save file) and your images (Images → Export pack) there, then
import them here. Pictures pinned to past turns don't carry over; portraits for new turns do.

Playing from another device (a phone against this computer) is not supported yet: the server only answers this
computer.

## Updating

Export a backup, stop the server, then `git pull`, `npm ci` and `npm start`. Your saves stay in `standalone/data/`.

## How it fits in

The game reaches its platform only through a host adapter (`src/js/host.js`). This folder adds one more, without
changing the artifact:

| File                         | Role                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `server.js`                  | The local server on 127.0.0.1: builds and serves the page, the storage API and the relay                    |
| `store.js`                   | Documents in SQLite (Node's built-in `node:sqlite`) with memDB's behavior (`src/js/db.js`), images as files |
| `relay.js`                   | Turns a narration request into each provider's format and streams the reply back                            |
| `client/main.js`             | The page's entry: registers the host (`registerHost`), then starts the game (`src/js/main.js`)              |
| `client/host.js`             | The host adapter: db, assets, sample, user and downloads over the local server                              |
| `client/providers.js`        | Presets, the connection settings and the `sample` capability                                                |
| `client/settings.js`         | The AI connection panel (the host's `bindSettings`), update steps, the setup banner                         |
| `client/i18n.js`, `locales/` | The add-on's own Korean and Japanese text (`tr()`), on top of the game's catalogs                           |
| `client/standalone.css`      | Its styles, added to the standalone page only                                                               |

The artifact build (`npm run build`) contains none of this. The only lines in the game for it are `registerHost` in
`src/js/host.js` and the optional `bindSettings` call in `src/js/settings-sheet.js`.

The page carries a token made for each server start; storage and relay requests must send it, and pictures need the
cookie the page sets. The server answers only `localhost` and `127.0.0.1` on its own port.

## Tests

```sh
npm run test:standalone   # relay, storage and translation checks, then the page in a browser with a mocked provider
```

These are separate from `npm test`, which is the game's release check. Install the test browser once with
`npx playwright install chromium`.
