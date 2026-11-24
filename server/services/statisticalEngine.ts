export type DiagnosticStatus =
  | 'Satisfied'
  | 'Potential Violation'
  | 'Requires Further Evaluation';

export interface AssumptionDiagnostic {
  name: string;
  value: string;
  pValue?: number | null;
  status: DiagnosticStatus;
  interpretation: string;
  recommendedAction: string;
}

export interface GroupDescriptive {
  group: string;
  n: number;
  mean: number;
  sd: number;
  median: number;
  iqr: number;
  min: number;
  max: number;
}

export interface StatisticalComputationResult {
  procedure: string;
  researchQuestion: string;
  variables: Record<string, unknown>;
  sampleSize: number;
  alpha: number;
  descriptives: GroupDescriptive[];
  testResults: {
    statisticName: string;
    statisticValue: number;
    df: string;
    pValue: number;
    significant: boolean;
    decision: string;
    details: Record<string, unknown>;
  };
  effectSize: {
    name: string;
    value: number;
    magnitude: string;
    explanation: string;
  };
  confidenceInterval: {
    level: number;
    lower: number | null;
    upper: number | null;
    label: string;
  };
  diagnostics: AssumptionDiagnostic[];
  postHoc: Array<{
    comparison: string;
    meanDiff: number;
    pValue: number;
    significant: boolean;
  }>;
  alternativeProcedure?: {
    name: string;
    statisticName: string;
    statisticValue: number;
    pValue: number;
    summary: string;
  };
  technicalInterpretation: string;
  simplifiedInterpretation: string;
  visualization: {
    type: 'bar' | 'scatter' | 'grouped_bar' | 'residual';
    title: string;
    xLabel: string;
    yLabel: string;
    labels?: string[];
    datasets: Array<{
      label: string;
      data: Array<number | { x: number; y: number }>;
      backgroundColor?: string | string[];
      borderColor?: string;
      type?: 'bar' | 'line' | 'scatter';
    }>;
  };
}

// ============================================================================
// Exact Mathematical & Distribution Primitives
// ============================================================================

function logGamma(z: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j += 1) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

function regularizedGammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n <= 200; n += 1) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 3e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // Continued fraction (Q = 1 - P)
  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 200; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  const q = Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
  return Math.max(0, Math.min(1, 1 - q));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t) *
      Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// Acklam inverse normal CDF
export function inverseNormalCdf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

export function tTwoTailedP(t: number, df: number): number {
  if (df <= 0 || !Number.isFinite(t)) return 1;
  const x = df / (df + t * t);
  return Math.max(0, Math.min(1, regularizedIncompleteBeta(x, df / 2, 0.5)));
}

export function tCriticalValue(alphaTwoTailed: number, df: number): number {
  const target = 1 - alphaTwoTailed / 2;
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    const pHalf = 0.5 * regularizedIncompleteBeta(df / (df + mid * mid), df / 2, 0.5);
    const cdf = 1 - pHalf;
    if (cdf < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function fUpperTailP(f: number, df1: number, df2: number): number {
  if (f <= 0 || df1 <= 0 || df2 <= 0) return 1;
  const x = df2 / (df2 + df1 * f);
  return Math.max(0, Math.min(1, regularizedIncompleteBeta(x, df2 / 2, df1 / 2)));
}

export function chiSquareUpperTailP(chi2: number, df: number): number {
  if (chi2 <= 0 || df <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - regularizedGammaP(df / 2, chi2 / 2)));
}

// ============================================================================
// Descriptive Statistics & Assumption Diagnostics
// ============================================================================

function computeDescriptives(name: string, rawValues: number[]): GroupDescriptive {
  const sorted = [...rawValues].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, x) => s + x, 0) / n;
  const variance =
    n > 1 ? sorted.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const quantile = (q: number) => {
    const pos = (n - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
  };
  const median = quantile(0.5);
  const q1 = quantile(0.25);
  const q3 = quantile(0.75);
  return {
    group: name,
    n,
    mean: round4(mean),
    sd: round4(sd),
    median: round4(median),
    iqr: round4(q3 - q1),
    min: round4(sorted[0]),
    max: round4(sorted[n - 1]),
  };
}

function round4(v: number): number {
  return Number.isFinite(v) ? Number(v.toFixed(4)) : 0;
}

function formatP(p: number): string {
  if (p < 0.001) return '< .001';
  return p.toFixed(4);
}

// Shapiro-Wilk Normality Test (Royston algorithm)
export function shapiroWilkTest(values: number[]): { W: number; pValue: number } {
  const n = values.length;
  if (n < 3) return { W: 1, pValue: 1 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((s, x) => s + x, 0) / n;
  const ss = sorted.reduce((s, x) => s + (x - mean) ** 2, 0);
  if (ss === 0) return { W: 1, pValue: 1 };

  const m = sorted.map((_, i) => inverseNormalCdf((i + 1 - 0.375) / (n + 0.25)));
  const mSumSq = m.reduce((s, v) => s + v * v, 0);
  const u = 1 / Math.sqrt(n);

  const a = new Array<number>(n).fill(0);
  const poly = (c: number[], x: number) =>
    c.reduce((acc, coef) => acc * x + coef, 0);

  if (n <= 5) {
    for (let i = 0; i < n; i += 1) a[i] = m[i] / Math.sqrt(mSumSq);
  } else {
    a[n - 1] =
      poly([-2.706056, 4.434685, -2.07119, -0.147981, 0.221157, 0], u) +
      m[n - 1] / Math.sqrt(mSumSq);
    a[0] = -a[n - 1];
    if (n > 5) {
      a[n - 2] =
        poly([-3.582633, 5.682633, -1.752461, -0.293762, 0.042981, 0], u) +
        m[n - 2] / Math.sqrt(mSumSq);
      a[1] = -a[n - 2];
    }
    const phi =
      (mSumSq - 2 * m[n - 1] ** 2 - (n > 5 ? 2 * m[n - 2] ** 2 : 0)) /
      (1 - 2 * a[n - 1] ** 2 - (n > 5 ? 2 * a[n - 2] ** 2 : 0));
    const start = n > 5 ? 2 : 1;
    const end = n - start;
    const sqrtPhi = Math.sqrt(Math.max(1e-12, phi));
    for (let i = start; i < end; i += 1) {
      a[i] = m[i] / sqrtPhi;
    }
  }

  let b = 0;
  for (let i = 0; i < n; i += 1) b += a[i] * sorted[i];
  const W = Math.min(1, Math.max(0, (b * b) / ss));

  // Royston normal transformation for p-value
  if (n <= 11) {
    const gamma = 0.459 * n - 2.273;
    const wLog = -Math.log(Math.max(1e-12, gamma - Math.log(Math.max(1e-12, 1 - W))));
    const mu = -0.0006714 * n ** 3 + 0.025054 * n ** 2 - 0.39978 * n + 0.544;
    const sigma = Math.exp(-0.0020322 * n ** 3 + 0.062767 * n ** 2 - 0.77857 * n + 1.3822);
    const z = (wLog - mu) / sigma;
    return { W: round4(W), pValue: round4(Math.max(0, Math.min(1, 1 - normalCdf(z)))) };
  }
  const lnN = Math.log(n);
  const y = Math.log(Math.max(1e-12, 1 - W));
  const mu = 0.0038915 * lnN ** 3 - 0.083751 * lnN ** 2 - 0.31082 * lnN - 1.5861;
  const sigma = Math.exp(0.0030302 * lnN ** 2 - 0.082676 * lnN - 0.4803);
  const z = (y - mu) / sigma;
  return { W: round4(W), pValue: round4(Math.max(0, Math.min(1, 1 - normalCdf(z)))) };
}

// Levene's / Brown-Forsythe Test for Homogeneity of Variance
export function levenesTest(groups: number[][]): { F: number; pValue: number } {
  const k = groups.length;
  const N = groups.reduce((s, g) => s + g.length, 0);
  if (k < 2 || N <= k) return { F: 0, pValue: 1 };

  const zGroups = groups.map((g) => {
    const sorted = [...g].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const med =
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    return g.map((x) => Math.abs(x - med));
  });

  const zMeans = zGroups.map((zg) => zg.reduce((s, x) => s + x, 0) / zg.length);
  const grandZMean =
    zGroups.flat().reduce((s, x) => s + x, 0) / N;

  let ssBetween = 0;
  let ssWithin = 0;
  for (let i = 0; i < k; i += 1) {
    ssBetween += zGroups[i].length * (zMeans[i] - grandZMean) ** 2;
    for (const z of zGroups[i]) {
      ssWithin += (z - zMeans[i]) ** 2;
    }
  }
  const df1 = k - 1;
  const df2 = N - k;
  const msBetween = ssBetween / df1;
  const msWithin = ssWithin / df2;
  const F = msWithin > 0 ? msBetween / msWithin : 0;
  const pValue = fUpperTailP(F, df1, df2);
  return { F: round4(F), pValue: round4(pValue) };
}

// Nonparametric Helpers
function rankWithTies(values: number[]): { ranks: number[]; tieCorrectionSum: number } {
  const indexed = values.map((v, idx) => ({ v, idx })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  let tieCorrectionSum = 0;
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) {
      j += 1;
    }
    const avgRank = (i + 1 + (j + 1)) / 2;
    const t = j - i + 1;
    if (t > 1) tieCorrectionSum += t ** 3 - t;
    for (let k = i; k <= j; k += 1) {
      ranks[indexed[k].idx] = avgRank;
    }
    i = j + 1;
  }
  return { ranks, tieCorrectionSum };
}

function kruskalWallis(groups: number[][]): { H: number; pValue: number } {
  const flat: number[] = [];
  const groupIndices: number[] = [];
  groups.forEach((g, gi) => {
    g.forEach((v) => {
      flat.push(v);
      groupIndices.push(gi);
    });
  });
  const N = flat.length;
  const { ranks, tieCorrectionSum } = rankWithTies(flat);
  const sumRanks = new Array<number>(groups.length).fill(0);
  ranks.forEach((r, idx) => {
    sumRanks[groupIndices[idx]] += r;
  });
  let hRaw = 0;
  groups.forEach((g, gi) => {
    hRaw += (sumRanks[gi] ** 2) / g.length;
  });
  let H = (12 / (N * (N + 1))) * hRaw - 3 * (N + 1);
  const tieDenom = 1 - tieCorrectionSum / (N ** 3 - N);
  if (tieDenom > 0) H /= tieDenom;
  const pValue = chiSquareUpperTailP(H, groups.length - 1);
  return { H: round4(H), pValue: round4(pValue) };
}

function mannWhitneyU(g1: number[], g2: number[]): { U: number; pValue: number } {
  const combined = [...g1, ...g2];
  const { ranks, tieCorrectionSum } = rankWithTies(combined);
  const r1 = ranks.slice(0, g1.length).reduce((s, r) => s + r, 0);
  const n1 = g1.length;
  const n2 = g2.length;
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const U = Math.min(u1, u2);
  const N = n1 + n2;
  const muU = (n1 * n2) / 2;
  const sigmaU = Math.sqrt(
    ((n1 * n2) / 12) * (N + 1 - tieCorrectionSum / (N * (N - 1))),
  );
  const z = sigmaU > 0 ? Math.abs(U - muU) / sigmaU : 0;
  const pValue = 2 * (1 - normalCdf(z));
  return { U: round4(U), pValue: round4(pValue) };
}

function wilcoxonSignedRank(diffs: number[]): { W: number; pValue: number } {
  const nonZero = diffs.filter((d) => d !== 0);
  const n = nonZero.length;
  if (n === 0) return { W: 0, pValue: 1 };
  const absVals = nonZero.map(Math.abs);
  const { ranks, tieCorrectionSum } = rankWithTies(absVals);
  let wPlus = 0;
  let wMinus = 0;
  nonZero.forEach((d, idx) => {
    if (d > 0) wPlus += ranks[idx];
    else wMinus += ranks[idx];
  });
  const W = Math.min(wPlus, wMinus);
  const mu = (n * (n + 1)) / 4;
  const sigma = Math.sqrt(
    (n * (n + 1) * (2 * n + 1) - 0.5 * tieCorrectionSum) / 24,
  );
  const z = sigma > 0 ? Math.abs(W - mu) / sigma : 0;
  const pValue = 2 * (1 - normalCdf(z));
  return { W: round4(W), pValue: round4(pValue) };
}

