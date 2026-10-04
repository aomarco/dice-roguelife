/* ============ composer & slash menu ============ */
import { $, toast } from './util.js';
import { CMDS } from './data.js';
import { app } from './app.js';
import { openStatus } from './status.js';
import { INPUT_PH } from './log.js';
import { openSettingsSheet } from './settings-sheet.js';
import { send } from './turn.js';

export const input = document.getElementById('input');
const INPUT_MAX_HEIGHT = 140; // px: the box grows with its text up to this
export function fitInput() {
  input.style.height = 'auto';
  input.style.height = Math.min(INPUT_MAX_HEIGHT, input.scrollHeight) + 'px';
}
// a line that did not go through goes back into the box, unless the player has already typed something new
export function offerInput(text) {
  if (input.value.trim()) return;
  input.value = text;
  fitInput();
  saveDraft();
}
export function bindComposer() {
  input.addEventListener('input', () => {
    fitInput();
    slashMenu();
  });
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const send = enterSends() ? !e.shiftKey : e.ctrlKey || e.metaKey || e.shiftKey;
    if (send) {
      e.preventDefault();
      $('#form').requestSubmit();
    }
  });
  $('#gearBtn').onclick = openSettingsSheet;
  $('#enterTog').onchange = e => {
    setEnterPref(e.target.checked ? 'always' : 'never');
    applyEnterHint();
    toast(
      e.target.checked
        ? '이 브라우저: 엔터로 보내요 (Shift+Enter 줄바꿈)'
        : '이 브라우저: 엔터는 줄바꿈, Shift+Enter로 보내요',
    );
  };
  input.addEventListener('input', () => {
    clearTimeout(draftT);
    draftT = setTimeout(saveDraft, 300);
  });
  $('#form').onsubmit = e => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    input.value = '';
    input.style.height = '';
    saveDraft();
    $('#slash').classList.add('hidden');
    send(v);
  };
}
const isTouch = () => matchMedia('(pointer:coarse)').matches;
// the Enter key is a per-device habit: kept in this browser only, never in the account settings that follow you to other devices
const ENTER_LS = 'dr:enterSend';
export function enterPref() {
  try {
    const v = localStorage.getItem(ENTER_LS);
    if (v === 'always' || v === 'never') return v;
  } catch {
    // browser storage may be unavailable: the Enter preference is not remembered
  }
  return null;
}
export function setEnterPref(v) {
  try {
    if (v) localStorage.setItem(ENTER_LS, v);
    else localStorage.removeItem(ENTER_LS);
  } catch {
    // browser storage may be unavailable: the Enter preference is not remembered
  }
}
export function enterSends() {
  const v = enterPref();
  return v == null ? !isTouch() : v !== 'never';
}
export function syncEnterTog() {
  const c = $('#enterTog');
  if (c) c.checked = enterSends();
}
export function applyEnterHint() {
  syncEnterTog();
  input.placeholder = isTouch()
    ? INPUT_PH
    : enterSends()
      ? INPUT_PH + ' (Shift+Enter 줄바꿈)'
      : INPUT_PH + ' (Shift+Enter로 보내기)';
}
export function setSendMode(abort) {
  // given the reply's AbortController, the send button becomes a stop button for it
  const stop = !!abort;
  const b = $('#sendBtn');
  if (!b) return;
  b.disabled = false;
  b.title = '';
  b.textContent = stop ? '중지' : '보내기';
  b.classList.toggle('danger', stop);
  b.classList.toggle('primary', !stop);
  b.type = stop ? 'button' : 'submit';
  b.onclick = stop
    ? e => {
        e.preventDefault();
        e.stopPropagation();
        abort.abort();
      }
    : null;
}
const draftKey = () => (app.currentSave ? 'dr:draft:' + app.currentSave.id : null);
export function saveDraft() {
  const k = draftKey();
  if (!k) return;
  try {
    if (input.value) localStorage.setItem(k, input.value);
    else localStorage.removeItem(k);
  } catch {
    // browser storage may be unavailable: no draft is kept
  }
}
export function restoreDraft() {
  const k = draftKey();
  if (!k || input.value) return;
  try {
    const v = localStorage.getItem(k);
    if (v) {
      input.value = v;
      fitInput();
    }
  } catch {
    // browser storage may be unavailable: no draft to restore
  }
}
let draftT = null;
function slashMenu() {
  const v = input.value,
    box = $('#slash');
  if (!v.startsWith('/') || v.includes(' ')) {
    box.classList.add('hidden');
    return;
  }
  const lv = v.toLowerCase();
  const m = CMDS.filter(c => [c.k, ...(c.a || [])].some(k => k.startsWith(lv)));
  if (!m.length) {
    box.classList.add('hidden');
    return;
  }
  box.innerHTML = m
    .map(
      c =>
        `<button type="button" data-k="${c.k}"><code>${c.k}</code><span class="muted">${c.d} <span class="cmd-alias">${(c.a || []).join(' ')}</span></span></button>`,
    )
    .join('');
  box.classList.remove('hidden');
  box.querySelectorAll('button').forEach(
    b =>
      (b.onclick = () => {
        const k = b.dataset.k;
        box.classList.add('hidden');
        if (k === '/상태') {
          input.value = '';
          openStatus();
          return;
        }
        input.value = k + ' ';
        input.focus();
      }),
  );
  if (m.length && !m.find(c => c.k === v || (c.a || []).includes(lv))) {
    const c = m[0];
    if (v.length > 1 && (c.a || []).some(k => k === lv)) {
      box.classList.add('hidden');
    }
  }
}
export function parseCmd(text) {
  const t = text.trim();
  for (const c of CMDS)
    for (const k of [c.k, ...(c.a || [])]) {
      if (t.toLowerCase() === k || t.toLowerCase().startsWith(k + ' '))
        return { type: c.t, arg: [c.preset, t.slice(k.length).trim()].filter(Boolean).join(' ') };
    }
  return null;
}
