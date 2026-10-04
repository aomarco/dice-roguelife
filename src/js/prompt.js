/* ============ prompt ============ */
import PR_DEFAULT from '../../prompts.json' with { type: 'json' };
import { stripMarks } from './util.js';
import { ART_SLOTS, askOf, cmdIs, currencyOf, powerGrade, REALMS } from './data.js';
import { LIMITS } from './limits.js';
import { withWeekday } from './calendar.js';
import { platform, thaw } from './db.js';
import { app } from './app.js';
import { setting } from './settings.js';
import { logErr } from './diag.js';
import { growthLevel, itemBonus, lifeDiff, ODDS_RE, rollGrade, rule, statusVisible, titlesOn } from './rules.js';
import { activeRel, canonName } from './people.js';
import { charSets, fitsWorld } from './images.js';
import { placeVocab } from './places.js';
import { setIds } from './casting.js';
import { widgetOf } from './widgets.js';

export let prompts = PR_DEFAULT; // narrator prompt text; config/prompt in the db overrides field by field
export const fillTemplate = (str, v) =>
  String(str || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? v[k] : m));
function rulesText() {
  return (prompts && prompts.rules) || '';
}
export async function loadPromptConfig() {
  try {
    const d = await platform.shared.doc('config/prompt').get();
    const v = d.exists ? thaw(d.data()) : null;
    prompts = v && v.rules ? Object.assign({}, PR_DEFAULT, v) : PR_DEFAULT;
  } catch (e) {
    prompts = PR_DEFAULT;
  }
}

export const recentBudget = () => Math.max(10000, Math.min(200000, Number(app.settings.recentBytes) || 40000)); // bytes of raw recent turns before the summaries take over
export const tbytes = x => new TextEncoder().encode(x).length;
// counted in exchanges (one narrator reply with the player's line before it), the same unit as the top bar
function recentEstimate() {
  const pool = app.turns.slice(-80);
  const ai = pool.filter(t => t.kind === 'ai').length;
  if (!ai) return null;
  const bytes = pool.reduce((a, t) => a + tbytes(turnText(t, true)), 0);
  return Math.max(3, Math.round(recentBudget() / Math.max(400, bytes / ai)));
}
export const recentLine = () =>
  app.state
    ? `지금 ${recentWindow().filter(t => t.kind === 'ai').length}턴이 들어가요. 이 게임의 평균 턴 크기면 약 ${recentEstimate()}턴까지 담겨요. `
    : '';
export function recentWindow() {
  // the newest turns, taken from the end until the budget is spent (older player turns count trimmed); at least six
  const pool = app.turns.filter(t => t.i > app.state.summarizedUpto);
  const out = [];
  let used = 0;
  for (let i = pool.length - 1; i >= 0; i--) {
    const t = pool[i];
    const b = tbytes(turnText(t, i < pool.length - 1));
    if (out.length >= 6 && used + b > recentBudget()) break;
    out.unshift(t);
    used += b;
  }
  return out;
}
export function turnText(t, trim, noAdmin) {
  if (t.kind === 'user') {
    const x = String(t.text || '');
    return `플레이어: ${trim && x.length > 300 ? x.slice(0, 300) + '…' : x}`;
  }
  if (t.kind === 'system') return `[시스템] ${t.text}`;
  if (t.kind === 'ledger') return `[인생 결산] ${(t.out && t.out.summary) || ''}`;
  const o = t.out || {};
  let s = '';
  if (o.admin && !noAdmin) s += `ADMIN: ${o.admin}\n`;
  s += stripMarks(o.narration).slice(0, 1400);
  if (o.widget) s += `\n(위젯: ${o.widget.type}${o.widget.headline ? ' ' + o.widget.headline : ''})`;
  if (o.choices && o.choices.length) s += `\n선택지: ${o.choices.join(' / ')}`;
  return s;
}
export const ADMIN_PERSONAS = () =>
  Object.assign({}, (prompts && prompts.personas) || {}, { custom: { name: '직접 입력', text: '' } });