function spearmanCorrelation(x: number[], y: number[]): { rho: number; pValue: number } {
  const rx = rankWithTies(x).ranks;
  const ry = rankWithTies(y).ranks;
  const n = rx.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  const rho = dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  const t = Math.abs(rho) < 1 ? rho * Math.sqrt((n - 2) / (1 - rho * rho)) : 0;
  const pValue = Math.abs(rho) >= 1 ? 0 : tTwoTailedP(t, n - 2);
  return { rho: round4(rho), pValue: round4(pValue) };
}

function invertMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  const aug = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let i = 0; i < n; i += 1) {
    let maxRow = i;
    for (let r = i + 1; r < n; r += 1) {
      if (Math.abs(aug[r][i]) > Math.abs(aug[maxRow][i])) maxRow = r;
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
    const pivot = aug[i][i];
    if (Math.abs(pivot) < 1e-12) {
      throw new Error('Predictors are collinear (singular matrix). Remove duplicate or linearly dependent predictors.');
    }
    for (let c = 0; c < 2 * n; c += 1) aug[i][c] /= pivot;
    for (let r = 0; r < n; r += 1) {
      if (r === i) continue;
      const factor = aug[r][i];
      for (let c = 0; c < 2 * n; c += 1) {
        aug[r][c] -= factor * aug[i][c];
      }
    }
  }
  return aug.map((row) => row.slice(n));
}

function logFactorial(n: number): number {
  return logGamma(n + 1);
}

function fishersExact2x2(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const c2 = b + d;
  const prob = (x: number) => {
    const y = r1 - x;
    const z = c1 - x;
    const w = c2 - y;
    return Math.exp(
      logFactorial(r1) +
        logFactorial(r2) +
        logFactorial(c1) +
        logFactorial(c2) -
        logFactorial(n) -
        logFactorial(x) -
        logFactorial(y) -
        logFactorial(z) -
        logFactorial(w),
    );
  };
  const pObs = prob(a);
  const minA = Math.max(0, c1 - r2);
  const maxA = Math.min(r1, c1);
  let pTotal = 0;
  for (let x = minA; x <= maxA; x += 1) {
    const px = prob(x);
    if (px <= pObs + 1e-12) pTotal += px;
  }
  return round4(Math.min(1, pTotal));
}

// ============================================================================
// Six Core Statistical Procedures
// ============================================================================

export function runOneWayAnova(params: {
  rows: Record<string, unknown>[];
  groupColumn: string;
  valueColumn: string;
  alpha?: number;
  researchQuestion?: string;
}): StatisticalComputationResult {
  const alpha = params.alpha ?? 0.05;
  const groupsMap = new Map<string, number[]>();

  for (const row of params.rows) {
    const gRaw = row[params.groupColumn];
    const vRaw = row[params.valueColumn];
    if (gRaw === null || gRaw === undefined || String(gRaw).trim() === '') continue;
    const vNum = Number(vRaw);
    if (vRaw === null || vRaw === undefined || String(vRaw).trim() === '' || !Number.isFinite(vNum)) continue;
    const gKey = String(gRaw).trim();
    const list = groupsMap.get(gKey) || [];
    list.push(vNum);
    groupsMap.set(gKey, list);
  }

  const entries = Array.from(groupsMap.entries()).filter(([, vals]) => vals.length >= 2);
  if (entries.length < 3) {
    throw new Error('One-Way ANOVA requires at least 3 groups with 2 or more numeric observations each.');
  }

  const allValues = entries.flatMap(([, vals]) => vals);
  const N = allValues.length;
  const k = entries.length;
  const grandMean = allValues.reduce((s, x) => s + x, 0) / N;

  let ssBetween = 0;
  let ssWithin = 0;
  const descriptives: GroupDescriptive[] = [];

  for (const [gName, vals] of entries) {
    const desc = computeDescriptives(gName, vals);
    descriptives.push(desc);
    const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
    ssBetween += vals.length * (mean - grandMean) ** 2;
    for (const v of vals) ssWithin += (v - mean) ** 2;
  }

  const dfBetween = k - 1;
  const dfWithin = N - k;
  const msBetween = ssBetween / dfBetween;
  const msWithin = ssWithin / dfWithin;
  const F = msWithin > 0 ? msBetween / msWithin : 0;
  const pValue = fUpperTailP(F, dfBetween, dfWithin);
  const ssTotal = ssBetween + ssWithin;
  const etaSq = ssTotal > 0 ? ssBetween / ssTotal : 0;

  // Diagnostics: Shapiro-Wilk on residuals & Levene's test
  const residuals = entries.flatMap(([, vals]) => {
    const m = vals.reduce((s, x) => s + x, 0) / vals.length;
    return vals.map((x) => x - m);
  });
  const sw = shapiroWilkTest(residuals);
  const lev = levenesTest(entries.map(([, vals]) => vals));
  const kw = kruskalWallis(entries.map(([, vals]) => vals));

  const diagnostics: AssumptionDiagnostic[] = [
    {
      name: 'Shapiro-Wilk Test (Residual Normality)',
      value: `W = ${sw.W}`,
      pValue: sw.pValue,
      status: sw.pValue >= 0.05 ? 'Satisfied' : 'Potential Violation',
      interpretation:
        sw.pValue >= 0.05
          ? `Model residuals appear approximately normally distributed (W = ${sw.W}, p = ${formatP(sw.pValue)}).`
          : `Model residuals deviate from normality (W = ${sw.W}, p = ${formatP(sw.pValue)}).`,
      recommendedAction:
        sw.pValue >= 0.05
          ? 'Normality assumption is met.'
          : 'Inspect the Kruskal-Wallis nonparametric alternative alongside ANOVA.',
    },
    {
      name: "Levene's Test (Homogeneity of Variance)",
      value: `F = ${lev.F}`,
      pValue: lev.pValue,
      status: lev.pValue >= 0.05 ? 'Satisfied' : 'Potential Violation',
      interpretation:
        lev.pValue >= 0.05
          ? `Group variances are statistically comparable (F = ${lev.F}, p = ${formatP(lev.pValue)}).`
          : `Group variances differ significantly (F = ${lev.F}, p = ${formatP(lev.pValue)}).`,
      recommendedAction:
        lev.pValue >= 0.05
          ? 'Equal-variance assumption is supported.'
          : 'Consider Kruskal-Wallis or Games-Howell post-hoc interpretation.',
    },
    {
      name: 'Independence of Observations',
      value: `N = ${N}, k = ${k}`,
      pValue: null,
      status: 'Requires Further Evaluation',
      interpretation: 'Independence depends on study sampling and cannot be verified solely from raw values.',
      recommendedAction: 'Confirm each participant/observation belongs to only one group.',
    },
  ];

  // Pairwise Bonferroni-adjusted post-hoc comparisons
  const numPairs = (k * (k - 1)) / 2;
  const postHoc: StatisticalComputationResult['postHoc'] = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [n1, v1] = entries[i];
      const [n2, v2] = entries[j];
      const m1 = v1.reduce((s, x) => s + x, 0) / v1.length;
      const m2 = v2.reduce((s, x) => s + x, 0) / v2.length;
      const diff = m1 - m2;
      const se = Math.sqrt(msWithin * (1 / v1.length + 1 / v2.length));
      const t = se > 0 ? diff / se : 0;
      const pAdj = Math.min(1, tTwoTailedP(t, dfWithin) * numPairs);
      postHoc.push({
        comparison: `${n1} vs ${n2}`,
        meanDiff: round4(diff),
        pValue: round4(pAdj),
        significant: pAdj < alpha,
      });
    }
  }

  const significant = pValue < alpha;
  const etaMag = etaSq < 0.01 ? 'Negligible' : etaSq < 0.06 ? 'Small' : etaSq < 0.14 ? 'Medium' : 'Large';

  return {
    procedure: 'One-Way ANOVA',
    researchQuestion:
      params.researchQuestion ||
      `Do mean "${params.valueColumn}" scores differ across "${params.groupColumn}" groups?`,
    variables: {
      groupingFactor: params.groupColumn,
      dependentVariable: params.valueColumn,
      groups: entries.map(([name]) => name),
    },
    sampleSize: N,
    alpha,
    descriptives,
    testResults: {
      statisticName: 'F',
      statisticValue: round4(F),
      df: `${dfBetween}, ${dfWithin}`,
      pValue: round4(pValue),
      significant,
      decision: significant ? 'Reject Null Hypothesis (H₀)' : 'Fail to Reject Null Hypothesis (H₀)',
      details: {
        ssBetween: round4(ssBetween),
        ssWithin: round4(ssWithin),
        msBetween: round4(msBetween),
        msWithin: round4(msWithin),
      },
    },
    effectSize: {
      name: 'Eta-Squared (η²)',
      value: round4(etaSq),
      magnitude: etaMag,
      explanation: `Approximately ${(etaSq * 100).toFixed(1)}% of variance in ${params.valueColumn} is explained by ${params.groupColumn}.`,
    },
    confidenceInterval: {
      level: 95,
      lower: null,
      upper: null,
      label: 'Omnibus F-test evaluates overall variance ratio; inspect pairwise group means.',
    },
    diagnostics,
    postHoc,
    alternativeProcedure: {
      name: 'Kruskal-Wallis H Test',
      statisticName: 'H',
      statisticValue: kw.H,
      pValue: kw.pValue,
      summary: `Nonparametric rank test: H(${dfBetween}) = ${kw.H}, p = ${formatP(kw.pValue)}.`,
    },
    technicalInterpretation: significant
      ? `A one-way analysis of variance revealed a statistically significant difference in ${params.valueColumn} across the ${k} ${params.groupColumn} groups, F(${dfBetween}, ${dfWithin}) = ${round4(F)}, p = ${formatP(pValue)}, η² = ${round4(etaSq)} (${etaMag.toLowerCase()} practical effect).`
      : `A one-way analysis of variance showed no statistically significant difference in ${params.valueColumn} across the ${k} ${params.groupColumn} groups, F(${dfBetween}, ${dfWithin}) = ${round4(F)}, p = ${formatP(pValue)}, η² = ${round4(etaSq)}.`,
    simplifiedInterpretation: significant
      ? `There is a real statistical difference in average ${params.valueColumn} between at least two ${params.groupColumn} groups (p = ${formatP(pValue)}), with a ${etaMag.toLowerCase()} practical impact (η² = ${round4(etaSq)}).`
      : `The observed differences in average ${params.valueColumn} across the ${params.groupColumn} groups could plausibly be due to random sampling variation (p = ${formatP(pValue)}).`,
    visualization: {
      type: 'bar',
      title: `Mean ${params.valueColumn} by ${params.groupColumn}`,
      xLabel: params.groupColumn,
      yLabel: `Mean ${params.valueColumn}`,
      labels: descriptives.map((d) => d.group),
      datasets: [
        {
          label: `Mean ${params.valueColumn}`,
          data: descriptives.map((d) => d.mean),
          backgroundColor: '#2563EB',
        },
      ],
    },
  };
}

