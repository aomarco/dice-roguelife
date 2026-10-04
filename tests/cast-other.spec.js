// sets labeled other (기타: beasts, spirits) are never given automatically to a man or a woman, on any casting path,
// but stay open to someone without a gender
import { test, expect } from './support/test.js';
import { check, claudeMock, library, startLife } from './support/harness.js';

const LIVE = library(); // its other-labeled sets: other3 (extra), other7 and other8 (major), other9 (minor)
// two silhouettes: one labeled other, one with no label
for (const [k, g] of [
  ['shadow_beast', 'other'],
  ['shadow_plain', null],
]) {
  LIVE.rows.push({
    id: k,
    kind: 'char',
    set: k,
    name: `${k}_neutral`,
    emotion: 'neutral',
    tags: ['beast'],
    worlds: [],
  });
  LIVE.sets[k] = g ? { gender: g } : {};
}

test('cast other', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(), { size: [420, 900] });
  await pg.waitForSelector('#rollBtn');
  await pg.evaluate(L => {
    DR.app.images.push(...L.rows);
    Object.assign(DR.app.setMeta, L.sets);
  }, LIVE);
  await startLife(pg, { world: 'hunter' });
  const r = await pg.evaluate(() => {
    const other = k => DR.genderOf(k) === 'other';
    const beast = { role: 'beast monster dragon', look: ['beast', 'spirit'] };
    const out = { candidates: [], cast: [], shadows: [], extras: [], open: [] };
    for (const gender of ['male', 'female'])
      for (const weight of ['extra', 'minor', 'major']) {
        out.candidates.push(...DR.castCandidates({ name: 'x', gender, weight, ...beast }, 40).filter(other));
        for (let i = 0; i < 12; i++) {
          const k = DR.castFor({ name: `${gender}-${weight}-${i}`, gender, weight, ...beast });
          if (k && other(k)) (weight === 'extra' ? out.extras : out.cast).push(k);
        }
        for (let i = 0; i < 8; i++) {
          const s = DR.shadowFor({ name: 's', gender, ...beast });
          if (s && other(s.im.set)) out.shadows.push(s.im.set);
        }
      }
    // no gender: the beasts are still there
    for (const gender of [null, 'other'])
      out.open.push(...DR.castCandidates({ name: 'y', gender, weight: 'major', ...beast }, 40).filter(other));
    return out;
  });
  console.log(JSON.stringify(r));
  check(errs, 'candidates for a man or a woman carry no other-labeled set', r.candidates.length === 0);
  check(errs, 'a gendered lead or minor part never gets an other-labeled face', r.cast.length === 0);
  check(errs, 'a gendered passer-by never gets an other-labeled face', r.extras.length === 0);
  check(errs, 'a gendered shadow never uses the other-labeled silhouette', r.shadows.length === 0);
  check(errs, 'someone without a gender may still be offered the beasts', r.open.length > 0);
  expect(errs).toEqual([]);
});
