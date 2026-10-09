/** Minimal hash router: #/album/123 -> { name: 'album', id: '123' }. */
export interface Route {
  name: string;
  id?: string;
}

function parse(): Route {
  const [name = 'albums', id] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'albums', id: id ? decodeURIComponent(id) : undefined };
}

export const route = $state<Route>(parse());

window.addEventListener('hashchange', () => {
  Object.assign(route, { id: undefined }, parse());
  window.scrollTo(0, 0);
});

export const href = (name: string, id?: string) => `#/${name}${id ? `/${encodeURIComponent(id)}` : ''}`;