function adminBlock() {
  const AP = ADMIN_PERSONAS();
  const k = setting('adminPersona');
  if (k === 'custom') return app.settings.adminCustom ? `[ADMIN] ${app.settings.adminCustom}` : '';
  return (AP[k] || AP.star || AP.dealer || {}).text || '';
}
// The player's language, length and correction settings sit just before the rules list, after the output format.
// The list's heading was '규칙:' and is now 'Rules:'; with neither, the settings follow the whole rules text.
function withPlayerSettings(rules, extra) {
  if (!extra) return rules;
  for (const head of ['\nRules:\n', '\n규칙:\n']) {
    const i = rules.indexOf(head);
    if (i >= 0) return rules.slice(0, i) + '\n' + extra + rules.slice(i);
  }
  return rules + '\n\n' + extra;
}
// The blocks after the rules, in the order the narrator reads them. Empty blocks are left out.
const PROMPT_ORDER = [
  'adminp',
  'cheat',
  'growth',
  'know',
  'world',
  'me',
  'profile',
  'entry',
  'sponsor',
  'stat',
  'ledger',
  'gear',
  'inv',
  'murim',
  'clock',
  'skill',
  'note',
  'quest',
  'rel',
  'lore',
  'past',
  'sum',
  'user',
  'named',
  'bg',
  'widgets',
  'recent',
  'cmd',
  'corr',
  'redo',
  'errata',
  'fate',
  'luck',
  'nodice',
  'jcore',
  'roll',
  'input',
];
// recent turns for the prompt: older player turns are trimmed (the action survives, the long deliberation does not),
// and only the last three remarks ADMIN actually made are kept
function recentForPrompt() {
  const recent = recentWindow();
  const aiIdx = recent.map((t, i) => (t.kind === 'ai' && t.out && t.out.admin ? i : -1)).filter(i => i >= 0);
  const keepAdmin = new Set(aiIdx.slice(-3)); // the last three remarks ADMIN actually made
  const recentStr = recent
    .map((t, i) =>
      i === recent.length - 1 ? turnText(t, false, !keepAdmin.has(i)) : turnText(t, true, !keepAdmin.has(i)),
    )
    .join('\n\n'); // older player turns are trimmed: the action survives, the long deliberation does not
  return recentStr;
}
function meBlock() {
  const l = app.state.life,
    s = app.state.stats;
  return `[플레이어] ${l.name}, ${l.gender}, ${s.age}세, 종족 ${l.race}, 신분 ${l.origin}(${l.originTier}), 칭호 ${(() => {
    const on = titlesOn(),
      fx = app.state.titleFx || {};
    const act = on.length ? on.map(t => `${t}${fx[t] ? `(${fx[t]})` : ''}`).join(', ') : '없음';
    const held = (app.state.titles || []).filter(t => !on.includes(t));
    return act + (held.length ? ` (보유: ${held.join(', ')})` : '');
  })()}, ${app.state.lifeNo}번째 삶`;
}
function statBlock() {
  const l = app.state.life,
    s = app.state.stats;
  return `[스탯]${statusVisible() ? '' : ' (플레이어에겐 아직 숫자가 보이지 않는다: 각성이나 측정이 오면 status_unlock)'} HP ${s.hp}/${s.maxHp}, 전투력 ${s.power}${itemBonus() ? `+${itemBonus()}(장비)=${s.power + itemBonus()}` : ''}(${powerGrade(s.power + itemBonus())}), 체력 ${s.con} 근력 ${s.str} 마력 ${s.mag} 민첩 ${s.agi} 지능 ${s.int} 매력 ${s.cha} (1~10이 일반인, 그 위는 초인)${app.state.energy ? `, ${app.state.energy.name} ${app.state.energy.cur}/${app.state.energy.max}${(r => (r <= 0 ? ' (탈진: 힘을 쓸 수 없고 몸이 말을 안 듣는다)' : r < 0.1 ? ' (탈진 직전)' : r < 0.3 ? ' (바닥이 보인다)' : ''))(app.state.energy.cur / Math.max(1, app.state.energy.max))}` : ', 힘의 자원 없음(아직 힘의 체계를 얻지 못함)'}, 소지금 ${s.gold.toLocaleString('ko-KR')}${currencyOf(l.world.id)[0]}, 명성 ${s.fame}`;
}
function murimBlock() {
  const M = app.state.murim;
  return M
    ? `${fillTemplate(prompts.murim, { realms: REALMS.join(' > ') })}\n[무림 상태] 경지 ${REALMS[M.realm]}${M.realm < REALMS.length - 1 ? `(다음 ${REALMS[M.realm + 1]})` : ''}, 내공 ${M.neigong}년, 세력 ${M.faction || '없음'}${M.rank ? '/' + M.rank : ''}, 별호 ${M.alias || '없음'}${M.constitution ? ', 체질 ' + M.constitution : ''}, 무공 ${
        ART_SLOTS.filter(k => M.arts[k])
          .map(k => k + ':' + M.arts[k])
          .join(' / ') || '없음'
      }`
    : '';
}
function relationsBlock() {
  return Object.keys(app.state.relations).length
    ? (() => {
        const al = {};
        for (const [a, b] of Object.entries(app.state.aliases || {}))
          (al[canonName(b)] = al[canonName(b)] || []).push(a);
        const active = activeRel();
        return active.length
          ? `[관계] ${active.map(([n, v]) => `${n}${al[n] ? `(= ${al[n].slice(0, 4).join(', ')})` : ''}: ${v}`).join(' | ')}`
          : '';
      })()
    : '';
}
// named characters with portraits, grouped by the set's first identity tag so one line holds a whole sect; groups
// the story mentions come first and the rest rotate over turns, within about 500 bytes
function namedBlock(hay) {
  const l = app.state.life,
    M = app.state.murim;
  const used = new Set(Object.values(app.state.cast));
  const w = l.world.id;
  const ctx = hay + ' ' + (app.state.stateNote || '') + ' ' + ((M && M.faction) || '');
  const list = Object.keys(charSets())
    .map(k => [k, app.setMeta[k] || {}])
    .filter(([k, m]) => m.charName && !used.has(k) && fitsWorld(m, w));
  if (!list.length) return '';
  // grouped by the set's first identity tag, so one line holds a whole sect; groups the story mentions come first, the rest rotate over turns
  const groups = new Map();
  for (const [k, m] of list) {
    const ids = setIds(k);
    const gname = ids.length ? ids[0].val : '기타';
    if (!groups.has(gname)) groups.set(gname, { name: gname, vals: [], members: [] });
    const g = groups.get(gname);
    for (const i of ids) if (!g.vals.includes(i.val)) g.vals.push(i.val);
    const segs = String(m.role || '')
      .split(/[,，]/)
      .map(t => {
        for (const i of ids) t = t.split(i.val).join('');
        return t.replace(/\(.*?\)|（.*?）/g, '').trim();
      });
    const short = (segs.find(t => t.length >= 3) || segs[0] || '').slice(0, 12).trim(); // the first phrase that still says something once the identity is removed
    g.members.push({
      name: m.charName,
      g: m.gender === 'female' ? '여' : m.gender === 'male' ? '남' : '?',
      short,
      hit: ctx.includes(m.charName) ? 1 : 0,
    });
  }
  const N = groups.size,
    r = app.state.next % N;
  const gs = [...groups.values()]
    .map((g, i) => [g, g.vals.some(v => v && ctx.includes(v)) ? 1 : 0, (i - r + N) % N])
    .sort((a, b) => b[1] - a[1] || a[2] - b[2])
    .map(([g]) => g);
  const bytes = x => new TextEncoder().encode(x).length;
  const parts = [];
  let size = 0;
  for (const g of gs) {
    const n = g.members.length,
      r2 = app.state.next % n;
    const ms = g.members
      .map((x, i) => [x, (i - r2 + n) % n])
      .sort((a, b) => b[0].hit - a[0].hit || a[1] - b[1])
      .map(([x]) => x);
    const names = [];
    for (const x of ms.slice(0, 6)) {
      const t = `${x.name}(${x.g}${x.short ? ', ' + x.short : ''})`;
      if (size + bytes(t) + bytes(g.name) + 6 > 500) break;
      names.push(t);
      size += bytes(t) + 2;
    } // at most six per group, so several groups fit; the rest rotate in
    if (names.length) {
      parts.push(`${g.name}: ${names.join(', ')}`);
      size += bytes(g.name) + 4;
    }
    if (size >= 480) break;
  }
  return parts.length ? fillTemplate(prompts.named, { list: parts.join(' | ') }) : '';
}
function widgetsBlock(cmd) {
  const W = prompts.widgets || {};
  if (cmdIs(cmd, 'ask')) return '';
  if (cmd && W[cmd.type]) return fillTemplate(prompts.widgetsCmd, { schema: W[cmd.type] });
  return prompts.widgetsIdle;
}
function cmdBlock(cmd) {
  if (!cmd) return '';
  const ask = askOf(cmd);
  if (ask) return fillTemplate(prompts[ask.prompt], { q: cmd.arg || ask.q });
  const how = cmdIs(cmd, 'browse') ? prompts.cmdBrowse : prompts.cmdAct;
  return `[명령] ${cmd.type} 위젯을 반드시 채울 것. ${cmd.arg ? '내용: ' + cmd.arg : ''}\n${how}`;
}
function rollBlock(roll) {
  return !roll
    ? ''
    : roll.fixed
      ? fillTemplate(prompts.roll, {
          result: { critSuccess: '대성공', success: '성공', fail: '실패', critFail: '대실패' }[rollGrade(roll)],
          d: roll.d,
          p: roll.p,
        })
      : roll.d != null
        ? fillTemplate(prompts.rollFree, { d: roll.d })
        : '';
}

