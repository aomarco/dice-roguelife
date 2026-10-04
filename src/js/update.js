/* ============ update check ============ */
import { $, esc, noteIgnored, toast } from './util.js';
import { app, APP_VERSION, RELEASES_URL, REPO_URL } from './app.js';
import { saveSettings } from './settings.js';
import { openSheet } from './sheet.js';

// The page cannot ask GitHub for the latest release (the artifact's content security policy blocks requests to other
// sites), so this sheet links to the releases page and hands the player a request to paste into a new Claude chat.
// The request asks Claude to overwrite this same artifact: saves live in the artifact's own database, so a new
// artifact would start with none of them.

function updateRequestText(link) {
  return [
    '아래 GitHub 저장소의 최신 릴리스로 내 아티팩트를 업데이트해 줘. 새 아티팩트를 만들지 말고 같은 링크에 덮어써서 저장 데이터를 유지해 줘.',
    `저장소: ${REPO_URL}`,
    `지금 버전: v${APP_VERSION}`,
    `내 아티팩트: ${link || '(여기에 내 아티팩트 링크)'}`,
  ].join('\n');
}

export function openUpdateSheet() {
  openSheet(`<h3>업데이트 확인</h3>
    <p class="upd-p">지금 버전은 <b>v${esc(APP_VERSION)}</b>이에요. 새 버전과 바뀐 점은 <a href="${RELEASES_URL}" target="_blank" rel="noopener">GitHub 릴리스 페이지</a>에서 볼 수 있어요.</p>
    <p class="upd-p muted">새 버전으로 바꾸려면 아래 문구를 복사해서 Claude 새 대화에 붙여 넣으세요. 이 아티팩트의 링크가 함께 가야 같은 링크에 덮어써지고 저장 데이터가 그대로 남아요.</p>
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
