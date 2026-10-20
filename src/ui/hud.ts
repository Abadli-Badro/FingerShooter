import { TUNING } from '../game/config';

const RING = 60;

function reticleSvg(): string {
  return `
    <svg viewBox="0 0 64 64">
      <circle class="ring" cx="32" cy="32" r="${RING / 2}"/>
      <line class="tick" x1="32" y1="6" x2="32" y2="13"/>
      <line class="tick" x1="32" y1="51" x2="32" y2="58"/>
      <line class="tick" x1="6" y1="32" x2="13" y2="32"/>
      <line class="tick" x1="51" y1="32" x2="58" y2="32"/>
      <circle class="dot" cx="32" cy="32" r="3.4"/>
      <rect class="hammer" x="28.5" y="-10" width="7" height="10" rx="3"/>
    </svg>`;
}

/** Minimal DOM HUD: reticle, score, combo chip, round timer, hints. */
export class Hud {
  private root = document.getElementById('overlay') as HTMLElement;
  private reticle: HTMLElement;
  private hud: HTMLElement;
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private fillEl: HTMLElement;
  private secsEl: HTMLElement;
  private hintEl: HTMLElement;
  private handEl: HTMLElement;
  private lastCombo = 1;
  private inRound = false;

  constructor() {
    this.reticle = document.createElement('div');
    this.reticle.id = 'reticle';
    this.reticle.innerHTML = reticleSvg();
    this.reticle.classList.add('dim');

    this.hud = document.createElement('div');
    this.hud.id = 'hud';
    this.hud.innerHTML = `
      <div class="hud-score">
        <div class="label">SCORE</div>
        <div class="value">0</div>
        <div class="hud-combo">×1</div>
      </div>
      <div class="hud-timer">
        <div class="bar"><div class="fill"></div></div>
        <div class="secs">0.0s</div>
      </div>
      <div class="hud-hint">&gt; POINT INDEX FINGER — SNAP THUMB TO FIRE</div>
      <div class="hud-hand">[ NO HAND DETECTED ]</div>`;

    this.root.appendChild(this.reticle);
    this.root.appendChild(this.hud);

    this.scoreEl = this.hud.querySelector('.hud-score .value') as HTMLElement;
    this.comboEl = this.hud.querySelector('.hud-combo') as HTMLElement;
    this.fillEl = this.hud.querySelector('.bar .fill') as HTMLElement;
    this.secsEl = this.hud.querySelector('.secs') as HTMLElement;
    this.hintEl = this.hud.querySelector('.hud-hint') as HTMLElement;
    this.handEl = this.hud.querySelector('.hud-hand') as HTMLElement;
  }

  setAim(x: number, y: number): void {
    this.reticle.style.left = `${(x * 0.5 + 0.5) * 100}%`;
    this.reticle.style.top = `${(-y * 0.5 + 0.5) * 100}%`;
  }

  setTracking(active: boolean): void {
    this.reticle.classList.toggle('dim', !active);
    this.handEl.classList.toggle('show', !active && this.inRound);
  }

  setCocked(cocked: boolean): void {
    this.reticle.classList.toggle('cocked', cocked);
  }

  fireKick(): void {
    this.reticle.classList.remove('kicked');
    void this.reticle.offsetWidth;
    this.reticle.classList.add('kicked');
  }

  setScore(score: number): void {
    this.scoreEl.textContent = String(score);
  }

  setMultiplier(mult: number): void {
    if (mult === this.lastCombo) return;
    const became = mult > this.lastCombo;
    this.lastCombo = mult;
    if (mult > 1) {
      this.comboEl.textContent = `[ CHAIN ×${mult} ]`;
      this.comboEl.classList.add('show');
      if (became) {
        this.comboEl.classList.remove('pop');
        void this.comboEl.offsetWidth;
        this.comboEl.classList.add('pop');
      }
    } else {
      this.comboEl.classList.remove('show');
    }
  }

  setTimer(remaining: number): void {
    const total = TUNING.roundTime;
    const ratio = Math.max(0, Math.min(1, remaining / total));
    this.fillEl.style.transform = `scaleX(${ratio})`;
    this.fillEl.classList.toggle('low', remaining < 10);
    this.secsEl.textContent = `${Math.ceil(remaining)}s`;
  }

  showHint(v: boolean): void {
    this.hintEl.classList.toggle('show', v);
    if (v) {
      window.setTimeout(() => this.hintEl.classList.remove('show'), 5200);
    }
  }

  showRound(inGame: boolean): void {
    this.inRound = inGame;
    this.hud.classList.toggle('show', inGame);
    if (!inGame) this.handEl.classList.remove('show');
  }
}
