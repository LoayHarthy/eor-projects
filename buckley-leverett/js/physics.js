// Buckley–Leverett fractional-flow engine.
// Pure functions, no DOM: usable in the browser and in Node tests.
//
// Notation follows the lecture "Displacement in Linear Systems" (A. Kazemi):
//   Se = (Sw − Siw)/(1 − Siw − Sor), krw = krw* Se^nw, kro = kro* (1 − Se)^no
//   fw = λw/(λw + λo), u = qt/(Aφ), xD = x/L, tD = qt t / PV
//   smooth wave: xD = tD f'w(Sw); front: mf = f'w(Swf) = fwf/(Swf − Siw)
//   label boundary: vB/u = fB/SB (origin tangent)
//   viscous injection: fI/SI = fR/SR = (fI − fR)/(SI − SR) (common origin line)
//   Welge: S̄w = Sw,out + tD (1 − fw,out)

export const UNIT_SYSTEMS = {
  lab: {
    key: 'lab', label: 'Laboratory (cm, s)',
    length: 'cm', area: 'cm²', rate: 'cm³/s', time: 's', volume: 'cm³', speed: 'cm/s',
    // conversion of user units to SI
    toM: 0.01, toM2: 1e-4, toM3s: 1e-6, toS: 1,
  },
  field: {
    key: 'field', label: 'Field (m, day)',
    length: 'm', area: 'm²', rate: 'm³/day', time: 'day', volume: 'm³', speed: 'm/day',
    toM: 1, toM2: 1, toM3s: 1 / 86400, toS: 86400,
  },
};

// Core A from the lecture (slide 5). k is not given in the lecture; 2000 mD is illustrative
// and only affects the pressure-drop plot.
export const PRESETS = {
  coreA: {
    name: 'Core A — lecture lab case',
    units: 'lab', L: 100, A: 10, phi: 0.20, k: 2000, qt: 0.20,
    Siw: 0.30, Sor: 0.30, krwMax: 0.20, kroMax: 0.80, nw: 2, no: 2,
    muW: 1, muO: 40, Bo: 1, Bw: 1,
    alphaL: 0, muP: 4, Rk: 1, D: 0, ipv: 0, tDend: 1.0,
  },
  field: {
    name: 'Ideal field streamtube (slide 75)',
    units: 'field', L: 500, A: 200, phi: 0.20, k: 2000, qt: 100,
    Siw: 0.30, Sor: 0.30, krwMax: 0.20, kroMax: 0.80, nw: 2, no: 2,
    muW: 1, muO: 40, Bo: 1.2, Bw: 1.0,
    alphaL: 0, muP: 4, Rk: 1, D: 0, ipv: 0, tDend: 1.0,
  },
  favourable: {
    name: 'Light oil',
    units: 'lab', L: 100, A: 10, phi: 0.20, k: 2000, qt: 0.20,
    Siw: 0.30, Sor: 0.30, krwMax: 0.20, kroMax: 0.80, nw: 2, no: 2,
    muW: 1, muO: 2, Bo: 1, Bw: 1,
    alphaL: 0, muP: 4, Rk: 1, D: 0, ipv: 0, tDend: 1.0,
  },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Relative permeability + fractional flow for one water viscosity. */
export function makeCurve(p, muW) {
  const dS = 1 - p.Siw - p.Sor;
  const Smin = p.Siw, Smax = 1 - p.Sor;
  const se = (S) => clamp((S - p.Siw) / dS, 0, 1);
  const krw = (S) => p.krwMax * Math.pow(se(S), p.nw);
  const kro = (S) => p.kroMax * Math.pow(1 - se(S), p.no);
  const dkrw = (S) => { const e = se(S); return p.krwMax * p.nw * (p.nw === 1 ? 1 : Math.pow(e, p.nw - 1)) / dS; };
  const dkro = (S) => { const e = se(S); return -p.kroMax * p.no * (p.no === 1 ? 1 : Math.pow(1 - e, p.no - 1)) / dS; };
  const lw = (S) => krw(S) / muW;
  const lo = (S) => kro(S) / p.muO;
  const f = (S) => {
    const a = lw(S), b = lo(S);
    return a + b === 0 ? 0 : a / (a + b);
  };
  const df = (S) => {
    const a = lw(S), b = lo(S);
    const da = dkrw(S) / muW, db = dkro(S) / p.muO;
    const t = a + b;
    if (t === 0) return 0;
    return (da * b - a * db) / (t * t);
  };
  const lt = (S) => lw(S) + lo(S); // total mobility, 1/cP
  return { muW, Smin, Smax, se, krw, kro, lw, lo, lt, f, df };
}

/** Max over S of f(S)/(S − Sa) on (lo, Smax]: tangent from (Sa, 0). */
export function tangentFrom(curve, Sa, lo) {
  const a = Math.max(lo, Sa) + 1e-9;
  const b = curve.Smax;
  const g = (S) => curve.f(S) / (S - Sa);
  const N = 4000;
  let best = b, gbest = g(b);
  for (let i = 1; i <= N; i++) {
    const S = a + (b - a) * i / N;
    const v = g(S);
    if (v > gbest) { gbest = v; best = S; }
  }
  // golden-section refinement around the best grid point
  let x0 = Math.max(a, best - (b - a) / N), x1 = Math.min(b, best + (b - a) / N);
  const R = (Math.sqrt(5) - 1) / 2;
  let c = x1 - R * (x1 - x0), d = x0 + R * (x1 - x0);
  for (let i = 0; i < 80; i++) {
    if (g(c) > g(d)) x1 = d; else x0 = c;
    c = x1 - R * (x1 - x0); d = x0 + R * (x1 - x0);
  }
  let S = (x0 + x1) / 2;
  if (g(b) >= g(S)) S = b; // piston-like (favourable) displacement
  return { S, f: curve.f(S), m: curve.f(S) / (S - Sa) };
}

/** Solve f'(S) = z on [a, b] where f' is decreasing; clamps at the ends. */
export function invDf(curve, z, a, b) {
  if (b <= a) return a;
  if (z >= curve.df(a)) return a;
  if (z <= curve.df(b)) return b;
  let lo = a, hi = b;
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (lo + hi);
    if (curve.df(m) > z) lo = m; else hi = m;
  }
  return 0.5 * (lo + hi);
}

