/**
 * Tiny SFX kit (Web Audio). Most sounds are procedurally synthesized; the
 * gunshot uses a decoded sample from /assets with a synth fallback.
 * The AudioContext is created lazily on the first user gesture.
 *
 * Everything feeds a shared short echo bus so the kit sits in a "digital
 * space" instead of sounding like dry beeps — echoes are lowpassed so they
 * stay thin and machine-like.
 */
const SHOT_SAMPLE_URL = 'assets/freesound_community-shoot-2-81137.mp3';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wet: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private shotBuffer: AudioBuffer | null = null;
  private shotLoading = false;

  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      void this.loadShotSample();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(this.ctx.destination);

    // --- echo send bus (shared by every sound) ---
    const delay = this.ctx.createDelay(1);
    delay.delayTime.value = 0.17;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.32;
    const damp = this.ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2600;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.16;
    this.wet.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    damp.connect(this.master);

    // shared noise buffer
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    void this.loadShotSample();
  }

  /** Fetch + decode the gunshot sample once; procedural fallback stays armed. */
  private loadShotSample(): void {
    if (this.shotLoading || this.shotBuffer || !this.ctx) return;
    this.shotLoading = true;
    fetch(SHOT_SAMPLE_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`shot sample HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => this.ctx?.decodeAudioData(buf))
      .then((decoded) => {
        if (decoded) this.shotBuffer = decoded;
      })
      .catch(() => {
        /* keep the procedural laser as the shot sound */
      })
      .finally(() => {
        this.shotLoading = false;
      });
  }

  /** Plays one-shot from the decoded sample; false if not available yet. */
  private playShotSample(): boolean {
    if (!this.ctx || !this.master || !this.shotBuffer) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = this.shotBuffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(gain).connect(this.master);
    const wet = this.wet;
    if (wet) gain.connect(wet);
    src.start(this.ctx.currentTime);
    return true;
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
    const wet = this.wet;
    if (wet) gain.connect(wet);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private hiss(dur: number, cutoffFrom: number, cutoffTo: number, peak: number, delay = 0): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime + delay;
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
    const wet = this.wet;
    if (wet) gain.connect(wet);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  shot(): void {
    // gunshot sample is the primary shot; procedural laser until it's decoded
    if (this.playShotSample()) return;
    this.tone('square', 1900, 150, 0.11, 0.5);
    this.tone('square', 950, 90, 0.14, 0.25);
    this.tone('sine', 180, 60, 0.1, 0.35);
    this.hiss(0.1, 5200, 600, 0.5);
  }

  hit(streak: number): void {
    // minor-pentatonic chime — streaks climb the scale instead of raw
    // semitones, so combos sound musical rather than shrill
    const penta = [0, 3, 5, 7, 10];
    const deg = Math.min(streak, 15);
    const semi = penta[deg % 5] + 12 * Math.floor(deg / 5);
    const f = 523.25 * Math.pow(2, semi / 12);
    this.tone('triangle', f, f, 0.16, 0.42);
    this.tone('square', f * 2, f * 2, 0.06, 0.1);
    this.tone('sine', f * 3.01, f * 3.01, 0.05, 0.06);
  }

  comboBreak(): void {
    // two-step glitch stutter down
    this.tone('square', 420, 380, 0.05, 0.2);
    this.tone('square', 300, 120, 0.16, 0.24);
    this.hiss(0.12, 2600, 300, 0.3);
  }

  hazard(): void {
    // stuttering alarm, then a long dive
    for (let i = 0; i < 3; i++) {
      this.tone('sawtooth', 660, 440, 0.09, 0.3, i * 0.08);
    }
    this.tone('sawtooth', 220, 55, 0.4, 0.35, 0.24);
    this.hiss(0.36, 1400, 90, 0.45);
  }

  ui(): void {
    // terminal blip: quick up-chirp + sparkle
    this.tone('square', 700, 1150, 0.05, 0.2);
    this.tone('sine', 1400, 1400, 0.04, 0.1, 0.05);
  }

  count(final: boolean): void {
    if (final) {
      this.tone('sine', 880, 880, 0.35, 0.32);
      this.tone('sine', 1320, 1320, 0.3, 0.16, 0.04);
    } else {
      this.tone('sine', 620, 620, 0.13, 0.26);
      this.tone('sine', 930, 930, 0.08, 0.1, 0.03);
    }
  }

  roundOver(record: boolean): void {
    if (record) {
      // rising 5-note arp with octave sparkle
      const notes = [523, 659, 784, 1047, 1319];
      notes.forEach((f, i) => {
        this.tone('triangle', f, f, 0.3, 0.3, i * 0.1);
        this.tone('square', f * 2, f * 2, 0.1, 0.08, i * 0.1);
      });
    } else {
      // descending minor arp — resolves instead of just stopping
      [392, 330, 262, 196].forEach((f, i) =>
        this.tone('triangle', f, f, 0.3, 0.24, i * 0.13),
      );
    }
  }
}
