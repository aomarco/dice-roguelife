/* ============ the status line of the image tab's long jobs, kept when the tab is drawn again ============ */
import { $ } from './util.js';

let text = '';
export const statText = () => text;
// Set the text and show it. The tab is drawn again after an edit (a new empty line), so the text lives here, not in
// the element: the new line starts with it and a job that keeps running keeps updating whatever line is on screen.
export function setStat(t) {
  text = t == null ? '' : String(t);
  const el = $('#uplStat');
  if (el) el.textContent = text;
}