export function runIndependentTTest(params: {
  rows: Record<string, unknown>[];
  groupColumn: string;
  valueColumn: string;
  equalVariance?: boolean;
  alpha?: number;
  researchQuestion?: string;
}): StatisticalComputationResult {
  const alpha = params.alpha ?? 0.05;
  const groupsMap = new Map<string, number[]>();

  for (const row of params.rows) {
    const gRaw = row[params.groupColumn];
    const vRaw = row[params.valueColumn];
    if (gRaw === null || gRaw === undefined || String(gRaw).trim() === '') continue;
    const vNum = Number(vRaw);
    if (vRaw === null || vRaw === undefined || String(vRaw).trim() === '' || !Number.isFinite(vNum)) continue;
    const key = String(gRaw).trim();
    const list = groupsMap.get(key) || [];
    list.push(vNum);
    groupsMap.set(key, list);
  }

  const entries = Array.from(groupsMap.entries()).filter(([, v]) => v.length >= 2);
  if (entries.length !== 2) {
    throw new Error(
      `Independent Samples T-Test requires exactly 2 groups with at least 2 observations each (found ${entries.length}).`,
    );
  }

  const [[name1, g1], [name2, g2]] = entries;
  const n1 = g1.length;
  const n2 = g2.length;
  const m1 = g1.reduce((s, x) => s + x, 0) / n1;
  const m2 = g2.reduce((s, x) => s + x, 0) / n2;
  const v1 = g1.reduce((s, x) => s + (x - m1) ** 2, 0) / (n1 - 1);
  const v2 = g2.reduce((s, x) => s + (x - m2) ** 2, 0) / (n2 - 1);

  const lev = levenesTest([g1, g2]);
  const useEqualVar = params.equalVariance !== undefined ? params.equalVariance : lev.pValue >= 0.05;

  let tStat = 0;
  let df = n1 + n2 - 2;
  let se = 0;

  if (useEqualVar) {
    const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
    se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
    tStat = se > 0 ? (m1 - m2) / se : 0;
  } else {
    se = Math.sqrt(v1 / n1 + v2 / n2);
    tStat = se > 0 ? (m1 - m2) / se : 0;
    const num = (v1 / n1 + v2 / n2) ** 2;
    const den = ((v1 / n1) ** 2) / (n1 - 1) + ((v2 / n2) ** 2) / (n2 - 1);
    df = den > 0 ? num / den : n1 + n2 - 2;
  }

  const pValue = tTwoTailedP(tStat, df);
  const meanDiff = m1 - m2;
  const tCrit = tCriticalValue(alpha, df);
  const ciLower = meanDiff - tCrit * se;
  const ciUpper = meanDiff + tCrit * se;

  const pooledSd = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  const cohensD = pooledSd > 0 ? Math.abs(meanDiff) / pooledSd : 0;
  const dMag = cohensD < 0.2 ? 'Negligible' : cohensD < 0.5 ? 'Small' : cohensD < 0.8 ? 'Medium' : 'Large';

  const sw1 = shapiroWilkTest(g1);
  const sw2 = shapiroWilkTest(g2);
  const mwu = mannWhitneyU(g1, g2);

  const diagnostics: AssumptionDiagnostic[] = [
    {
      name: `Shapiro-Wilk (${name1})`,
      value: `W = ${sw1.W}`,
      pValue: sw1.pValue,
      status: sw1.pValue >= 0.05 ? 'Satisfied' : 'Potential Violation',
      interpretation:
        sw1.pValue >= 0.05
          ? `Group "${name1}" is consistent with normality.`
          : `Group "${name1}" shows departure from normality.`,
      recommendedAction:
        sw1.pValue >= 0.05 ? 'Normality met.' : 'Verify with Mann-Whitney U test.',
    },
    {
      name: `Shapiro-Wilk (${name2})`,
      value: `W = ${sw2.W}`,
      pValue: sw2.pValue,
      status: sw2.pValue >= 0.05 ? 'Satisfied' : 'Potential Violation',
      interpretation:
        sw2.pValue >= 0.05
          ? `Group "${name2}" is consistent with normality.`
          : `Group "${name2}" shows departure from normality.`,
      recommendedAction:
        sw2.pValue >= 0.05 ? 'Normality met.' : 'Verify with Mann-Whitney U test.',
    },
    {
      name: "Levene's Test (Equal Variances)",
      value: `F = ${lev.F}`,
      pValue: lev.pValue,
      status: lev.pValue >= 0.05 ? 'Satisfied' : 'Potential Violation',
      interpretation:
        lev.pValue >= 0.05
          ? 'Group variances are comparable; Student’s t-test is appropriate.'
          : 'Group variances differ; Welch’s unequal-variance t-test was used.',
      recommendedAction:
        lev.pValue >= 0.05 ? 'Equal variance supported.' : 'Welch correction automatically applied.',
    },
  ];

  const significant = pValue < alpha;
  const variantLabel = useEqualVar ? "Student's Equal-Variance" : "Welch's Unequal-Variance";

  return {
    procedure: `Independent Samples T-Test (${variantLabel})`,
    researchQuestion:
      params.researchQuestion ||
      `Is there a mean difference in "${params.valueColumn}" between "${name1}" and "${name2}"?`,
    variables: {
      groupingFactor: params.groupColumn,
      dependentVariable: params.valueColumn,
      groups: [name1, name2],
    },
    sampleSize: n1 + n2,
    alpha,
    descriptives: [computeDescriptives(name1, g1), computeDescriptives(name2, g2)],
    testResults: {
      statisticName: 't',
      statisticValue: round4(tStat),
      df: String(round4(df)),
      pValue: round4(pValue),
      significant,
      decision: significant ? 'Reject Null Hypothesis (H₀)' : 'Fail to Reject Null Hypothesis (H₀)',
      details: {
        variant: variantLabel,
        meanDifference: round4(meanDiff),
        standardError: round4(se),
      },
    },
    effectSize: {
      name: "Cohen's d",
      value: round4(cohensD),
      magnitude: dMag,
      explanation: `The two group means differ by ${round4(cohensD)} pooled standard deviations (${dMag.toLowerCase()} practical effect).`,
    },
    confidenceInterval: {
      level: 95,
      lower: round4(ciLower),
      upper: round4(ciUpper),
      label: `95% CI of Mean Difference (${name1} − ${name2})`,
    },
    diagnostics,
    postHoc: [],
    alternativeProcedure: {
      name: 'Mann-Whitney U Test',
      statisticName: 'U',
      statisticValue: mwu.U,
      pValue: mwu.pValue,
      summary: `Nonparametric rank comparison: U = ${mwu.U}, p = ${formatP(mwu.pValue)}.`,
    },
    technicalInterpretation: `An independent-samples ${useEqualVar ? "Student's" : "Welch's"} t-test compared ${params.valueColumn} between ${name1} (M = ${round4(m1)}, SD = ${round4(Math.sqrt(v1))}) and ${name2} (M = ${round4(m2)}, SD = ${round4(Math.sqrt(v2))}). There was ${significant ? 'a statistically significant' : 'no statistically significant'} difference, t(${round4(df)}) = ${round4(tStat)}, p = ${formatP(pValue)}, 95% CI [${round4(ciLower)}, ${round4(ciUpper)}], Cohen's d = ${round4(cohensD)}.`,
    simplifiedInterpretation: significant
      ? `"${name1}" and "${name2}" have a statistically significant difference in average ${params.valueColumn} (difference = ${round4(meanDiff)}, p = ${formatP(pValue)}), representing a ${dMag.toLowerCase()} practical difference.`
      : `There is not enough statistical evidence to conclude that "${name1}" and "${name2}" differ in average ${params.valueColumn} (p = ${formatP(pValue)}).`,
    visualization: {
      type: 'bar',
      title: `${params.valueColumn}: ${name1} vs ${name2}`,
      xLabel: params.groupColumn,
      yLabel: `Mean ${params.valueColumn}`,
      labels: [name1, name2],
      datasets: [
        {
          label: `Mean ${params.valueColumn}`,
          data: [round4(m1), round4(m2)],
          backgroundColor: ['#2563EB', '#173B75'],
        },
      ],
    },
  };
}

export function runPairedTTest(params: {
  rows: Record<string, unknown>[];
  columnA: string;
  columnB: string;
  alpha?: number;
  researchQuestion?: string;
}): StatisticalComputationResult {
  const alpha = params.alpha ?? 0.05;
  const valsA: number[] = [];
  const valsB: number[] = [];

  for (const row of params.rows) {
    const a = Number(row[params.columnA]);
    const b = Number(row[params.columnB]);
    if (
      row[params.columnA] === null ||
      row[params.columnA] === undefined ||
      row[params.columnB] === null ||
      row[params.columnB] === undefined ||
      !Number.isFinite(a) ||
      !Number.isFinite(b)
    ) {
      continue;
    }
    valsA.push(a);
    valsB.push(b);
  }

  const n = valsA.length;
  if (n < 3) {
    throw new Error('Paired Samples T-Test requires at least 3 complete numeric pairs.');
  }

  const diffs = valsA.map((a, idx) => a - valsB[idx]);
  const meanDiff = diffs.reduce((s, d) => s + d, 0) / n;
  const sdDiff = Math.sqrt(
    diffs.reduce((s, d) => s + (d - meanDiff) ** 2, 0) / (n - 1),
  );
  const se = sdDiff / Math.sqrt(n);
  const tStat = se > 0 ? meanDiff / se : 0;
  const df = n - 1;
  const pValue = tTwoTailedP(tStat, df);
  const tCrit = tCriticalValue(alpha, df);
  const ciLower = meanDiff - tCrit * se;
  const ciUpper = meanDiff + tCrit * se;
  const cohensDz = sdDiff > 0 ? Math.abs(meanDiff) / sdDiff : 0;
  const dMag = cohensDz < 0.2 ? 'Negligible' : cohensDz < 0.5 ? 'Small' : cohensDz < 0.8 ? 'Medium' : 'Large';

  const swDiff = shapiroWilkTest(diffs);
  const wilcoxon = wilcoxonSignedRank(diffs);
  const significant = pValue < alpha;

  return {
    procedure: 'Paired Samples T-Test',
    researchQuestion:
      params.researchQuestion ||
      `Is there a significant paired difference between "${params.columnA}" and "${params.columnB}"?`,
    variables: { condition1: params.columnA, condition2: params.columnB },
    sampleSize: n,
    alpha,
    descriptives: [
      computeDescriptives(params.columnA, valsA),
      computeDescriptives(params.columnB, valsB),
      computeDescriptives(`Difference (${params.columnA} − ${params.columnB})`, diffs),
    ],
    testResults: {
      statisticName: 't',
      statisticValue: round4(tStat),
      df: String(df),
      pValue: round4(pValue),
      significant,
      decision: significant ? 'Reject Null Hypothesis (H₀)' : 'Fail to Reject Null Hypothesis (H₀)',
      details: {
        meanDifference: round4(meanDiff),
        sdDifference: round4(sdDiff),
        standardError: round4(se),
      },
    },
    effectSize: {
      name: "Cohen's dz",
      value: round4(cohensDz),
      magnitude: dMag,
      explanation: `Paired change magnitude is ${round4(cohensDz)} standard deviations of the difference scores (${dMag.toLowerCase()} effect).`,
    },
    confidenceInterval: {
      level: 95,
      lower: round4(ciLower),
      upper: round4(ciUpper),
      label: `95% CI of Paired Difference (${params.columnA} − ${params.columnB})`,
    },
    diagnostics: [
      {
        name: 'Shapiro-Wilk (Paired Differences Normality)',
        value: `W = ${swDiff.W}`,
        pValue: swDiff.pValue,
        status: swDiff.pValue >= 0.05 ? 'Satisfied' : 'Potential Violation',
        interpretation:
          swDiff.pValue >= 0.05
            ? 'Paired difference scores are consistent with a normal distribution.'
            : 'Paired difference scores deviate from normality.',
        recommendedAction:
          swDiff.pValue >= 0.05
            ? 'Normality of differences satisfied.'
            : 'Consult the Wilcoxon Signed-Rank test.',
      },
    ],
    postHoc: [],
    alternativeProcedure: {
      name: 'Wilcoxon Signed-Rank Test',
      statisticName: 'W',
      statisticValue: wilcoxon.W,
      pValue: wilcoxon.pValue,
      summary: `Nonparametric paired test: W = ${wilcoxon.W}, p = ${formatP(wilcoxon.pValue)}.`,
    },
    technicalInterpretation: `A paired-samples t-test indicated ${significant ? 'a statistically significant' : 'no statistically significant'} difference between ${params.columnA} and ${params.columnB}, M_diff = ${round4(meanDiff)}, SD_diff = ${round4(sdDiff)}, t(${df}) = ${round4(tStat)}, p = ${formatP(pValue)}, 95% CI [${round4(ciLower)}, ${round4(ciUpper)}], Cohen's dz = ${round4(cohensDz)}.`,
    simplifiedInterpretation: significant
      ? `On average, ${params.columnA} and ${params.columnB} changed significantly by ${round4(meanDiff)} units across the ${n} paired observations (p = ${formatP(pValue)}).`
      : `The average change of ${round4(meanDiff)} units between ${params.columnA} and ${params.columnB} is not statistically significant (p = ${formatP(pValue)}).`,
    visualization: {
      type: 'bar',
      title: `Paired Mean Comparison: ${params.columnA} vs ${params.columnB}`,
      xLabel: 'Condition',
      yLabel: 'Mean Value',
      labels: [params.columnA, params.columnB],
      datasets: [
        {
          label: 'Mean',
          data: [
            round4(valsA.reduce((s, x) => s + x, 0) / n),
            round4(valsB.reduce((s, x) => s + x, 0) / n),
          ],
          backgroundColor: ['#173B75', '#2563EB'],
        },
      ],
    },
  };
}

