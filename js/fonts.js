/* FIGlet fonts: they used to be a classic script that set window.FIGFONTS; now they come
   from data/fonts.json, fetched at boot. new URL(..., import.meta.url) resolves the path
   against this module, so it also works from a GitHub Pages subfolder.
   FONTS keeps its identity: it is filled in place, so every module that imported it sees
   the fonts, and loading an .flf keeps adding to the same object. */
export const FONTS = {};
export async function loadFonts(){
  const res = await fetch(new URL('../data/fonts.json', import.meta.url));
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
  Object.assign(FONTS, await res.json());
  return FONTS;
}
