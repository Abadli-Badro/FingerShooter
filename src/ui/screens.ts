import { MatrixRain } from "./matrixRain";

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
  private root = document.getElementById("overlay") as HTMLElement;
  private current: HTMLElement | null = null;
  private calibStatus: HTMLElement | null = null;
  private calibBar: HTMLElement | null = null;
  private cancelHandler: (() => void) | null = null;
  private rain: MatrixRain | null = null;
  private typeTimers: number[] = [];
  private titleGen = 0;

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.current && this.cancelHandler) {
        this.cancelHandler();
      }
    });
  }

  private async swap(next: HTMLElement | null): Promise<void> {
    const prev = this.current;
    if (prev) {
      prev.classList.add("leaving");
      await sleep(340);
      prev.remove();
    }
    this.teardownRain();
    if (next) this.root.appendChild(next);
    this.current = next;
  }

  /** Stop any running digital rain + type-out timers from a previous screen. */
  private teardownRain(): void {
    this.titleGen++;
    this.rain?.destroy();
    this.rain = null;
    for (const t of this.typeTimers) window.clearTimeout(t);
    this.typeTimers = [];
  }

  showTitle(opts: TitleOpts): Promise<void> {
    this.cancelHandler = null;
    const el = screen(`
      <canvas class="rain-canvas"></canvas>
      <div class="term">
        <div class="term-bar">
          <span class="term-dots"><i></i><i></i><i></i></span>
          <span class="term-title">root@range07:~/sim — fingershooter</span>
        </div>
        <div class="term-body">
          <div class="boot-log" id="boot-log"></div>
          <h1 class="logo glitch" data-text="FINGERSHOOTER">FINGER<span class="accent">SHOOTER</span></h1>
          <p class="tagline">VR COMBAT SIMULATION // RANGE 07<br/>Aim with your index finger. Snap your thumb to fire.</p>
          <div class="chip">HIGH SCORE&nbsp;&nbsp;<strong>${opts.highScore}</strong></div>
          <div class="btn-row">
            <button class="btn primary" data-act="cam">[ INITIALIZE WEBCAM ]</button>
            <button class="btn ghost" data-act="mouse">[ MOUSE OVERRIDE ]</button>
          </div>
          <p class="footnote">Made by N0M4D</p>
        </div>
      </div>
    `);
    el.querySelector('[data-act="cam"]')!.addEventListener(
      "click",
      opts.onCamera,
    );
    el.querySelector('[data-act="mouse"]')!.addEventListener(
      "click",
      opts.onMouse,
    );
    const gen = ++this.titleGen;
    return this.swap(el).then(() => {
      if (gen !== this.titleGen || this.current !== el) return;
      this.rain = new MatrixRain(el);
      this.rain.start();
      this.typeBootLog(el);
    });
  }

  /** Type out the boot sequence line-by-line, then reveal the menu. */
  private typeBootLog(el: HTMLElement): void {
    const log = el.querySelector("#boot-log") as HTMLElement;
    const lines = [
      "> initializing neural interface…",
      "> loading hand-tracking module… ok",
      "> establishing range 07 link… ok",
      "> calibrating targeting grid… ok",
      "> awaiting operator input_",
    ];
    let i = 0;
    const next = () => {
      if (i >= lines.length) return;
      const line = document.createElement("div");
      line.className = "boot-line";
      line.textContent = lines[i];
      log.appendChild(line);
      i++;
      this.typeTimers.push(window.setTimeout(next, 380));
    };
    next();
  }

  showLoading(message: string): Promise<void> {
    const el = screen(`
      <div class="spin"></div>
      <p class="tagline">${message}</p>
    `);
    return this.swap(el);
  }

  showError(message: string, onMouse: () => void): Promise<void> {
    const el = screen(`
      <p class="calib-status">${message}</p>
      <div class="btn-row">
        <button class="btn ghost" data-act="mouse">[ MOUSE OVERRIDE ]</button>
      </div>
    `);
    el.querySelector('[data-act="mouse"]')!.addEventListener("click", () => {
      this.hide();
      onMouse();
    });
    return this.swap(el);
  }

  /** Calibration: the debug pane (top-right) doubles as the camera preview. */
  showCalibrate(onCancel: () => void): Promise<void> {
    const el = screen(`
      <p class="calib-status">MAKE A FINGER GUN — POINT AT THE WALL</p>
      <div class="calib-track"><div class="calib-fill"></div></div>
      <p class="tagline">Check the live view in the top-right corner.<br/>Point your index finger until it feels right,<br/>then hold it steady to start the round.</p>
      <p class="footnote">Press ESC to cancel</p>
    `);
    this.cancelHandler = onCancel;
    this.calibStatus = el.querySelector(".calib-status");
    this.calibBar = el.querySelector(".calib-fill");
    return this.swap(el);
  }

  calibStatusOk(aiming: boolean, progress = 0): void {
    if (!this.calibStatus) return;
    this.calibStatus.textContent = aiming
      ? "TRACKING — HOLD IT…"
      : "MAKE A FINGER GUN — POINT AT THE WALL";
    this.calibStatus.classList.toggle("ok", aiming);
    if (this.calibBar) {
      this.calibBar.style.width = `${Math.min(100, progress * 100)}%`;
    }
  }

  async showCountdown(onTick?: (n: number) => void): Promise<void> {
    this.cancelHandler = null;
    const el = screen("");
    await this.swap(el);
    for (const n of ["3", "2", "1"]) {
      el.innerHTML = `<div class="countdown">${n}</div>`;
      onTick?.(Number(n));
      await sleep(650);
    }
    el.innerHTML = `<div class="countdown go">ENGAGE</div>`;
    onTick?.(0);
    await sleep(500);
    el.remove();
    this.current = null;
  }

  showOver(opts: OverOpts): Promise<void> {
    const title = opts.isRecord ? "NEW RECORD" : "SIMULATION COMPLETE";
    const el = screen(`
      <p class="over-title ${opts.isRecord ? "record" : ""}">${title}</p>
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
        <button class="btn primary" data-act="retry">[ RE-ENGAGE ]</button>
        <button class="btn ghost" data-act="menu">[ RETURN TO MENU ]</button>
      </div>
    `);
    el.querySelector('[data-act="retry"]')!.addEventListener(
      "click",
      opts.onRetry,
    );
    el.querySelector('[data-act="menu"]')!.addEventListener(
      "click",
      opts.onMenu,
    );
    return this.swap(el);
  }

  hide(): void {
    this.cancelHandler = null;
    this.calibStatus = null;
    this.calibBar = null;
    void this.swap(null);
  }
}

function screen(html: string): HTMLElement {
  const el = document.createElement("section");
  el.className = "screen";
  el.innerHTML = html;
  return el;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}
