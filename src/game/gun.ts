import * as THREE from 'three';
import { PALETTE, TUNING } from './config';
import type { AimPoint } from '../core/events';

interface Tracer {
  mesh: THREE.Mesh;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  traveled: number;
  maxDist: number;
  active: boolean;
}

export interface FireResult {
  fired: boolean;
  hit: THREE.Intersection | null;
}

/**
 * The low-poly viewmodel gun welded to the camera, aim raycasting, tracers
 * and muzzle flash. The gun is your hand — this is just its embodiment.
 */
export class Gun {
  private group = new THREE.Group();
  private muzzle = new THREE.Object3D();
  private flash!: THREE.Mesh;
  private flashLight!: THREE.PointLight;
  private flashT = 0;
  private tracers: Tracer[] = [];
  private nextTracer = 0;
  private cooldown = 0;
  private kick = 0;
  private basePos = new THREE.Vector3(0.27, -0.26, -0.52);
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private unproj = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(
    private camera: THREE.PerspectiveCamera,
    scene: THREE.Scene,
  ) {
    this.buildViewmodel();
    this.camera.add(this.group);
    scene.add(this.camera);

    for (let i = 0; i < 10; i++) {
      const geo = new THREE.BoxGeometry(0.024, 0.024, 1, 1, 1, 1);
      geo.translate(0, 0, 0.5); // pivot at back so lookAt + scale.z pushes forward
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.tracers.push({
        mesh,
        origin: new THREE.Vector3(),
        dir: new THREE.Vector3(0, 0, -1),
        traveled: 0,
        maxDist: 0,
        active: false,
      });
    }
  }

  private buildViewmodel(): void {
    const white = new THREE.MeshStandardMaterial({
      color: PALETTE.gun,
      roughness: 0.35,
      metalness: 0.1,
      flatShading: true,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: PALETTE.gunDark,
      roughness: 0.6,
      metalness: 0.2,
      flatShading: true,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.34), white);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), white);
    barrel.position.set(0, 0.015, -0.27);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.17, 0.1), dark);
    grip.position.set(0, -0.13, 0.1);
    grip.rotation.x = 0.42;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.05), dark);
    sight.position.set(0, 0.08, -0.1);

    this.group.add(body, barrel, grip, sight);

    this.muzzle.position.set(0, 0.015, -0.45);
    this.group.add(this.muzzle);

    this.flash = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.075, 0),
      new THREE.MeshBasicMaterial({
        color: 0xfff3d6,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.flash.visible = false;
    this.muzzle.add(this.flash);

    this.flashLight = new THREE.PointLight(0xfff3d6, 0, 7);
    this.muzzle.add(this.flashLight);

    this.group.position.copy(this.basePos);
    this.group.rotation.y = 0.04;
  }

  /** Aim handling + FX decay. Call once per frame with the smoothed aim. */
  update(dt: number, aim: AimPoint, gunActive: boolean): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.kick = Math.max(0, this.kick - dt * 4.2);
    this.group.position.z = this.basePos.z + this.kick * 0.12;

    if (!gunActive) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    // rotate to point at the aim spot
    this.ndc.set(aim.x, aim.y);
    this.unproj.set(aim.x, aim.y, 0.9).unproject(this.camera).sub(this.camera.position);
    this.tmp.copy(this.camera.position).addScaledVector(this.unproj.clone().normalize(), 40);
    this.group.lookAt(this.tmp);

    if (this.flashT > 0) {
      this.flashT -= dt;
      const s = Math.max(0, this.flashT / TUNING.muzzleFlashTime);
      this.flash.scale.setScalar(0.4 + s);
      (this.flash.material as THREE.MeshBasicMaterial).opacity = s;
      this.flashLight.intensity = s * 26;
    } else {
      this.flash.visible = false;
      this.flashLight.intensity = 0;
    }

    for (const tr of this.tracers) {
      if (!tr.active) continue;
      tr.traveled += TUNING.tracerSpeed * dt;
      const fade = 1 - tr.traveled / tr.maxDist;
      if (fade <= 0) {
        tr.active = false;
        tr.mesh.visible = false;
        continue;
      }
      tr.mesh.position.copy(tr.origin).addScaledVector(tr.dir, tr.traveled);
      const mat = tr.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = fade * 0.9;
    }
  }

  /**
   * Attempt a shot: enforces cooldown, raycasts into target meshes and
   * spawns FX. Returns whether the shot happened and what it hit.
   */
  fire(ndc: AimPoint, targetMeshes: THREE.Object3D[]): FireResult {
    if (this.cooldown > 0) return { fired: false, hit: null };
    this.cooldown = TUNING.fireCooldown;
    this.kick = 1;
    this.flashT = TUNING.muzzleFlashTime;
    this.flash.visible = true;

    this.ndc.set(ndc.x, ndc.y);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(targetMeshes, false);
    const hit = hits.length > 0 ? hits[0] : null;

    const origin = this.muzzle.getWorldPosition(new THREE.Vector3());
    const end = hit ? hit.point.clone() : this.raycaster.ray.at(TUNING.tracerMaxLength, new THREE.Vector3());
    this.spawnTracer(origin, end);

    return { fired: true, hit };
  }

  private spawnTracer(origin: THREE.Vector3, end: THREE.Vector3): void {
    const tr = this.tracers[this.nextTracer];
    this.nextTracer = (this.nextTracer + 1) % this.tracers.length;

    tr.dir.copy(end).sub(origin);
    tr.maxDist = tr.dir.length();
    tr.dir.normalize();
    tr.traveled = 0;
    tr.active = true;
    tr.mesh.visible = true;

    tr.origin.copy(origin);
    tr.mesh.position.copy(origin);
    tr.mesh.lookAt(end);
    tr.mesh.scale.z = 1.6;
    (tr.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
  }
}
