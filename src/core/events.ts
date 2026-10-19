export type TargetKind = 'standard' | 'fast' | 'hazard';

export interface AimPoint {
  x: number;
  y: number;
}

export interface GameEvents {
  /** Smoothed aim point in NDC (-1..1), emitted whenever a hand (or mouse) provides a target. */
  aim: AimPoint;
  /** Hammer state changed (finger-gun cocked / released). */
  cocked: boolean;
  /** A trigger pull was registered (edge). Payload is the raw NDC aim at that instant. */
  fire: AimPoint;
  /** Hand presence change. */
  tracking: { active: boolean };
  /** A gesture fire cycle completed during calibration. */
  gestureReady: Record<string, never>;
  /** A registered shot hit a target. */
  hit: { kind: TargetKind; point: { x: number; y: number; z: number }; distance: number };
  /** A registered shot hit nothing. */
  miss: Record<string, never>;
  /** Score changed (positive gain or negative hazard penalty). */
  score: { gained: number; multiplier: number; total: number; streak: number };
  /** Round lifecycle. */
  roundStart: Record<string, never>;
  roundEnd: {
    score: number;
    accuracy: number;
    bestStreak: number;
    highScore: number;
    isRecord: boolean;
  };
}

type Handler = (payload: never) => void;

export class Emitter<Events extends object> {
  private handlers = new Map<keyof Events, Set<Handler>>();

  on<K extends keyof Events>(key: K, fn: (payload: Events[K]) => void): void {
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
    }
    set.add(fn as Handler);
  }

  emit<K extends keyof Events>(key: K, payload: Events[K]): void {
    const set = this.handlers.get(key);
    if (set) {
      for (const fn of set) (fn as unknown as (p: Events[K]) => void)(payload);
    }
  }
}
