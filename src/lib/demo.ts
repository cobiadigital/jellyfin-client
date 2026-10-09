import { auth, setSession, type Session } from './session.svelte';
import { clearQueue } from './player.svelte';

/** A session with no server and no token: requests are answered by demo-api.ts. */
const demoSession: Session = { server: '', serverName: 'Demo library', userId: 'demo-user', userName: 'Demo', token: '', demo: true };

export function enterDemo() {
  setSession(demoSession);
  // The demo flag is set first, so clearing the queue doesn't write to the real saved queue.
  clearQueue();
  location.hash = '';
}

export function exitDemo() {
  clearQueue(); // still in demo, so nothing is persisted
  setSession(null);
  location.hash = '';
}

/**
 * `#/demo` opens the demo straight away. If a real sign-in exists, ask first, because
 * starting the demo replaces it and the user would need to sign in again.
 */
export function handleDemoLink() {
  const real = auth.session && !auth.session.demo;
  if (real && !confirm('Open the demo library? You will be signed out of your server and need to sign in again afterwards.')) {
    location.hash = '';
    return;
  }
  enterDemo();
}
