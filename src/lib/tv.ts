/**
 * TV mode: remote-control layout for Fire TV / Android TV. Detected from the user agent,
 * or forced with ?tv=1 / ?tv=0 (remembered) or the "TV layout" setting. Sets data-tv on <html>.
 */
const KEY = 'jf.tv';

export type TvPref = 'auto' | 'on' | 'off';

export function getTvPref(): TvPref {
  try {
    const q = new URLSearchParams(location.search).get('tv');
    if (q === '1' || q === '0') localStorage.setItem(KEY, q);
    const v = localStorage.getItem(KEY);
    return v === '1' ? 'on' : v === '0' ? 'off' : 'auto';
  } catch {
    return 'auto';
  }
}

export function setTvPref(pref: TvPref) {
  try {
    if (pref === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref === 'on' ? '1' : '0');
  } catch {}
}

function detect(): boolean {
  const pref = getTvPref();
  if (pref !== 'auto') return pref === 'on';
  return /\bAFT[A-Z0-9]+\b|Android TV|GoogleTV/i.test(navigator.userAgent);
}

export const isTV = detect();

if (isTV) document.documentElement.setAttribute('data-tv', '');
