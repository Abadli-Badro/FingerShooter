/** 1€ filter — adaptive low-pass that keeps aim snappy while killing jitter. */
class OneEuro {
  private hasPrev = false;
  private prev = 0;
  private prevDeriv = 0;

  constructor(
    private minCutoff: number,
    private beta: number,
  ) {}

  filter(value: number, dt: number): number {
    if (!this.hasPrev) {
      this.hasPrev = true;
      this.prev = value;
      this.prevDeriv = 0;
      return value;
    }
    const deriv = (value - this.prev) / dt;
    const dCutoff = 1.0 + Math.abs(deriv);
    const aDeriv = OneEuro.alpha(dCutoff, dt);
    const derivSmoothed = this.prevDeriv + aDeriv * (deriv - this.prevDeriv);
    const cutoff = this.minCutoff + this.beta * Math.abs(derivSmoothed);
    const a = OneEuro.alpha(cutoff, dt);
    const result = this.prev + a * (value - this.prev);
    this.prev = result;
    this.prevDeriv = derivSmoothed;
    return result;
  }

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
}

export class AimSmoother {
  private fx: OneEuro;
  private fy: OneEuro;

  constructor(
    private minCutoff: number,
    private beta: number,
  ) {
    this.fx = new OneEuro(minCutoff, beta);
    this.fy = new OneEuro(minCutoff, beta);
  }

  filter(x: number, y: number, dt: number): { x: number; y: number } {
    return { x: this.fx.filter(x, dt), y: this.fy.filter(y, dt) };
  }

  reset(): void {
    this.fx = new OneEuro(this.minCutoff, this.beta);
    this.fy = new OneEuro(this.minCutoff, this.beta);
  }
}