// turn: what runTurn rolled for this reply (roll, luck, fate) and what a rewrite must fix (redo)
export function buildPrompt(text, cmd, turn = {}) {
  const { roll = null, luck = null, fate = null, redo = '' } = turn;
  const l = app.state.life,
    ck = app.state.clock;
  const recentStr = recentForPrompt();
  const hay = recentStr.slice(-3000) + ' ' + text;
  const lore = Object.entries(app.state.lore)
    .filter(([k]) => hay.includes(k))
    .slice(0, 15);
  const vocab = placeVocab();
  const P = {
    adminp: adminBlock(),
    world: `[세계] ${l.world.name}${l.world.desc ? ` (${l.world.desc})` : ''}: ${l.world.risk}. ${l.world.opp}. 이번 삶의 난이도 ${lifeDiff(l)}/5: 적, 경쟁자, 세계의 기준 수치와 요구치가 ${lifeDiff(l) >= 5 ? '가혹한 편이다' : lifeDiff(l) <= 1 ? '관대한 편이다' : '그만큼 높다'}.`, // the adjective describes the world's demands, not the narrator's attitude
    me: meBlock(),
    cheat: prompts.cheat, // always on: asserting things you do not have is a lie inside the fiction
    growth: (() => {
      const k = growthLevel().key;
      return k ? (prompts.growth || {})[k] || '' : '';
    })(),
    know: rule('knowledgeGuard') !== false ? prompts.knowledge : '', // the player always brings knowledge from outside this world (their own, a past life, the character's origin); the rule is about the process, not the source
    profile: l.profile ? `[플레이어 설정: 이 캐릭터의 서사와 성격에 반드시 반영] ${l.profile}` : '',
    entry:
      l.entry === 'possess'
        ? prompts.entryPossess
        : l.entry === 'transfer'
          ? fillTemplate(prompts.entryTransfer, { from: l.world.from || '현대 한국' })
          : '',
    sponsor: l.sponsor
      ? fillTemplate(app.state.channelOpen ? prompts.sponsorOpen : prompts.sponsorClosed, { stance: l.sponsor.stance })
      : '',
    stat: statBlock(),
    murim: murimBlock(),
    clock: `[시각] D+${ck.day}${ck.date ? ', ' + withWeekday(ck.date) : ''}${ck.time ? ', ' + ck.time : ''}${ck.weather ? ', ' + ck.weather : ''}${ck.place ? ', ' + ck.place : ''}`,
    skill: `[스킬] ${app.state.skills.map(k => `${k.name}(${k.grade}, Lv.${k.lv || 1}${k.cost ? `, 비용 ${k.cost}%` : ''}${k.src === '계승' ? ', 전생 계승' : ''}): ${k.desc}`).join(' | ')}`,
    note: app.state.stateNote ? `[현재 상황] ${app.state.stateNote}` : '',
    quest: app.state.quests.filter(q => q.status === 'active').length
      ? `[진행 중 의뢰] ${app.state.quests
          .filter(q => q.status === 'active')
          .map(q => q.title + (q.note ? ` (${q.note})` : ''))
          .join(' | ')}`
      : '',
    ledger: Object.keys(app.state.ledger || {}).length
      ? `[장부] ${Object.entries(app.state.ledger)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ')}`
      : '',
    gear: (app.state.equipped || []).length
      ? `[장비] ${app.state.equipped
          .map(n => {
            const it = (app.state.items || []).find(x => x.name === n) || {};
            return `${n}(${it.grade || '-'}${it.power ? ', +' + it.power : ''}${it.note ? ': ' + it.note.slice(0, 40) : ''})`;
          })
          .join(' | ')}`
      : '',
    inv: (app.state.items || []).length
      ? `[소지품] ${app.state.items.map(it => `${it.name}${it.qty > 1 ? ' x' + it.qty : ''}${it.grade ? '(' + it.grade + ')' : ''}${it.note && !(app.state.equipped || []).includes(it.name) ? ': ' + it.note.slice(0, 30) : ''}`).join(' | ')}`
      : '',
    rel: relationsBlock(),
    lore: lore.length ? `[관련 설정] ${lore.map(([k, v]) => `${k}: ${v}`).join(' | ')}` : '',
    past: app.state.pastLives.length
      ? `[전생 기록] ${app.state.pastLives
          .slice(-5)
          .map(p => `${p.lifeNo}회차 ${p.world}/${p.origin}(${p.tier}), ${p.epitaph}`)
          .join(' | ')}`
      : '',
    sum: app.state.summaries.length
      ? `[지난 이야기 요약]\n${app.state.summaries.map(x => '- ' + x.text).join('\n')}`
      : '',
    user: app.state.userNotes ? `[유저 노트: 반드시 따를 것]\n${app.state.userNotes}` : '',
    named: namedBlock(hay),
    bg: `[장소 단어] ${vocab.length ? vocab.join(', ') : '없음. scene은 null'}`,
    recent: recentStr ? `[최근 진행]\n${recentStr}` : '',
    widgets: widgetsBlock(cmd),
    cmd: cmdBlock(cmd),
    redo: redo ? fillTemplate(prompts.redo, { reason: redo }) : '',
    errata:
      app.state.errataNote && !cmdIs(cmd, 'browse')
        ? fillTemplate(
            prompts.errata ||
              '[정정] 지난 기록의 오류를 바로잡았다: {fact}. 이번 답 첫머리에 한두 문장으로 자연스럽게 수습한다.',
            { fact: app.state.errataNote },
          )
        : '',
    corr: (app.state.corrections || []).filter(c => c.until >= app.state.next).length
      ? `${prompts.corrHead}\n${app.state.corrections
          .filter(c => c.until >= app.state.next)
          .map(c => '- ' + c.text)
          .join('\n')}`
      : '',
    fate: fate ? prompts.fateHead + (fate === 'jackpot' ? prompts.fateJackpot : prompts.fateDoom) : '',
    luck: luck === 'bad' ? prompts.luckBad || '' : luck === 'good' ? prompts.luckGood || '' : '',
    nodice: rule('dice') === false ? prompts.noDice || '' : '',
    jcore: roll || (cmd && cmd.type === 'judge') ? prompts.judgeCore || '' : '',
    roll: rollBlock(roll),
    input: `[이번 입력] ${text}\n\n${prompts.jsonTail}`,
  };
  const LEN = { short: prompts.lenShort, normal: '', long: prompts.lenLong }[setting('len')] || '';
  const lang = setting('lang');
  const LR = prompts.lang || {},
    TR = prompts.tip || {};
  const extra = (LR[lang] || '') + (app.settings.langTip && TR[lang] ? '\n[추가 출력 필드] ' + TR[lang] : '');
  const rules = withPlayerSettings(rulesText(), [LEN, extra].filter(Boolean).join('\n'));
  const build = skip =>
    rules +
    '\n\n' +
    PROMPT_ORDER.filter(k => P[k] && !skip.includes(k))
      .map(k => P[k])
      .join('\n\n');
  let p = build([]);
  const max = (platform.limits && platform.limits.maxPromptBytes) || 0;
  if (max && new Blob([p]).size > max * 0.9) p = build(['lore', 'bg', 'past']);
  return p;
}

