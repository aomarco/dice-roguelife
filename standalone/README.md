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
API call. Keep the server running while you play.

## Providers

Presets for OpenAI, Anthropic, Google Gemini, Azure OpenAI and Perplexity (each in its own request format), plus
OpenRouter, Groq, DeepSeek, Mistral, xAI, Together, Fireworks, DeepInfra, Cerebras, NVIDIA NIM and Hugging Face
(OpenAI-compatible), and the local servers Ollama, LM Studio, llama.cpp and vLLM. **Custom** takes any
OpenAI-compatible endpoint. Remote endpoints must use HTTPS; local servers can use HTTP on localhost.

Use a model that follows JSON instructions well. Turn on JSON mode only if the model supports it, and turn off
streaming if the endpoint doesn't support it. **Fast** in ⚙ Settings uses the optional summary model; Standard and
Deep use the narration model.

You can keep several connections as **profiles** (say, a paid model and a local one): pick **+ New profile** in the
**Profile** list, name it and save. Choosing a profile in the list switches the game to it at once.

Logins that reuse a chat subscription (Claude Pro/Max through Claude Code, ChatGPT through Codex, Gemini CLI) are not
supported: their providers' terms don't allow it in other apps. If you have a Claude subscription, play the artifact.

## Costs and keys

API calls are billed to your API account. Like the artifact, the game makes extra calls for summaries and Life
Reviews, and a reply it can't read is retried up to twice. Network retries for rate limits and server errors are off
by default (⚙ Settings). The usage line in Settings shows the tokens providers report.

Your connection profiles and their keys are kept on this computer in `standalone/data/connection.json`,
**unencrypted**, so every browser here uses them. The server adds the key when it calls the provider: the page never
gets it back, and it never goes into saves or exports. Saving a profile with another endpoint and no new key drops its
old key.

## Saves and images

Saves, settings and images are kept on disk in `standalone/data/` (a SQLite file and an `assets` folder), not in the
browser. Clearing browser data doesn't touch them, and any browser on this computer sees the same saves. To back up,
stop the server and copy the folder. To keep them elsewhere, set `dataDir` in `config.json` (below).

Moving from the artifact: export your saves (Saves → Save file) and your images (Images → Export pack) there, then
import them here. Pictures pinned to past turns don't carry over; portraits for new turns do.

## Playing on your phone (Tailscale)

The server only answers this computer. To play from your phone as well, install [Tailscale](https://tailscale.com/) on
the computer and the phone with the same account, then on the computer run `tailscale serve --bg 3000` (allow HTTPS
when it asks). It prints this computer's address, such as `https://my-pc.tail1234.ts.net`. Add that name in **⚙ Settings →
Server settings** (or to `hosts` in `config.json`, below) and open the address on the phone.

Only devices on your Tailscale account can reach it. Don't play the same save on two devices at the same time.

## Server settings (config.json)

The server reads an optional `standalone/config.json` (yours alone: git ignores it). Edit it in **⚙ Settings → Server
settings**, or by hand. Every field can be left out:

```json
{
  "port": 3000,
  "dataDir": "data",
  "hosts": ["my-pc.tail1234.ts.net"]
}
```

- `port`: the port the game is served on (3000).
- `dataDir`: where saves, images and the AI connection are kept, relative to `standalone/` (`data`).
- `hosts`: other names this server answers to, for Tailscale (above). These apply at once; a new port or folder
  applies the next time you run `npm start`.

The AI connection itself is chosen in ⚙ Settings and kept in the data folder (`connection.json`).

## Updating

Export a backup, stop the server, then `git pull`, `npm ci` and `npm start`. Your saves stay in `standalone/data/`.

## How it fits in

The game reaches its platform only through a host adapter (`src/js/host.js`). This folder adds one more, without
changing the artifact:

| File                         | Role                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `server.js`                  | The local server on 127.0.0.1: builds and serves the page, the storage API and the relay                                       |
| `store.js`                   | Documents in SQLite (Node's built-in `node:sqlite`) with memDB's behavior (`src/js/db.js`), images as files, the AI connection |
| `relay.js`                   | Turns a narration request into each provider's format and streams the reply back                                               |
| `client/main.js`             | The page's entry: the host adapter, then the game (`src/js/main.js`)                                                           |
| `client/host.js`             | The host adapter, joined with `registerHost`: db, assets, sample, user and downloads over the local server                     |
| `client/net.js`              | Requests to the local server with its token                                                                                    |
| `client/providers.js`        | Presets, the page's copy of the connection, and the `sample` capability                                                        |
| `client/settings.js`         | The AI connection and Server settings panels (the host's `bindSettings`), update steps, the setup banner                       |
| `client/i18n.js`, `locales/` | The add-on's own Korean and Japanese text (`tr()`), on top of the game's catalogs                                              |
| `client/standalone.css`      | Its styles, added to the standalone page only                                                                                  |
| `lines.js`                   | Reads a streamed body line by line, for the relay and the page                                                                 |

The artifact build (`npm run build`) contains none of this. The only lines in the game for it are `registerHost` in
`src/js/host.js` and the optional `bindSettings` call in `src/js/settings-sheet.js`.

The page carries a token made for each server start; storage and relay requests must send it, and pictures need the
cookie the page sets. The server answers only `localhost` and `127.0.0.1` on its own port, and the names in `hosts`.

## Tests

```sh
npm run test:standalone   # relay, storage and translation checks, then the page in a browser with a mocked provider
```

These are separate from `npm test`, which is the game's release check. Install the test browser once with
`npx playwright install chromium`.
