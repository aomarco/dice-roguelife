/* ============ boot ============ */
import { host } from './host.js';
import { $, esc, noteIgnored, nowIso, toast } from './util.js';
import { dget, loadWhitelist, memDB, platform, thaw, userCol } from './db.js';
import { app } from './app.js';
import { settingsLoaded } from './settings.js';
import { applyDiscreet } from './shell.js';
import { loadImages, loadSets, migrateLegacy } from './library.js';
import { startNewLifeForm } from './new-life.js';
import { openSave } from './persistence.js';
import { renderLog, syncInputHint } from './log.js';
import { loadPromptConfig } from './prompt.js';

export async function boot() {
  setTimeout(() => {
    if (!app.state && $('#log').textContent.includes('불러오는 중')) bootTrouble('불러오기가 너무 오래 걸려요. ');
  }, 12000);
  renderLog();
  try {
    await bootInner();
  } catch (e) {
    console.error(e);
    bootTrouble(`시작 중 오류가 났어요: ${esc((e && (e.code || e.message)) || e)}<br>`);
  }
}
function bootTrouble(lead) {
  // the start went wrong or is taking too long: reload, or leave whatever was loading and start a new game
  $('#log').innerHTML =
    `<div class="notice">${lead}<button class="btn boot-action" data-boot="reload">다시 시도</button> <button class="btn ghost boot-action" data-boot="new">새 게임으로</button></div>`;
  $('#log [data-boot="reload"]').onclick = () => location.reload();
  $('#log [data-boot="new"]').onclick = () => {
    app.state = null;
    app.turns = [];
    startNewLifeForm();
  };
}
// one of the host's capabilities (host.js), or null when this page does not have it
export let useCapability = function useCapability(n) {
  return host().connect(n);
};
var sampleTries = 0;
export async function ensureSample() {
  if (platform.sample) return platform.sample;
  sampleTries++;
  toast('Claude 연결 중...', 2000);
  platform.sample = await useCapability('sample');
  if (platform.sample) {
    try {
      platform.limits = await platform.sample.limits();
    } catch (e) {
      noteIgnored('boot: sample limits', e);
    }
    $('#noSample').classList.add('hidden');
    if (app.state && !app.state.dead) {
      $('#composer').classList.remove('hidden');
      syncInputHint();
    }
    renderLog('keep');
  } else {
    const n = $('#noSample');
    n.innerHTML =
      '이 화면에서는 Claude를 호출할 수 없어요. Claude에 로그인한 상태인지 확인하고 다시 시도해 주세요. <button class="btn inline-action" id="retrySample">Claude 연결 다시 시도</button>' +
      (sampleTries >= 2
        ? '<br><span class="boot-note">계속 안 되면 ⚙ → 진단 내용을 앱 주인에게 보내 주세요.</span>'
        : '');
    n.classList.remove('hidden');
    $('#retrySample').onclick = ensureSample;
  }
  return platform.sample;
}
async function bootInner() {
  const [db, sample, assets, user] = await Promise.all([
    useCapability('db'),
    useCapability('sample'),
    useCapability('assets'),
    useCapability('user'),
  ]);
  platform.sample = sample;
  platform.assets = assets;
  platform.user = user;
  if (db) {
    platform.db = db;
  } else {
    platform.db = memDB();
    platform.memMode = true;
  }
  if (user) {
    try {
      const id = await user.id();
      if (id) {
        platform.userPath = `data/users/${id}`;
        platform.userId = id;
      }
    } catch (e) {
      noteIgnored('boot: user id (staying on the local path)', e);
    }
  }
  platform.shared = platform.db; // shared root collections (images, sets, hall) always go through the platform db
  if (db) {
    try {
      await platform.db.doc(`${platform.userPath}/probe`).set({ t: nowIso() });
    } catch (e) {
      platform.db = memDB('dr-db-' + platform.userId);
      platform.localMode = true;
      toast('읽기 권한이라 진행 상황은 이 기기에만 저장돼요', 5000);
    }
  }
  if (!platform.sample) {
    const n = $('#noSample');
    n.innerHTML =
      'Claude 연결을 아직 못 받았어요. <button class="btn inline-action" id="retrySample">Claude 연결 다시 시도</button>';
    n.classList.remove('hidden');
    $('#retrySample').onclick = ensureSample;
    setTimeout(() => {
      if (!platform.sample) ensureSample();
    }, 1500);
  }
  if (platform.memMode) toast('저장소 없이 실행 중: 새로고침하면 사라져요', 4000);
  if (platform.sample) {
    try {
      platform.limits = await platform.sample.limits();
    } catch (e) {
      noteIgnored('boot: sample limits', e);
    }
  }
  await migrateLegacy();
  app.settings = Object.assign(app.settings, (await dget('settings')) || {});
  settingsLoaded();
  applyDiscreet();
  await loadPromptConfig();
  await loadWhitelist();
  await loadImages();
  await loadSets();
  await loadSaves();
  const last = (app.settings.lastSave && app.saves.find(s => s.id === app.settings.lastSave)) || app.saves[0];
  if (last) await openSave(last.id);
  else startNewLifeForm();
}

export async function loadSaves() {
  try {
    const q = await userCol('saves/items').orderBy('updatedAt', 'desc').limit(100).get();
    app.saves = q.docs.map(d => thaw(d.data()));
  } catch (e) {
    app.saves = [];
  }
}

// the functions above that tests may replace (window.DR.mock): each setter swaps the binding every caller uses
export const mocks = {
  useCapability: f => (useCapability = f),
};
