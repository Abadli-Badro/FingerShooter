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
          color: PALETTE.accent,
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
    const body = new THREE.MeshStandardMaterial({
      color: PALETTE.gun,
      roughness: 0.45,
      metalness: 0.4,
      flatShading: true,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: PALETTE.gunDark,
      roughness: 0.55,
      metalness: 0.45,
      flatShading: true,
    });
    // emissive neon trim — kept dim so it doesn't blow out under bloom
    const trim = new THREE.MeshStandardMaterial({
      color: PALETTE.gunAccent,
      emissive: PALETTE.gunAccent,
      emissiveIntensity: 0.25,
      roughness: 0.4,
      metalness: 0.2,
      flatShading: true,
    });
    // hotter trim for the muzzle ring / emitter
    const hot = new THREE.MeshStandardMaterial({
      color: PALETTE.gunAccent,
      emissive: PALETTE.gunAccent,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.2,
      flatShading: true,
    });

    const add = (
      parent: THREE.Object3D,
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
      rx = 0,
      ry = 0,
      rz = 0,
    ): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      parent.add(m);
      return m;
    };

    const g = this.group;

    // --- frame: one extruded angular silhouette with skeletonized cutouts ---
    const s = new THREE.Shape();
    s.moveTo(-0.22, 0.11); // rear top
    s.lineTo(0.18, 0.11); // slide top front
    s.lineTo(0.32, 0.02); // aggressive chin point
    s.lineTo(0.32, -0.01); // chin bottom
    s.lineTo(0.1, -0.03); // frame underside
    s.lineTo(-0.01, -0.045); // in front of trigger pocket
    s.lineTo(-0.05, -0.3); // grip front, raked
    s.lineTo(-0.15, -0.32); // grip bottom
    s.lineTo(-0.21, -0.3); // grip bottom rear
    s.lineTo(-0.17, -0.09); // back strap
    s.lineTo(-0.26, -0.04); // beavertail
    s.lineTo(-0.26, 0.05); // rear slide bottom
    s.closePath();

    // slide window — the glowing energy core shows through it
    const window = new THREE.Path();
    window.moveTo(0.0, 0.03);
    window.lineTo(0.0, 0.09);
    window.lineTo(0.15, 0.09);
    window.lineTo(0.15, 0.03);
    window.closePath();
    s.holes.push(window);

    // skeletonized grip slot
    const gripSlot = new THREE.Path();
    gripSlot.moveTo(-0.16, -0.11);
    gripSlot.lineTo(-0.16, -0.24);
    gripSlot.lineTo(-0.06, -0.24);
    gripSlot.lineTo(-0.06, -0.11);
    gripSlot.closePath();
    s.holes.push(gripSlot);

    const frameGeo = new THREE.ExtrudeGeometry(s, {
      depth: 0.085,
      bevelEnabled: true,
      bevelThickness: 0.007,
      bevelSize: 0.007,
      bevelSegments: 1,
      steps: 1,
    });
    frameGeo.rotateY(Math.PI / 2);
    frameGeo.translate(-0.0425, 0, 0);
    add(g, frameGeo, body, 0, 0, 0);

    // --- energy core behind the slide window + cell inside the grip slot ---
    add(g, new THREE.BoxGeometry(0.062, 0.05, 0.14), trim, 0, 0.06, -0.075);
    add(g, new THREE.BoxGeometry(0.06, 0.05, 0.095), trim, 0, -0.175, 0.1, -0.16);

    // --- barrel: hex shroud + hex energy ring + emitter orb ---
    const shroud = new THREE.CylinderGeometry(0.027, 0.027, 0.16, 6);
    shroud.rotateX(Math.PI / 2);
    add(g, shroud, dark, 0, 0.005, -0.38);
    add(g, new THREE.TorusGeometry(0.04, 0.011, 4, 6), hot, 0, 0.005, -0.465);
    add(g, new THREE.IcosahedronGeometry(0.023, 0), hot, 0, 0.005, -0.472);

    // --- side details: power strips + vents on both flanks ---
    for (const x of [0.052, -0.052]) {
      add(g, new THREE.BoxGeometry(0.01, 0.013, 0.3), trim, x, 0.095, -0.03);
      add(g, new THREE.BoxGeometry(0.01, 0.013, 0.035), trim, x, 0.055, -0.17);
      add(g, new THREE.BoxGeometry(0.01, 0.013, 0.035), trim, x, 0.055, -0.215);
    }

    // --- trigger guard (hexagonal half-loop) + glowing trigger ---
    const guard = new THREE.TorusGeometry(0.055, 0.011, 4, 8, Math.PI);
    guard.rotateZ(Math.PI);
    guard.rotateY(Math.PI / 2);
    add(g, guard, body, 0, -0.045, -0.03);
    add(g, new THREE.BoxGeometry(0.015, 0.045, 0.013), trim, 0, -0.068, -0.05, -0.35);

    // --- sights: angular rear block with pip + front post ---
    add(g, new THREE.BoxGeometry(0.05, 0.022, 0.035), dark, 0, 0.121, 0.155);
    add(g, new THREE.BoxGeometry(0.012, 0.008, 0.012), trim, 0, 0.134, 0.152);
    add(g, new THREE.BoxGeometry(0.013, 0.02, 0.02), trim, 0, 0.12, -0.155);

    // --- rear charging fin ---
    add(g, new THREE.BoxGeometry(0.026, 0.05, 0.06), trim, 0, 0.128, 0.205, -0.55);

    this.muzzle.position.set(0, 0.005, -0.48);
    this.group.add(this.muzzle);

    this.flash = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.075, 0),
      new THREE.MeshBasicMaterial({
        color: PALETTE.flash,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.flash.visible = false;
    this.muzzle.add(this.flash);

    this.flashLight = new THREE.PointLight(PALETTE.flash, 0, 7);
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
    const hits = this.raycaster.intersectObjects(targetMeshes, true);
    let hit = hits.length > 0 ? hits[0] : null;
    if (hit) {
      // targets are groups; climb to the root that carries targetId
      let root: THREE.Object3D | null = hit.object;
      while (root && root.userData.targetId === undefined) root = root.parent;
      hit = root ? { ...hit, object: root } : null;
    }

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