export function runPearsonCorrelation(params: {
  rows: Record<string, unknown>[];
  columnX: string;
  columnY: string;
  alpha?: number;
  researchQuestion?: string;
}): StatisticalComputationResult {
  const alpha = params.alpha ?? 0.05;
  const xs: number[] = [];
  const ys: number[] = [];

  for (const row of params.rows) {
    const x = Number(row[params.columnX]);
    const y = Number(row[params.columnY]);
    if (
      row[params.columnX] === null ||
      row[params.columnX] === undefined ||
      row[params.columnY] === null ||
      row[params.columnY] === undefined ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      continue;
    }
    xs.push(x);
    ys.push(y);
  }

  const n = xs.length;
  if (n < 4) {
    throw new Error('Pearson Correlation requires at least 4 complete numeric pairs.');
  }

  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const r = sxx > 0 && syy > 0 ? num / Math.sqrt(sxx * syy) : 0;
  const df = n - 2;
  const tStat = Math.abs(r) < 1 ? r * Math.sqrt(df / (1 - r * r)) : 0;
  const pValue = Math.abs(r) >= 1 ? 0 : tTwoTailedP(tStat, df);

  // Fisher z 95% confidence interval
  let ciLower: number | null = null;
  let ciUpper: number | null = null;
  if (n > 3 && Math.abs(r) < 0.9999) {
    const z = 0.5 * Math.log((1 + r) / (1 - r));
    const seZ = 1 / Math.sqrt(n - 3);
    const zCrit = inverseNormalCdf(1 - alpha / 2);
    ciLower = round4(Math.tanh(z - zCrit * seZ));
    ciUpper = round4(Math.tanh(z + zCrit * seZ));
  }

  const absR = Math.abs(r);
  const strength =
    absR < 0.1 ? 'Negligible' : absR < 0.3 ? 'Weak' : absR < 0.5 ? 'Moderate' : 'Strong';
  const direction = r > 0 ? 'Positive' : r < 0 ? 'Negative' : 'Zero';

  const swX = shapiroWilkTest(xs);
  const swY = shapiroWilkTest(ys);
  const spearman = spearmanCorrelation(xs, ys);
  const significant = pValue < alpha;

  return {
    procedure: 'Pearson Correlation',
    researchQuestion:
      params.researchQuestion ||
      `Is there a linear relationship between "${params.columnX}" and "${params.columnY}"?`,
    variables: { variableX: params.columnX, variableY: params.columnY },
    sampleSize: n,
    alpha,
    descriptives: [
      computeDescriptives(params.columnX, xs),
      computeDescriptives(params.columnY, ys),
    ],
    testResults: {
      statisticName: 'r',
      statisticValue: round4(r),
      df: String(df),
      pValue: round4(pValue),
      significant,
      decision: significant ? 'Reject Null Hypothesis (H₀)' : 'Fail to Reject Null Hypothesis (H₀)',
      details: {
        tStatistic: round4(tStat),
        rSquared: round4(r * r),
        direction,
        strength,
      },
    },
    effectSize: {
      name: 'Coefficient of Determination (r²)',
      value: round4(r * r),
      magnitude: strength,
      explanation: `${(r * r * 100).toFixed(1)}% of shared linear variance between ${params.columnX} and ${params.columnY}. Correlation does not imply causation.`,
    },
    confidenceInterval: {
      level: 95,
      lower: ciLower,
      upper: ciUpper,
      label: '95% Fisher-z Confidence Interval for r',
    },
    diagnostics: [
      {
        name: `Shapiro-Wilk (${params.columnX})`,
        value: `W = ${swX.W}`,
        pValue: swX.pValue,
        status: swX.pValue >= 0.05 ? 'Satisfied' : 'Potential Violation',
        interpretation:
          swX.pValue >= 0.05 ? `${params.columnX} approximates normality.` : `${params.columnX} is non-normal.`,
        recommendedAction:
          swX.pValue >= 0.05 ? 'Met.' : 'Compare with Spearman rank correlation.',
      },
      {
        name: `Shapiro-Wilk (${params.columnY})`,
        value: `W = ${swY.W}`,
        pValue: swY.pValue,
        status: swY.pValue >= 0.05 ? 'Satisfied' : 'Potential Violation',
        interpretation:
          swY.pValue >= 0.05 ? `${params.columnY} approximates normality.` : `${params.columnY} is non-normal.`,
        recommendedAction:
          swY.pValue >= 0.05 ? 'Met.' : 'Compare with Spearman rank correlation.',
      },
    ],
    postHoc: [],
    alternativeProcedure: {
      name: 'Spearman Rank Correlation',
      statisticName: 'ρ',
      statisticValue: spearman.rho,
      pValue: spearman.pValue,
      summary: `Nonparametric monotonic correlation: ρ = ${spearman.rho}, p = ${formatP(spearman.pValue)}.`,
    },
    technicalInterpretation: `A Pearson product-moment correlation examined the linear relationship between ${params.columnX} and ${params.columnY} (n = ${n}). The correlation was ${strength.toLowerCase()} and ${direction.toLowerCase()}, r(${df}) = ${round4(r)}, p = ${formatP(pValue)}, r² = ${round4(r * r)}${ciLower !== null ? `, 95% CI [${ciLower}, ${ciUpper}]` : ''}. Because this is correlational, causation cannot be inferred.`,
    simplifiedInterpretation: `There is a ${strength.toLowerCase()}, ${direction.toLowerCase()} association between ${params.columnX} and ${params.columnY} (r = ${round4(r)}, p = ${formatP(pValue)}). Remember that correlation shows variables move together—not that one causes the other.`,
    visualization: {
      type: 'scatter',
      title: `Scatterplot: ${params.columnX} vs ${params.columnY}`,
      xLabel: params.columnX,
      yLabel: params.columnY,
      datasets: [
        {
          label: 'Observations',
          data: xs.slice(0, 300).map((x, idx) => ({ x: round4(x), y: round4(ys[idx]) })),
          backgroundColor: '#2563EB',
          borderColor: '#173B75',
        },
      ],
    },
  };
}

export function runMultipleRegression(params: {
  rows: Record<string, unknown>[];
  dependentColumn: string;
  predictorColumns: string[];
  alpha?: number;
  researchQuestion?: string;
}): StatisticalComputationResult {
  const alpha = params.alpha ?? 0.05;
  const predictors = params.predictorColumns.filter((p) => p !== params.dependentColumn);
  if (predictors.length < 1) {
    throw new Error('Select at least 1 independent predictor variable.');
  }

  const cleanRows: Array<{ y: number; x: number[] }> = [];
  for (const row of params.rows) {
    const y = Number(row[params.dependentColumn]);
    if (
      row[params.dependentColumn] === null ||
      row[params.dependentColumn] === undefined ||
      !Number.isFinite(y)
    ) {
      continue;
    }
    const xs = predictors.map((p) => {
      const raw = row[p];
      if (raw === null || raw === undefined || String(raw).trim() === '') return NaN;
      return Number(raw);
    });
    if (xs.some((v) => !Number.isFinite(v))) continue;
    cleanRows.push({ y, x: xs });
  }

  const n = cleanRows.length;
  const k = predictors.length;
  if (n <= k + 2) {
    throw new Error(`Multiple Linear Regression requires more complete observations (${n}) than predictors + 2 (${k + 2}).`);
  }

  // Design matrix X with intercept column 1
  const X = cleanRows.map((r) => [1, ...r.x]);
  const Y = cleanRows.map((r) => r.y);
  const pCount = k + 1;

  // X^T X and X^T Y
  const XtX: number[][] = Array.from({ length: pCount }, () => new Array(pCount).fill(0));
  const XtY: number[] = new Array(pCount).fill(0);
  for (let i = 0; i < n; i += 1) {
    for (let r = 0; r < pCount; r += 1) {
      XtY[r] += X[i][r] * Y[i];
      for (let c = 0; c < pCount; c += 1) {
        XtX[r][c] += X[i][r] * X[i][c];
      }
    }
  }

  const XtXInv = invertMatrix(XtX);
  const beta = XtXInv.map((row) => row.reduce((s, val, idx) => s + val * XtY[idx], 0));

  const yMean = Y.reduce((s, v) => s + v, 0) / n;
  const yHat = X.map((row) => row.reduce((s, xj, j) => s + xj * beta[j], 0));
  const residuals = Y.map((y, i) => y - yHat[i]);

  const ssRes = residuals.reduce((s, e) => s + e * e, 0);
  const ssTot = Y.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const ssReg = Math.max(0, ssTot - ssRes);

  const dfModel = k;
  const dfResid = n - k - 1;
  const mse = ssRes / dfResid;
  const msReg = ssReg / dfModel;
  const fStat = mse > 0 ? msReg / mse : 0;
  const modelP = fUpperTailP(fStat, dfModel, dfResid);

  const r2 = ssTot > 0 ? ssReg / ssTot : 0;
  const adjR2 = 1 - ((1 - r2) * (n - 1)) / dfResid;

  const tCrit = tCriticalValue(alpha, dfResid);
  const coefficients = ['(Intercept)', ...predictors].map((term, j) => {
    const se = Math.sqrt(Math.max(0, mse * XtXInv[j][j]));
    const tVal = se > 0 ? beta[j] / se : 0;
    const pVal = tTwoTailedP(tVal, dfResid);
    return {
      term,
      estimate: round4(beta[j]),
      se: round4(se),
      tStat: round4(tVal),
      pValue: round4(pVal),
      ciLower: round4(beta[j] - tCrit * se),
      ciUpper: round4(beta[j] + tCrit * se),
    };
  });

  // Compute VIF for each predictor when k >= 2
  const vifs: Array<{ predictor: string; vif: number }> = [];
  if (k >= 2) {
    for (let j = 0; j < k; j += 1) {
      const yj = cleanRows.map((r) => r.x[j]);
      const otherX = cleanRows.map((r) => [1, ...r.x.filter((_, idx) => idx !== j)]);
      const pO = otherX[0].length;
      const oXtX: number[][] = Array.from({ length: pO }, () => new Array(pO).fill(0));
      const oXtY: number[] = new Array(pO).fill(0);
      for (let i = 0; i < n; i += 1) {
        for (let r = 0; r < pO; r += 1) {
          oXtY[r] += otherX[i][r] * yj[i];
          for (let c = 0; c < pO; c += 1) oXtX[r][c] += otherX[i][r] * otherX[i][c];
        }
      }
      const oInv = invertMatrix(oXtX);
      const bO = oInv.map((row) => row.reduce((s, v, idx) => s + v * oXtY[idx], 0));
      const yjMean = yj.reduce((s, v) => s + v, 0) / n;
      const ssTotJ = yj.reduce((s, v) => s + (v - yjMean) ** 2, 0);
      const ssResJ = yj.reduce(
        (s, v, i) => s + (v - otherX[i].reduce((acc, xVal, idx) => acc + xVal * bO[idx], 0)) ** 2,
        0,
      );
      const r2J = ssTotJ > 0 ? 1 - ssResJ / ssTotJ : 0;
      const vif = r2J < 0.9999 ? 1 / (1 - r2J) : 9999;
      vifs.push({ predictor: predictors[j], vif: round4(vif) });
    }
  } else {
    vifs.push({ predictor: predictors[0], vif: 1 });
  }

  const maxVif = Math.max(...vifs.map((v) => v.vif));
  const swResid = shapiroWilkTest(residuals);

  // Durbin-Watson autocorrelation statistic
  let dwNum = 0;
  for (let i = 1; i < residuals.length; i += 1) {
    dwNum += (residuals[i] - residuals[i - 1]) ** 2;
  }
  const dw = ssRes > 0 ? round4(dwNum / ssRes) : 2;

  const diagnostics: AssumptionDiagnostic[] = [
    {
      name: 'Shapiro-Wilk (Residual Normality)',
      value: `W = ${swResid.W}`,
      pValue: swResid.pValue,
      status: swResid.pValue >= 0.05 ? 'Satisfied' : 'Potential Violation',
      interpretation:
        swResid.pValue >= 0.05
          ? 'Regression residuals appear approximately normally distributed.'
          : 'Regression residuals show departure from normality.',
      recommendedAction:
        swResid.pValue >= 0.05
          ? 'Residual normality satisfied.'
          : 'Inspect residual scatterplot for skewness or influential outliers.',
    },
    {
      name: 'Multicollinearity (Max VIF)',
      value: `Max VIF = ${maxVif}`,
      pValue: null,
      status: maxVif < 5 ? 'Satisfied' : maxVif < 10 ? 'Requires Further Evaluation' : 'Potential Violation',
      interpretation:
        maxVif < 5
          ? 'Predictors exhibit low multicollinearity (all VIF < 5).'
          : 'Elevated correlation detected among predictor variables.',
      recommendedAction:
        maxVif < 5 ? 'No predictor redundancy concern.' : 'Consider removing highly collinear predictors.',
    },
    {
      name: 'Durbin-Watson (Residual Independence)',
      value: `DW = ${dw}`,
      pValue: null,
      status: dw >= 1.5 && dw <= 2.5 ? 'Satisfied' : 'Requires Further Evaluation',
      interpretation: `Durbin-Watson = ${dw} (values near 2.0 indicate independent errors).`,
      recommendedAction:
        dw >= 1.5 && dw <= 2.5
          ? 'Error independence is supported.'
          : 'Check for sequential/time autocorrelation in observations.',
    },
  ];

  const significant = modelP < alpha;
  const r2Mag = r2 < 0.02 ? 'Negligible' : r2 < 0.13 ? 'Small' : r2 < 0.26 ? 'Medium' : 'Large';

  return {
    procedure: 'Multiple Linear Regression',
    researchQuestion:
      params.researchQuestion ||
      `Do ${predictors.join(', ')} predict "${params.dependentColumn}"?`,
    variables: { dependentVariable: params.dependentColumn, predictors },
    sampleSize: n,
    alpha,
    descriptives: [
      computeDescriptives(params.dependentColumn, Y),
      ...predictors.map((p, idx) => computeDescriptives(p, cleanRows.map((r) => r.x[idx]))),
    ],
    testResults: {
      statisticName: 'F',
      statisticValue: round4(fStat),
      df: `${dfModel}, ${dfResid}`,
      pValue: round4(modelP),
      significant,
      decision: significant ? 'Reject Null Hypothesis (H₀)' : 'Fail to Reject Null Hypothesis (H₀)',
      details: {
        rSquared: round4(r2),
        adjustedRSquared: round4(adjR2),
        rmse: round4(Math.sqrt(mse)),
        coefficients,
        vifs,
      },
    },
    effectSize: {
      name: 'Adjusted R²',
      value: round4(adjR2),
      magnitude: r2Mag,
      explanation: `The predictors jointly explain ${(r2 * 100).toFixed(1)}% of raw variance (Adjusted R² = ${(adjR2 * 100).toFixed(1)}%) in ${params.dependentColumn}. Observational regression does not prove causation.`,
    },
    confidenceInterval: {
      level: 95,
      lower: coefficients[1]?.ciLower ?? null,
      upper: coefficients[1]?.ciUpper ?? null,
      label: `95% CI for ${coefficients[1]?.term ?? 'Primary Predictor'} Slope (see coefficient table)`,
    },
    diagnostics,
    postHoc: [],
    technicalInterpretation: `A multiple linear regression was conducted to predict ${params.dependentColumn} from ${predictors.join(', ')} (n = ${n}). The overall model was ${significant ? 'statistically significant' : 'not statistically significant'}, F(${dfModel}, ${dfResid}) = ${round4(fStat)}, p = ${formatP(modelP)}, R² = ${round4(r2)}, Adjusted R² = ${round4(adjR2)}. Observational regression findings indicate predictive association rather than causal proof.`,
    simplifiedInterpretation: significant
      ? `Together, ${predictors.join(', ')} meaningfully predict ${params.dependentColumn} (explaining ${(r2 * 100).toFixed(1)}% of its variation, p = ${formatP(modelP)}). Check each predictor’s individual p-value in the coefficient table.`
      : `As a group, ${predictors.join(', ')} do not significantly predict ${params.dependentColumn} (p = ${formatP(modelP)}).`,
    visualization: {
      type: 'scatter',
      title: `Predicted vs Observed (${params.dependentColumn})`,
      xLabel: `Observed ${params.dependentColumn}`,
      yLabel: `Predicted ${params.dependentColumn}`,
      datasets: [
        {
          label: 'Observed vs Predicted',
          data: Y.slice(0, 300).map((yVal, idx) => ({
            x: round4(yVal),
            y: round4(yHat[idx]),
          })),
          backgroundColor: '#2563EB',
        },
      ],
    },
  };
}

