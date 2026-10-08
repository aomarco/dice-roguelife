// Requests to the local server, with the token made at its start. No server, or a restarted one (a new token),
// means starting it and reloading the page.
import { tr } from './i18n.js';

export async function post(path, body, { type = 'application/json', signal } = {}) {
  const offline = () =>
    Object.assign(new Error(tr('Start the app with npm start, then reload this page.')), { code: 'no_server' });
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': type, 'X-DR-Token': window.DR_SERVER_TOKEN },
      body: type === 'application/json' ? JSON.stringify(body) : body,
      signal,
    });
  } catch (e) {
    if (signal && signal.aborted) throw e;
    throw offline();
  }
  if (response.status === 403) throw offline();
  if (!response.ok) {
    const out = await response.json().catch(() => ({}));
    throw Object.assign(new Error(out.message || tr('Request failed.')), { code: out.code || 'storage_error' });
  }
  return response;
}
