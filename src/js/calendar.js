/* ============ calendar: in-game dates and clock times ============ */
// the weekday is computed, never written by the narrator: only for plain calendar dates ("2035년 4월 5일"), never for a world's own calendar ("제국력 1203년")
const WEEKDAYS = '일월화수목금토';
export function parseKDate(x) {
  const m = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/.exec(String(x || ''));
  if (!m) return null;
  const y = +m[1],
    mo = +m[2],
    d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
    ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : null;
}
export function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function fmtKDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${y}년 ${m}월 ${d}일 (${WEEKDAYS[dt.getUTCDay()]})`;
}
export function clockMin(t) {
  t = String(t || '');
  let m = /(\d{1,2}):(\d{2})/.exec(t);
  if (m) return (+m[1] % 24) * 60 + +m[2];
  if (/자정/.test(t)) return 0;
  if (/정오/.test(t)) return 720; /* minutes after midnight, or null when the hour is ambiguous */
  m = /(오전|오후|새벽|아침|낮|저녁|밤)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?/.exec(t);
  if (!m) return null;
  const ap = m[1],
    h0 = +m[2];
  if (h0 < 1 || h0 > 12) return null;
  let h = h0 % 12;
  if (ap === '오후' || ap === '저녁') h += 12;
  else if (ap === '낮' && h0 < 6) h += 12;
  else if (ap === '밤' && h0 >= 6 && h0 < 12) h += 12;
  return h * 60 + (m[3] != null ? +m[3] : m[4] ? 30 : 0);
}
export function withWeekday(date) {
  const s = String(date || '')
    .replace(/\s*\(([월화수목금토일])\)|\s*[월화수목금토일]요일/g, '')
    .trim();
  const m = /^(?:서기\s*)?(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/.exec(s);
  if (!m) return date || '';
  const y = +m[1],
    mo = +m[2],
    d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return date || '';
  return s.replace(m[0], `${m[0]} (${WEEKDAYS[dt.getUTCDay()]})`);
}