/** Sanitize user parameters. */
export function normalize(p0) {
  const p = { ...p0 };
  p.Siw = clamp(+p.Siw, 0, 0.8);
  p.Sor = clamp(+p.Sor, 0, 0.8);
  if (p.Siw + p.Sor > 0.9) p.Sor = 0.9 - p.Siw;
  p.nw = clamp(+p.nw, 1, 8); p.no = clamp(+p.no, 1, 8);
  for (const k of ['L', 'A', 'phi', 'k', 'qt', 'krwMax', 'kroMax', 'muW', 'muO', 'muP', 'Rk', 'Bo', 'Bw'])
    p[k] = Math.max(+p[k], 1e-6);
  p.phi = Math.min(p.phi, 0.6);
  p.alphaL = Math.max(+p.alphaL || 0, 0);
  p.D = Math.max(+p.D || 0, 0);
  p.ipv = clamp(+p.ipv || 0, 0, Math.max(0, p.Siw - 0.01));
  p.tDend = clamp(+p.tDend || 1, 0.05, 20);
  return p;
}

/**
 * Build the complete self-similar solution S(ζ), ζ = xD/tD.
 * mode: 'water' | 'tracer' | 'polymer'
 */
export function solve(p0, mode = 'water') {
  const p = normalize(p0);
  const U = UNIT_SYSTEMS[p.units] || UNIT_SYSTEMS.lab;
  const res = makeCurve(p, p.muW);
  const polymer = mode === 'polymer';
  const muI = polymer ? Math.max(p.muP * p.Rk, p.muW) : p.muW;
  const inj = polymer ? makeCurve(p, muI) : res;
  const Sa = polymer ? p.ipv - p.D : 0; // anchor of the injected-water/polymer line
  const Siw = p.Siw, Smax = 1 - p.Sor;

  // Geometry and scales (user units)
  const PV = p.A * p.phi * p.L;
  const u = p.qt / (p.A * p.phi);           // length/time
  const tScale = PV / p.qt;                  // time per pore volume
  const OOIP = PV * (1 - Siw);

  // Leading water front on the resident curve (tangent from (Siw, 0))
  const F = tangentFrom(res, Siw, Siw);
  const Swf = F.S, fwf = F.f, mf = F.m;

  // Injected-water / polymer boundary I (or label boundary B): tangent from (Sa, 0)
  const I = tangentFrom(inj, Sa, Siw);
  const SI = I.S, fI = I.f, mI = I.m;

  // Resident bank state R: crossing of f = mI (S − Sa) with the resident curve below SI
  let SR = SI;
  const h = (S) => res.f(S) - mI * (S - Sa);
  if (h(SI) > 1e-10) {
    let lo = Siw, hi = SI;
    for (let i = 0; i < 80; i++) {
      const m = 0.5 * (lo + hi);
      if (h(m) < 0) lo = m; else hi = m;
    }
    SR = 0.5 * (lo + hi);
  }
  const fR = res.f(SR);

  // Leading front: if the bank is below Swf, the front jumps directly Siw → SR.
  let vF, SF, fF;
  if (SR >= Swf - 1e-12) { vF = mf; SF = Swf; fF = fwf; }
  else { SF = SR; fF = fR; vF = fR / (SR - Siw); }
  const zE = Math.min(res.df(SR), vF); // end of SR plateau (bank edge E)
  const hasBank = polymer && SI - SR > 1e-6;

  /** state at similarity coordinate ζ = xD/tD */
  function stateAt(z) {
    if (z <= mI) {
      const S = invDf(inj, z, SI, Smax);
      return { S, f: inj.f(S), region: 'inj', c: 1, mu: muI };
    }
    if (z <= zE) return { S: SR, f: fR, region: 'res', c: 0, mu: p.muW };
    if (z <= vF) {
      const S = SR > Swf ? invDf(res, z, Swf, SR) : SR;
      return { S, f: res.f(S), region: 'res', c: 0, mu: p.muW };
    }
    return { S: Siw, f: 0, region: 'init', c: 0, mu: p.muW };
  }

  const features = [];
  features.push({ id: 'F', name: 'Leading water front', v: vF, S: [Siw, SF], color: 'front' });
  if (mode === 'tracer') features.push({ id: 'B', name: 'Tracer (injected-water) boundary', v: mI, S: [SI, SI], color: 'tracer' });
  if (polymer) {
    if (hasBank) features.push({ id: 'E', name: 'Bank edge (start of SR plateau)', v: zE, S: [SR, SR], color: 'bank' });
    features.push({ id: 'I', name: 'Polymer front', v: mI, S: [SR, SI], color: 'polymer' });
  }

  const sol = {
    p, mode, U, res, inj, muI, Sa, Siw, Smax,
    PV, u, tScale, OOIP,
    Swf, fwf, mf, SF, fF, vF,
    SI, fI, mI, SR, fR, zE, hasBank,
    features, stateAt,
  };
  sol.tDBT = 1 / vF;
  sol.tBT = sol.tDBT * tScale;
  sol.SavgBT = Siw + sol.tDBT;
  sol.NpBT = PV * sol.tDBT;
  sol.RFBT = sol.tDBT / (1 - Siw);
  sol.RFmax = (1 - Siw - p.Sor) / (1 - Siw);
  return sol;
}

