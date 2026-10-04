// one life end to end: the four command screens, death, the life ledger and a regression into life 2
import { test, expect } from './support/test.js';
import { MOCK_BASE, check, same, shot } from './support/harness.js';

const MOCK =
  MOCK_BASE +
  String.raw`
window.claude={use:async(n)=>{
 if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){const f=async()=>({text:''});
   f.limits=async()=>({maxPromptBytes:200000});
   f.json=async(p,o)=>{ if(p.includes('인생 결산을')) return {score:42,epitaph:'쥐에게 진 허수아비',summary:'짧았다.',highlights:['시궁쥐와의 사투'],inherit:{name:'지푸라기 투지',grade:'EX',desc:'HP 1로 버틴다'}};
     const dead=p.includes('[이번 입력] 죽는다');
     const w=p.includes('[명령] quest')?{type:'quest',board:'모험가 길드 게시판',quests:[{title:'잃어버린 양 찾기',client:'목동 한스',deadline:'사흘 뒤',difficulty:2,body:'양이 사라졌어요.',location:'북쪽 언덕',reward:'은화 3닢',status:'모집'}]}:p.includes('[명령] gallery')?{type:'gallery',site:'유니버스인사이드',board:'헌터 갤러리',posts:[{title:'F급 허수아비 봤냐',author:'ㅇㅇ',views:120,likes:3,comments:5}]}:p.includes('[명령] news')?{type:'news',section:'마도 소식',outlet:'왕국 일보',time:'오후 3시',headline:'허수아비가 쥐를 이겼다',reporter:'콜린',body:'놀라운 일이다.',quotes:['믿을 수 없어요']}:p.includes('[명령] messenger')?{type:'messenger',app:'유니버스톡',room:'파티방',messages:[{from:'나',text:'라멘 먹자',me:true},{from:'레온',text:'좋아'}]}:null;
     return {admin:'흥미롭군요.',narration:'당신은 눈을 떴습니다. "여기가 어디지?"',system:['[ 위기: 시궁쥐 ]'],choices:['싸운다 (성공 확률 10%)','도망친다'],stat_changes:{hp:dead?-999:-2,power:1},title:null,add_skills:[],memory:{lore:[{key:'시궁쥐',text:'당신을 노린다'}],relations:[],state_note:'시장 한복판',quests:[]},widget:w,scene_img:null,char_img:null,dead:dead};};
   return f;}
 return null;}};
`;

test('smoke', async ({ game }) => {
  const { pg, errs } = await game(MOCK, { size: [400, 860] });
  await pg.waitForTimeout(800);
  await pg.fill('#nm', '정지훈');
  await pg.click('#rollBtn');
  await pg.waitForTimeout(1800);
  await pg.screenshot({ path: shot('s1.png') });
  await pg.click('#acceptBtn');
  await pg.waitForTimeout(800);
  for (const c of ['/의뢰', '/갤', '/뉴스', '/톡 라멘 먹자']) {
    await pg.fill('#input', c);
    await pg.press('#input', 'Enter');
    await pg.waitForTimeout(500);
  }
  await pg.screenshot({ path: shot('s2.png'), fullPage: false });
  await pg.evaluate("document.querySelector('#log').scrollTop=0");
  await pg.screenshot({ path: shot('s3.png') });
  await pg.fill('#input', '죽는다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(500);
  await pg.click('#ledgerBtn');
  await pg.waitForTimeout(600);
  await pg.click('#regressBtn');
  await pg.waitForTimeout(300);
  await pg.click('#rollBtn');
  await pg.waitForTimeout(1800);
  await pg.click('#acceptBtn');
  await pg.waitForTimeout(700);
  await pg.screenshot({ path: shot('s4.png') });
  let st = await pg.evaluate(
    'JSON.stringify({next:DR.app.state.next,life:DR.app.state.lifeNo,skills:DR.app.state.skills.map(k=>k.name+k.grade),turns:DR.app.turns.length,past:DR.app.state.pastLives.length,widgets:DR.app.turns.filter(t=>t.out&&t.out.widget).map(t=>t.out.widget.type)})',
  );
  console.log(st);
  st = JSON.parse(st);
  check(
    errs,
    'the four commands answer with their screens',
    same(st.widgets, ['quest', 'gallery', 'news', 'messenger']),
  );
  check(
    errs,
    'death, the ledger and a regression: life 2 with one past life, every row still in the log',
    st.life === 2 && st.past === 1 && st.turns === st.next,
  );
  check(
    errs,
    'the inherited skill is carried over, its grade capped below EX',
    st.skills.some(k => k.startsWith('지푸라기 투지') && !k.endsWith('EX')),
  );
  expect(errs).toEqual([]);
});
