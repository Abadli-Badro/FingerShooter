import { GESTURE } from '../game/config';
import type { AimPoint } from '../core/events';

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface GestureSnapshot {
  /** Index finger extended — the gun is "up". */
  aiming: boolean;
  /** Thumb is raised (hammer cocked). */
  cocked: boolean;
  /** True on the exact update where the hammer snap is detected. */
  fired: boolean;
  /** Aim point in mirrored NDC (-1..1). */
  tip: AimPoint;
  /** Smoothed thumb-up value (positive = thumb above its IP joint, in palm units). */
  upness: number;
  /** Smoothed d(upness)/dt, palm units per second (negative = snapping down). */
  hVel: number;
}

const dist = (a: Landmark, b: Landmark): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Tiny exponential smoother. */
class LowPass {
  private has = false;
  private v = 0;

  filter(x: number, alpha: number): number {
    if (!this.has) {
      this.has = true;
      this.v = x;
      return x;
    }
    this.v += alpha * (x - this.v);
    return this.v;
  }
}

/**
 * Turns 21 hand landmarks into a finger-gun state machine.
 *
 * The thumb's absolute range of motion in camera space is small and varies a
 * lot between people/orientations, so instead of pure fixed thresholds the
 * trigger combines three signals:
 *
 *  1. `upness` — thumb tip height relative to its IP joint (palm-scaled).
 *  2. `peak drop` — how far the thumb has fallen from its peak while cocked
 *     (relative to *that person's* cocked height).
 *  3. `snap velocity` — a deliberate hammer snap is fast (~2-4 palm/s);
 *     tracking jitter is slow. Firing requires a fast negative spike OR a
 *     deep absolute drop below the fired floor.
 *
 * Aim comes from the index fingertip, extended slightly "down the barrel".
 * All coordinates are mirrored so aiming matches the mirrored self-view.
 */
export class GestureDetector {
  private cocked = false;
  private cockedAt = 0;
  private peakH = 0;
  private lastFire = -1e9;
  private lastSeen = -1e9;
  private prevH: number | null = null;
  private vEma = 0;
  private hLp = new LowPass();

  update(lm: Landmark[] | null, nowMs: number): GestureSnapshot {
    const none: GestureSnapshot = {
      aiming: false,
      cocked: false,
      fired: false,
      tip: { x: 0, y: 0 },
      upness: 0,
      hVel: 0,
    };
    if (!lm || lm.length < 21) {
      this.cocked = false;
      this.peakH = 0;
      this.prevH = null;
      this.vEma = 0;
      this.hLp = new LowPass();
      return none;
    }

    let dt = (nowMs - this.lastSeen) / 1000;
    if (this.prevH === null || dt <= 0 || dt > 0.25) dt = 1 / 30;
    dt = Math.min(dt, 0.1);
    this.lastSeen = nowMs;

    const palm = dist(lm[0], lm[9]);

    // --- hammer signal: thumb tip (4) height vs its IP joint (3), palm-scaled ---
    const hRaw = palm > 1e-4 ? (lm[3].y - lm[4].y) / palm : 0;
    const h = this.hLp.filter(hRaw, 1 - Math.exp(-dt * 14));
    if (this.prevH !== null) {
      const d = (h - this.prevH) / dt;
      this.vEma += 0.55 * (d - this.vEma);
    }
    this.prevH = h;

    // --- index extension: fingertip well beyond the middle knuckle ---
    const dTipMid = dist(lm[8], lm[9]);
    const dPipMid = dist(lm[6], lm[9]);
    const aiming = dPipMid > 1e-4 && dTipMid / dPipMid > GESTURE.indexExtRatio;

    // --- mirrored-space aim point, projected slightly past the fingertip ---
    const mx = (p: Landmark): number => 1 - p.x;
    const dirX = mx(lm[8]) - mx(lm[5]);
    const dirY = lm[8].y - lm[5].y;
    const aimX = mx(lm[8]) + dirX * GESTURE.aimExtension;
    const aimY = lm[8].y + dirY * GESTURE.aimExtension;
    const tip: AimPoint = {
      x: Math.min(1, Math.max(-1, aimX * 2 - 1)),
      y: Math.min(1, Math.max(-1, -(aimY * 2 - 1))),
    };

    // --- trigger state machine ---
    let fired = false;

    if (this.cocked && !aiming) this.cocked = false;

    if (!this.cocked) {
      if (aiming && h > GESTURE.cockedUpness) {
        this.cocked = true;
        this.cockedAt = nowMs;
        this.peakH = h;
      }
    } else {
      if (h > this.peakH) this.peakH = h;
      if (h < GESTURE.cockedExitUpness) {
        this.cocked = false;
        this.peakH = 0;
      } else {
        const held = nowMs - this.cockedAt > GESTURE.cockedHoldMs;
        const fell = this.peakH - h >= GESTURE.dropAbs;
        const snapped = this.vEma < GESTURE.dropVel;
        const deepDown = h < GESTURE.firedUpness;
        if (aiming && held && ((fell && snapped) || deepDown)) {
          if (nowMs - this.lastFire > GESTURE.refireMs) {
            fired = true;
            this.lastFire = nowMs;
          }
          this.cocked = false;
          this.peakH = 0;
        }
      }
    }

    return { aiming, cocked: this.cocked, fired, tip, upness: h, hVel: this.vEma };
  }
}
