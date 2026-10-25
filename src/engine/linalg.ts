// Small dense linear solver. The thermal network has ~50 nodes, so a plain LU
// factorisation with partial pivoting is fast enough and has no dependencies.

export class DenseLU {
  readonly n: number;
  private readonly lu: Float64Array;
  private readonly piv: Int32Array;

  constructor(n: number) {
    this.n = n;
    this.lu = new Float64Array(n * n);
    this.piv = new Int32Array(n);
  }

  /** Factorises A (row-major, length n²). A is copied, not modified. */
  factor(A: Float64Array): void {
    const { n, lu, piv } = this;
    lu.set(A);
    for (let i = 0; i < n; i++) piv[i] = i;
    for (let k = 0; k < n; k++) {
      let p = k;
      let max = Math.abs(lu[k * n + k]);
      for (let i = k + 1; i < n; i++) {
        const v = Math.abs(lu[i * n + k]);
        if (v > max) {
          max = v;
          p = i;
        }
      }
      if (max === 0) throw new Error('Thermal network matrix is singular (a node is not connected to anything).');
      if (p !== k) {
        for (let j = 0; j < n; j++) {
          const t = lu[k * n + j];
          lu[k * n + j] = lu[p * n + j];
          lu[p * n + j] = t;
        }
        const t = piv[k];
        piv[k] = piv[p];
        piv[p] = t;
      }
      const pivot = lu[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = (lu[i * n + k] /= pivot);
        if (f === 0) continue;
        const ri = i * n;
        const rk = k * n;
        for (let j = k + 1; j < n; j++) lu[ri + j] -= f * lu[rk + j];
      }
    }
  }

  /** Solves A x = b using the last factorisation. Writes x into `out`. */
  solve(b: Float64Array, out: Float64Array): void {
    const { n, lu, piv } = this;
    for (let i = 0; i < n; i++) out[i] = b[piv[i]];
    for (let i = 0; i < n; i++) {
      let s = out[i];
      const ri = i * n;
      for (let j = 0; j < i; j++) s -= lu[ri + j] * out[j];
      out[i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = out[i];
      const ri = i * n;
      for (let j = i + 1; j < n; j++) s -= lu[ri + j] * out[j];
      out[i] = s / lu[ri + i];
    }
  }
}
