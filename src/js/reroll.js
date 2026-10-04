/* ============ reroll & fork ============ */
import { $, clone, cutLine, fmt, noteIgnored, nowIso, toast, uid } from './util.js';
import { cmdIs, currencyOf } from './data.js';
import { dset } from './db.js';
import { turnStore } from './turn-store.js';
import { app, currentRun, exclusive, isIdle } from './app.js';
import { compat } from './compat.js';
import { answerDialog, askConfirm, askPrompt, openDialog } from './sheet.js';
import { openSave, persist, storeError } from './persistence.js';
import { renderStrip } from './status.js';
import { renderLog } from './log.js';
import { parseCmd } from './composer.js';
import { lifeExtra, runTurn } from './turn.js';
import { fillTemplate, prompts } from './prompt.js';

// A rewrite takes the last reply back and asks again with the same line, dice and fate. It may carry a fix:
//   reason     what was wrong, told to the narrator for this reply
//   remember   also keep the reason in the corrections the next replies see
//   noCheck    the line should never have been a check: drop its die
//   objection  the upheld /판정 this rewrite answers, kept on the new reply
const REROLL_REASONS = [
  ['impersonate', '내 캐릭터의 대사, 감정, 행동을 대신 정했음'],
  ['hostile', '내 말을 악의적으로 해석했음'],
  ['stall', '상황이 진행되지 않고 제자리'],
  ['repeat', '앞 턴과 반복됨'],
  ['lore', '설정이나 기억과 어긋남'],
  ['custom', '직접 입력'],
];
const REASON_TEXT = {
  impersonate:
    '유저 캐릭터의 감정 표현과 행동을 내레이터가 대신 정했다. 유저 캐릭터의 말과 행동은 유저 입력에 있는 것만 사용한다.',
  hostile: '유저의 언행을 악의적으로 해석했다. 유저 입력을 문자 그대로, 선의로 해석한다.',
  stall: '상황이 진행되지 않았다. 이번에는 사건을 확실히 한 단계 진행시키고 새로운 선택지를 준다.',
  repeat: '직전 턴과 내용이 반복됐다. 새로운 전개, 새로운 대사로 쓴다.',
  lore: '설정이나 기억과 어긋났다. [관련 설정], [관계], [지난 이야기 요약]을 다시 확인하고 맞춘다.',
};
export async function rerollWithReason() {
  if (!isIdle()) return;
  const last = app.turns[app.turns.length - 1];
  if (!last || last.kind !== 'ai') return;
  const answer = openDialog(
    `<h3>다시 쓰기</h3><p class="muted sheet-intro">문제를 고르면 직전 응답을 롤백하고, 그 점을 고쳐서 다시 씁니다.</p><div class="choices">${REROLL_REASONS.map(([k, l]) => `<button data-rr="${k}">${l}</button>`).join('')}<button data-rr="" class="fu">사유 없이 그냥 다시</button></div>`,
  );
  $('#sheetInner')
    .querySelectorAll('[data-rr]')
    .forEach(b => (b.onclick = () => answerDialog(b.dataset.rr)));
  const pick = await answer;
  if (pick === null) return;
  let reason = '';
  if (pick === 'custom') {
    const t = await askPrompt('무엇이 문제였나요?');
    if (t === null) return;
    reason = t.trim();
  } else if (pick) reason = REASON_TEXT[pick] || '';
  await reroll({ reason, remember: true });
}
export function applyErratum(fact, ago, remember, fix, q, out) {
  /* an error some replies back: the record stays, the state is put right now, and the next reply mends the story */
  const replies = app.turns.filter(t => t.kind === 'ai' && !(t.out && t.out.judge));
  const target = replies[replies.length - 1 - ago] || null;
  const notes = applyFix(fix);
  if (target) {
    target.errata = { fact, q };
    turnStore.update(target).catch(e => noteIgnored('reroll: turnStore.update', e));
  }
  if (remember) {
    app.state.corrections = (app.state.corrections || []).filter(c => c.until >= app.state.next);
    app.state.corrections.push({ text: '설정이나 기억과 어긋났다: ' + fact, until: app.state.next + 10 });
    app.state.corrections = app.state.corrections.slice(-3);
  }
  app.state.errataNote = fact;
  out.narration =
    String(out.narration || '') + `\n\n[ 정정 반영: ${notes.length ? notes.join(', ') : fact.slice(0, 60)} ]`;
  toast('정정해서 지금 상태에 반영했어요', 3500);
}
export function seenSpan(name) {
  const m = ((app.state && app.state.meta) || {})[name];
  if (!m || m.l == null) return '';
  const ago = (app.state.next || 0) - m.l;
  const last = ago <= 0 ? '지금' : ago + '턴 전';
  const span = m.f === m.l ? `${m.f}턴` : `${m.f}~${m.l}턴`;
  return `<span class="muted seen-span">${span}${ago > 0 ? ', ' + last : ''}</span>`;
}
function applyFix(fix) {
  const notes = [];
  if (!fix || typeof fix !== 'object') return notes; /* only bounded, plausible corrections */
  const cf = (currencyOf(app.state.life.world.id) || [])[1] || 1;
  const cap = Math.max(1000 * cf, Math.abs(app.state.stats.gold || 0) * 2);
  const g = Math.round(Number(fix.gold) || 0);
  if (g && Math.abs(g) <= cap) {
    app.state.stats.gold = Math.max(0, (app.state.stats.gold || 0) + g);
    notes.push(`소지금 ${g > 0 ? '+' : ''}${fmt(g)}`);
  }
  for (const it of (Array.isArray(fix.items) ? fix.items : []).slice(0, 6)) {
    const name = String((it && it.name) || '')
      .trim()
      .slice(0, 30);
    const q = Math.round(Number(it && it.qty) || 0);
    if (!name || !q || Math.abs(q) > 20) continue;
    const ex = (app.state.items || []).find(x => x.name === name);
    if (q > 0) {
      if (ex) ex.qty = (ex.qty || 1) + q;
      else
        (app.state.items = app.state.items || []).push({
          name,
          qty: q,
          grade: 'F',
          note: String(it.note || '').slice(0, 60),
          slot: null,
          power: 0,
        });
      notes.push(`${name} +${q}`);
    } else if (ex) {
      const take = Math.min(ex.qty || 1, -q);
      ex.qty = (ex.qty || 1) - take;
      if (ex.qty <= 0) app.state.items = app.state.items.filter(x => x !== ex);
      notes.push(`${name} -${take}`);
    }
  }
  if (fix.ledger && typeof fix.ledger === 'object') {
    app.state.ledger = app.state.ledger || {};
    for (const [k0, v] of Object.entries(fix.ledger).slice(0, 4)) {
      const k = String(k0).trim().slice(0, 30);
      if (!k) continue;
      if (v === null || v === '') {
        if (k in app.state.ledger) {
          delete app.state.ledger[k];
          notes.push(`장부 정리: ${k}`);
        }
      } else {
        app.state.ledger[k] = cutLine(v, 60);
        notes.push(`장부: ${k}`);
      }
    }
  }
  for (const r of (Array.isArray(fix.relations) ? fix.relations : []).slice(0, 3)) {
    if (r && r.name) {
      app.state.relations[String(r.name).slice(0, 30)] = String(r.note || '').slice(0, 200);
      notes.push(`관계: ${String(r.name).slice(0, 20)}`);
    }
  }
  return notes;
}
export async function upholdObjection(fact, judge, { remember, noCheck }) {
  // the record proves the last reply wrong: the /판정 line and that reply go, and the reply is written again with the fact (its outcome stays)
  const run = currentRun();
  const ju = app.turns[app.turns.length - 1];
  if (ju && ju.kind === 'user') {
    try {
      await turnStore.popTail(ju.i);
    } catch (e) {
      await storeError(e);
      return;
    }
    if (!run || run.abandoned) return;
    app.turns.pop();
    app.state.next = ju.i;
    await persist();
    if (!app.state || run.abandoned) return;
  }
  toast('이의 제기를 인정합니다. 재생성합니다.', 3500);
  renderLog('keep');
  // only a lasting fact goes into the corrections kept for the next turns; a passing detail fixes this reply and nothing more
  await rewriteLast({
    reason: `설정이나 기억과 어긋났다: ${fact}`,
    remember,
    noCheck,
    objection: Object.assign({ fact }, judge || {}),
  });
}
export function reroll(fix) {
  return exclusive(() => rewriteLast(fix));
}
// the rewrite itself, inside an action that already holds the game (reroll, or a /판정 reply being handled)
async function rewriteLast(fix = null, again = false) {
  const run = currentRun();
  const last = app.turns[app.turns.length - 1];
  if (!last || last.kind !== 'ai') return;
  const prevUser = [...app.turns].reverse().find(t => (t.kind === 'user' || t.kind === 'system') && t.i < last.i);
  if (prevUser && prevUser.kind === 'system') {
    await rerollIntro(last, prevUser, fix);
    return;
  }
  const prevSnap = [...app.turns].reverse().find(t => t.snap && t.i < last.i);
  if (!prevSnap) {
    toast('되돌릴 지점이 없어요');
    return;
  }
  try {
    await turnStore.popTail(last.i);
  } catch (e) {
    if (e && e.code === 'conflict' && !again) {
      const want = { i: last.i, at: last.at };
      await storeError(e);
      const now = app.turns[app.turns.length - 1]; // another device or tab moved this save on: reload, then carry on only if the same reply is still the last
      if (now && now.kind === 'ai' && now.i === want.i && now.at === want.at) {
        toast('최신으로 불러와서 다시 쓰기를 이어서 해요');
        return rewriteLast(fix, true);
      }
      toast('다른 곳에서 이야기가 더 진행돼서 다시 쓰기를 멈췄어요. 최신 화면에서 다시 눌러 주세요', 4500);
      return;
    }
    await storeError(e);
    return;
  }
  if (!run || run.abandoned) return; // the save was left during the rollback
  app.turns.pop();
  const tn = app.state.turnNo,
    pc = parseCmd(prevUser.text || ''),
    counted = !cmdIs(pc, 'browse');
  const next = app.state.next - 1;
  app.state = compat(clone(prevSnap.snap));
  app.state.next = next;
  if (app.state.turnNo == null && tn != null) app.state.turnNo = Math.max(0, tn - (counted ? 1 : 0)); // an older snapshot without the count takes it from before
  await persist();
  if (run.abandoned) return;
  renderStrip();
  const noCheck = !!(fix && fix.noCheck);
  if (noCheck) prevUser.roll = null; /* an upheld objection said this should never have been a check */
  prevUser.req = uid();
  turnStore.update(prevUser).catch(e => noteIgnored('reroll: turnStore.update', e));
  let r = noCheck ? null : prevUser.roll || null;
  if (r && !r.fixed) r = r.p != null ? Object.assign({}, r, { fixed: true }) : null; // a rewrite fixes the prose, not the outcome: the first answer's chance and result stand, and a turn judged without a check stays without one
  await runTurn(prevUser.text, parseCmd(prevUser.text), {
    run,
    roll: r,
    req: prevUser.req,
    luck: prevUser.luck || null,
    fate: prevUser.fate || null,
    fix,
  });
}
async function rerollIntro(last, sys, fix) {
  const run = currentRun();
  try {
    await turnStore.popTail(last.i);
  } catch (e) {
    await storeError(e);
    return;
  }
  if (!run || run.abandoned) return;
  app.turns.pop();
  const next = app.state.next - 1;
  app.state = compat(clone(sys.snap));
  app.state.next = next;
  app.state.introReq = uid();
  app.state.introText =
    app.state.introText ||
    fillTemplate(prompts.intro, {
      extra: lifeExtra(app.state.life),
      opening: '',
      world: app.state.life.world.name,
      race: app.state.life.race,
      origin: app.state.life.origin,
      originTier: app.state.life.originTier,
      talent: app.state.life.talent.name,
      talentTier: app.state.life.talentTier,
    });
  await persist();
  if (run.abandoned) return;
  renderStrip();
  await runTurn(app.state.introText, null, { run, intro: true, fix });
}
export async function fork(i) {
  if (!isIdle()) return;
  const t = app.turns.find(x => x.i === i);
  if (!t || !t.snap) {
    toast('이 지점에서는 분기할 수 없어요');
    return;
  }
  if (!(await askConfirm('이 지점에서 새로운 분기를 만들까요? 원래 기록은 그대로 남습니다.'))) return;
  await exclusive(() => makeBranch(t, i));
}
// a new save holding the rows up to turn i and the state saved with it; the original is not touched
async function makeBranch(t, i) {
  const parent = Object.assign(
    { id: app.currentSave.id, name: app.currentSave.name, turn: i },
    t.snap.turnNo != null ? { turnNo: t.snap.turnNo } : {},
  );
  const meta = {
    id: uid(),
    name: `${app.currentSave.name} (분기)`,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    parent,
    lifeNo: t.snap.lifeNo,
    turns: i + 1,
    store: 2,
    pages: 0,
  };
  toast('분기 복사 중...');
  try {
    meta.pages = await turnStore.copyUpTo(app.currentSave.id, meta.id, i);
  } catch (e) {
    await storeError(e);
    return;
  }
  const st = compat(clone(t.snap));
  st.next = i + 1;
  await dset(`states/items/${meta.id}`, st);
  await dset(`saves/items/${meta.id}`, meta);
  app.saves.unshift(meta);
  await openSave(meta.id, { keepAction: true });
  toast('새 분기에서 이어집니다');
}
