/**
 * TV remote buttons: Back, Menu, Play/Pause and friends. Back walks a stack of "close me"
 * handlers (sheets, Now Playing), then the view history, and on the home screen asks to quit.
 * On Android the media keys and Menu arrive as a `remote` window event from MainActivity;
 * in a browser they come in as ordinary keys, which is also how this is tested.
 */
import { route, href } from './router.svelte';
import { current, next, pause, play, player, previous, seek, toggle } from './player.svelte';
import { isTV } from './tv';
import type { Item } from './jellyfin';

export const remote = $state<{ quit: boolean; albumMenu: Item | null }>({ quit: false, albumMenu: null });

const homeRoutes = ['albums', 'artists', 'playlists', 'genres'];
const stack: (() => void)[] = [];

/** Registers something Back should close first (latest wins). Returns the unregister function. */
export function pushBack(fn: () => void) {
  stack.push(fn);
  return () => {
    const i = stack.lastIndexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Closes the topmost sheet or overlay. Returns false when there was nothing to close. */
export function closeTop() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}

export function goBack() {
  if (closeTop()) return;
  if (homeRoutes.includes(route.name)) {
    remote.quit = true;
    return;
  }
  const before = location.hash;
  history.back();
  // Nothing earlier to go back to (first screen after launch): land on the home screen instead.
  setTimeout(() => {
    if (location.hash === before) location.hash = href('albums');
  }, 250);
}

export async function exitApp() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { App } = await import('@capacitor/app');
      await App.exitApp();
      return;
    }
  } catch {}
  window.close();
}

export function openAlbumMenu(item: Item) {
  remote.albumMenu = item;
}

/** Svelte action: runs `handler` when the Menu button is pressed with focus on (or inside) this element. */
export function remoteMenu(node: HTMLElement, handler: () => void) {
  const on = (e: Event) => {
    e.stopPropagation();
    handler();
  };
  node.addEventListener('remotemenu', on);
  return {
    update(next: () => void) {
      handler = next;
    },
    destroy() {
      node.removeEventListener('remotemenu', on);
    },
  };
}

const SEEK_STEP = 10;

function act(action: string) {
  switch (action) {
    case 'play-pause':
      if (current()) toggle();
      break;
    case 'play':
      if (current() && !player.playing) play();
      break;
    case 'pause':
      if (player.playing) pause();
      break;
    case 'next':
      next();
      break;
    case 'previous':
      previous();
      break;
    case 'fast-forward':
      if (current()) seek(Math.min(player.duration || Infinity, player.time + SEEK_STEP));
      break;
    case 'rewind':
      if (current()) seek(Math.max(0, player.time - SEEK_STEP));
      break;
    case 'menu':
      document.activeElement?.dispatchEvent(new CustomEvent('remotemenu', { bubbles: true, cancelable: true }));
      break;
    case 'back':
      goBack();
      break;
  }
}

const keyActions: Record<string, string> = {
  MediaPlayPause: 'play-pause',
  MediaPlay: 'play',
  MediaPause: 'pause',
  MediaTrackNext: 'next',
  MediaTrackPrevious: 'previous',
  MediaFastForward: 'fast-forward',
  MediaRewind: 'rewind',
  ContextMenu: 'menu',
  GoBack: 'back',
  BrowserBack: 'back',
};

function onKeyDown(e: KeyboardEvent) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  // Escape closes the top sheet everywhere; in TV mode it behaves like the Back button.
  if (e.key === 'Escape') {
    if (isTV ? (goBack(), true) : closeTop()) e.preventDefault();
    return;
  }
  if (!isTV) return;
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  // Some Android WebViews report Menu as keyCode 82 or 93 rather than "ContextMenu".
  const action = keyActions[e.key] ?? (e.keyCode === 82 || e.keyCode === 93 ? 'menu' : e.key === 'Backspace' && !typing ? 'back' : undefined);
  if (!action) return;
  e.preventDefault();
  act(action);
}

export async function initRemote() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('remote', (e) => act((e as CustomEvent<string>).detail));
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const { App } = await import('@capacitor/app');
    // Having a listener means the app, not Android, decides what Back does.
    await App.addListener('backButton', () => goBack());
  } catch {}
}