export function runChiSquareIndependence(params: {
  rows: Record<string, unknown>[];
  rowColumn: string;
  colColumn: string;
  alpha?: number;
  researchQuestion?: string;
}): StatisticalComputationResult {
  const alpha = params.alpha ?? 0.05;
  const rowCatsSet = new Set<string>();
  const colCatsSet = new Set<string>();
  const pairs: Array<[string, string]> = [];

  for (const row of params.rows) {
    const r = row[params.rowColumn];
    const c = row[params.colColumn];
    if (
      r === null ||
      r === undefined ||
      c === null ||
      c === undefined ||
      String(r).trim() === '' ||
      String(c).trim() === ''
    ) {
      continue;
    }
    const rStr = String(r).trim();
    const cStr = String(c).trim();
    rowCatsSet.add(rStr);
    colCatsSet.add(cStr);
    pairs.push([rStr, cStr]);
  }

  const rowCats = Array.from(rowCatsSet);
  const colCats = Array.from(colCatsSet);
  if (rowCats.length < 2 || colCats.length < 2) {
    throw new Error('Chi-Square Test of Independence requires at least 2 distinct categories in both variables.');
  }

  const observed: number[][] = Array.from({ length: rowCats.length }, () =>
    new Array(colCats.length).fill(0),
  );
  for (const [r, c] of pairs) {
    observed[rowCats.indexOf(r)][colCats.indexOf(c)] += 1;
  }

  const n = pairs.length;
  const rowTotals = observed.map((r) => r.reduce((s, v) => s + v, 0));
  const colTotals = colCats.map((_, cIdx) =>
    observed.reduce((s, r) => s + r[cIdx], 0),
  );

  let chi2 = 0;
  let cellsBelow5 = 0;
  let minExpected = Infinity;
  const expected: number[][] = Array.from({ length: rowCats.length }, () =>
    new Array(colCats.length).fill(0),
  );

  for (let i = 0; i < rowCats.length; i += 1) {
    for (let j = 0; j < colCats.length; j += 1) {
      const exp = (rowTotals[i] * colTotals[j]) / n;
      expected[i][j] = round4(exp);
      if (exp < minExpected) minExpected = exp;
      if (exp < 5) cellsBelow5 += 1;
      if (exp > 0) chi2 += (observed[i][j] - exp) ** 2 / exp;
    }
  }

  const df = (rowCats.length - 1) * (colCats.length - 1);
  const pValue = chiSquareUpperTailP(chi2, df);
  const minDim = Math.min(rowCats.length - 1, colCats.length - 1);
  const cramersV = minDim > 0 ? Math.sqrt(chi2 / (n * minDim)) : 0;
  const vMag = cramersV < 0.1 ? 'Negligible' : cramersV < 0.3 ? 'Small' : cramersV < 0.5 ? 'Medium' : 'Large';

  const totalCells = rowCats.length * colCats.length;
  const pctBelow5 = (cellsBelow5 / totalCells) * 100;

  let alternative: StatisticalComputationResult['alternativeProcedure'] | undefined;
  if (rowCats.length === 2 && colCats.length === 2) {
    const fExactP = fishersExact2x2(
      observed[0][0],
      observed[0][1],
      observed[1][0],
      observed[1][1],
    );
    alternative = {
      name: "Fisher's Exact Test (2x2)",
      statisticName: 'Exact p',
      statisticValue: fExactP,
      pValue: fExactP,
      summary: `Exact 2x2 contingency test p = ${formatP(fExactP)}.`,
    };
  }

  const diagnostics: AssumptionDiagnostic[] = [
    {
      name: 'Expected Cell Frequency Check',
      value: `Min expected = ${round4(minExpected)} (${cellsBelow5}/${totalCells} cells < 5)`,
      pValue: null,
      status: pctBelow5 <= 20 && minExpected >= 1 ? 'Satisfied' : 'Potential Violation',
      interpretation:
        pctBelow5 <= 20 && minExpected >= 1
          ? 'Expected cell counts satisfy Cochran’s guideline (<= 20% of cells below 5).'
          : `${pctBelow5.toFixed(0)}% of cells have expected frequency < 5 (minimum expected = ${round4(minExpected)}).`,
      recommendedAction:
        rowCats.length === 2 && colCats.length === 2 && pctBelow5 > 20
          ? "Consult Fisher's Exact Test provided below."
          : pctBelow5 <= 20
            ? 'Expected frequency assumption met.'
            : 'Consider combining sparse categories or increasing sample size.',
    },
  ];

  const significant = pValue < alpha;

  return {
    procedure: 'Chi-Square Test of Independence',
    researchQuestion:
      params.researchQuestion ||
      `Are "${params.rowColumn}" and "${params.colColumn}" statistically independent?`,
    variables: {
      rowVariable: params.rowColumn,
      columnVariable: params.colColumn,
      rowCategories: rowCats,
      columnCategories: colCats,
    },
    sampleSize: n,
    alpha,
    descriptives: [],
    testResults: {
      statisticName: 'χ²',
      statisticValue: round4(chi2),
      df: String(df),
      pValue: round4(pValue),
      significant,
      decision: significant ? 'Reject Null Hypothesis (H₀)' : 'Fail to Reject Null Hypothesis (H₀)',
      details: {
        rowCategories: rowCats,
        columnCategories: colCats,
        observed,
        expected,
      },
    },
    effectSize: {
      name: "Cramér's V",
      value: round4(cramersV),
      magnitude: vMag,
      explanation: `Association strength between ${params.rowColumn} and ${params.colColumn} is ${vMag.toLowerCase()} (V = ${round4(cramersV)}).`,
    },
    confidenceInterval: {
      level: 95,
      lower: null,
      upper: null,
      label: 'Contingency chi-square evaluates categorical independence.',
    },
    diagnostics,
    postHoc: [],
    alternativeProcedure: alternative,
    technicalInterpretation: `A Chi-Square Test of Independence examined the association between ${params.rowColumn} and ${params.colColumn} (N = ${n}). The association was ${significant ? 'statistically significant' : 'not statistically significant'}, χ²(${df}, N = ${n}) = ${round4(chi2)}, p = ${formatP(pValue)}, Cramér's V = ${round4(cramersV)} (${vMag.toLowerCase()} effect).`,
    simplifiedInterpretation: significant
      ? `"${params.rowColumn}" and "${params.colColumn}" are related—the category proportions are not independent (p = ${formatP(pValue)}, Cramér's V = ${round4(cramersV)}).`
      : `There is no statistically significant association between "${params.rowColumn}" and "${params.colColumn}" (p = ${formatP(pValue)}).`,
    visualization: {
      type: 'grouped_bar',
      title: `Observed Counts: ${params.rowColumn} × ${params.colColumn}`,
      xLabel: params.rowColumn,
      yLabel: 'Observed Frequency',
      labels: rowCats,
      datasets: colCats.map((cName, j) => ({
        label: cName,
        data: rowCats.map((_, i) => observed[i][j]),
        backgroundColor: j % 2 === 0 ? '#2563EB' : '#173B75',
      })),
    },
  };
}

// ============================================================================
// Nonparametric Procedures & Reliability Analysis
// ============================================================================

