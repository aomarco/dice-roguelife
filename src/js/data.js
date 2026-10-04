/* ============ data tables (code owns the rules) ============ */
import { rnd } from './util.js';

export const TIERS = ['EX', 'SSS', 'S', 'A', 'B', 'C', 'D', 'E', 'F'];
export const TIER_P = [
  ['EX', 0.5],
  ['SSS', 1.5],
  ['S', 4],
  ['A', 9],
  ['B', 16],
  ['C', 24],
  ['D', 22],
  ['E', 13],
  ['F', 10],
];
export const WORLDS = [
  {
    id: 'hunter',
    diff: [2, 4],
    name: '현대 헌터물',
    risk: '게이트는 예고 없이 열린다',
    opp: '각성 한 번이면 인생이 뒤집힌다',
    entry: { transfer: 0.15, possess: 0.1 },
    sponsor: 0.4,
    from: '검과 마법의 이세계',
  },
  {
    id: 'apoc',
    diff: [4, 5],
    name: '아포칼립스',
    desc: '문명이 무너진 뒤의 세계',
    risk: '물 한 병에 사람이 죽는다',
    opp: '무너진 세상에선 누구나 왕이 될 수 있다',
    entry: { transfer: 0.1, possess: 0.05 },
    sponsor: 0.35,
  },
  {
    id: 'academy',
    diff: [1, 4],
    name: '아카데미물',
    desc: '각성자나 마법사를 길러내는 명문 학원',
    risk: '등수가 곧 계급이다',
    opp: '졸업장 하나로 신분이 바뀐다',
    entry: { transfer: 0.1, possess: 0.25 },
    sponsor: 0.3,
  },
  {
    id: 'tower',
    diff: [4, 5],
    name: '탑 등반물',
    desc: '정상에 오르면 소원을 이뤄준다는 탑',
    risk: '층마다 죽음이 기다린다',
    opp: '꼭대기에 모든 것이 있다',
    entry: { transfer: 0.2, possess: 0.05 },
    sponsor: 0.4,
  },
  {
    id: 'vrmmo',
    diff: [2, 4],
    name: 'VR MMO',
    desc: '가상현실 게임 속. 로그아웃이 안 된다',
    risk: '게임 속 죽음이 진짜일지도 모른다',
    opp: '버그와 히든 퀘스트가 곧 기회다',
    entry: { transfer: 0.05, possess: 0.05 },
    sponsor: 0.3,
  },
  {
    id: 'fantasy',
    diff: [2, 4],
    name: '정통 판타지',
    risk: '죽음은 흔하고 신분은 단단하다',
    opp: '기연은 던전 바닥에 있다',
    entry: { transfer: 0.2, possess: 0.1 },
    sponsor: 0.15,
  },
  {
    id: 'rofan',
    diff: [1, 4],
    name: '로맨스 판타지',
    risk: '칼보다 소문이 위험하다',
    opp: '결혼이 무기다',
    entry: { transfer: 0.1, possess: 0.35 },
    sponsor: 0.05,
  },
  {
    id: 'murim',
    diff: [3, 5],
    name: '동양 무협',
    risk: '한 수에 목이 날아간다',
    opp: '경지가 곧 신분이다',
    entry: { transfer: 0.1, possess: 0.15 },
    sponsor: 0.1,
  },
  {
    id: 'palace',
    diff: [3, 5],
    name: '동양 궁중물',
    desc: '황궁과 후궁, 조정의 암투',
    risk: '말 한마디에 삼족이 멸한다',
    opp: '총애 한 번이면 하늘에 닿는다',
    entry: { transfer: 0.1, possess: 0.3 },
    sponsor: 0.05,
  },
  {
    id: 'cyber',
    diff: [3, 5],
    name: 'SF 사이버펑크',
    risk: '몸을 판 만큼 산다',
    opp: '기업이 신이고, 신은 거래한다',
    entry: { transfer: 0.05, possess: 0.05 },
    sponsor: 0.1,
  },
  {
    id: 'monster',
    diff: [5, 5],
    name: '인외마경',
    risk: '모든 것이 사냥감이고, 너도 그중 하나다',
    opp: '먹은 만큼 강해지고, 강해진 만큼 모습이 바뀐다',
    entry: { transfer: 0.15, possess: 0.05 },
    sponsor: 0.2,
  },
];
// retired world ids: what they were is now a background plus an entry (how the player arrived)
export const WORLD_ALIAS = {
  gamehunter: ['hunter'],
  isekai: ['fantasy', 'transfer'],
  reverse: ['hunter', 'transfer'],
  possess: ['rofan', 'possess'],
};
export const ENTRY_NAME = { native: '토박이', transfer: '전이자', possess: '빙의자' };
const STANCES = ['무관심', '경쟁', '적대', '협력'];
// per ADMIN persona: 무관심, 경쟁, 적대, 협력
const STANCE_P = {
  star: [0.3, 0.35, 0.25, 0.1],
  dealer: [0.25, 0.45, 0.2, 0.1],
  archivist: [0.6, 0.15, 0.15, 0.1],
  fan: [0.1, 0.4, 0.3, 0.2],
};
export function rollEntry(world, aff) {
  const e = world.entry || {};
  let t = e.transfer || 0,
    p = e.possess || 0;
  if (aff && aff.entry === 'possess') p = Math.min(0.8, p * 3 + 0.1);
  if (aff && aff.entry === 'transfer') t = Math.min(0.8, t * 3 + 0.1);
  const r = rnd();
  return r < p ? 'possess' : r < p + t ? 'transfer' : 'native';
}
export function rollSponsor(world, force, persona) {
  if (force === 'off') return null;
  if (force !== 'on' && rnd() >= (world.sponsor || 0)) return null;
  const w = STANCE_P[persona] || [0.3, 0.3, 0.25, 0.15]; // the ADMIN persona leans the constellation's stance
  let r = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < STANCES.length; i++) {
    if ((r -= w[i]) < 0) return { stance: STANCES[i] };
  }
  return { stance: STANCES[1] };
}
export const TRANSFER_RACES = {
  modern: ['인간(전이자)', '인간(전이자)', '인간(전이자)', '전이 중 변이된 몸'],
  other: ['엘프', '마족', '인간화한 드래곤', '이세계의 용사', '이세계의 마왕', '고블린'],
};
export const RACES = {
  vrmmo: ['인간 유저', '인간 유저', '엘프 유저', '수인 유저', '자아가 생긴 NPC', '버그 캐릭터'],
  academy: ['인간', '인간', '엘프', '수인', '혼혈', '마족 교환학생'],
  tower: ['인간', '인간', '수인', '요정', '거인족', '탑의 원주민'],
  apoc: ['인간', '인간', '인간', '변이 인간', '감염 면역자', '기계 개조인'],
  palace: ['인간', '인간', '인간', '여우 요괴', '반신'],
  fantasy: ['인간', '인간', '인간', '엘프', '드워프', '수인', '하프오크', '마족'],
  murim: ['인간', '인간', '인간', '요괴', '반요', '영수'],
  hunter: ['인간(비각성자)', '인간(비각성자)', '인간(각성 체질)', '게이트 몬스터', '혼혈 각성체'],
  cyber: ['인간', '인간', '사이보그', '안드로이드', '각성한 AI', '변이체'],
  monster: ['슬라임', '고블린', '리치', '미믹', '드래곤 해츨링', '곰팡이 군체', '언데드'],
  rofan: ['인간(귀족)', '인간(평민)', '인간(평민)', '요정', '흑마법 혈통', '용족 혼혈'],
};
export const ORIGINS = {
  EX: ['마왕', '선택받은 용사', '창세신의 후예', '시스템 관리자'],
  SSS: [
    '국내 1위 길드의 상속자',
    '마교 소교주',
    '북부 대공가의 외동',
    '고대 드래곤',
    '메가코프 이사회 의장의 클론',
    '황제의 적자',
    '군주종의 마지막 알',
    '재벌 3세',
    '대현자의 마지막 제자',
  ],
  S: ['공작가 후계자', '대형 길드장의 양자', '성녀', 'S급 헌터', '마계 공작의 사생아', '대마법사의 제자', '상급 마족'],
  A: ['백작가 자제', '명문 정파 제자', 'A급 각성자', '기사단장의 아들', '궁정 마법사 견습'],
  B: ['남작가 막내', '용병', '상인의 아들', '견습 기사', '모험가 길드 신입'],
  C: ['평민', '농부의 자식', '마을 사냥꾼', '여관 종업원', '하급 병사'],
  D: ['고아', '빈민가 소매치기', '떠돌이 약장수', '파산한 상인의 자식'],
  E: ['노예', '광산 노역수', '빚에 팔려 온 아이', '시한부 병자', '저주받은 아이'],
  F: ['이세계 슬라임', '고블린 새끼', '허수아비', '마을 개'],
};
export const TALENTS = {
  EX: [
    ['인과율 조작', '하루 한 번, 방금 일어난 일의 결과를 다시 굴린다'],
    ['세계의 총애', '치명적 위기를 한 번 무효로 만든다'],
    ['관리자 권한', 'ADMIN과 직접 대화하고 거래할 수 있다'],
  ],
  SSS: [
    ['결말 감각', '선택지 하나의 결과가 흐릿하게 미리 보인다'],
    ['절대 재능', '모든 숙련도 상승 속도 5배'],
    ['황금손', '손대는 거래마다 이득이 따른다'],
  ],
  S: [
    ['광전사', '궁지에 몰릴수록(HP 30% 아래) 판정이 크게 유리해진다'],
    ['검술 천재', '한 번 본 검초를 몸이 기억한다'],
    ['마나 친화', '마력 회복이 비정상적으로 빠르다'],
  ],
  A: [
    ['첫인상', '처음 만난 NPC의 태도가 한 단계 부드럽다'],
    ['빠른 성장', '경험치 획득량 2배'],
    ['행운아', '작은 운이 자주 따른다'],
  ],
  B: [
    ['강철 체질', '병과 독에 강하다'],
    ['손재주', '무엇이든 금방 고친다'],
    ['눈치', '거짓말을 어렴풋이 알아챈다'],
  ],
  C: [
    ['성실함', '꾸준히 하면 조금씩 는다'],
    ['평범한 건강', '잔병치레가 없다'],
    ['잔재주', '요리와 청소를 잘한다'],
  ],
  D: [
    ['불면증', '밤에 깨어 있지만 늘 피곤하다'],
    ['둔감', '통증을 덜 느끼지만 위험도 늦게 알아챈다'],
    ['겁쟁이', '도망칠 때만 발이 빨라진다'],
  ],
  E: [
    ['저주받은 운', '중요한 순간마다 운이 나쁘다'],
    ['허약 체질', '최대 HP가 쉽게 줄어든다'],
    ['기억 상실', '과거를 떠올리지 못한다'],
  ],
  F: [
    ['끈질김', '죽음 판정 한 번을 중상으로 바꾼다(한 생에 1회)'],
    ['존재감 제로', '아무도 당신을 신경 쓰지 않는다'],
    ['잡초', '밟혀도 다음 날이면 일어난다. 회복만 빠르다'],
  ],
};
// others: 골드 ×1
const CURRENCY = {
  hunter: ['원', 1000],
  academy: ['원', 1000],
  cyber: ['크레딧', 10],
  apoc: ['배급표', 1],
  murim: ['냥', 1],
  palace: ['냥', 1],
};
export function currencyOf(wid) {
  return CURRENCY[wid] || ['골드', 1];
}
export const BASE = {
  EX: { hp: 999, power: 120000, gold: 50000 },
  SSS: { hp: 500, power: 15000, gold: 200000 },
  S: { hp: 300, power: 3000, gold: 20000 },
  A: { hp: 200, power: 600, gold: 5000 },
  B: { hp: 120, power: 150, gold: 500 },
  C: { hp: 100, power: 40, gold: 100 },
  D: { hp: 80, power: 20, gold: 10 },
  E: { hp: 50, power: 10, gold: 0 },
  F: { hp: 10, power: 3, gold: 0 },
};
export const CMDS = [
  { k: '/뉴스', a: ['/news'], t: 'news', d: '세계의 소식지' },
  { k: '/의뢰', a: ['/quest', '/q'], t: 'quest', d: '의뢰 게시판' },
  { k: '/갤', a: ['/board', '/gallery', '/dc'], t: 'gallery', d: '커뮤니티 게시판' },
  {
    k: '/성좌',
    a: ['/star', '/성좌갤'],
    t: 'gallery',
    d: '성좌들의 관전 갤러리 (성좌가 있는 삶, 채널이 열린 뒤)',
    preset:
      '성좌 갤러리. 이 플레이어의 채널을 보는 성좌들(별자리 이름의 관전자들)이 글과 댓글로 후원, 조롱, 내기를 건다. 사이트명은 세계관에 맞게.',
  },
  { k: '/톡', a: ['/chat', '/talk', '/dm'], t: 'messenger', d: '메신저로 메시지 보내기' },
  { k: '/판정', a: ['/why', '/근거'], t: 'judge', d: '판정 근거 묻기 (시간 안 흐름)' },
  { k: '/스킬', a: ['/skill', '/skills', '/기술'], t: 'skills', d: 'ADMIN에게 스킬 목록과 비용 듣기 (시간 안 흐름)' },
  { k: '/상태', a: ['/status', '/st'], t: 'status', d: '상태창 열기' },
];

