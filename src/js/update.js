/* ============ update check ============ */
import { $, esc, noteIgnored, toast } from './util.js';
import { app, APP_VERSION, RELEASES_URL } from './app.js';
import { saveSettings } from './settings.js';
import { openSheet } from './sheet.js';

// The page cannot ask GitHub for the latest release (the artifact's content security policy blocks requests to other
// sites), so this sheet links to the releases page and hands the player a request to paste into a new Claude chat.
// The request asks Claude to overwrite this same artifact: saves live in the artifact's own database, so a new
// artifact would start with none of them.

// The request makes Claude fetch the release with curl in its computer tool (the web reader is blocked by GitHub; the
// computer tool needs "network egress" turned on in the Claude app settings) and overwrite this same artifact.
const GUIDE_URL = 'https://wonjoonseol-ws.github.io/dice-roguelife/#install';
function updateRequestText(link) {
  return [
    '컴퓨터 도구(bash)에서 아래 명령으로 파일을 받아 줘. 웹 읽기(web fetch)는 쓰지 마.',
    `curl -L -o dice-roguelife.html ${RELEASES_URL}/latest/download/dice-roguelife.html`,
    '받은 파일이 수백 KB짜리 HTML인지 확인한 다음, 새 아티팩트를 만들지 말고 아래 내 아티팩트 링크에 덮어써 줘.',
    '기능은 db, sample, user, assets, downloads, artifact로 맞춰 줘.',
    `내 아티팩트: ${link || '(여기에 내 아티팩트 링크)'}`,
  ].join('\n');
}

export function openUpdateSheet() {
  openSheet(`<h3>업데이트 확인</h3>
    <p class="upd-p">지금 버전은 <b>v${esc(APP_VERSION)}</b>이에요. 새 버전과 바뀐 점은 <a href="${RELEASES_URL}" target="_blank" rel="noopener">GitHub 릴리스 페이지</a>에서 볼 수 있어요.</p>
    <p class="upd-p muted">새 버전으로 바꾸려면 아래 문구를 복사해서 <b>Claude 새 대화</b>에 붙여 넣으세요. 이 아티팩트의 링크가 함께 가야 같은 링크에 덮어써지고 저장 데이터가 그대로 남아요. Claude 앱 설정에서 <b>네트워크 허용(Allow network egress)</b>이 켜져 있어야 파일을 받을 수 있어요. 막히면 <a href="${GUIDE_URL}" target="_blank" rel="noopener">설치 가이드</a>의 "막혔을 때"를 보세요.</p>
    <div class="field"><label for="updLink">내 아티팩트 링크</label><input id="updLink" type="url" placeholder="https://claude.ai/artifact/..." value="${esc(app.settings.artifactLink || '')}"></div>
    <textarea id="updText" class="upd-text" readonly aria-label="업데이트 요청 문구"></textarea>
    <div class="row upd-actions"><button class="btn primary" id="updCopy" type="button">문구 복사</button><button class="btn ghost" type="button" data-close>닫기</button></div>`);
  const link = $('#updLink');
  const text = $('#updText');
  const refresh = () => (text.value = updateRequestText(link.value.trim()));
  refresh();
  link.oninput = refresh;
  link.onchange = async () => {
    app.settings.artifactLink = link.value.trim();
    await saveSettings().catch(e => noteIgnored('update: save the artifact link', e));
  };
  $('#updCopy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(text.value);
      toast('복사했어요');
    } catch {
      text.select(); // clipboard blocked in this frame: leave the text selected for a manual copy
      toast('복사가 막혀 있어요. 선택된 문구를 직접 복사해 주세요');
    }
  };
}
