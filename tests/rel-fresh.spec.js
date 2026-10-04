// relations stale past 200 turns drop from the prompt, but ledger names and log-less relations stay; memory tab still shows all
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

test('rel fresh', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(), { size: [420, 900] });
  await pg.waitForTimeout(500);
  await startLife(pg, { dice: true });
  await pg.evaluate(`DR.app.state.next=500;
      DR.app.state.relations={'칼자국':'매일 상납','오래된 지인':'300턴 전 사람','최근 사람':'방금','기록없는 사람':'메타 없음'};
      DR.app.state.ledger={'할당량':'매일 밤 칼자국에게 3만 원'};
      DR.app.state.meta={'칼자국':{f:1,l:120},'오래된 지인':{f:5,l:120},'최근 사람':{f:480,l:498}};0`);
  const active = await pg.evaluate('DR.activeRel().map(x=>x[0])');
  console.log('sent to prompt:', active);
  // memory tab shows all four
  await pg.click('[data-tab="memory"]');
  await pg.waitForTimeout(300);
  const shown = await pg.evaluate(
    "[...document.querySelectorAll('.lore b')].map(b=>b.textContent.replace(/[0-9].*$/,'').trim())",
  );
  console.log('memory tab shows:', shown);
  const ok =
    active.includes('칼자국') &&
    active.includes('최근 사람') &&
    active.includes('기록없는 사람') &&
    !active.includes('오래된 지인') &&
    shown.filter(x => x.includes('오래된 지인')).length === 1;
  if (!ok) errs.push('rel fresh wrong');
  expect(errs).toEqual([]);
});
