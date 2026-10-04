// the date is counted by the code from the first real date; a missed midnight adds a day; time does not slip back within a day; own-calendar worlds keep the narrator's date
import { test, expect } from './support/test.js';
import { check, claudeMock, same, startLife } from './support/harness.js';

const SEQ = [
  { date: '2035년 4월 13일', time: '오후 11시 30분', days_passed: 0 }, // opening: becomes the anchor (금)
  { date: '2035년 4월 19일', time: '오후 11시 52분', days_passed: 0 }, // narrator jumps the date: ignored
  { time: '오전 12시 09분', days_passed: 0 }, // past midnight, unreported: +1 day
  { time: '오전 12시 01분', days_passed: 0 }, // slips back 8 minutes: keep 12:09
  { time: '오전 7시 20분', days_passed: 1 }, // reported day: +1
];
const J =
  'async()=>{const seq=' +
  JSON.stringify(SEQ) +
  ";const n=(window.__n=(window.__n||0)+1);const c=seq[Math.min(n,seq.length)-1];return{admin:'',narration:'장면 '+n,system:[],choices:['a'],stat_changes:{},clock:c,memory:{},dead:false}}";

test('clock', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [1280, 720] });
  await pg.waitForTimeout(500);
  await startLife(pg);
  const got = [
    await pg.evaluate('JSON.stringify([DR.app.state.clock.day,DR.app.state.clock.date,DR.app.state.clock.time])'),
  ];
  for (let k = 0; k < 4; k++) {
    await pg.fill('#input', `다음 ${k}`);
    await pg.press('#input', 'Enter');
    await pg.waitForTimeout(600);
    got.push(
      await pg.evaluate('JSON.stringify([DR.app.state.clock.day,DR.app.state.clock.date,DR.app.state.clock.time])'),
    );
  }
  for (const g of got) console.log(g);
  const want = [
    '[0,"2035년 4월 13일 (금)","오후 11시 30분"]',
    '[0,"2035년 4월 13일 (금)","오후 11시 52분"]',
    '[1,"2035년 4월 14일 (토)","오전 12시 09분"]',
    '[1,"2035년 4월 14일 (토)","오전 12시 09분"]',
    '[2,"2035년 4월 15일 (일)","오전 7시 20분"]',
  ];
  console.log(
    'times parse:',
    await pg.evaluate(
      "['오후 11시 52분','오전 12시 09분','밤 12시','밤 1시','새벽 3시 반','낮 1시','정오','23:05','11시 5분'].map(DR.clockMin)",
    ),
  );
  // an older save with a date but no anchor: the next day moves the date
  await pg.evaluate(
    "DR.app.state.clock={day:5,date:'2035년 4월 23일 (월)',time:'오후 10시 40분',weather:'',place:''};0",
  );
  await pg.evaluate('window.__n=99;0');
  const old = await pg.evaluate(
    "(()=>{DR.applyOut(DR.normalize({admin:'',narration:'다음 날.',system:[],choices:[],stat_changes:{},clock:{days_passed:1,time:'오전 8시 55분'},memory:{},dead:false}));return JSON.stringify([DR.app.state.clock.day,DR.app.state.clock.date,DR.app.state.clock.anchor])})()",
  );
  console.log('older save, one day later:', old);
  check(errs, 'the date follows the anchor, a missed midnight and reported days, never the narrator', same(got, want));
  const [day, date, anchor] = JSON.parse(old);
  check(
    errs,
    'an older save without an anchor: one day later is day 6, 4월 24일 (화), anchored at its day 5 date',
    day === 6 && date === '2035년 4월 24일 (화)' && same(anchor, { date: '2035-04-23', day: 5 }),
  );
  expect(errs).toEqual([]);
});
