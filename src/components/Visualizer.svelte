<script lang="ts">
  import { analyser, player } from '../lib/player.svelte';
  import { settings } from '../lib/session.svelte';

  // Winamp's classic vis window: 76x16 pixels, 19 bars 3px wide with a 1px gap.
  const W = 76;
  const H = 16;
  const BARS = 19;
  const BAR_FALL = 40; // px/s
  const PEAK_FALL = 10; // px/s

  // Winamp's default viscolor.txt: spectrum rows top to bottom, then scope shades.
  const SPECTRUM = [
    [239, 49, 16], [206, 41, 16], [214, 90, 0], [214, 102, 0], [214, 115, 0], [198, 123, 8], [222, 165, 24], [214, 181, 33],
    [189, 222, 41], [148, 222, 33], [41, 206, 16], [50, 190, 16], [57, 181, 16], [49, 156, 8], [41, 148, 0], [24, 132, 8],
  ];
  const SCOPE = [[255, 255, 255], [214, 214, 222], [181, 189, 189], [160, 170, 175], [148, 156, 165]];
  const PEAK = [150, 150, 150];
  const DOT = [24, 33, 41];

  let canvas: HTMLCanvasElement;
  let node: AnalyserNode | null = null;
  let freq: Uint8Array<ArrayBuffer> | null = null;
  let wave: Uint8Array<ArrayBuffer> | null = null;
  let ranges: [number, number][] = [];
  const levels = new Float32Array(BARS);
  const peaks = new Float32Array(BARS);
  let frame = 0;
  let last = 0;

  function connect(gesture = false) {
    if (node) return node;
    node = analyser(gesture);
    if (node) {
      freq = new Uint8Array(node.frequencyBinCount);
      wave = new Uint8Array(node.fftSize);
      // Log-spaced bands from ~40 Hz to ~16 kHz.
      const hz = node.context.sampleRate / node.fftSize;
      ranges = Array.from({ length: BARS }, (_, i) => {
        const lo = 40 * Math.pow(400, i / BARS);
        const hi = 40 * Math.pow(400, (i + 1) / BARS);
        const a = Math.min(Math.floor(lo / hz), node!.frequencyBinCount - 1);
        return [a, Math.max(a + 1, Math.ceil(hi / hz))];
      });
    }
    return node;
  }

  function start() {
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  function tick(now: number) {
    frame = 0;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    connect();
    const img = new ImageData(W, H);
    const px = (x: number, y: number, c: number[]) => {
      const o = (y * W + x) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
    };
    for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = 255;
    for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) px(x, y, DOT);

    let busy = false;
    if (settings.visualizerMode === 'spectrum') {
      if (node && freq && player.playing) node.getByteFrequencyData(freq);
      for (let b = 0; b < BARS; b++) {
        let v = 0;
        if (freq && player.playing) for (let k = ranges[b][0]; k < ranges[b][1]; k++) v = Math.max(v, freq[k]);
        levels[b] = Math.max((v / 255) * H, levels[b] - BAR_FALL * dt);
        peaks[b] = Math.max(levels[b], peaks[b] - PEAK_FALL * dt);
        if (peaks[b] > 0) busy = true;
        const top = Math.round(levels[b]);
        for (let x = b * 4; x < b * 4 + 3; x++) {
          for (let y = H - top; y < H; y++) px(x, y, SPECTRUM[y]);
          const p = Math.round(peaks[b]);
          if (p > 0) px(x, H - p, PEAK);
        }
      }
    } else if (node && wave && player.playing) {
      // Winamp's scope draws ~576 samples across the window.
      node.getByteTimeDomainData(wave);
      busy = true;
      let prev = -1;
      for (let x = 0; x < W; x++) {
        const v = wave[Math.floor((x * 576) / W)];
        const y = Math.max(0, Math.min(H - 1, Math.round(((255 - v) / 255) * (H - 1))));
        const from = prev < 0 ? y : Math.min(prev, y);
        const to = prev < 0 ? y : Math.max(prev, y);
        for (let yy = from; yy <= to; yy++) px(x, yy, SCOPE[Math.min(4, Math.floor(Math.abs(yy - H / 2) / 2))]);
        prev = y;
      }
    }
    canvas.getContext('2d')?.putImageData(img, 0, 0);

    // Keep drawing while there's audio to show or bars still falling; otherwise rest.
    if ((player.playing && node) || busy) frame = requestAnimationFrame(tick);
  }

  function cycle() {
    connect(true);
    settings.visualizerMode = settings.visualizerMode === 'spectrum' ? 'scope' : 'spectrum';
    start();
  }

  $effect(() => {
    // Redraw when playback starts or the track changes (a new source may be readable).
    player.playing;
    player.index;
    start();
    return () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
  });
</script>

<svelte:window onclickcapture={() => !node && connect(true) && start()} />

<button
  class="vis"
  onclick={cycle}
  aria-label="Visualizer: {settings.visualizerMode === 'spectrum' ? 'spectrum analyzer' : 'oscilloscope'}. Tap to switch."
>
  <canvas bind:this={canvas} width={W} height={H}></canvas>
</button>

<style>
  .vis {
    display: block;
    width: min(100%, 50dvh);
    margin: 0 auto;
    padding: 3px;
    background: #000;
    border: 1px solid #3a4150;
    border-radius: 3px;
    min-height: 44px;
  }
  canvas {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 76 / 16;
    image-rendering: pixelated;
  }
</style>
