import * as THREE from 'three';
import { PALETTE } from './config';

const BASE_POS = new THREE.Vector3(0, 1.66, 0);

/**
 * The stylized shooting range: off-white low-poly world, fog, coral accents,
 * a static first-person camera with idle breathing + aim parallax.
 */
export class Arena {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.05, 220);
  readonly renderer: THREE.WebGLRenderer;

  private time = 0;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(PALETTE.bg);
    this.scene.fog = new THREE.Fog(PALETTE.bg, 26, 95);

    this.camera.position.copy(BASE_POS);
    this.scene.add(this.camera);

    this.buildLights();
    this.buildGround();
    this.buildProps();
    this.buildRange();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 0.85);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(18, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -30;
    cam.right = 30;
    cam.top = 30;
    cam.bottom = -30;
    cam.near = 1;
    cam.far = 120;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  private buildGround(): void {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(90, 48),
      new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private buildProps(): void {
    const mats = PALETTE.props.map(
      (c) =>
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0, flatShading: true }),
    );
    const group = new THREE.Group();

    const rocks = 26;
    for (let i = 0; i < rocks; i++) {
      const mat = mats[i % mats.length];
      const r = 0.5 + Math.random() * 1.6;
      const geo =
        i % 3 === 0
          ? new THREE.DodecahedronGeometry(r, 0)
          : i % 3 === 1
            ? new THREE.IcosahedronGeometry(r, 0)
            : new THREE.ConeGeometry(r * 0.8, r * 2.4, 5);
      const mesh = new THREE.Mesh(geo, mat);
      // scatter in a ring, keeping the central firing corridor clean
      const angle = Math.random() * Math.PI * 2;
      const dist = 18 + Math.random() * 34;
      const x = Math.sin(angle) * dist;
      const z = -Math.abs(Math.cos(angle)) * dist - 6;
      mesh.position.set(x, geo.type === 'ConeGeometry' ? r * 0.9 : r * 0.4, z);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      mesh.receiveShadow = true;
      if (dist < 34) mesh.castShadow = true;
      group.add(mesh);
    }

    // a few distant monoliths for horizon composition
    for (let i = 0; i < 5; i++) {
      const h = 6 + Math.random() * 10;
      const w = 1.2 + Math.random() * 2.4;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, w),
        new THREE.MeshStandardMaterial({
          color: PALETTE.props[2],
          roughness: 1,
          metalness: 0,
          flatShading: true,
        }),
      );
      mesh.position.set(
        (Math.random() - 0.5) * 90,
        h / 2,
        -(55 + Math.random() * 25),
      );
      mesh.rotation.y = Math.random() * Math.PI;
      group.add(mesh);
    }

    this.scene.add(group);
  }

  /** Thin coral frame marking the shooting range in the air. */
  private buildRange(): void {
    const w = 19;
    const h = 5.6;
    const z = -23.8;
    const pts = [
      new THREE.Vector3(-w, 0.1, z),
      new THREE.Vector3(w, 0.1, z),
      new THREE.Vector3(w, h, z),
      new THREE.Vector3(-w, h, z),
      new THREE.Vector3(-w, 0.1, z),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.35 }),
    );
    this.scene.add(line);
  }

  update(dt: number, aimX: number, aimY: number): void {
    this.time += dt;
    const bob = Math.sin(this.time * 0.9) * 0.018;
    const swayX = Math.sin(this.time * 0.6) * 0.008;

    this.camera.position.set(BASE_POS.x + swayX, BASE_POS.y + bob, BASE_POS.z);
    this.camera.rotation.set(aimY * 0.045, aimX * 0.065, 0);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
