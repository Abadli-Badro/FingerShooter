import * as THREE from 'three';
import { TUNING } from './config';
import type { TargetKind } from '../core/events';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

/**
 * All the fast feedback: shatter bursts, camera shake, hit-stop, floating
 * score popups, hazard flash.
 */
export class Juice {
  private particles: Particle[] = [];
  private nextParticle = 0;
  private shakeAmp = 0;
  private hitstopTimer = 0;

  constructor(
    scene: THREE.Scene,
    private camera: THREE.Camera,
    private popupsContainer: HTMLElement,
    private flashEl: HTMLElement,
  ) {
    const geo = new THREE.TetrahedronGeometry(0.085);
    for (let i = 0; i < 130; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 1,
      });
    }
  }

  /** Raw (unscaled) dt busywork: shake + hitstop timing. */
  timeScale(rawDt: number): number {
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= rawDt;
      return rawDt * TUNING.hitstopScale;
    }
    return rawDt;
  }

  update(rawDt: number): void {
    // camera shake decay (added on top of the arena-set camera transform)
    if (this.shakeAmp > 0.0001) {
      const o = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
      ).multiplyScalar(this.shakeAmp);
      this.camera.position.add(o);
      this.shakeAmp *= Math.exp(-9 * rawDt);
    }

    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= rawDt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= 7.5 * rawDt;
      p.mesh.position.addScaledVector(p.vel, rawDt);
      p.mesh.rotation.x += p.spin.x * rawDt;
      p.mesh.rotation.y += p.spin.y * rawDt;
      const t = p.life / p.maxLife;
      p.mesh.scale.setScalar(p.size * t);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, t * 1.6);
    }
  }

  burst(point: THREE.Vector3, kind: TargetKind): void {
    const color = kind === 'standard' ? 0xff5050 : kind === 'fast' ? 0xff8a63 : 0x2e3d4f;
    const n = kind === 'fast' ? 18 : 14;
    for (let i = 0; i < n; i++) {
      const p = this.particles[this.nextParticle];
      this.nextParticle = (this.nextParticle + 1) % this.particles.length;
      p.life = 0.45 + Math.random() * 0.3;
      p.maxLife = p.life;
      p.size = 0.7 + Math.random() * 1.1;
      p.mesh.position.copy(point);
      p.mesh.visible = true;
      p.vel
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(1.6 + Math.random() * 3.4);
      p.spin.set(Math.random() * 12, Math.random() * 12, 0);
      (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    }
  }

  shake(amp: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  hitstop(): void {
    this.hitstopTimer = TUNING.hitstopSec;
  }

  popup(worldPoint: THREE.Vector3, text: string, kind: TargetKind): void {
    const v = worldPoint.clone().project(this.camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = `popup ${kind}`;
    el.textContent = text;
    el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
    this.popupsContainer.appendChild(el);
    window.setTimeout(() => el.remove(), 950);
  }

  hazardFlash(): void {
    this.flashEl.classList.remove('hit');
    // force reflow so the animation restarts
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('hit');
  }
}