/** Tracer concentration (label) with optional longitudinal dispersion (approximate). */
export function erfc(x) {
  // Abramowitz–Stegun 7.1.26
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-z * z);
  return x >= 0 ? y : 2 - y;
}

function tracerC(sol, xD, tD) {
  const xB = sol.mI * tD;
  const a = sol.p.alphaL / sol.p.L; // dimensionless dispersivity
  if (a <= 0 || xB <= 0) return xD <= xB ? 1 : 0;
  return 0.5 * erfc((xD - xB) / (2 * Math.sqrt(a * xB)));
}

/** Snapshot at dimensionless time tD: profile arrays + outlet + averages. */
export function snapshot(sol, tD, n = 600) {
  const xs = [], S = [], c = [], region = [], f = [];
  for (let i = 0; i <= n; i++) {
    const xD = i / n;
    const st = tD > 0 ? sol.stateAt(xD / tD) : { S: sol.Siw, f: 0, region: 'init', c: 0, mu: sol.p.muW };
    xs.push(xD); S.push(st.S); f.push(st.f); region.push(st.region);
    c.push(sol.mode === 'tracer' ? (tD > 0 ? tracerC(sol, xD, tD) : 0) : st.c);
  }
  // insert exact discontinuities for crisp plotting
  return { tD, xs, S, c, f, region, ...outlet(sol, tD) };
}