export function runMannWhitneyU(params: {
  rows: Record<string, unknown>[];
  groupColumn: string;
  valueColumn: string;
  alpha?: number;
  researchQuestion?: string;
}): StatisticalComputationResult {
  const alpha = params.alpha ?? 0.05;
  const groupsMap = new Map<string, number[]>();

  for (const row of params.rows) {
    const gRaw = row[params.groupColumn];
    const vRaw = row[params.valueColumn];
    if (gRaw === null || gRaw === undefined || String(gRaw).trim() === '') continue;
    const vNum = Number(vRaw);
    if (vRaw === null || vRaw === undefined || String(vRaw).trim() === '' || !Number.isFinite(vNum)) continue;
    const key = String(gRaw).trim();
    const list = groupsMap.get(key) || [];
    list.push(vNum);
    groupsMap.set(key, list);
  }

  const entries = Array.from(groupsMap.entries()).filter(([, v]) => v.length >= 2);
  if (entries.length !== 2) {
    throw new Error(
      `Mann-Whitney U Test requires exactly 2 groups with at least 2 observations each (found ${entries.length}).`,
    );
  }

  const [[name1, g1], [name2, g2]] = entries;
  const n1 = g1.length;
  const n2 = g2.length;
  const mwu = mannWhitneyU(g1, g2);
  const desc1 = computeDescriptives(name1, g1);
  const desc2 = computeDescriptives(name2, g2);

  // Rank-biserial correlation r = 1 - (2U)/(n1*n2)
  const rankBiserial = n1 * n2 > 0 ? Math.abs(1 - (2 * mwu.U) / (n1 * n2)) : 0;
  const mag =
    rankBiserial < 0.1 ? 'Negligible' : rankBiserial < 0.3 ? 'Small' : rankBiserial < 0.5 ? 'Medium' : 'Large';

  const combined = [...g1, ...g2];
  const { ranks } = rankWithTies(combined);
  const meanRank1 = ranks.slice(0, n1).reduce((s, r) => s + r, 0) / n1;
  const meanRank2 = ranks.slice(n1).reduce((s, r) => s + r, 0) / n2;

  const significant = mwu.pValue < alpha;

  return {
    procedure: 'Mann-Whitney U Test',
    researchQuestion:
      params.researchQuestion ||
      `Do distributions/medians of "${params.valueColumn}" differ between "${name1}" and "${name2}"?`,
    variables: {
      groupingFactor: params.groupColumn,
      dependentVariable: params.valueColumn,
      groups: [name1, name2],
    },
    sampleSize: n1 + n2,
    alpha,
    descriptives: [desc1, desc2],
    testResults: {
      statisticName: 'U',
      statisticValue: mwu.U,
      df: `n₁=${n1}, n₂=${n2}`,
      pValue: mwu.pValue,
      significant,
      decision: significant ? 'Reject Null Hypothesis (H₀)' : 'Fail to Reject Null Hypothesis (H₀)',
      details: {
        meanRankGroup1: round4(meanRank1),
        meanRankGroup2: round4(meanRank2),
        medianDifference: round4(desc1.median - desc2.median),
      },
    },
    effectSize: {
      name: 'Rank-Biserial r',
      value: round4(rankBiserial),
      magnitude: mag,
      explanation: `Rank-biserial correlation r = ${round4(rankBiserial)} indicates a ${mag.toLowerCase()} stochastic dominance effect between the two groups.`,
    },
    confidenceInterval: {
      level: 95,
      lower: null,
      upper: null,
      label: `Group Medians: ${name1} = ${desc1.median} (IQR ${desc1.iqr}), ${name2} = ${desc2.median} (IQR ${desc2.iqr})`,
    },
    diagnostics: [
      {
        name: 'Scale & Distributional Robustness',
        value: `Median₁ = ${desc1.median}, Median₂ = ${desc2.median}`,
        pValue: null,
        status: 'Satisfied',
        interpretation: 'Mann-Whitney U does not require within-group normality and is robust to skewed distributions and ordinal scales.',
        recommendedAction: 'Confirm observations between groups are independent.',
      },
    ],
    postHoc: [],
    technicalInterpretation: `A Mann-Whitney U test compared ${params.valueColumn} between ${name1} (Mdn = ${desc1.median}, IQR = ${desc1.iqr}, n = ${n1}) and ${name2} (Mdn = ${desc2.median}, IQR = ${desc2.iqr}, n = ${n2}). The difference was ${significant ? 'statistically significant' : 'not statistically significant'}, U = ${mwu.U}, p = ${formatP(mwu.pValue)}, rank-biserial r = ${round4(rankBiserial)}.`,
    simplifiedInterpretation: significant
      ? `"${name1}" (median ${desc1.median}) and "${name2}" (median ${desc2.median}) differ significantly in ${params.valueColumn} rank scores (p = ${formatP(mwu.pValue)}).`
      : `There is no statistically significant rank difference in ${params.valueColumn} between "${name1}" and "${name2}" (p = ${formatP(mwu.pValue)}).`,
    visualization: {
      type: 'bar',
      title: `Median ${params.valueColumn}: ${name1} vs ${name2}`,
      xLabel: params.groupColumn,
      yLabel: `Median ${params.valueColumn}`,
      labels: [name1, name2],
      datasets: [
        {
          label: `Median ${params.valueColumn}`,
          data: [desc1.median, desc2.median],
          backgroundColor: ['#2563EB', '#0EA5E9'],
        },
      ],
    },
  };
}

export function runWilcoxonSignedRank(params: {
  rows: Record<string, unknown>[];
  columnA: string;
  columnB: string;
  alpha?: number;
  researchQuestion?: string;
}): StatisticalComputationResult {
  const alpha = params.alpha ?? 0.05;
  const valsA: number[] = [];
  const valsB: number[] = [];

  for (const row of params.rows) {
    const a = Number(row[params.columnA]);
    const b = Number(row[params.columnB]);
    if (
      row[params.columnA] === null ||
      row[params.columnA] === undefined ||
      row[params.columnB] === null ||
      row[params.columnB] === undefined ||
      !Number.isFinite(a) ||
      !Number.isFinite(b)
    ) {
      continue;
    }
    valsA.push(a);
    valsB.push(b);
  }

  const n = valsA.length;
  if (n < 3) {
    throw new Error('Wilcoxon Signed-Rank Test requires at least 3 complete numeric pairs.');
  }

  const diffs = valsA.map((a, idx) => a - valsB[idx]);
  const nonZeroCount = diffs.filter((d) => d !== 0).length;
  const wilcoxon = wilcoxonSignedRank(diffs);
  const descA = computeDescriptives(params.columnA, valsA);
  const descB = computeDescriptives(params.columnB, valsB);
  const descDiff = computeDescriptives(`Difference (${params.columnA} − ${params.columnB})`, diffs);

  // Matched-pairs rank-biserial r = |z| / sqrt(n) approximated from p-value
  const zAbs = wilcoxon.pValue < 1 && wilcoxon.pValue > 0 ? Math.abs(inverseNormalCdf(wilcoxon.pValue / 2)) : wilcoxon.pValue <= 0 ? 4 : 0;
  const effectR = nonZeroCount > 0 ? Math.min(1, zAbs / Math.sqrt(nonZeroCount)) : 0;
  const mag = effectR < 0.1 ? 'Negligible' : effectR < 0.3 ? 'Small' : effectR < 0.5 ? 'Medium' : 'Large';

  const significant = wilcoxon.pValue < alpha;

  return {
    procedure: 'Wilcoxon Signed-Rank Test',
    researchQuestion:
      params.researchQuestion ||
      `Is there a median/rank shift between "${params.columnA}" and "${params.columnB}"?`,
    variables: { condition1: params.columnA, condition2: params.columnB },
    sampleSize: n,
    alpha,
    descriptives: [descA, descB, descDiff],
    testResults: {
      statisticName: 'W',
      statisticValue: wilcoxon.W,
      df: `N = ${n} (${nonZeroCount} non-zero pairs)`,
      pValue: wilcoxon.pValue,
      significant,
      decision: significant ? 'Reject Null Hypothesis (H₀)' : 'Fail to Reject Null Hypothesis (H₀)',
      details: {
        nonZeroPairs: nonZeroCount,
        medianDifference: descDiff.median,
      },
    },
    effectSize: {
      name: 'Matched-Pairs Rank r',
      value: round4(effectR),
      magnitude: mag,
      explanation: `Rank effect size r = ${round4(effectR)} reflects a ${mag.toLowerCase()} paired change magnitude.`,
    },
    confidenceInterval: {
      level: 95,
      lower: null,
      upper: null,
      label: `Condition Medians: ${params.columnA} = ${descA.median}, ${params.columnB} = ${descB.median}`,
    },
    diagnostics: [
      {
        name: 'Paired Difference Symmetry & Non-Zero Pairs',
        value: `${nonZeroCount}/${n} non-zero pairs`,
        pValue: null,
        status: nonZeroCount >= 3 ? 'Satisfied' : 'Potential Violation',
        interpretation:
          nonZeroCount >= 3
            ? 'Paired difference ranks support valid nonparametric Wilcoxon estimation without requiring normality.'
            : 'Too few non-zero paired differences limit statistical power.',
        recommendedAction:
          nonZeroCount >= 3
            ? 'No normality adjustment required.'
            : 'Collect more paired observations with distinct pre/post values.',
      },
    ],
    postHoc: [],
    technicalInterpretation: `A Wilcoxon signed-rank test evaluated paired differences between ${params.columnA} (Mdn = ${descA.median}, IQR = ${descA.iqr}) and ${params.columnB} (Mdn = ${descB.median}, IQR = ${descB.iqr}) across n = ${n} pairs. The shift was ${significant ? 'statistically significant' : 'not statistically significant'}, W = ${wilcoxon.W}, p = ${formatP(wilcoxon.pValue)}, r = ${round4(effectR)}.`,
    simplifiedInterpretation: significant
      ? `There is a statistically significant shift between ${params.columnA} (median ${descA.median}) and ${params.columnB} (median ${descB.median}), p = ${formatP(wilcoxon.pValue)}.`
      : `No statistically significant rank shift was found between ${params.columnA} and ${params.columnB} (p = ${formatP(wilcoxon.pValue)}).`,
    visualization: {
      type: 'bar',
      title: `Paired Medians: ${params.columnA} vs ${params.columnB}`,
      xLabel: 'Condition',
      yLabel: 'Median Value',
      labels: [params.columnA, params.columnB],
      datasets: [
        {
          label: 'Median',
          data: [descA.median, descB.median],
          backgroundColor: ['#173B75', '#2563EB'],
        },
      ],
    },
  };
}