const FATAL = [
  'not_granted',
  'rate_limited',
  'refused',
  'cancelled',
  'sampling_disabled',
  'session_expired',
  'prompt_too_large',
];
export let promptStats = []; // estimated tokens of the last prompts, for the settings tab
// one id per send: a retry of the same send reuses it, so an answer that finished while the page was away replays at no cost; anything else (a new send, a rewrite, a branch) gets a new id and never sees an old answer
const REPLAY = { gcTime: 3600000 };
const STALE_REQ = new Set(); // request ids whose cached answer was unusable: the next try asks for a fresh one
// What a reply still streaming already says: the fields the live box shows early. A field not yet complete is null,
// except the narration, which is read as far as it has come. sceneReady: enough is in to pick the banner and the face.
export function peekReply(text) {
  const str = k => {
    const m = new RegExp('"' + k + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(text);
    return m ? m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : null;
  };
  const scene = str('scene'),
    speaker = str('speaker'),
    emotion = str('emotion');
  const narration = /"narration"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(text);
  return {
    scene,
    speaker,
    emotion,
    gender: str('speaker_gender'),
    role: str('speaker_role'),
    weight: str('speaker_weight'),
    time: str('time'),
    hidden: /"speaker_hidden"\s*:\s*true/.test(text),
    look: ((/"speaker_look"\s*:\s*\[([^\]]*)\]/.exec(text) || [])[1] || '')
      .replace(/"/g, '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean),
    admin: str('admin'),
    narration: narration ? narration[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : null,
    sceneReady:
      scene !== null &&
      (speaker !== null || /"speaker"\s*:\s*null/.test(text)) &&
      (emotion !== null || /"admin"/.test(text)),
  };
}
// turn: the reply being written (turn.js runTurn); its request id, its stop handle, and what to do as it streams (turn.onText)
export async function callNarrator(text, cmd, turn) {
  const req = turn.req;
  const prompt = buildPrompt(text, cmd, turn) + (req ? `\n(req ${req})` : '');
  const cacheOpt = () => (!req ? false : STALE_REQ.has(req) ? Object.assign({ refresh: true }, REPLAY) : REPLAY);
  const stale = () => {
    if (req) STALE_REQ.add(req);
  };
  try {
    const tok = Math.round(new TextEncoder().encode(prompt).length / 2.6);
    promptStats.push(tok);
    promptStats = promptStats.slice(-20);
  } catch {
    // prompt size stats are diagnostics only
  }
  const onText = turn.onText; // what to do with the reply as it streams (turn.js streamedReply)
  const ok = o => o && (String(o.narration || '').trim().length > 0 || o.widget);
  const signal = turn.abort && turn.abort.signal;
  try {
    const o = normalize(
      await platform.sample.json(prompt, {
        modelTier: setting('tier'),
        cache: cacheOpt(),
        onText,
        signal,
      }),
    );
    if (ok(o)) return o;
    stale();
    logErr('json', {
      code: 'empty_narration',
      message: 'JSON without narration',
      text: JSON.stringify(o).slice(0, 300),
    });
  } catch (e) {
    logErr('json', e);
    if (e && FATAL.includes(e.code)) throw e;
    if (e && e.text) {
      const j = extractJson(e.text);
      if (j && ok(normalize(j))) return normalize(j);
    }
  }
  {
    // fallback 1: plain text mode, then pull the JSON out ourselves
    if (signal && signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
    try {
      const r = await platform.sample(prompt + '\n\n' + prompts.fallbackText, {
        modelTier: setting('tier'),
        cache: cacheOpt(),
        onText,
        signal,
      });
      const j = extractJson((r && r.text) || '');
      if (j && ok(normalize(j))) return normalize(j);
      stale();
      logErr('text', { code: 'no_json', message: 'text reply without usable JSON', text: r && r.text });
    } catch (e2) {
      logErr('text', e2);
      if (e2 && FATAL.includes(e2.code)) throw e2;
    }
    // fallback 2: compact retry on the quick tier
    if (signal && signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
    try {
      const r = await platform.sample(prompt + '\n\n' + prompts.fallbackCompact, {
        modelTier: 'quick',
        cache: false,
        signal,
      });
      const j = extractJson((r && r.text) || '');
      if (j && ok(normalize(j))) return normalize(j);
      logErr('compact', { code: 'no_json', message: 'compact reply without usable JSON', text: r && r.text });
    } catch (e3) {
      logErr('compact', e3);
      if (e3 && FATAL.includes(e3.code)) throw e3;
    }
    throw Object.assign(new Error('응답을 읽지 못했어요 (⚙ → 최근 오류 참고)'), { code: 'no_json' });
  }
}
function extractJson(t) {
  if (!t) return null;
  t = String(t).replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{'),
    b = t.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  const body = t.slice(a, b + 1);
  try {
    return JSON.parse(body);
  } catch {
    // not plain JSON: try the lenient form below
  }
  try {
    return JSON.parse(body.replace(/,\s*([}\]])/g, '$1').replace(/[\u0000-\u001f]+/g, ' '));
  } catch {
    // still not JSON: try closing a truncated object below
  }
  // truncated output: close open strings/brackets and retry
  let fixed = body;
  const q = (fixed.match(/(?<!\\)"/g) || []).length;
  if (q % 2) fixed += '"';
  let depth = 0;
  for (const ch of fixed) {
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
  }
  fixed = fixed.replace(/,\s*$/, '');
  while (depth-- > 0) fixed += '}';
  try {
    return JSON.parse(fixed);
  } catch (e) {
    return null;
  }
}
const noDash = t =>
  String(t)
    .replace(/\s*—+\s*/g, m => (/\s$/.test(m) && /^\s/.test(m) ? ', ' : ', '))
    .replace(/,\s*,/g, ',')
    .replace(/\(\s*,\s*/g, '(')
    .replace(/\s*,\s*\)/g, ')');
export function normalize(o) {
  if (!o || typeof o !== 'object') o = {};
  o.narration = noDash(o.narration || '');
  o.admin = noDash(o.admin || '');
  o.system = Array.isArray(o.system) ? o.system.map(x => noDash(x)).slice(0, LIMITS.perReply.system) : [];
  o.choices = Array.isArray(o.choices) ? o.choices.map(x => noDash(x)).slice(0, LIMITS.perReply.choices) : [];
  if (o.widget && typeof o.widget === 'object') {
    const walk = v =>
      typeof v === 'string'
        ? noDash(v)
        : Array.isArray(v)
          ? v.map(walk)
          : v && typeof v === 'object'
            ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
            : v;
    o.widget = walk(o.widget);
  }
  if (o.widget && !widgetOf(o.widget)) o.widget = null;
  if (o.reasons && typeof o.reasons === 'object') {
    const r = {};
    for (const [k, v] of Object.entries(o.reasons).slice(0, LIMITS.perReply.reasons))
      if (v) r[String(k).slice(0, LIMITS.text.statKey)] = String(v).slice(0, LIMITS.text.reason);
    o.reasons = r;
  } else o.reasons = {};
  o.windfall = o.windfall === true;
  if (o.check && (typeof o.check !== 'object' || !(Number(o.check.p) > 0))) o.check = null;
  o.also_present = Array.isArray(o.also_present)
    ? o.also_present.filter(p => p && typeof p === 'object' && p.name).slice(0, LIMITS.perReply.alsoPresent)
    : [];
  o.speaker_hidden = o.speaker_hidden === true;
  o.ledger = o.ledger && typeof o.ledger === 'object' && !Array.isArray(o.ledger) ? o.ledger : null;
  if (app.state && rule('dice') === false && Array.isArray(o.choices))
    o.choices = o.choices.map(c => String(c).replace(ODDS_RE, '').trim());
  o.items = Array.isArray(o.items)
    ? o.items.filter(x => x && typeof x === 'object' && x.name).slice(0, LIMITS.perReply.items)
    : [];
  o.equip = Array.isArray(o.equip) ? o.equip.map(String) : [];
  o.unequip = Array.isArray(o.unequip) ? o.unequip.map(String) : [];
  return o;
}
