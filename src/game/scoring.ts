import { TUNING, UI } from './config';
import type { TargetKind } from '../core/events';

/**
 * Round scoring state: points, combo multiplier, accuracy, high score.
 */
export class Scoring {
  score = 0;
  streak = 0;
  bestStreak = 0;
  shots = 0;
  hits = 0;

  get multiplier(): number {
    return Math.min(TUNING.comboMax, 1 + Math.floor(this.streak / TUNING.comboStep));
  }

  get accuracy(): number {
    return this.shots === 0 ? 0 : this.hits / this.shots;
  }

  reset(): void {
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.shots = 0;
    this.hits = 0;
  }

  /** Returns gained points (can be negative) and whether combo broke. */
  registerHit(kind: TargetKind, distance: number): { gained: number; broke: boolean } {
    this.hits++;
    this.shots++;
    const broke = false;

    if (kind === 'hazard') {
      const before = this.multiplier;
      this.streak = 0;
      const gained = TUNING.points.hazard;
      this.score = Math.max(0, this.score + gained);
      return { gained, broke: before > 1 };
    }

    let gained = TUNING.points[kind];
    const over = distance - TUNING.distBonusFrom;
    if (over > 0) gained += Math.round(over) * TUNING.distBonusPerUnit;

    gained *= this.multiplier;
    this.score += gained;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    return { gained, broke };
  }

  registerMiss(): { broke: boolean } {
    this.shots++;
    const before = this.multiplier;
    this.streak = 0;
    return { broke: before > 1 };
  }

  getHighScore(): number {
    try {
      return Number(localStorage.getItem(UI.highScoreKey) ?? 0);
    } catch {
      return 0;
    }
  }

  saveHighScore(score: number): void {
    try {
      localStorage.setItem(UI.highScoreKey, String(Math.max(score, this.getHighScore())));
    } catch {
      /* storage unavailable */
    }
  }
}
