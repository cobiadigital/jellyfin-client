/**
 * Demo mode media helpers. Kept tiny and free of app imports because the player calls
 * them synchronously (iOS blocks audio.play() after an await). The library data itself
 * lives in demo-api.ts and is loaded lazily.
 */

export const DEMO_PREFIX = 'demo-';

/** Track ids look like `demo-t-123`; the number drives the tone and the length. */
const trackNumber = (id: string) => Number(id.replace(/^\D+-/, '').replace(/\D/g, '')) || 0;

/** Each demo track is a short tone, and its RunTimeTicks matches the audio exactly. */
export function demoTrackSeconds(id: string) {
  return 12 + (trackNumber(id) % 5) * 4; // 12 to 28 seconds
}

const tones = new Map<string, string>();

/** A blob URL for a generated WAV, cached per track so repeat plays are instant. */
export function demoToneUrl(id: string) {
  let url = tones.get(id);
  if (!url) {
    url = URL.createObjectURL(new Blob([wav(id)], { type: 'audio/wav' }));
    tones.set(id, url);
  }
  return url;
}

const RATE = 11025;
// A pentatonic scale keeps the generated tunes pleasant whatever the track number.
const SCALE = [0, 2, 4, 7, 9, 12];

function wav(id: string) {
  const n = trackNumber(id);
  const seconds = demoTrackSeconds(id);
  const samples = RATE * seconds;
  const root = 196 * 2 ** (((n * 5) % 12) / 12);
  const buf = new DataView(new ArrayBuffer(44 + samples * 2));
  const str = (o: number, t: string) => [...t].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  buf.setUint32(4, 36 + samples * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true);
  buf.setUint16(22, 1, true);
  buf.setUint32(24, RATE, true);
  buf.setUint32(28, RATE * 2, true);
  buf.setUint16(32, 2, true);
  buf.setUint16(34, 16, true);
  str(36, 'data');
  buf.setUint32(40, samples * 2, true);

  const noteLen = Math.round(RATE * 0.4);
  for (let i = 0; i < samples; i++) {
    const note = Math.floor(i / noteLen);
    const step = SCALE[(note * 3 + n * 7 + (note >> 2)) % SCALE.length];
    const f = root * 2 ** (step / 12);
    const t = (i % noteLen) / RATE;
    const env = Math.min(1, (i % noteLen) / 300) * Math.exp(-t * 4); // click-free attack, plucked decay
    const s = Math.sin(2 * Math.PI * f * (i / RATE)) * 0.7 + Math.sin(4 * Math.PI * f * (i / RATE)) * 0.15;
    buf.setInt16(44 + i * 2, Math.round(s * env * 0.5 * 32767), true);
  }
  return buf.buffer;
}

/** A gradient tile as a data URI, so demo mode makes no image requests. */
export function demoArtUrl(id: string | undefined) {
  if (!id) return null;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const hue = (h >>> 0) % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 60% 45%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 50) % 360} 65% 25%)"/></linearGradient></defs>` +
    `<rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="50" r="22" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3"/>` +
    `<circle cx="50" cy="50" r="4" fill="#fff" fill-opacity=".5"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
