/**
 * Tiny procedurally-synthesized SFX kit (Web Audio, zero assets).
 * The AudioContext is created lazily on the first user gesture.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(this.ctx.destination);

    // shared noise buffer
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    peak: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private hiss(dur: number, cutoffFrom: number, cutoffTo: number, peak: number): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffFrom, t);
    filter.frequency.exponentialRampToValueAtTime(cutoffTo, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  shot(): void {
    this.hiss(0.14, 2400, 220, 0.9);
    this.tone('sine', 170, 52, 0.16, 0.55);
  }

  hit(streak: number): void {
    const semis = Math.min(streak, 14);
    const f = 480 * Math.pow(2, semis / 12);
    this.tone('triangle', f, f * 1.02, 0.14, 0.4);
    this.tone('sine', f * 2, f * 2, 0.07, 0.15);
  }

  comboBreak(): void {
    this.tone('square', 130, 70, 0.18, 0.28);
  }

  hazard(): void {
    this.tone('sawtooth', 220, 60, 0.32, 0.4);
    this.hiss(0.3, 900, 100, 0.5);
  }

  ui(): void {
    this.tone('sine', 640, 640, 0.07, 0.22);
  }

  count(final: boolean): void {
    this.tone('sine', final ? 880 : 440, final ? 880 : 440, final ? 0.4 : 0.12, 0.3);
  }

  roundOver(record: boolean): void {
    if (record) {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => this.tone('triangle', f, f, 0.32, 0.3, i * 0.11));
    } else {
      this.tone('triangle', 392, 392, 0.3, 0.25);
      this.tone('triangle', 262, 262, 0.45, 0.22, 0.16);
    }
  }
}
