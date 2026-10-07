/* ============ start ============ */
import { catchPageErrors } from './diag.js';
import { bindSheet } from './sheet.js';
import { bindDiscreetTaps, bindScrollFade, bindTabs, setTabViews } from './shell.js';
import { bindSound } from './sound.js';
import { boot } from './boot.js';
import { bindStatusStrip } from './status.js';
import { bindLogEvents, watchCaptureMask } from './log.js';
import { bindComposer } from './composer.js';
import { renderHall } from './hall.js';
import { renderSaves } from './saves-view.js';
import { renderMemory } from './memory-view.js';
import { renderImages } from './images-view.js';
import { exposeDebugHandle } from './debug.js';
import { browserLang, rememberedLang, setUiLang, translateStatic } from './i18n.js';

// The entry point. Every other module only declares things; the page starts here once all of them are loaded: the
// event wiring first, then the boot (boot.js), which loads the settings and the saves.
setUiLang(rememberedLang() || browserLang());
translateStatic();
exposeDebugHandle();
catchPageErrors();
setTabViews({ saves: renderSaves, memory: renderMemory, images: renderImages, hall: renderHall });
bindSound();
bindDiscreetTaps();
bindTabs();
bindStatusStrip();
bindSheet();
watchCaptureMask();
bindLogEvents();
bindScrollFade();
bindComposer();
boot();
