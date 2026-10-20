import { Emitter } from './core/events';
import type { GameEvents } from './core/events';
import { GestureDetector, type GestureSnapshot } from './tracking/gestures';
import { AimSmoother } from './tracking/smoothing';
import { DebugPane } from './tracking/debugPane';
import { TUNING } from './game/config';
import { Arena } from './game/arena';
import { Targets } from './game/targets';
import { Gun } from './game/gun';
import { Scoring } from './game/scoring';
import { Juice } from './game/juice';
import { Sfx } from './audio/sfx';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';

type Mode = 'title' | 'loading' | 'calibrate' | 'countdown' | 'playing' | 'over';
type Input = 'hand' | 'mouse';

const emitter = new Emitter<GameEvents>();
const arena = new Arena(document.getElementById('game') as HTMLCanvasElement);
const targets = new Targets(arena.scene);
const gun = new Gun(arena.camera, arena.scene);
const scoring = new Scoring();
const sfx = new Sfx();
const hud = new Hud();
const screens = new Screens();
const detector = new GestureDetector();
const smoother = new AimSmoother(TUNING.aimFilter.minCutoff, TUNING.aimFilter.beta);
const debugPane = new DebugPane();

const flashEl = document.createElement('div');
flashEl.id = 'flash';
document.body.appendChild(flashEl);

const juice = new Juice(arena.scene, arena.camera, document.getElementById('popups') as HTMLElement, flashEl);

let mode: Mode = 'title';
let input: Input = 'hand';
let tracker: import('./tracking/handTracker').HandTracker | null = null;
let lastFrame = performance.now();
let roundRemaining = TUNING.roundTime;
let aim: { x: number; y: number } = { x: 0, y: 0 };
let handActive = false;
let trackingWasActive = false;
let calibFired = false;
let lastAimTime = 0;
/** How long the aim pose has been held during calibration (ms). */
let aimHeldMs = 0;
/** Sustained aim needed to confirm tracking and start the round. */
const CALIB_AIM_MS = 700;

/* ------------------------------- helpers ------------------------------- */

function setAim(x: number, y: number): void {
  aim.x = x;
  aim.y = y;
  lastAimTime = performance.now();
  hud.setAim(x, y);
  emitter.emit('aim', aim);
}

function setTracking(active: boolean): void {
  handActive = active;
  hud.setTracking(active);
  if (active !== trackingWasActive) {
    trackingWasActive = active;
    emitter.emit('tracking', { active });
  }
}

function shoot(): void {
  if (mode !== 'playing') return;

  const result = gun.fire(aim, targets.meshes());
  if (!result.fired) return;
  sfx.shot();
  hud.fireKick();
  juice.shake(TUNING.shakeFire);

  const hit = result.hit;
  if (hit && hit.object.userData.targetId !== undefined) {
    const consumed = targets.consume(hit.object);
    if (consumed) {
      const point = hit.point;
      const reg = scoring.registerHit(consumed.kind, hit.distance);

      emitter.emit('hit', {
        kind: consumed.kind,
        point: { x: point.x, y: point.y, z: point.z },
        distance: hit.distance,
      });
      juice.burst(point, consumed.kind);
      juice.hitstop();

      if (consumed.kind === 'hazard') {
        sfx.hazard();
        juice.hazardFlash();
        juice.shake(TUNING.shakeHazard);
        juice.popup(point, `${reg.gained}`, 'hazard');
      } else {
        sfx.hit(scoring.streak);
        juice.popup(point, `+${reg.gained}`, consumed.kind);
      }

      hud.setScore(scoring.score);
      hud.setMultiplier(scoring.multiplier);
      emitter.emit('score', {
        gained: reg.gained,
        multiplier: scoring.multiplier,
        total: scoring.score,
        streak: scoring.streak,
      });
    }
  } else {
    emitter.emit('miss', {});
    const broke = scoring.registerMiss().broke;
    if (broke) sfx.comboBreak();
    hud.setMultiplier(scoring.multiplier);
  }
}

async function startCountdownAndRound(): Promise<void> {
  mode = 'countdown';
  await screens.showCountdown((n) => sfx.count(n === 0));
  startRound();
}

function startRound(): void {
  scoring.reset();
  targets.clear();
  roundRemaining = TUNING.roundTime;
  hud.setScore(0);
  hud.setMultiplier(1);
  hud.showRound(true);
  hud.showHint(input === 'hand');
  emitter.emit('roundStart', {});
  mode = 'playing';
}

