import type { GestureSnapshot, Landmark } from './gestures';

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const INDEX_CHAIN = [5, 6, 7, 8];
const THUMB_CHAIN = [1, 2, 3, 4];

const W = 256;
const H = 144;

/**
 * Top-right debug window: mirrored camera feed with hand skeleton overlay,
 * index/thumb highlighting and live hammer telemetry (value + velocity).
 * Toggle with the D key.
 */
export class DebugPane {
  private root = document.createElement('div');
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
  private video = document.getElementById('cam') as HTMLVideoElement;
  private aimChip = document.createElement('span');
  private hammerChip = document.createElement('span');
  private hVal = document.createElement('span');
  private vVal = document.createElement('span');
  autoVisible = false;
  private userHidden = false;

  constructor() {
    this.root.id = 'debug-pane';

    this.canvas.width = W;
    this.canvas.height = H;
    this.root.appendChild(this.canvas);

    const chips = document.createElement('div');
    chips.className = 'debug-chips';
    this.aimChip.className = 'chipx';
    this.aimChip.textContent = 'AIM';
    this.hammerChip.className = 'chipx';
    this.hammerChip.textContent = 'HAMMER';
    chips.append(this.aimChip, this.hammerChip);
    this.root.appendChild(chips);

    const vals = document.createElement('div');
    vals.className = 'debug-vals';
    this.hVal.className = 'debug-val-item';
    this.hVal.textContent = 'H 0.00';
    this.vVal.className = 'debug-val-item';
    this.vVal.textContent = 'V 0.00';
    vals.append(this.hVal, this.vVal);
    this.root.appendChild(vals);

    document.body.appendChild(this.root);

    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'd' && !e.repeat) {
        this.userHidden = !this.userHidden;
        this.refresh();
      }
    });

    this.refresh();
  }

  /** Track whether hand tracking is even running; D key still wins. */
  setVisible(v: boolean): void {
    this.autoVisible = v;
    this.refresh();
  }

  private refresh(): void {
    this.root.classList.toggle('hidden', this.userHidden || !this.autoVisible);
  }

  update(lm: Landmark[] | null, snap: GestureSnapshot | null): void {
    const ctx = this.ctx;

    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, W, H);
    if (this.video.readyState >= 2) {
      try {
        ctx.drawImage(this.video, 0, 0, W, H);
      } catch {
        /* frame not ready */
      }
    }

    if (!lm || !snap) {
      this.aimChip.classList.remove('on');
      this.hammerChip.classList.remove('on');
      this.hVal.textContent = 'H —';
      this.vVal.textContent = 'V —';
      return;
    }

    const px = (i: number): number => (1 - lm[i].x) * W;
    const py = (i: number): number => lm[i].y * H;

    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(32, 29, 24, 0.4)';
    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) {
      if (INDEX_CHAIN.includes(a) && INDEX_CHAIN.includes(b)) continue;
      if (THUMB_CHAIN.includes(a) && THUMB_CHAIN.includes(b)) continue;
      ctx.moveTo(px(a), py(a));
      ctx.lineTo(px(b), py(b));
    }
    ctx.stroke();

    // thumb chain — coral highlight when the hammer is cocked
    ctx.strokeStyle = snap.cocked ? '#ff5050' : 'rgba(32, 29, 24, 0.55)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(px(1), py(1));
    ctx.lineTo(px(2), py(2));
    ctx.lineTo(px(3), py(3));
    ctx.lineTo(px(4), py(4));
    ctx.stroke();

    // index chain — green highlight when aiming
    ctx.strokeStyle = snap.aiming ? '#2e9e6b' : 'rgba(32, 29, 24, 0.55)';
    ctx.beginPath();
    ctx.moveTo(px(5), py(5));
    ctx.lineTo(px(6), py(6));
    ctx.lineTo(px(7), py(7));
    ctx.lineTo(px(8), py(8));
    ctx.stroke();

    // key landmarks
    for (const i of [4, 8]) {
      ctx.beginPath();
      ctx.arc(px(i), py(i), i === 8 ? 4 : 3.4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = i === 8 ? (snap.aiming ? '#2e9e6b' : 'rgba(32,29,24,0.6)') : snap.cocked ? '#ff5050' : 'rgba(32,29,24,0.6)';
      ctx.stroke();
    }

    this.aimChip.classList.toggle('on', snap.aiming);
    this.hammerChip.classList.toggle('on', snap.cocked);
    this.hVal.textContent = `H ${snap.upness.toFixed(2)}`;
    this.vVal.textContent = `V ${snap.hVel.toFixed(2)}`;
  }
}