/** Outlet state and integral quantities at tD (exact, via the generalized Welge relation). */
export function outlet(sol, tD) {
  const p = sol.p;
  const st = tD > 0 ? sol.stateAt(1 / tD) : { S: sol.Siw, f: 0, region: 'init', c: 0 };
  const Sout = st.S, fout = st.f;
  const Savg = Sout + tD * (1 - fout);
  const NpD = Savg - sol.Siw;
  const WpD = Math.max(tD - NpD, 0);
  let cout = st.c;
  if (sol.mode === 'tracer') cout = tD > 0 ? tracerC(sol, 1, tD) : 0;
  const WORres = fout >= 1 ? Infinity : fout / (1 - fout);
  return {
    tD, t: tD * sol.tScale, Vinj: tD * sol.PV,
    Sout, fout, cout, outRegion: st.region, Savg,
    NpD, WpD, Np: NpD * sol.PV, Wp: WpD * sol.PV,
    RF: NpD / (1 - sol.Siw),
    WORres, WORsurf: WORres * p.Bo / p.Bw,
    qw: p.qt * fout, qo: p.qt * (1 - fout),
    xF: Math.min(sol.vF * tD, 1), xI: Math.min(sol.mI * tD, 1), xE: Math.min(sol.zE * tD, 1),
    dP: pressureDrop(sol, tD),
  };
}

/** Pressure drop across the core (Darcy, rate-controlled), returned in kPa. */
export function pressureDrop(sol, tD, n = 240) {
  const p = sol.p, U = sol.U;
  let integ = 0; // ∫0^1 dxD / λt   [cP]
  for (let i = 0; i < n; i++) {
    const xD = (i + 0.5) / n;
    const st = tD > 0 ? sol.stateAt(xD / tD) : { S: sol.Siw, region: 'init' };
    const curve = st.region === 'inj' ? sol.inj : sol.res;
    integ += 1 / Math.max(curve.lt(st.S), 1e-12) / n;
  }
  const q = p.qt * U.toM3s, L = p.L * U.toM, A = p.A * U.toM2, k = p.k * 9.869233e-16;
  const dPa = q * L / (A * k) * integ * 1e-3; // cP → Pa·s
  return dPa / 1000; // kPa
}

/** Time histories from 0 to tDend, including exact arrival instants. */
export function history(sol, tDend, n = 400) {
  const ts = new Set();
  for (let i = 0; i <= n; i++) ts.add(tDend * i / n);
  for (const ft of sol.features) {
    const ta = 1 / ft.v;
    if (ta < tDend) { ts.add(ta * (1 - 1e-6)); ts.add(ta * (1 + 1e-6)); }
  }
  const arr = [...ts].sort((a, b) => a - b);
  return arr.map((tD) => outlet(sol, tD));
}

/** Where (if anywhere) does a chosen saturation sit at time tD? */
export function exploreSw(sol, Sw, tD) {
  const { Siw, Smax } = sol;
  let curve = sol.res, present = true, note = '', z = null, plateau = null;
  if (Sw <= Siw + 1e-9) {
    note = 'Initial water saturation: occupies the uninvaded core ahead of the front.';
    z = sol.vF; present = true;
  } else if (Sw >= sol.SI - 1e-9) {
    curve = sol.inj; z = curve.df(Sw);
    note = sol.mode === 'polymer' ? 'Smooth wave inside the polymer (injected) region.' : 'Smooth wave behind the front.';
  } else if (sol.hasBank && Math.abs(Sw - sol.SR) < 2e-3) {
    plateau = [sol.mI, sol.zE]; z = sol.zE;
    note = 'Constant-saturation oil bank: this value occupies a whole interval.';
  } else if (sol.hasBank && Sw > sol.SR) {
    present = false; note = 'Skipped: the polymer front jumps from SR to SI.';
  } else if (Sw >= sol.SF - 1e-9) {
    z = curve.df(Sw);
    note = 'Smooth wave behind the front.';
  } else {
    present = false; note = 'Skipped: the leading front jumps from Siw directly to Swf.';
  }
  const fw = curve.f(Sw), dfw = curve.df(Sw);
  const xD = present && z !== null ? z * tD : null;
  return {
    Sw, curve, present, note, plateau,
    krw: curve.krw(Sw), kro: curve.kro(Sw), fw, dfw,
    v: present && z !== null ? z * sol.u : null,
    xD: xD !== null && xD <= 1 ? xD : null,
    arrivalTD: present && z ? 1 / z : null,
    plateauX: plateau ? plateau.map((q) => Math.min(q * tD, 1)) : null,
  };
}
