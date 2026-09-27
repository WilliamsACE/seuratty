/* The floating tooltip shared by the panels' "i" icons and the tools:
   a single one, so it is never clipped or covered. */
let toolTip = null;
export function initTooltips(){
  toolTip = document.createElement('div'); toolTip.id = 'toolTip'; toolTip.hidden = true; toolTip.setAttribute('role', 'tooltip'); document.body.appendChild(toolTip);
  return toolTip;
}
export const hideTip = () => { toolTip.hidden = true; };
export function showTip(el, text, side){
  toolTip.textContent = text; toolTip.hidden = false;
  const r = el.getBoundingClientRect(), w = toolTip.offsetWidth, h = toolTip.offsetHeight;
  let x = side === 'right' ? r.right + 10 : r.left - w - 10;
  if (x < 8 || x + w > innerWidth - 8) x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
  toolTip.style.left = x + 'px'; toolTip.style.top = Math.max(8, Math.min(r.top - 6, innerHeight - h - 8)) + 'px';
}
/* The panels' "i" icons use the same floating tooltip (never clipped or covered) */
export function initInfoTooltips(){
  document.querySelectorAll('.info').forEach(el => {
    const tip = el.querySelector('.tip'); if (!tip) return; const text = tip.textContent;
    const show = () => showTip(el, text, el.getBoundingClientRect().left > innerWidth / 2 ? 'left' : 'right');
    el.addEventListener('mouseenter', show); el.addEventListener('focus', show);
    el.addEventListener('mouseleave', () => { toolTip.hidden = true; }); el.addEventListener('blur', () => { toolTip.hidden = true; });
    el.addEventListener('click', e => e.preventDefault());
  });
}
