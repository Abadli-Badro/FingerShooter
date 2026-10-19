interface TitleOpts {
  highScore: number;
  onCamera: () => void;
  onMouse: () => void;
}

interface OverOpts {
  score: number;
  accuracy: number;
  bestStreak: number;
  highScore: number;
  isRecord: boolean;
  onRetry: () => void;
  onMenu: () => void;
}

/** Title / calibration / countdown / game-over overlays. */
export class Screens {
  private root = document.getElementById('overlay') as HTMLElement;
  private current: HTMLElement | null = null;
  private calibStatus: HTMLElement | null = null;
  private cancelHandler: (() => void) | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.current && this.cancelHandler) {
        this.cancelHandler();
      }
    });
  }

  private async swap(next: HTMLElement | null): Promise<void> {
    const prev = this.current;
    if (prev) {
      prev.classList.add('leaving');
      await sleep(340);
      prev.remove();
    }
    if (next) this.root.appendChild(next);
    this.current = next;
  }

  showTitle(opts: TitleOpts): void {
    this.cancelHandler = null;
    const el = screen(`
      <h1 class="logo">FINGER<span class="accent">SHOOTER</span></h1>
      <p class="tagline">A super-stylish webcam finger-gun range.<br/>Aim with your index finger. Snap your thumb to fire.</p>
      <div class="chip">BEST SCORE&nbsp;&nbsp;<strong>${opts.highScore}</strong></div>
      <div class="btn-row">
        <button class="btn primary" data-act="cam">PLAY WITH WEBCAM</button>
        <button class="btn ghost" data-act="mouse">PLAY WITH MOUSE</button>
      </div>
      <p class="footnote">Your camera feed never leaves your machine — hand tracking runs entirely in-browser.</p>
    `);
    el.querySelector('[data-act="cam"]')!.addEventListener('click', opts.onCamera);
    el.querySelector('[data-act="mouse"]')!.addEventListener('click', opts.onMouse);
    this.swap(el);
  }

  showLoading(message: string): void {
    const el = screen(`
      <div class="spin"></div>
      <p class="tagline">${message}</p>
    `);
    this.swap(el);
  }

  showError(message: string, onMouse: () => void): void {
    const el = screen(`
      <p class="calib-status">${message}</p>
      <div class="btn-row">
        <button class="btn ghost" data-act="mouse">PLAY WITH MOUSE</button>
      </div>
    `);
    el.querySelector('[data-act="mouse"]')!.addEventListener('click', () => {
      this.hide();
      onMouse();
    });
    this.swap(el);
  }

  /** Calibration: the debug pane (top-right) doubles as the camera preview. */
  showCalibrate(onCancel: () => void): void {
    const el = screen(`
      <p class="calib-status">MAKE A FINGER GUN — POINT AT THE WALL</p>
      <p class="tagline">Check the live view in the top-right corner.<br/>Point your index finger until it feels right,<br/>then snap your thumb like a hammer.</p>
      <p class="footnote">Press ESC to cancel</p>
    `);
    this.cancelHandler = onCancel;
    this.swap(el);
    this.calibStatus = el.querySelector('.calib-status');
  }

  calibStatusOk(aiming: boolean): void {
    if (!this.calibStatus) return;
    this.calibStatus.textContent = aiming
      ? 'NICE — NOW SNAP YOUR THUMB DOWN'
      : 'MAKE A FINGER GUN — POINT AT THE WALL';
    this.calibStatus.classList.toggle('ok', aiming);
  }

  async showCountdown(onTick?: (n: number) => void): Promise<void> {
    this.cancelHandler = null;
    const el = screen('');
    this.swap(el);
    for (const n of ['3', '2', '1']) {
      el.innerHTML = `<div class="countdown">${n}</div>`;
      onTick?.(Number(n));
      await sleep(650);
    }
    el.innerHTML = `<div class="countdown go">FIRE</div>`;
    onTick?.(0);
    await sleep(500);
    el.remove();
    this.current = null;
  }

  showOver(opts: OverOpts): void {
    const title = opts.isRecord ? 'NEW RECORD' : 'ROUND COMPLETE';
    const el = screen(`
      <p class="over-title ${opts.isRecord ? 'record' : ''}">${title}</p>
      <div class="over-score">${opts.score}</div>
      <div class="stats">
        <div class="stat"><div class="label">ACCURACY</div><div class="value">${Math.round(
          opts.accuracy * 100,
        )}%</div></div>
        <div class="stat"><div class="label">BEST STREAK</div><div class="value">${
          opts.bestStreak
        }</div></div>
        <div class="stat"><div class="label">HIGH SCORE</div><div class="value">${
          opts.highScore
        }</div></div>
      </div>
      <div class="btn-row">
        <button class="btn primary" data-act="retry">SHOOT AGAIN</button>
        <button class="btn ghost" data-act="menu">MENU</button>
      </div>
    `);
    el.querySelector('[data-act="retry"]')!.addEventListener('click', opts.onRetry);
    el.querySelector('[data-act="menu"]')!.addEventListener('click', opts.onMenu);
    this.swap(el);
  }

  hide(): void {
    this.cancelHandler = null;
    this.calibStatus = null;
    void this.swap(null);
  }
}

function screen(html: string): HTMLElement {
  const el = document.createElement('section');
  el.className = 'screen';
  el.innerHTML = html;
  return el;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}