export function runKruskalWallis(params: {
  rows: Record<string, unknown>[];
  groupColumn: string;
  valueColumn: string;
  alpha?: number;
  researchQuestion?: string;
}): StatisticalComputationResult {
  const alpha = params.alpha ?? 0.05;
  const groupsMap = new Map<string, number[]>();

  for (const row of params.rows) {
    const gRaw = row[params.groupColumn];
    const vRaw = row[params.valueColumn];
    if (gRaw === null || gRaw === undefined || String(gRaw).trim() === '') continue;
    const vNum = Number(vRaw);
    if (vRaw === null || vRaw === undefined || String(vRaw).trim() === '' || !Number.isFinite(vNum)) continue;
    const key = String(gRaw).trim();
    const list = groupsMap.get(key) || [];
    list.push(vNum);
    groupsMap.set(key, list);
  }

  const entries = Array.from(groupsMap.entries()).filter(([, vals]) => vals.length >= 2);
  if (entries.length < 3) {
    throw new Error('Kruskal-Wallis H Test requires at least 3 groups with 2 or more numeric observations each.');
  }

  const N = entries.reduce((s, [, vals]) => s + vals.length, 0);
  const k = entries.length;
  const df = k - 1;
  const kw = kruskalWallis(entries.map(([, vals]) => vals));
  const descriptives = entries.map(([name, vals]) => computeDescriptives(name, vals));

  // Epsilon-squared effect size for Kruskal-Wallis: (H - k + 1) / (N - k)
  const epsSq = N > k ? Math.max(0, Math.min(1, (kw.H - k + 1) / (N - k))) : 0;
  const mag = epsSq < 0.01 ? 'Negligible' : epsSq < 0.06 ? 'Small' : epsSq < 0.14 ? 'Medium' : 'Large';

  // Dunn-Bonferroni pairwise post-hoc on rank means
  const flat: number[] = [];
  const groupIdx: number[] = [];
  entries.forEach(([, vals], gi) => {
    vals.forEach((v) => {
      flat.push(v);
      groupIdx.push(gi);
    });
  });
  const { ranks, tieCorrectionSum } = rankWithTies(flat);
  const meanRanks = new Array<number>(k).fill(0);
  entries.forEach(([, vals], gi) => {
    let sumR = 0;
    ranks.forEach((r, idx) => {
      if (groupIdx[idx] === gi) sumR += r;
    });
    meanRanks[gi] = sumR / vals.length;
  });

  const numPairs = (k * (k - 1)) / 2;
  const tieTerm = (N * (N + 1)) / 12 - tieCorrectionSum / (12 * (N - 1));
  const postHoc: StatisticalComputationResult['postHoc'] = [];
  for (let i = 0; i < k; i += 1) {
    for (let j = i + 1; j < k; j += 1) {
      const n1 = entries[i][1].length;
      const n2 = entries[j][1].length;
      const se = Math.sqrt(Math.max(1e-9, tieTerm * (1 / n1 + 1 / n2)));
      const z = (meanRanks[i] - meanRanks[j]) / se;
      const pAdj = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))) * numPairs);
      postHoc.push({
        comparison: `${entries[i][0]} vs ${entries[j][0]}`,
        meanDiff: round4(descriptives[i].median - descriptives[j].median),
        pValue: round4(pAdj),
        significant: pAdj < alpha,
      });
    }
  }

  const significant = kw.pValue < alpha;

  return {
    procedure: 'Kruskal-Wallis H Test',
    researchQuestion:
      params.researchQuestion ||
      `Do distributions/medians of "${params.valueColumn}" differ across "${params.groupColumn}" groups?`,
    variables: {
      groupingFactor: params.groupColumn,
      dependentVariable: params.valueColumn,
      groups: entries.map(([name]) => name),
    },
    sampleSize: N,
    alpha,
    descriptives,
    testResults: {
      statisticName: 'H',
      statisticValue: kw.H,
      df: String(df),
      pValue: kw.pValue,
      significant,
      decision: significant ? 'Reject Null Hypothesis (H₀)' : 'Fail to Reject Null Hypothesis (H₀)',
      details: {
        groupMeanRanks: entries.map(([name], gi) => ({ group: name, meanRank: round4(meanRanks[gi]) })),
      },
    },
    effectSize: {
      name: 'Epsilon-Squared (ε²)',
      value: round4(epsSq),
      magnitude: mag,
      explanation: `Approximately ${(epsSq * 100).toFixed(1)}% of rank variance in ${params.valueColumn} is associated with ${params.groupColumn}.`,
    },
    confidenceInterval: {
      level: 95,
      lower: null,
      upper: null,
      label: 'Nonparametric omnibus rank test; inspect Dunn-Bonferroni pairwise comparisons.',
    },
    diagnostics: [
      {
        name: 'Distribution-Free Assumption Check',
        value: `N = ${N}, k = ${k}`,
        pValue: null,
        status: 'Satisfied',
        interpretation: 'Kruskal-Wallis does not require residual normality or equal variances across groups.',
        recommendedAction: 'Ensure observations across groups are independent.',
      },
    ],
    postHoc,
    technicalInterpretation: `A Kruskal-Wallis H test showed ${significant ? 'a statistically significant' : 'no statistically significant'} difference in ${params.valueColumn} across the ${k} ${params.groupColumn} groups, H(${df}) = ${kw.H}, p = ${formatP(kw.pValue)}, ε² = ${round4(epsSq)} (${mag.toLowerCase()} effect).`,
    simplifiedInterpretation: significant
      ? `At least two ${params.groupColumn} groups differ significantly in their ${params.valueColumn} rank distributions (p = ${formatP(kw.pValue)}). Inspect the Dunn-Bonferroni comparisons below.`
      : `Across the ${k} ${params.groupColumn} groups, rank differences in ${params.valueColumn} are not statistically significant (p = ${formatP(kw.pValue)}).`,
    visualization: {
      type: 'bar',
      title: `Median ${params.valueColumn} by ${params.groupColumn}`,
      xLabel: params.groupColumn,
      yLabel: `Median ${params.valueColumn}`,
      labels: descriptives.map((d) => d.group),
      datasets: [
        {
          label: `Median ${params.valueColumn}`,
          data: descriptives.map((d) => d.median),
          backgroundColor: '#2563EB',
        },
      ],
    },
  };
}

export function runSpearmanCorrelation(params: {
  rows: Record<string, unknown>[];
  columnX: string;
  columnY: string;
  alpha?: number;
  researchQuestion?: string;
}): StatisticalComputationResult {
  const alpha = params.alpha ?? 0.05;
  const xs: number[] = [];
  const ys: number[] = [];

  for (const row of params.rows) {
    const x = Number(row[params.columnX]);
    const y = Number(row[params.columnY]);
    if (
      row[params.columnX] === null ||
      row[params.columnX] === undefined ||
      row[params.columnY] === null ||
      row[params.columnY] === undefined ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      continue;
    }
    xs.push(x);
    ys.push(y);
  }

  const n = xs.length;
  if (n < 4) {
    throw new Error('Spearman Rank Correlation requires at least 4 complete numeric pairs.');
  }

  const sp = spearmanCorrelation(xs, ys);
  const absR = Math.abs(sp.rho);
  const strength =
    absR < 0.1 ? 'Negligible' : absR < 0.3 ? 'Weak' : absR < 0.5 ? 'Moderate' : 'Strong';
  const direction = sp.rho > 0 ? 'Positive' : sp.rho < 0 ? 'Negative' : 'Zero';

  let ciLower: number | null = null;
  let ciUpper: number | null = null;
  if (n > 4 && Math.abs(sp.rho) < 0.9999) {
    const z = 0.5 * Math.log((1 + sp.rho) / (1 - sp.rho));
    const seZ = Math.sqrt((1 + (sp.rho * sp.rho) / 2) / (n - 3));
    const zCrit = inverseNormalCdf(1 - alpha / 2);
    ciLower = round4(Math.tanh(z - zCrit * seZ));
    ciUpper = round4(Math.tanh(z + zCrit * seZ));
  }

  const significant = sp.pValue < alpha;

  return {
    procedure: 'Spearman Rank Correlation',
    researchQuestion:
      params.researchQuestion ||
      `Is there a monotonic rank association between "${params.columnX}" and "${params.columnY}"?`,
    variables: { variableX: params.columnX, variableY: params.columnY },
    sampleSize: n,
    alpha,
    descriptives: [
      computeDescriptives(params.columnX, xs),
      computeDescriptives(params.columnY, ys),
    ],
    testResults: {
      statisticName: 'ρ',
      statisticValue: sp.rho,
      df: String(n - 2),
      pValue: sp.pValue,
      significant,
      decision: significant ? 'Reject Null Hypothesis (H₀)' : 'Fail to Reject Null Hypothesis (H₀)',
      details: {
        rhoSquared: round4(sp.rho * sp.rho),
        direction,
        strength,
      },
    },
    effectSize: {
      name: 'Rank Variance Shared (ρ²)',
      value: round4(sp.rho * sp.rho),
      magnitude: strength,
      explanation: `${(sp.rho * sp.rho * 100).toFixed(1)}% of shared rank variance between ${params.columnX} and ${params.columnY}.`,
    },
    confidenceInterval: {
      level: 95,
      lower: ciLower,
      upper: ciUpper,
      label: '95% Fieller-Adjusted Confidence Interval for ρ',
    },
    diagnostics: [
      {
        name: 'Monotonic Rank Robustness',
        value: `n = ${n}`,
        pValue: null,
        status: 'Satisfied',
        interpretation: 'Spearman rank correlation is robust to outliers, skewness, and ordinal scales.',
        recommendedAction: 'Inspect the scatterplot to verify a generally monotonic trend.',
      },
    ],
    postHoc: [],
    technicalInterpretation: `A Spearman rank-order correlation examined the monotonic association between ${params.columnX} and ${params.columnY} (n = ${n}). The correlation was ${strength.toLowerCase()} and ${direction.toLowerCase()}, r_s(${n - 2}) = ${sp.rho}, p = ${formatP(sp.pValue)}${ciLower !== null ? `, 95% CI [${ciLower}, ${ciUpper}]` : ''}.`,
    simplifiedInterpretation: `There is a ${strength.toLowerCase()}, ${direction.toLowerCase()} monotonic link between ${params.columnX} and ${params.columnY} (ρ = ${sp.rho}, p = ${formatP(sp.pValue)}).`,
    visualization: {
      type: 'scatter',
      title: `Scatterplot: ${params.columnX} vs ${params.columnY} (Spearman ρ = ${sp.rho})`,
      xLabel: params.columnX,
      yLabel: params.columnY,
      datasets: [
        {
          label: 'Observations',
          data: xs.slice(0, 300).map((x, idx) => ({ x: round4(x), y: round4(ys[idx]) })),
          backgroundColor: '#0EA5E9',
          borderColor: '#173B75',
        },
      ],
    },
  };
}

