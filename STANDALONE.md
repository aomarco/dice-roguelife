# Standalone application architecture

The standalone app runs with `npm start` and does not require a Claude subscription.
The original artifact integration remains available when `window.claude.use` exists.

## Boundaries

| Module | Responsibility |
| --- | --- |
| `src/js/host.js` | Select Claude artifact or ordinary browser capabilities |
| `src/js/host-browser.js` | IndexedDB document store and image blobs, local identity, browser downloads |
| `src/js/providers.js` | Provider presets, separate connection configuration, sampling interface, JSON parsing and validation |
| `src/js/provider-settings.js` | Translated connection controls and test request |
| `tools/server.js` | Loopback HTTP server, request authorization, cancellation and timeouts |
| `tools/provider-api.js` | Protocol-specific requests and normalized streaming/text/error/usage events |

The browser sends a prompt, selected model, configuration and API key to the loopback relay.
The relay calls the selected endpoint and returns newline-delimited JSON events: `{text}`, then
`{done, model, usage}`, or `{error: {code, message}}`. Provider JSON and SSE responses are supported.
Reasoning deltas are not used as narration. Missing completion markers, refusals and truncated replies fail
without applying partial game state. JSON mode is opt-in because compatible APIs differ.

The game continues using `platform.sample`, `.json()` and `.limits()`. Standalone narration has one request,
with zero network retries by default. Users may enable up to two retries for rate limits and server failures.
Malformed JSON, connection failures and partially delivered replies do not trigger automatic model calls.
Summary generation and summary merging remain separate calls; life reviews use the narration model.
The optional summary model is also the existing Fast tier. Standard and Deep use the selected narration model.
There is no automatic provider switching. AI portrait selection is opt-in; default portrait matching uses local scores. Completed replies are cached only in session memory, for at most
one hour and 32 entries; refreshing the page loses that cache and may make a manual retry billable.

## Persistence and credentials

IndexedDB `dice-roguelife` stores document values and asset blobs, preserving the existing save/export schema.
The document adapter waits for transaction completion before reporting success. Assets receive stable IDs;
session blob URLs are rebuilt at boot and revoked on deletion. Story exports translate these URLs back to IDs
and embed the actual image bytes. IndexedDB failures surface as startup or write failures.
The application is for one local player, with no multiplayer identity or cloud synchronization.

Non-secret connection configuration lives in localStorage `dr:provider`. The API key stays in JavaScript memory
unless the user explicitly checks Remember; then it is saved unencrypted as `dr:provider-key`.
Keys never enter game settings, saves, image manifests or exports. The relay does not store keys on disk or
include upstream error bodies in diagnostics. Usage totals cover successful calls with reported token counts,
not a complete billing statement; failed/retried calls may also incur charges.

The relay binds to `127.0.0.1`, checks Host and Origin, and requires a random per-process token injected into
the served page. Remote endpoints require HTTPS; HTTP is limited to loopback model servers. Redirects are
rejected to avoid forwarding credentials to another host. This is a local application, not a public multiuser
server. No production deployment or shared-secret hosting is implied.

## Extending and verifying

Add compatible service presets to `PROVIDERS`; add a dedicated protocol only when its wire format differs.
Endpoints and model IDs are editable. Azure uses a resource base URL and deployment name, with an editable
API version. Bedrock and Vertex IAM authentication are not implemented. API vision auto-sort is opt-in and requires a vision model (PNG/JPEG/WebP/GIF, up to 8 MB per image);
the image library, manual tags, portrait matching, pack exports and story images work locally.

Run `npm run lint`, `npm run build`, `npm run test:api`, and `npm test`.
API tests cover request shapes, fragmented SSE, error mapping, bounded retries, cancellation and relay access.
Standalone browser tests cover actual IndexedDB persistence, save migration, key exclusion and image exports.
All automated provider responses are mocked; paid endpoints require keys for live verification.

Official protocol references:
[OpenAI Chat](https://developers.openai.com/api/reference/resources/chat),
[Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming),
[Gemini generation](https://ai.google.dev/api/generate-content),
[Perplexity Sonar](https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/overview),
[Together compatibility](https://docs.together.ai/docs/inference/openai-compatibility),
[Hugging Face](https://huggingface.co/docs/inference-providers/tasks/chat-completion),
[Ollama](https://docs.ollama.com/api/openai-compatibility).

## Validation of this checkout

Build, lint (including all three UI languages), nine API tests and four standalone browser tests pass.
The full 92-test run initially passed 89 tests: one new image assertion expected PNG despite the existing
exporter converting images to WebP; that assertion was corrected and the standalone tests pass.
Two existing duplicate-image tests fail on this Windows environment, and reproduce against the untouched
upstream commit `dac7374`. The other 87 existing game tests passed. Relevant casting, export and artifact
update tests were also rerun after integration and pass. Live paid-provider verification has not been run.