export const EMOS = [
  'neutral',
  'smile',
  'joy',
  'anger',
  'sadness',
  'surprise',
  'smirk',
  'shy',
  'fear',
  'serious',
  'crying',
  'determined',
];
export const EMO_FB = {
  joy: 'smile',
  smile: 'joy',
  crying: 'sadness',
  sadness: 'crying',
  determined: 'serious',
  serious: 'neutral',
  smirk: 'smile',
  shy: 'smile',
  fear: 'surprise',
  surprise: 'neutral',
  anger: 'serious',
};
export const REALMS = ['미입문', '삼류', '이류', '일류', '절정', '초절정', '화경', '현경', '생사경'];
const REALM_START = { EX: 6, SSS: 4, S: 3, A: 2, B: 1 };
const NEIGONG_START = { EX: 120, SSS: 60, S: 20, A: 10, B: 3 };
export const ART_SLOTS = ['검법', '심법', '경공', '기타'];
const EMO_KO = {
  중립: 'neutral',
  기본: 'neutral',
  미소: 'smile',
  웃음: 'joy',
  기쁨: 'joy',
  행복: 'joy',
  분노: 'anger',
  화남: 'anger',
  슬픔: 'sadness',
  우울: 'sadness',
  놀람: 'surprise',
  경악: 'surprise',
  비웃음: 'smirk',
  능글: 'smirk',
  부끄러움: 'shy',
  수줍음: 'shy',
  공포: 'fear',
  두려움: 'fear',
  진지: 'serious',
  심각: 'serious',
  눈물: 'crying',
  울음: 'crying',
  결의: 'determined',
  각오: 'determined',
  happy: 'joy',
  laugh: 'joy',
  sad: 'sadness',
  angry: 'anger',
  surprised: 'surprise',
  scared: 'fear',
  cry: 'crying',
  embarrassed: 'shy',
  smug: 'smirk',
};
export function normEmo(e) {
  e = String(e || '')
    .trim()
    .toLowerCase();
  if (EMOS.includes(e)) return e;
  return EMO_KO[e] || 'neutral';
}
export function normGender(g) {
  g = String(g || '')
    .trim()
    .toLowerCase();
  if (/^(female|여|여성|여자|f)$/.test(g)) return 'female';
  if (/^(male|남|남성|남자|m)$/.test(g)) return 'male';
  return g ? 'other' : null;
}
export const SUB_STATS = [
  ['con', '체력'],
  ['str', '근력'],
  ['mag', '마력'],
  ['agi', '민첩'],
  ['int', '지능'],
  ['cha', '매력'],
];
const SUB_BONUS = { EX: 12, SSS: 8, S: 5, A: 3, B: 1, C: 0, D: 0, E: -1, F: -2 };
export function rollSubStats(tier) {
  const o = {};
  for (const [k] of SUB_STATS) o[k] = Math.max(1, 3 + Math.floor(rnd() * 5) + (SUB_BONUS[tier] || 0));
  return o;
}
export function powerGrade(p) {
  return p >= 500000
    ? 'EX'
    : p >= 100000
      ? 'SSS'
      : p >= 50000
        ? 'SS'
        : p >= 10000
          ? 'S'
          : p >= 5000
            ? 'A'
            : p >= 1000
              ? 'B'
              : p >= 500
                ? 'C'
                : p >= 100
                  ? 'D'
                  : p >= 50
                    ? 'E'
                    : 'F';
}
export function initMurim(tier) {
  return {
    realm: REALM_START[tier] || 0,
    neigong: NEIGONG_START[tier] || 0,
    faction: '',
    rank: '',
    alias: '',
    constitution: '',
    arts: {},
  };
}
export function rollTier() {
  let r = rnd() * 100;
  for (const [t, p] of TIER_P) {
    if ((r -= p) < 0) return t;
  }
  return 'F';
}
export function tierRank(t) {
  return TIERS.indexOf(t);
}
// What each command type is, asked through cmdIs(cmd, trait):
//   screen  a screen you read (news, a board, a chat), not a place: no scene, banner or portraits
//   browse  reading it changes nothing in the story: no stats, skills, title, death or time
//   ask     a question to ADMIN that takes no time: no scene, growth or memory, and the choices stay as they were.
//           It names its prompt template (a prompts.json key), the question when none is typed, and the heading of
//           the live box while the answer streams
// status has none: it opens the status window and asks the model nothing
export const COMMAND_TYPES = {
  news: { screen: true, browse: true },
  quest: { screen: true, browse: true },
  gallery: { screen: true, browse: true },
  messenger: { screen: true },
  judge: {
    screen: true,
    browse: true,
    ask: { prompt: 'cmdJudge', q: '방금 판정은 왜 이렇게 됐나', head: '판정 근거' },
  },
  skills: { screen: true, browse: true, ask: { prompt: 'cmdSkills', q: '', head: '스킬 목록' } },
  status: {},
};
export const cmdIs = (cmd, trait) => !!(cmd && COMMAND_TYPES[cmd.type] && COMMAND_TYPES[cmd.type][trait]);
export const askOf = cmd => (cmdIs(cmd, 'ask') ? COMMAND_TYPES[cmd.type].ask : null);