export function runCronbachAlpha(params: {
  rows: Record<string, unknown>[];
  itemColumns: string[];
  alpha?: number;
  researchQuestion?: string;
}): StatisticalComputationResult {
  const alpha = params.alpha ?? 0.05;
  const items = Array.from(new Set(params.itemColumns.map((c) => c.trim()).filter(Boolean)));
  if (items.length < 3) {
    throw new Error("Cronbach's Alpha Reliability requires at least 3 numeric/Likert item columns.");
  }

  const matrix: number[][] = [];
  for (const row of params.rows) {
    const vals = items.map((col) => {
      const raw = row[col];
      if (raw === null || raw === undefined || String(raw).trim() === '') return NaN;
      return Number(raw);
    });
    if (vals.some((v) => !Number.isFinite(v))) continue;
    matrix.push(vals);
  }

  const n = matrix.length;
  const k = items.length;
  if (n < 3) {
    throw new Error(`Cronbach's Alpha requires at least 3 complete cases across all ${k} items (found ${n}).`);
  }

  const computeAlphaForSubset = (colIndices: number[]): { cronbachAlpha: number; totalVar: number; totalMean: number; totalSd: number } => {
    const subK = colIndices.length;
    const itemVars = colIndices.map((ci) => {
      const colVals = matrix.map((r) => r[ci]);
      const m = colVals.reduce((s, v) => s + v, 0) / n;
      return colVals.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1);
    });
    const sumItemVar = itemVars.reduce((s, v) => s + v, 0);

    const rowTotals = matrix.map((r) => colIndices.reduce((s, ci) => s + r[ci], 0));
    const totalMean = rowTotals.reduce((s, v) => s + v, 0) / n;
    const totalVar = rowTotals.reduce((s, v) => s + (v - totalMean) ** 2, 0) / (n - 1);
    const cronbachAlpha =
      totalVar > 0 && subK > 1 ? (subK / (subK - 1)) * (1 - sumItemVar / totalVar) : 0;
    return {
      cronbachAlpha,
      totalVar,
      totalMean,
      totalSd: Math.sqrt(totalVar),
    };
  };

  const full = computeAlphaForSubset(items.map((_, idx) => idx));
  const rowTotalsAll = matrix.map((r) => r.reduce((s, v) => s + v, 0));

  const itemStatistics = items.map((name, idx) => {
    const colVals = matrix.map((r) => r[idx]);
    const restTotals = matrix.map((r, rIdx) => rowTotalsAll[rIdx] - r[idx]);
    const mX = colVals.reduce((s, v) => s + v, 0) / n;
    const mRest = restTotals.reduce((s, v) => s + v, 0) / n;
    let cov = 0;
    let varX = 0;
    let varRest = 0;
    for (let i = 0; i < n; i += 1) {
      cov += (colVals[i] - mX) * (restTotals[i] - mRest);
      varX += (colVals[i] - mX) ** 2;
      varRest += (restTotals[i] - mRest) ** 2;
    }
    const correctedItemTotalCorrelation = varX > 0 && varRest > 0 ? cov / Math.sqrt(varX * varRest) : 0;
    const subsetIndices = items.map((_, j) => j).filter((j) => j !== idx);
    const withoutItem = computeAlphaForSubset(subsetIndices);
    return {
      item: name,
      mean: round4(mX),
      sd: round4(Math.sqrt(varX / (n - 1))),
      correctedItemTotalCorrelation: round4(correctedItemTotalCorrelation),
      alphaIfDeleted: round4(withoutItem.cronbachAlpha),
    };
  });

  const cAlpha = round4(full.cronbachAlpha);
  const rating =
    cAlpha >= 0.9
      ? 'Excellent'
      : cAlpha >= 0.8
        ? 'Good'
        : cAlpha >= 0.7
          ? 'Acceptable'
          : cAlpha >= 0.6
            ? 'Questionable'
            : 'Poor';
  const reliable = cAlpha >= 0.7;

  // Approximate F-test against null alpha = 0 (Feldt / K-R)
  const fAlpha = cAlpha < 1 ? 1 / Math.max(1e-6, 1 - Math.max(0, cAlpha)) : 100;
  const pValue = cAlpha > 0 ? round4(fUpperTailP(fAlpha, n - 1, (n - 1) * (k - 1))) : 1;

  const reverseCheck = itemStatistics.some((it) => it.correctedItemTotalCorrelation < 0);
  const weakItems = itemStatistics.filter((it) => it.alphaIfDeleted > cAlpha + 0.02);

  return {
    procedure: "Cronbach's Alpha Reliability Analysis",
    researchQuestion:
      params.researchQuestion ||
      `Do the ${k} survey/Likert items (${items.join(', ')}) exhibit internal consistency reliability?`,
    variables: { items, itemCount: k },
    sampleSize: n,
    alpha,
    descriptives: items.map((name, idx) =>
      computeDescriptives(
        name,
        matrix.map((r) => r[idx]),
      ),
    ),
    testResults: {
      statisticName: 'α',
      statisticValue: cAlpha,
      df: `${k} items`,
      pValue,
      significant: reliable,
      decision: reliable ? 'Acceptable Internal Consistency (α ≥ .70)' : 'Below Conventional Threshold (α < .70)',
      details: {
        itemCount: k,
        scaleMean: round4(full.totalMean),
        scaleSd: round4(full.totalSd),
        scaleVariance: round4(full.totalVar),
        reliabilityLevel: rating,
        itemStatistics,
      },
    },
    effectSize: {
      name: 'Reliability Benchmark (α)',
      value: cAlpha,
      magnitude: rating,
      explanation: `Cronbach's α = ${cAlpha} indicates ${rating.toLowerCase()} internal consistency across the ${k}-item composite scale.`,
    },
    confidenceInterval: {
      level: 95,
      lower: null,
      upper: null,
      label: `Scale Composite Mean = ${round4(full.totalMean)}, SD = ${round4(full.totalSd)}`,
    },
    diagnostics: [
      {
        name: 'Internal Consistency Threshold (α ≥ 0.70)',
        value: `α = ${cAlpha} (${rating})`,
        pValue,
        status: cAlpha >= 0.7 ? 'Satisfied' : cAlpha >= 0.6 ? 'Requires Further Evaluation' : 'Potential Violation',
        interpretation: `A coefficient of ${cAlpha} reflects ${rating.toLowerCase()} inter-item covariance among the ${k} items.`,
        recommendedAction:
          weakItems.length > 0
            ? `Inspect items whose deletion raises α: ${weakItems.map((w) => w.item).join(', ')}.`
            : 'All items contribute cohesively to scale reliability.',
      },
      {
        name: 'Reverse-Coded Item Check (Item-Total r)',
        value: reverseCheck ? 'Negative item-total r detected' : 'All positive item-total r',
        pValue: null,
        status: reverseCheck ? 'Potential Violation' : 'Satisfied',
        interpretation: reverseCheck
          ? 'At least one item correlates negatively with the rest of the scale.'
          : 'All items correlate positively with the composite score.',
        recommendedAction: reverseCheck
          ? 'Verify whether negatively correlated items need reverse scoring (e.g., 6 − score on a 1–5 Likert scale).'
          : 'Item polarity appears consistent.',
      },
    ],
    postHoc: [],
    technicalInterpretation: `A reliability analysis using Cronbach's alpha was performed on the ${k}-item scale (n = ${n}). Internal consistency was ${rating.toLowerCase()}, α = ${cAlpha} (Scale M = ${round4(full.totalMean)}, SD = ${round4(full.totalSd)}).`,
    simplifiedInterpretation: `The ${k} items demonstrate ${rating.toLowerCase()} internal reliability (Cronbach's α = ${cAlpha}).${weakItems.length > 0 ? ` Removing ${weakItems[0].item} would increase α to ${weakItems[0].alphaIfDeleted}.` : ''}`,
    visualization: {
      type: 'bar',
      title: `Item-Total Correlation by Scale Item (Scale α = ${cAlpha})`,
      xLabel: 'Scale Item',
      yLabel: 'Corrected Item-Total r',
      labels: itemStatistics.map((it) => it.item),
      datasets: [
        {
          label: 'Corrected Item-Total Correlation (r)',
          data: itemStatistics.map((it) => it.correctedItemTotalCorrelation),
          backgroundColor: itemStatistics.map((it) =>
            it.correctedItemTotalCorrelation >= 0.3 ? '#2563EB' : '#D97706',
          ),
        },
      ],
    },
  };
}

// ============================================================================
// A Priori Sample Size & Statistical Power Calculator
// ============================================================================

export type PowerProcedure =
  | 'independent_t'
  | 'paired_t'
  | 'one_way_anova'
  | 'pearson_correlation'
  | 'multiple_regression';

export interface SamplePowerResult {
  procedure: PowerProcedure;
  procedureLabel: string;
  effectSize: number;
  effectMetricName: string;
  effectMagnitude: string;
  alpha: number;
  targetPower: number;
  requiredTotalN: number;
  perGroupN: number | null;
  achievedPower: number;
  summary: string;
  curve: Array<{ n: number; power: number }>;
}

function estimatePowerAtN(params: {
  procedure: PowerProcedure;
  nTotal: number;
  effectSize: number;
  alpha: number;
  groups: number;
  predictors: number;
}): number {
  const { procedure, nTotal, effectSize, alpha, groups, predictors } = params;

  if (procedure === 'independent_t') {
    const df = nTotal - 2;
    if (df < 2) return 0;
    const tCrit = tCriticalValue(alpha, df);
    const ncp = Math.abs(effectSize) * Math.sqrt(nTotal / 4);
    const denom = Math.sqrt(1 + (tCrit * tCrit) / (2 * df));
    const scale = 1 - 1 / (4 * df);
    const pUpper = 1 - normalCdf((tCrit * scale - ncp) / denom);
    const pLower = normalCdf((-tCrit * scale - ncp) / denom);
    return Math.max(0, Math.min(1, pUpper + pLower));
  }

  if (procedure === 'paired_t') {
    const df = nTotal - 1;
    if (df < 2) return 0;
    const tCrit = tCriticalValue(alpha, df);
    const ncp = Math.abs(effectSize) * Math.sqrt(nTotal);
    const denom = Math.sqrt(1 + (tCrit * tCrit) / (2 * df));
    const scale = 1 - 1 / (4 * df);
    const pUpper = 1 - normalCdf((tCrit * scale - ncp) / denom);
    const pLower = normalCdf((-tCrit * scale - ncp) / denom);
    return Math.max(0, Math.min(1, pUpper + pLower));
  }

  if (procedure === 'pearson_correlation') {
    if (nTotal <= 4) return 0;
    const rAbs = Math.min(0.99, Math.abs(effectSize));
    const zR = 0.5 * Math.log((1 + rAbs) / (1 - rAbs));
    const zCrit = inverseNormalCdf(1 - alpha / 2);
    const ncp = zR * Math.sqrt(nTotal - 3);
    return Math.max(0, Math.min(1, 1 - normalCdf(zCrit - ncp) + normalCdf(-zCrit - ncp)));
  }

  // One-Way ANOVA or Multiple Regression via non-central F (Patnaik approximation)
  const df1 = procedure === 'one_way_anova' ? Math.max(2, groups - 1) : Math.max(1, predictors);
  const df2 = procedure === 'one_way_anova' ? nTotal - groups : nTotal - predictors - 1;
  if (df2 < 2) return 0;

  let lo = 0;
  let hi = 200;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (fUpperTailP(mid, df1, df2) > alpha) lo = mid;
    else hi = mid;
  }
  const fCrit = (lo + hi) / 2;
  const lambda =
    procedure === 'one_way_anova'
      ? nTotal * effectSize * effectSize
      : nTotal * Math.abs(effectSize);
  const nuStar = ((df1 + lambda) ** 2) / (df1 + 2 * lambda);
  const scaledF = (fCrit * df1) / (df1 + lambda);
  return Math.max(0, Math.min(1, fUpperTailP(scaledF, nuStar, df2)));
}

export function calculateSamplePower(input: {
  procedure: PowerProcedure;
  effectSize: number;
  alpha?: number;
  power?: number;
  groups?: number;
  predictors?: number;
}): SamplePowerResult {
  const alpha = Math.min(0.25, Math.max(0.001, Number(input.alpha ?? 0.05)));
  const targetPower = Math.min(0.99, Math.max(0.5, Number(input.power ?? 0.8)));
  const effectSize = Math.max(0.05, Math.min(5, Math.abs(Number(input.effectSize || 0.5))));
  const groups = Math.max(3, Math.min(12, Math.round(Number(input.groups ?? 3))));
  const predictors = Math.max(1, Math.min(15, Math.round(Number(input.predictors ?? 3))));

  const step = input.procedure === 'independent_t' ? 2 : input.procedure === 'one_way_anova' ? groups : 1;
  const minN =
    input.procedure === 'independent_t'
      ? 6
      : input.procedure === 'one_way_anova'
        ? groups * 2
        : input.procedure === 'multiple_regression'
          ? predictors + 4
          : input.procedure === 'pearson_correlation'
            ? 6
            : 4;

  let requiredTotalN = minN;
  let achievedPower = 0;
  while (requiredTotalN <= 10000) {
    achievedPower = estimatePowerAtN({
      procedure: input.procedure,
      nTotal: requiredTotalN,
      effectSize,
      alpha,
      groups,
      predictors,
    });
    if (achievedPower >= targetPower) break;
    requiredTotalN += step;
  }

  const perGroupN =
    input.procedure === 'independent_t'
      ? requiredTotalN / 2
      : input.procedure === 'one_way_anova'
        ? requiredTotalN / groups
        : null;

  const metaMap: Record<PowerProcedure, { label: string; metric: string; mag: string }> = {
    independent_t: {
      label: 'Independent Samples T-Test',
      metric: "Cohen's d",
      mag: effectSize < 0.2 ? 'Negligible' : effectSize < 0.5 ? 'Small' : effectSize < 0.8 ? 'Medium' : 'Large',
    },
    paired_t: {
      label: 'Paired Samples T-Test',
      metric: "Cohen's dz",
      mag: effectSize < 0.2 ? 'Negligible' : effectSize < 0.5 ? 'Small' : effectSize < 0.8 ? 'Medium' : 'Large',
    },
    one_way_anova: {
      label: `One-Way ANOVA (${groups} groups)`,
      metric: "Cohen's f",
      mag: effectSize < 0.1 ? 'Negligible' : effectSize < 0.25 ? 'Small' : effectSize < 0.4 ? 'Medium' : 'Large',
    },
    pearson_correlation: {
      label: 'Pearson Correlation',
      metric: 'Target |r|',
      mag: effectSize < 0.1 ? 'Negligible' : effectSize < 0.3 ? 'Small' : effectSize < 0.5 ? 'Medium' : 'Large',
    },
    multiple_regression: {
      label: `Multiple Linear Regression (${predictors} predictors)`,
      metric: "Cohen's f²",
      mag: effectSize < 0.02 ? 'Negligible' : effectSize < 0.15 ? 'Small' : effectSize < 0.35 ? 'Medium' : 'Large',
    },
  };

  const info = metaMap[input.procedure];
  const maxPlotN = Math.max(requiredTotalN + step * 4, minN + step * 9);
  const curve: Array<{ n: number; power: number }> = [];
  for (let i = 0; i < 10; i += 1) {
    const rawN = Math.round(minN + ((maxPlotN - minN) * i) / 9);
    const alignedN = Math.max(minN, Math.round(rawN / step) * step);
    const pwr = estimatePowerAtN({
      procedure: input.procedure,
      nTotal: alignedN,
      effectSize,
      alpha,
      groups,
      predictors,
    });
    if (!curve.some((c) => c.n === alignedN)) {
      curve.push({ n: alignedN, power: round4(pwr) });
    }
  }

  return {
    procedure: input.procedure,
    procedureLabel: info.label,
    effectSize: round4(effectSize),
    effectMetricName: info.metric,
    effectMagnitude: info.mag,
    alpha,
    targetPower,
    requiredTotalN,
    perGroupN,
    achievedPower: round4(achievedPower),
    summary: `To detect a ${info.mag.toLowerCase()} effect (${info.metric} = ${round4(effectSize)}) at α = ${alpha} with ${(targetPower * 100).toFixed(0)}% statistical power, you need N = ${requiredTotalN}${perGroupN ? ` (${perGroupN} per group)` : ''} (actual power = ${(achievedPower * 100).toFixed(1)}%).`,
    curve,
  };
}

