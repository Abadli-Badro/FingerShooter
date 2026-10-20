/**
 * Digital-rain backdrop: falling columns of glyphs on a canvas.
 * Runs only while a screen with class `has-rain` is mounted.
 */
const GLYPHS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789';

interface Column {
  x: number;
  y: number;
  speed: number;
  len: number;
  chars: string[];
}

export class MatrixRain {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private columns: Column[] = [];
  private raf = 0;
  private last = 0;
  private fontSize = 16;
  private dpr = 1;

  constructor(private host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'rain-canvas';
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.host.appendChild(this.canvas);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.draw(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy(): void {
    this.stop();
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }

  private resize = (): void => {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.fontSize = w < 640 ? 13 : 16;
    this.seed(w, h);
  };

  private seed(w: number, h: number): void {
    const count = Math.ceil(w / this.fontSize);
    this.columns = [];
    for (let i = 0; i < count; i++) {
      this.columns.push(this.makeColumn(i * this.fontSize, h, true));
    }
  }

  private makeColumn(x: number, h: number, initial: boolean): Column {
    const len = 8 + Math.floor(Math.random() * 26);
    const chars: string[] = [];
    for (let i = 0; i < len; i++) chars.push(this.randGlyph());
    return {
      x,
      y: initial ? Math.random() * h : -Math.random() * h * 0.5,
      speed: 60 + Math.random() * 160,
      len,
      chars,
    };
  }

  private randGlyph(): string {
    return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  }

  private draw(dt: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // trail fade — leaves a faint ghost behind each glyph
    this.ctx.fillStyle = 'rgba(0, 4, 2, 0.14)';
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.font = `${this.fontSize}px 'JetBrains Mono', ui-monospace, monospace`;
    this.ctx.textBaseline = 'top';

    for (const col of this.columns) {
      col.y += col.speed * dt;
      // recycle the column once it has fully passed the bottom
      if (col.y - col.len * this.fontSize > h) {
        const fresh = this.makeColumn(col.x, h, false);
        col.y = fresh.y;
        col.speed = fresh.speed;
        col.len = fresh.len;
        col.chars = fresh.chars;
      }

      for (let i = 0; i < col.len; i++) {
        const gy = col.y - i * this.fontSize;
        if (gy < -this.fontSize || gy > h) continue;
        // mutate a glyph now and then so the stream keeps shifting
        if (Math.random() < 0.02) col.chars[i] = this.randGlyph();
        if (i === 0) {
          this.ctx.fillStyle = '#d6ffe6';
          this.ctx.shadowColor = '#00ff6a';
          this.ctx.shadowBlur = 10;
        } else {
          const fade = 1 - i / col.len;
          this.ctx.fillStyle = `rgba(0, 255, 106, ${0.25 + fade * 0.6})`;
          this.ctx.shadowBlur = 0;
        }
        this.ctx.fillText(col.chars[i], col.x, gy);
      }
    }
    this.ctx.shadowBlur = 0;
  }
}
