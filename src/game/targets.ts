import * as THREE from 'three';
import { PALETTE, TUNING } from './config';
import type { TargetKind } from '../core/events';

interface Motion {
  base: THREE.Vector3;
  pattern: 'drift' | 'orbit';
  amp: number;
  speed: number;
  phase: number;
  orbitR: number;
  orbitW: number;
}

interface Target {
  id: number;
  kind: TargetKind;
  mesh: THREE.Mesh;
  motion: Motion;
  age: number;
  life: number;
  spin: THREE.Vector3;
  scale: number;
}

let nextId = 0;

/**
 * Spawns and animates the low-poly targets drifting through the range.
 * Owns the spawn director (difficulty ramps with round elapsed time).
 */
export class Targets {
  readonly group = new THREE.Group();
  private targets: Target[] = [];
  private byMesh = new Map<THREE.Object3D, Target>();
  private spawnTimer = 0;

  private mats: Record<TargetKind, THREE.MeshStandardMaterial>;
  private geos: Record<TargetKind, THREE.BufferGeometry> = {
    standard: new THREE.OctahedronGeometry(0.72),
    fast: new THREE.IcosahedronGeometry(0.42, 0),
    hazard: new THREE.OctahedronGeometry(0.8),
  };

  constructor(scene: THREE.Scene) {
    this.mats = {
      standard: new THREE.MeshStandardMaterial({
        color: PALETTE.accent,
        roughness: 0.55,
        metalness: 0,
        flatShading: true,
      }),
      fast: new THREE.MeshStandardMaterial({
        color: PALETTE.fast,
        roughness: 0.45,
        metalness: 0,
        flatShading: true,
      }),
      hazard: new THREE.MeshStandardMaterial({
        color: PALETTE.hazard,
        roughness: 0.8,
        metalness: 0.1,
        flatShading: true,
      }),
    };
    this.group.name = 'targets';
    scene.add(this.group);
  }

  get alive(): number {
    return this.targets.length;
  }

  meshes(): THREE.Object3D[] {
    return this.group.children;
  }

  /** difficulty: 0..1 across the round */
  update(dt: number, difficulty: number): void {
    const interval = THREE.MathUtils.lerp(
      TUNING.spawnIntervalStart,
      TUNING.spawnIntervalEnd,
      difficulty,
    );
    const cap = Math.round(
      THREE.MathUtils.lerp(TUNING.maxAliveStart, TUNING.maxAliveEnd, difficulty),
    );

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.alive < cap) {
      this.spawn(difficulty);
      this.spawnTimer = interval * (0.75 + Math.random() * 0.5);
    }

    for (let i = this.alive - 1; i >= 0; i--) {
      const t = this.targets[i];
      t.age += dt;
      const m = t.motion;
      if (m.pattern === 'drift') {
        t.mesh.position.x = m.base.x + Math.sin(t.age * m.speed + m.phase) * m.amp;
        t.mesh.position.y = m.base.y + Math.sin(t.age * m.speed * 1.35 + m.phase * 2) * 0.45;
      } else {
        const a = t.age * m.orbitW + m.phase;
        t.mesh.position.set(
          m.base.x + Math.cos(a) * m.orbitR,
          m.base.y + Math.sin(a) * m.orbitR,
          m.base.z,
        );
      }
      t.mesh.rotation.x += t.spin.x * dt;
      t.mesh.rotation.y += t.spin.y * dt;

      if (t.age > t.life) {
        const s = Math.max(0, 1 - (t.age - t.life) / 0.25);
        t.mesh.scale.setScalar(t.scale * s);
        if (s <= 0) this.kill(i);
      }
    }
  }

  private spawn(difficulty: number): void {
    const roll = Math.random();
    let kind: TargetKind = 'standard';
    if (roll < TUNING.hazardChance) kind = 'hazard';
    else if (roll < TUNING.hazardChance + TUNING.fastChanceMax * difficulty) kind = 'fast';

    const pos = this.findSpot();
    const fast = kind === 'fast';
    const hazard = kind === 'hazard';

    const mesh = new THREE.Mesh(this.geos[kind], this.mats[kind]);
    mesh.castShadow = true;
    const scale = 0.85 + Math.random() * 0.35;
    mesh.scale.setScalar(scale);
    if (hazard) mesh.rotation.z = Math.PI / 4;

    const motion: Motion = {
      base: pos,
      pattern:
        !hazard && Math.random() < (fast ? 0.7 : 0.14) ? 'orbit' : 'drift',
      amp: fast ? 2.6 + Math.random() * 2.4 : 1.2 + Math.random() * 1.8,
      speed: fast ? 1.4 + Math.random() * 0.9 : 0.45 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2,
      orbitR: 0.9 + Math.random() * 1.2,
      orbitW: fast ? 1.2 + Math.random() * 0.9 : 0.5 + Math.random() * 0.4,
    };
    mesh.position.copy(pos);

    const t: Target = {
      id: nextId++,
      kind,
      mesh,
      motion,
      age: 0,
      life: THREE.MathUtils.randFloat(TUNING.targetLifeMin, TUNING.targetLifeMax),
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * (fast ? 3.2 : 1.6),
        (Math.random() - 0.5) * (fast ? 4 : 2),
        0,
      ),
      scale,
    };
    mesh.userData.targetId = t.id;
    this.byMesh.set(mesh, t);
    this.targets.push(t);
    this.group.add(mesh);
  }

  private findSpot(): THREE.Vector3 {
    for (let tries = 0; tries < 10; tries++) {
      const p = new THREE.Vector3(
        THREE.MathUtils.randFloat(-8.5, 8.5),
        THREE.MathUtils.randFloat(1.0, 4.6),
        THREE.MathUtils.randFloat(-7, -21),
      );
      let ok = true;
      for (const t of this.targets) {
        if (t.mesh.position.distanceTo(p) < 2.1) {
          ok = false;
          break;
        }
      }
      if (ok) return p;
    }
    return new THREE.Vector3(
      THREE.MathUtils.randFloat(-8.5, 8.5),
      THREE.MathUtils.randFloat(1.0, 4.6),
      THREE.MathUtils.randFloat(-7, -21),
    );
  }

  /** Consume the mesh that was just shot; returns its data or null. */
  consume(mesh: THREE.Object3D): { id: number; kind: TargetKind } | null {
    const t = this.byMesh.get(mesh);
    if (!t) return null;
    const i = this.targets.indexOf(t);
    if (i >= 0) {
      this.targets[i] = this.targets[this.alive - 1];
      this.targets.pop();
    }
    this.byMesh.delete(mesh);
    this.group.remove(mesh);
    return { id: t.id, kind: t.kind };
  }

  private kill(i: number): void {
    const t = this.targets[i];
    this.byMesh.delete(t.mesh);
    this.targets[i] = this.targets[this.alive - 1];
    this.targets.pop();
    this.group.remove(t.mesh);
  }

  clear(): void {
    while (this.alive) this.kill(0);
    this.spawnTimer = 0;
  }
}
