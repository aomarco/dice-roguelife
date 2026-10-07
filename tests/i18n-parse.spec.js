// the parsers that read the narrator's replies understand Korean, English and Japanese
import { test, expect } from './support/test.js';
import { check } from './support/harness.js';

test('i18n parse', async ({ game }) => {
  const { pg, errs } = await game();
  await pg.waitForFunction(() => window.DR && DR.matchOdds);
  const r = await pg.evaluate(() => {
    const odds = c => {
      const m = DR.matchOdds(c);
      return m ? [m.p, DR.isPivotal(m.rest)] : null;
    };
    return {
      oddsKo: odds('검을 휘두른다 (성공 확률 60%)'),
      oddsKoBig: odds('뛰어내린다 (성공 확률 20%, 결정적)'),
      oddsEn: odds('Swing the sword (success chance 60%)'),
      oddsEnBig: odds('Jump (Success Chance 20%, decisive)'),
      oddsNone: odds('Walk away'),
      oddsJa: odds('剣を振るう（成功率60％）'),
      oddsJaBig: odds('飛び降りる (成功率 20%, 決定的)'),
      ja: DR.clockMin('午後9時10分'),
      jaHalf: DR.clockMin('夜8時半'),
      parseJa: DR.parseKDate('2035年4月5日'),
      fmtJa: DR.fmtKDate('2035-04-05', 'ja'),
      wdJa: DR.withWeekday('2035年4月5日(月)'),
      pm: DR.clockMin('9:10 PM'),
      pm2: DR.clockMin('around 9 pm'),
      am: DR.clockMin('12:30 a.m.'),
      h24: DR.clockMin('21:10'),
      noon: DR.clockMin('Noon'),
      midnight: DR.clockMin('midnight'),
      ko: DR.clockMin('오후 9시 10분'),
      parseEn: DR.parseKDate('April 5, 2035'),
      parseEn2: DR.parseKDate('5 April 2035'),
      parseKo: DR.parseKDate('2035년 4월 5일'),
      fmtKo: DR.fmtKDate('2035-04-05', 'ko'),
      fmtEn: DR.fmtKDate('2035-04-05', 'en'),
      wdEn: DR.withWeekday('Monday, April 5, 2035'),
      wdKo: DR.withWeekday('2035년 4월 5일 (월)'),
      wdOwn: DR.withWeekday('Year 1203 of the Empire'),
    };
  });
  console.log(r);
  check(errs, 'Korean odds', JSON.stringify([r.oddsKo, r.oddsKoBig]) === '[[60,false],[20,true]]');
  check(errs, 'English odds', JSON.stringify([r.oddsEn, r.oddsEnBig, r.oddsNone]) === '[[60,false],[20,true],null]');
  check(errs, 'English times', r.pm === 1270 && r.pm2 === 1260 && r.am === 30 && r.noon === 720 && r.midnight === 0);
  check(errs, '24-hour and Korean times', r.h24 === 1270 && r.ko === 1270);
  check(errs, 'dates parse', r.parseEn === '2035-04-05' && r.parseEn2 === '2035-04-05' && r.parseKo === '2035-04-05');
  check(errs, 'dates format', r.fmtKo === '2035년 4월 5일 (목)' && r.fmtEn === 'April 5, 2035 (Thu)');
  check(
    errs,
    'weekday',
    r.wdEn === 'April 5, 2035 (Thu)' && r.wdKo === '2035년 4월 5일 (목)' && r.wdOwn === 'Year 1203 of the Empire',
  );
  check(errs, 'Japanese odds', JSON.stringify([r.oddsJa, r.oddsJaBig]) === '[[60,false],[20,true]]');
  check(errs, 'Japanese times', r.ja === 1270 && r.jaHalf === 1230);
  check(
    errs,
    'Japanese dates',
    r.parseJa === '2035-04-05' && r.fmtJa === '2035年4月5日 (木)' && r.wdJa === '2035年4月5日 (木)',
  );
  expect(errs).toEqual([]);
});

// each prompt language's own odds example is read by the reply profiles (reply/<lang>.js)
test('prompts ask for the odds tags the parser reads', async ({ game }) => {
  const { pg, errs } = await game();
  await pg.waitForFunction(() => window.DR && DR.matchOdds);
  const r = await pg.evaluate(() => {
    const example = rules => {
      const m = /\(([^()]*?) n%(, [^()]*?)?\)/.exec(rules);
      return m ? `Go (${m[1]} 60%${m[2] || ''})` : '';
    };
    const read = rules => {
      const m = DR.matchOdds(example(rules));
      return m ? m.p : null;
    };
    return { ko: read(DR.prompts.rules), en: read(DR.prompts.en.rules) };
  });
  check(errs, `Korean rules' odds tag is read (${r.ko})`, r.ko === 60);
  check(errs, `English rules' odds tag is read (${r.en})`, r.en === 60);
  expect(errs).toEqual([]);
});
