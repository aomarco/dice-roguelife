/* ============ host adapter: the claude.ai artifact runtime ============ */

// The page published as a claude.ai artifact. Its runtime is window.claude: use(name) hands out each capability,
// already in the shape host.js describes, so this adapter only finds it, turns a refusal into null, and knows
// where uploaded files are served.
export const claudeHost = {
  id: 'claude',
  available: () => !!(window.claude && window.claude.use),
  connect: capability => window.claude.use(capability).catch(() => null), // not granted, or failed to start: absent
  assetUrl: id => '/_blob/' + id,
};
