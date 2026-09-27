import { $ } from '../core/util.js';
import { store, MOB_KEY } from '../io/save.js';

/* ---------- Small screen notice ---------- */
export function initSmallScreen(){
  const screenIsSmall = Math.min(screen.width, screen.height) <= 640;   // the real device resolution, not the window size
  if (screenIsSmall && store.get(MOB_KEY) !== '1'){
    $('#mob').hidden = false;
    $('#mobOk').addEventListener('click', () => { $('#mob').hidden = true; store.set(MOB_KEY, '1'); });
  }
}
