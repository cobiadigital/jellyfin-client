/**
 * D-pad navigation for TV mode. Arrow keys move focus to the nearest focusable element in
 * that direction; Enter activates it (native for buttons and links). Sheets and Now Playing
 * trap focus inside, and focus returns to the opener when they close.
 */
type Dir = 'left' | 'right' | 'up' | 'down';

const KEYS: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The part of the page that currently owns focus: the topmost sheet, else Now Playing, else everything. */
function scope(): ParentNode {
  const sheets = document.querySelectorAll('.scrim');
  if (sheets.length) return sheets[sheets.length - 1];
  return document.querySelector('.np') ?? document;
}

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none';
}

function focusables(root: ParentNode = scope()): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
}

/** Lower is better; null means the candidate isn't in that direction. */
function score(a: DOMRect, b: DOMRect, dir: Dir): number | null {
  const acx = a.left + a.width / 2;
  const acy = a.top + a.height / 2;
  const bcx = b.left + b.width / 2;
  const bcy = b.top + b.height / 2;
  let gap: number; // distance along the direction of travel
  let off: number; // distance sideways between centers
  let overlap: number; // shared extent across the direction of travel
  if (dir === 'right' || dir === 'left') {
    if (dir === 'right' ? bcx <= acx + 1 : bcx >= acx - 1) return null;
    gap = Math.max(0, dir === 'right' ? b.left - a.right : a.left - b.right);
    off = Math.abs(bcy - acy);
    overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  } else {
    if (dir === 'down' ? bcy <= acy + 1 : bcy >= acy - 1) return null;
    gap = Math.max(0, dir === 'down' ? b.top - a.bottom : a.top - b.bottom);
    off = Math.abs(bcx - acx);
    overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  }
  // Prefer what's straight ahead over what's merely nearby.
  return gap + off * (overlap > 0 ? 0.4 : 2.5);
}

function pick(from: HTMLElement, dir: Dir): HTMLElement | null {
  const a = from.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of focusables()) {
    if (el === from || el.contains(from) || from.contains(el)) continue;
    const s = score(a, el.getBoundingClientRect(), dir);
    if (s !== null && s < bestScore) {
      best = el;
      bestScore = s;
    }
  }
  return best;
}

function focusEl(el: HTMLElement) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/**
 * Where focus starts: an explicit data-autofocus, else the first item in the page content
 * (not the rail). With `railOk`, an empty page falls back to the rail so a key press always lands somewhere.
 */
function initial(railOk = true): HTMLElement | null {
  const root = scope();
  const marked = root.querySelector<HTMLElement>('[data-autofocus]');
  if (marked && visible(marked)) return marked;
  const content = root === document ? document.querySelector<HTMLElement>('.page, main') : root;
  return focusables(content ?? root)[0] ?? (railOk ? focusables(root)[0] : null) ?? null;
}

const isLost = () => !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected;

function onKeyDown(e: KeyboardEvent) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const active = document.activeElement as HTMLElement | null;

  // Select on elements that aren't natively clickable (cards with tabindex and the like).
  if ((e.key === 'Enter' || e.keyCode === 23) && active && !active.matches('a, button, input, select, textarea, summary')) {
    active.click();
    return;
  }

  const dir = KEYS[e.key];
  if (!dir) return;

  if (isLost() || !scope().contains(active)) {
    const first = initial();
    if (first) {
      e.preventDefault();
      focusEl(first);
    }
    return;
  }

  // Sliders and text fields keep left/right for themselves.
  if (active instanceof HTMLInputElement && (dir === 'left' || dir === 'right')) {
    const type = active.type;
    if (type === 'range' || ['text', 'search', 'url', 'email', 'password', 'tel', ''].includes(type)) return;
  }

  const next = pick(active!, dir);
  if (next) {
    e.preventDefault();
    focusEl(next);
  }
  // Nothing further that way: up/down fall through so the page can still scroll.
}

let opener: HTMLElement | null = null;
let lastScope: ParentNode | null = null;

/** Moves focus into a sheet when it opens and back out when it closes. */
function trackScope() {
  const now = scope();
  if (now === lastScope) return;
  const before = lastScope;
  lastScope = now;
  if (now !== document && before === document) {
    opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  }
  if (now !== document) {
    requestAnimationFrame(() => {
      if (scope() === now && !now.contains(document.activeElement)) {
        const first = initial();
        if (first) focusEl(first);
      }
    });
  } else if (opener && opener.isConnected && isLost()) {
    focusEl(opener);
    opener = null;
  }
}

/** After a view change, put focus on the new content if the old focused element disappeared. */
function onRouteChange() {
  for (const delay of [120, 500, 1200]) {
    setTimeout(() => {
      if (!isLost() || scope() !== document) return;
      const first = initial(false); // content may still be loading: don't settle for the rail
      if (first) focusEl(first);
    }, delay);
  }
}

export function initTvNav() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('hashchange', onRouteChange);
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      trackScope();
    });
  }).observe(document.body, { childList: true, subtree: true });
  onRouteChange();
}
