<script lang="ts">
  import { analyser, player, releaseAnalyser } from '../lib/player.svelte';

  let { mode }: { mode: 'spectrum' | 'scope' } = $props();

  // Winamp's classic vis is 76px wide: 19 bars 3px wide with a 1px gap. Rows grow to
  // fill the available height so the pixels stay roughly square.
  const W = 76;
  const BARS = 19;
  const BAR_FALL = 2.5; // fraction of height per second
  const PEAK_FALL = 0.6;

  // Winamp's default viscolor.txt: spectrum top to bottom, then scope shades.
  const SPECTRUM = [
    [239, 49, 16], [206, 41, 16], [214, 90, 0], [214, 102, 0], [214, 115, 0], [198, 123, 8], [222, 165, 24], [214, 181, 33],
    [189, 222, 41], [148, 222, 33], [41, 206, 16], [50, 190, 16], [57, 181, 16], [49, 156, 8], [41, 148, 0], [24, 132, 8],
  ];
  const SCOPE = [[255, 255, 255], [214, 214, 222], [181, 189, 189], [160, 170, 175], [148, 156, 165]];
  const PEAK = [150, 150, 150];
  const DOT = [24, 33, 41];

  let canvas: HTMLCanvasElement;
  let rows = $state(16);
  let node: AnalyserNode | null = null;
  let freq: Uint8Array<ArrayBuffer> | null = null;
  let wave: Uint8Array<ArrayBuffer> | null = null;
  let ranges: [number, number][] = [];
  const levels = new Float32Array(BARS);
  const peaks = new Float32Array(BARS);
  let frame = 0;
  let last = 0;

  function connect() {
    if (node) return;
    node = analyser();
    if (!node) return;
    freq = new Uint8Array(node.frequencyBinCount);
    wave = new Uint8Array(node.fftSize);
    // Log-spaced bands from ~40 Hz to ~16 kHz.
    const hz = node.context.sampleRate / node.fftSize;
    const bins = node.frequencyBinCount;
    ranges = Array.from({ length: BARS }, (_, i) => {
      const a = Math.min(Math.floor((40 * Math.pow(400, i / BARS)) / hz), bins - 1);
      return [a, Math.max(a + 1, Math.ceil((40 * Math.pow(400, (i + 1) / BARS)) / hz))];
    });
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
    const H = rows;
    const img = new ImageData(W, H);
    const px = (x: number, y: number, c: number[]) => {
      const o = (y * W + x) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
    };
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) px(x, y, DOT);

    let busy = false;
    if (mode === 'spectrum') {
      const live = node && freq && player.playing;
      if (live) node!.getByteFrequencyData(freq!);
      for (let b = 0; b < BARS; b++) {
        let v = 0;
        if (live) for (let k = ranges[b][0]; k < ranges[b][1]; k++) v = Math.max(v, freq![k]);
        levels[b] = Math.max(v / 255, levels[b] - BAR_FALL * dt);
        peaks[b] = Math.max(levels[b], peaks[b] - PEAK_FALL * dt);
        if (peaks[b] > 0) busy = true;
        const top = Math.round(levels[b] * H);
        const p = Math.round(peaks[b] * H);
        for (let x = b * 4; x < b * 4 + 3; x++) {
          for (let y = H - top; y < H; y++) px(x, y, SPECTRUM[Math.floor((y * SPECTRUM.length) / H)]);
          if (p > 0) px(x, H - p, PEAK);
        }
      }
    } else if (node && wave && player.playing) {
      // Winamp's scope draws ~576 samples across the window.
      node.getByteTimeDomainData(wave);
      busy = true;
      const mid = (H - 1) / 2;
      let prev = -1;
      for (let x = 0; x < W; x++) {
        const v = wave[Math.floor((x * 576) / W)];
        const y = Math.max(0, Math.min(H - 1, Math.round(((255 - v) / 255) * (H - 1))));
        const from = prev < 0 ? y : Math.min(prev, y);
        const to = prev < 0 ? y : Math.max(prev, y);
        for (let yy = from; yy <= to; yy++) px(x, yy, SCOPE[Math.min(4, Math.floor((Math.abs(yy - mid) / (mid + 1)) * 5))]);
        prev = y;
      }
    }
    canvas.getContext('2d')?.putImageData(img, 0, 0);

    // Keep drawing while there's audio to show or bars still falling; otherwise rest.
    if ((player.playing && node) || busy) frame = requestAnimationFrame(tick);
  }

  // Let the player stop feeding the analyser once this is off screen.
  $effect(() => releaseAnalyser);

  $effect(() => {
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0) rows = Math.max(16, Math.min(240, Math.round((W * height) / width)));
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  });

  $effect(() => {
    // Redraw on playback, track, mode or size changes.
    player.playing;
    player.index;
    mode;
    rows;
    start();
    return () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
  });
</script>

<canvas bind:this={canvas} width={W} height={rows} aria-label={mode === 'spectrum' ? 'Spectrum analyzer' : 'Oscilloscope'}></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    background: #000;
    border-radius: 8px;
    image-rendering: pixelated;
  }
</style>
