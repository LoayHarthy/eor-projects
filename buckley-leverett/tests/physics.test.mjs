// Run: node tests/physics.test.mjs
// Checks the engine against the worked numbers in the lecture (Core A).
import { PRESETS, solve, outlet, makeCurve } from '../js/physics.js';

let fails = 0;
function near(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(44)} got ${got.toFixed(6)}  want ${want}`);
}

const A = PRESETS.coreA;
const w = solve(A, 'water');
const c = makeCurve(w.p, 1);

// Slides 44–48: fractional flow table and slopes
near('fw(0.35)', c.f(0.35), 0.1695, 1e-4);
near('fw(0.40)', c.f(0.40), 0.5263, 1e-4);
near('fw(0.50)', c.f(0.50), 0.9091, 1e-4);
near('fw(0.60)', c.f(0.60), 0.9890, 1e-4);
near("f'w(0.50)", c.df(0.50), 1.6529, 1e-4);
near("f'w(0.60)", c.df(0.60), 0.28982, 1e-5);

// Slides 50–52: front and breakthrough
near('Swf', w.Swf, 0.420605, 2e-6);
near('fwf', w.fwf, 0.650756, 2e-6);
near('mf', w.mf, 5.3958, 1e-4);
near('vf (cm/s)', w.vF * w.u, 0.53958, 1e-5);
near('tBT (s)', w.tBT, 185.33, 0.01);
near('S̄w,BT', w.SavgBT, 0.48533, 1e-5);
near('RF at BT', w.RFBT, 0.2648, 1e-4);

// Slides 64–67: 300 s
let o = outlet(w, 300 / w.tScale);
near('Sw,out @300 s', o.Sout, 0.455715, 2e-6);
near('fw,out @300 s', o.fout, 0.802497, 2e-6);
near('S̄w @300 s', o.Savg, 0.514966, 2e-6);
near('Np @300 s (cm³)', o.Np, 42.99, 0.01);
near('RF @300 s', o.RF, 0.3071, 1e-4);

// Slides 69–70: 500 s
o = outlet(w, 0.5);
near('Sw,out @500 s', o.Sout, 0.488278, 2e-6);
near('Np @500 s', o.Np, 48.88, 0.01);

// Slide 120: 120 s front
o = outlet(w, 0.12);
near('xf @120 s (cm)', o.xF * 100, 64.75, 0.01);

// Slide 96: tracer boundary
const t = solve(A, 'tracer');
near('SB', t.SI, 0.494125, 2e-6);
near('fB', t.fI, 0.898898, 2e-6);
near('vB (cm/s)', t.mI * t.u, 0.18192, 1e-5);

// Slides 112–114: viscous injection (polymer mode, 4 cP)
const pm = solve(A, 'polymer');
near('SI', pm.SI, 0.576379, 2e-6);
near('fI', pm.fI, 0.925903, 2e-6);
near('SR', pm.SR, 0.427589, 2e-6);
near('fR', pm.fR, 0.686885, 2e-6);
near('mI', pm.mI, 1.6064, 1e-4);
near("E speed f'R(SR)", pm.zE, 4.9504, 1e-4);
near('tI arrival (s)', 1 / pm.mI * pm.tScale, 622.5, 0.1);
near('Np @300 s polymer', outlet(pm, 0.3).Np, 44.30, 0.01);
// Slide 78: uniform μw = 4 cP
const w4 = solve({ ...A, muW: 4 }, 'water');
near('Swf (μw=4)', w4.Swf, 0.5138, 1e-4);
near('vf (μw=4)', w4.vF * w4.u, 0.35885, 1e-5);

// Independent check: Welge average vs direct integration of the profile
for (const [m, extra] of [['water', {}], ['tracer', {}], ['polymer', {}], ['polymer', { muP: 12, D: 0.1, ipv: 0.05 }]]) {
  const s = solve({ ...A, ...extra }, m);
  for (const tD of [0.05, 0.19, 0.4, 0.9, 2.2]) {
    const q = outlet(s, tD);
    const n = 200000; let sum = 0;
    for (let i = 0; i < n; i++) sum += s.stateAt(((i + 0.5) / n) / tD).S / n;
    near(`profile area ${m}${extra.D ? '+ads' : ''} tD=${tD}`, sum, q.Savg, 2e-4);
  }
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
