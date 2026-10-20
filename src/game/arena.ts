import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { PALETTE } from './config';

const BASE_POS = new THREE.Vector3(0, 1.66, 0);

/**
 * VR simulation range: black void, scrolling phosphor-green grid floor, a
 * banded green data-sun on the horizon, emissive wireframe props, bloom post.
 * Static first-person camera with idle breathing + aim parallax.
 */
export class Arena {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.05, 220);
  readonly renderer: THREE.WebGLRenderer;

  private composer: EffectComposer;
  private gridMat: THREE.ShaderMaterial;
  private sunMat!: THREE.MeshBasicMaterial;
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.scene.background = new THREE.Color(PALETTE.bg);
    this.scene.fog = new THREE.Fog(PALETTE.bg, 30, 120);

    this.camera.position.copy(BASE_POS);
    this.scene.add(this.camera);

    this.buildLights();
    this.gridMat = this.buildGridFloor();
    this.buildSun();
    this.buildProps();
    this.buildRange();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.35, 0.9);
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private buildLights(): void {
    // low-key so emissive + bloom carry the look
    this.scene.add(new THREE.AmbientLight(0x06140a, 1.6));

    // green key from low in front
    const key = new THREE.PointLight(PALETTE.grid, 22, 90, 2);
    key.position.set(0, 2.5, -16);
    this.scene.add(key);

    // cooler green rim from behind the targets
    const rim = new THREE.PointLight(0x66ffaa, 14, 80, 2);
    rim.position.set(-12, 8, -34);
    this.scene.add(rim);

    // faint fill high right
    const fill = new THREE.PointLight(0x0a5a2a, 8, 70, 2);
    fill.position.set(16, 10, -8);
    this.scene.add(fill);
  }

  /** Dark plane with an animated, scrolling, anti-aliased neon grid. */
  private buildGridFloor(): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBase: { value: new THREE.Color(PALETTE.ground) },
        uGrid: { value: new THREE.Color(PALETTE.grid) },
        uFog: { value: new THREE.Color(PALETTE.bg) },
        uFogNear: { value: 30 },
        uFogFar: { value: 120 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uBase;
        uniform vec3 uGrid;
        uniform vec3 uFog;
        uniform float uFogNear;
        uniform float uFogFar;
        varying vec3 vWorld;

        float gridLine(vec2 p, float scale, float thickness) {
          vec2 c = p * scale;
          // scroll toward the camera
          c.y += uTime * 0.9;
          vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
          float line = min(g.x, g.y);
          return 1.0 - smoothstep(0.0, thickness, line);
        }

        void main() {
          // world XZ plane
          vec2 p = vWorld.xz;

          float major = gridLine(p, 0.25, 1.6);
          float minor = gridLine(p, 1.0, 1.1) * 0.35;
          float grid = max(major, minor);

          // fade the grid out with distance from the camera origin
          float dist = length(vWorld - cameraPosition);
          float fade = 1.0 - smoothstep(18.0, 95.0, dist);

          vec3 col = uBase;
          col += uGrid * grid * fade * 1.6;

          // horizon glow band near the far plane
          float horizon = smoothstep(60.0, 100.0, dist);
          col = mix(col, uFog, horizon);

          // apply scene fog so the floor matches the void
          float fogF = smoothstep(uFogNear, uFogFar, dist);
          col = mix(col, uFog, fogF);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1), mat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    return mat;
  }

  /** Banded data-sun on the horizon behind the range. */
  private buildSun(): void {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.42;

    // gradient disc: bright phosphor top -> deep green bottom
    const grad = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    grad.addColorStop(0, '#9dffc4');
    grad.addColorStop(0.4, '#00ff6a');
    grad.addColorStop(1, '#0a7a3c');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // horizontal scanline cutouts (wider toward the bottom)
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) {
      const y = cy + (i / 7) * r;
      const h = 3 + i * 2.5;
      ctx.fillRect(cx - r, y, r * 2, h);
    }
    ctx.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    this.sunMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      fog: false,
      depthWrite: false,
    });
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), this.sunMat);
    sun.position.set(0, 10, -108);
    this.scene.add(sun);
  }

  /** Dark low-poly silhouettes with emissive neon trim, clear of the corridor. */
  private buildProps(): void {
    const group = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({
      color: 0x04140a,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
    });

    // emissive wireframe pyramids scattered around the range
    const wireMats = [
      new THREE.MeshBasicMaterial({ color: PALETTE.grid, wireframe: true, fog: true }),
      new THREE.MeshBasicMaterial({ color: 0x66ffaa, wireframe: true, fog: true }),
    ];
    for (let i = 0; i < 14; i++) {
      const h = 2 + Math.random() * 5;
      const geo = new THREE.ConeGeometry(h * 0.55, h, 4);
      const mesh = new THREE.Mesh(geo, i % 2 ? wireMats[0] : wireMats[1]);
      const angle = Math.random() * Math.PI * 2;
      const dist = 16 + Math.random() * 30;
      const x = Math.sin(angle) * dist;
      const z = -Math.abs(Math.cos(angle)) * dist - 8;
      mesh.position.set(x, h / 2, z);
      mesh.rotation.y = Math.random() * Math.PI;
      group.add(mesh);

      // solid dark core so they read as objects, not just lines
      const core = new THREE.Mesh(new THREE.ConeGeometry(h * 0.4, h * 0.96, 4), dark);
      core.position.copy(mesh.position);
      core.rotation.copy(mesh.rotation);
      group.add(core);
    }

    // glowing obelisks
    const obeliskMat = new THREE.MeshStandardMaterial({
      color: 0x08180e,
      emissive: PALETTE.accent,
      emissiveIntensity: 0.5,
      roughness: 0.6,
      metalness: 0.2,
      flatShading: true,
    });
    for (let i = 0; i < 5; i++) {
      const h = 6 + Math.random() * 8;
      const w = 0.8 + Math.random() * 1.2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), obeliskMat);
      mesh.position.set((Math.random() - 0.5) * 90, h / 2, -(55 + Math.random() * 25));
      mesh.rotation.y = Math.random() * Math.PI;
      group.add(mesh);
    }

    // floating neon diamonds (slow bob handled in update via userData)
    const diamondMat = new THREE.MeshStandardMaterial({
      color: 0x06140a,
      emissive: PALETTE.grid,
      emissiveIntensity: 0.9,
      roughness: 0.4,
      metalness: 0.3,
      flatShading: true,
    });
    for (let i = 0; i < 6; i++) {
      const s = 0.5 + Math.random() * 0.7;
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), diamondMat);
      const angle = Math.random() * Math.PI * 2;
      const dist = 14 + Math.random() * 26;
      const x = Math.sin(angle) * dist;
      const z = -Math.abs(Math.cos(angle)) * dist - 10;
      const y = 3 + Math.random() * 6;
      mesh.position.set(x, y, z);
      mesh.rotation.z = Math.PI / 4;
      mesh.userData.floatBase = y;
      mesh.userData.floatPhase = Math.random() * Math.PI * 2;
      mesh.userData.isFloat = true;
      group.add(mesh);
    }

    this.scene.add(group);
  }

  /** Thin cyan frame marking the shooting range in the air. */
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
      new THREE.LineBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.55 }),
    );
    this.scene.add(line);
  }

  /** Float the diamonds + pulse the sun. */
  private updateProps(dt: number): void {
    this.scene.traverse((o) => {
      if (o.userData?.isFloat) {
        o.position.y =
          o.userData.floatBase + Math.sin(this.time * 0.8 + o.userData.floatPhase) * 0.5;
        o.rotation.y += dt * 0.6;
      }
    });
    // gentle sun pulse
    const pulse = 0.85 + Math.sin(this.time * 0.6) * 0.1;
    this.sunMat.opacity = pulse;
  }

  update(dt: number, aimX: number, aimY: number): void {
    this.time += dt;
    const bob = Math.sin(this.time * 0.9) * 0.018;
    const swayX = Math.sin(this.time * 0.6) * 0.008;

    this.gridMat.uniforms.uTime.value = this.time;
    this.updateProps(dt);

    this.camera.position.set(BASE_POS.x + swayX, BASE_POS.y + bob, BASE_POS.z);
    this.camera.rotation.set(aimY * 0.045, aimX * 0.065, 0);
  }

  render(): void {
    this.composer.render();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }
}
