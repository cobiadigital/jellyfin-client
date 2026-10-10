import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { isTV } from './lib/tv';

mount(App, { target: document.getElementById('app')! });

if (isTV) import('./lib/tvnav').then((m) => m.initTvNav());
import('./lib/remote.svelte').then((m) => m.initRemote());

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