async function endRound(): Promise<void> {
  mode = 'over';
  hud.showRound(false);
  hud.showHint(false);
  const high = scoring.getHighScore();
  const isRecord = scoring.score > high;
  if (isRecord) scoring.saveHighScore(scoring.score);
  const finalHigh = Math.max(high, scoring.score);
  sfx.roundOver(isRecord);
  emitter.emit('roundEnd', {
    score: scoring.score,
    accuracy: scoring.accuracy,
    bestStreak: scoring.bestStreak,
    highScore: finalHigh,
    isRecord,
  });
  await screens.showOver({
    score: scoring.score,
    accuracy: scoring.accuracy,
    bestStreak: scoring.bestStreak,
    highScore: finalHigh,
    isRecord,
    onRetry: () => {
      sfx.ui();
      void startCountdownAndRound();
    },
    onMenu: () => {
      sfx.ui();
      void backToTitle();
    },
  });
}

async function playWithHand(): Promise<void> {
  input = 'hand';
  sfx.ensure();
  sfx.ui();
  mode = 'loading';
  await screens.showLoading('WAKING UP THE RANGE…');
  try {
    if (!tracker) {
      const mod = await import('./tracking/handTracker');
      tracker = new mod.HandTracker();
    }
    if (!tracker.getStream()) await tracker.start();
    mode = 'calibrate';
    calibFired = false;
    aimHeldMs = 0;
    // start the aim filter from wherever the hand already is, so the first
    // shot of the round isn't smeared across the countdown fade
    smoother.reset();
    await screens.showCalibrate(() => void backToTitle());
  } catch {
    mode = 'title';
    tracker = null;
    await screens.showError('Camera blocked or tracking failed to load.', () => {
      input = 'mouse';
      void startCountdownAndRound();
    });
  }
}

async function playWithMouse(): Promise<void> {
  input = 'mouse';
  sfx.ensure();
  sfx.ui();
  await startCountdownAndRound();
}

async function calibrateReady(): Promise<void> {
  calibFired = true;
  sfx.ui();
  await startCountdownAndRound();
}

async function backToTitle(): Promise<void> {
  mode = 'title';
  hud.showRound(false);
  hud.setTracking(false);
  setTracking(false);
  gun.update(0, aim, false);
  await screens.showTitle({
    highScore: scoring.getHighScore(),
    onCamera: () => void playWithHand(),
    onMouse: () => void playWithMouse(),
  });
}

/* ------------------------------ input hooks ----------------------------- */

window.addEventListener('pointermove', (e) => {
  if (input !== 'mouse' || mode !== 'playing') return;
  setAim((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  setTracking(true);
});

window.addEventListener('pointerdown', (e) => {
  sfx.ensure();
  if (input !== 'mouse' || mode !== 'playing') return;
  if ((e.target as HTMLElement).closest('.screen')) return;
  shoot();
});

/* ------------------------------ main loop ------------------------------- */

function loop(now: number): void {
  const rawDt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  // --- hand tracking poll ---
  const t = tracker;
  debugPane.setVisible(input === 'hand' && !!t && !!t.getStream());
  if (input === 'hand' && t && t.getStream()) {
    const lm = t.poll();
    const g: GestureSnapshot = detector.update(lm, now);
    debugPane.update(lm, g);
    const canAim = mode === 'playing' || mode === 'countdown';
    if (canAim && lm) {
      const smoothed = smoother.filter(g.tip.x, g.tip.y, rawDt);
      setAim(smoothed.x, smoothed.y);
      setTracking(true);
    } else if (canAim && now - lastAimTime > 350) {
      setTracking(false);
    }
    hud.setCocked(g.cocked);
    emitter.emit('cocked', g.cocked);

    if (mode === 'calibrate' && !calibFired) {
      if (g.aiming) {
        aimHeldMs += rawDt * 1000;
        // hold the aim pose briefly to confirm tracking, then drop into the round
        if (aimHeldMs >= CALIB_AIM_MS) void calibrateReady();
      } else {
        aimHeldMs = 0;
      }
      screens.calibStatusOk(g.aiming, aimHeldMs / CALIB_AIM_MS);
    } else if (mode === 'playing' && g.fired) {
      shoot();
    }
  }

  // --- time scale (hit-stop) + world updates ---
  const dt = juice.timeScale(rawDt);
  const difficulty =
    mode === 'playing' ? 1 - roundRemaining / TUNING.roundTime : 0.15;
  targets.update(dt, difficulty);
  arena.update(rawDt, aim.x, aim.y);
  juice.update(rawDt);
  gun.update(rawDt, aim, handActive || input === 'mouse');

  // --- round timer ---
  if (mode === 'playing') {
    roundRemaining -= dt;
    hud.setTimer(Math.max(0, roundRemaining));
    if (roundRemaining <= 0) void endRound();
  }

  arena.render();
}

/* ------------------------------ boot ----------------------------------- */

arena.renderer.setAnimationLoop(loop);
void backToTitle();
