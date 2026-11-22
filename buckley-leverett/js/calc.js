// Step-by-step calculation sheet (follows the lecture's calculation sequence, slide 41)
// and the model/assumptions page. Every number is computed from the current inputs.
import { outlet } from './physics.js';

export const fx = (v, d = 4) => (v === null || v === undefined || !isFinite(v) ? '—' : Number(v).toFixed(d));
export function fs(v, sig = 4) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e5 || a < 1e-3) return v.toExponential(2);
  const d = Math.max(0, sig - 1 - Math.floor(Math.log10(a)));
  return v.toFixed(Math.min(d, 6));
}

function step(n, title, body) {
  return `<section class="cstep"><div class="n">${n}</div><h3>${title}</h3><div class="body">${body}</div></section>`;
}
const eq = (s, cls = '') => `<div class="eq ${cls}">${s}</div>`;
function table(head, rows) {
  return `<div class="tbl"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function renderCalc(sol, tD) {
  const p = sol.p, U = sol.U, mode = sol.mode;
  const L = U.length, T = U.time, V = U.volume;
  const o = outlet(sol, tD);
  const t = tD * sol.tScale;
  const out = [];
  out.push(`<p class="intro">The same five-step sequence as the lecture, recalculated live from your inputs at t = ${fs(t)} ${T} (tD = ${fx(tD, 4)}). Change any input or the time slider and every number below updates.</p>`);

  out.push(step(0, 'Core scales', [
    eq(`PV = A·φ·L = ${fs(p.A)} × ${fs(p.phi)} × ${fs(p.L)} = ${fs(sol.PV)} ${V}`),
    eq(`u = qt/(A·φ) = ${fs(p.qt)} / (${fs(p.A)} × ${fs(p.phi)}) = ${fs(sol.u)} ${U.speed}`),
    eq(`PV/qt = ${fs(sol.tScale)} ${T}  → tD = qt·t/PV, xD = x/L`),
    `<p>Initially: ${fs(sol.PV * sol.Siw)} ${V} water + ${fs(sol.OOIP)} ${V} oil. Movable oil = PV(1 − Siw − Sor) = ${fs(sol.PV * (1 - sol.Siw - p.Sor))} ${V}.</p>`,
  ].join('')));

  // Step 1: fw table
  const rows = [];
  for (let i = 0; i <= 8; i++) {
    const S = sol.Siw + (sol.Smax - sol.Siw) * i / 8;
    const c = sol.res;
    rows.push([fx(S, 3), fx(c.se(S), 3), fx(c.krw(S), 5), fx(c.kro(S), 5), fx(c.lw(S), 5), fx(c.lo(S), 5), fx(c.f(S), 4), fx(c.df(S), 4)]);
  }
  out.push(step(1, 'Fractional flow from relative permeability', [
    eq(`Se = (Sw − Siw)/(1 − Siw − Sor) = (Sw − ${fx(sol.Siw, 2)})/${fx(1 - sol.Siw - p.Sor, 2)}`),
    eq(`krw = ${fs(p.krwMax)}·Se^${fs(p.nw)}     kro = ${fs(p.kroMax)}·(1 − Se)^${fs(p.no)}`),
    eq(`fw = (krw/μw) / (krw/μw + kro/μo),   μw = ${fs(p.muW)} cP,  μo = ${fs(p.muO)} cP`),
    table(['Sw', 'Se', 'krw', 'kro', 'λw (1/cP)', 'λo (1/cP)', 'fw', 'f′w'], rows),
    `<p>f′w is taken with respect to Sw (chain rule dSe/dSw = 1/${fx(1 - sol.Siw - p.Sor, 2)}).</p>`,
  ].join('')));

  // Step 2: front
  const pistonish = sol.SF >= sol.Smax - 1e-6;
  out.push(step(2, 'Front state and front speed', [
    `<p>The front state F satisfies the tangent condition: the secant from the initial state (Siw, 0) equals the local slope.</p>`,
    eq(`f′w(Swf) = (fwf − 0)/(Swf − Siw)\nSwf = ${fx(sol.SF, 6)},  fwf = ${fx(sol.fF, 6)}\nmf = ${fx(sol.fF, 6)} / (${fx(sol.SF, 6)} − ${fx(sol.Siw, 2)}) = ${fx(sol.vF, 4)}`),
    eq(`vf = u·mf = ${fs(sol.u)} × ${fx(sol.vF, 4)} = ${fs(sol.u * sol.vF)} ${U.speed}`),
    mode === 'polymer' && sol.SF !== sol.Swf ? `<p>In this polymer case the resident bank SR is below the Welge Swf, so the leading front jumps straight from Siw to SR.</p>` : '',
    pistonish ? `<p>The tangent touches at 1 − Sor: the mobility ratio is favourable and the displacement is piston-like.</p>` : '',
  ].join('')));

  // Step 3: breakthrough
  out.push(step(3, 'Breakthrough', [
    eq(`tBT = L/vf = ${fs(p.L)} / ${fs(sol.u * sol.vF)} = ${fs(sol.tBT)} ${T}     (tD,BT = 1/mf = ${fx(sol.tDBT, 5)})`),
    eq(`Vinj,BT = qt·tBT = ${fs(p.qt * sol.tBT)} ${V}`),
    eq(`S̄w,BT = Siw + 1/mf = ${fx(sol.Siw, 2)} + ${fx(sol.tDBT, 5)} = ${fx(sol.SavgBT, 5)}   (tangent intercept at fw = 1)`),
    eq(`Np,BT = PV(S̄w,BT − Siw) = ${fs(sol.NpBT)} ${V}     RF,BT = ${fx(sol.RFBT * 100, 2)} %`),
    `<p>At the same instant the outlet saturation jumps from ${fx(sol.Siw, 2)} to ${fx(sol.SF, 4)} and the water cut jumps from 0 to ${fx(sol.fF, 4)}.</p>`,
  ].join('')));

  // Step 4: profile at current time
  const prow = [];
  const fanStates = [];
  if (mode === 'polymer') {
    for (let i = 0; i <= 3; i++) fanStates.push([sol.Smax - (sol.Smax - sol.SI) * i / 3, sol.inj, 'polymer']);
    if (sol.hasBank) fanStates.push([sol.SR, sol.res, 'bank SR']);
    if (sol.SR > sol.Swf) fanStates.push([sol.Swf, sol.res, 'front']);
  } else {
    for (let i = 0; i <= 4; i++) fanStates.push([sol.Smax - (sol.Smax - sol.SF) * i / 4, sol.res, i === 4 ? 'front' : '']);
  }
  for (const [S, c, tag] of fanStates) {
    const v = tag === 'bank SR' ? sol.zE : c.df(S);
    const x = sol.u * v * t;
    prow.push([fx(S, 4) + (tag ? ` <small>(${tag})</small>` : ''), fx(v, 4), fs(sol.u * v), x > p.L ? `${fs(x)} (beyond L)` : fs(x)]);
  }
  const xF = sol.u * sol.vF * t;
  out.push(step(4, `Saturation profile at t = ${fs(t)} ${T}`, [
    eq(`qt·t/(A·φ) = ${fs(p.qt)} × ${fs(t)} / (${fs(p.A)} × ${fs(p.phi)}) = ${fs(sol.u * t)} ${L}     x = (qt·t/Aφ)·f′w(Sw)`),
    table(['Sw', 'f′w', `vs (${U.speed})`, `x (${L})`], prow),
    eq(xF < p.L ? `xf = vf·t = ${fs(xF)} ${L} < L: the outlet still produces oil only. Ahead of the front Sw = ${fx(sol.Siw, 2)}.` : `vf·t = ${fs(xF)} ${L} > L: the front has passed the outlet (breakthrough at ${fs(sol.tBT)} ${T}).`),
  ].join('')));

  // Step 5: averages & production
  const pre = tD <= sol.tDBT;
  const lines = [];
  if (pre) {
    lines.push(eq(`Before breakthrough Wp = 0:\nS̄w = Siw + qt·t/PV = ${fx(sol.Siw, 2)} + ${fx(tD, 5)} = ${fx(o.Savg, 5)}`));
  } else {
    lines.push(eq(`Outlet saturation from f′w(Sw,out) = PV/(qt·t) = 1/tD = ${fx(1 / tD, 4)}\nSw,out = ${fx(o.Sout, 6)},  fw,out = ${fx(o.fout, 6)}${mode === 'polymer' && o.outRegion === 'inj' ? '  (polymer curve)' : ''}`));
    lines.push(eq(`Welge: S̄w = Sw,out + (qt·t/PV)(1 − fw,out) = ${fx(o.Sout, 5)} + ${fx(tD, 4)} × ${fx(1 - o.fout, 5)} = ${fx(o.Savg, 5)}`));
  }
  lines.push(eq(`Np = PV(S̄w − Siw) = ${fs(o.Np)} ${V}     Wp = qt·t − Np = ${fs(o.Vinj)} − ${fs(o.Np)} = ${fs(o.Wp)} ${V}`));
  lines.push(eq(`RF = Np/[PV(1 − Siw)] = ${fs(o.Np)} / ${fs(sol.OOIP)} = ${fx(o.RF * 100, 2)} %`));
  lines.push(eq(`WOR (reservoir) = fw/(1 − fw) = ${fs(o.WORres)}     WOR (surface) = (Bo/Bw)·fw/(1 − fw) = ${fs(o.WORsurf)}`));
  lines.push(eq(`Upper limit: RFmax = (1 − Siw − Sor)/(1 − Siw) = ${fx(sol.RFmax * 100, 2)} %`));
  out.push(step(5, 'Average saturation and production', lines.join('')));

  if (mode === 'tracer') {
    const vB = sol.u * sol.mI;
    out.push(`<h3 class="sec-title">Tracer: water amount versus water origin</h3>`);
    out.push(step('T1', 'Label conservation gives the boundary speed', [
      `<p>The tracer marks injected water. Conserving only the labelled water across boundary B gives vB = u·fB/SB. Because B travels with the constant-saturation state it sits on, f′w(SB) = fB/SB: a tangent drawn from the origin (0, 0).</p>`,
      eq(`SB = ${fx(sol.SI, 6)},  fB = ${fx(sol.fI, 6)},  fB/SB = ${fx(sol.mI, 4)}`, 'tr'),
      eq(`vB = ${fs(sol.u)} × ${fx(sol.mI, 4)} = ${fs(vB)} ${U.speed}     vF = ${fs(sol.u * sol.vF)} ${U.speed}  (×${fx(sol.vF / sol.mI, 2)} faster)`, 'tr'),
      table(['Feature', `Speed (${U.speed})`, `Position at t (${L})`, `Arrival at L (${T})`], [
        ['F leading water front', fs(sol.u * sol.vF), fs(Math.min(p.L, sol.u * sol.vF * t)), fs(sol.tBT)],
        ['B tracer boundary', fs(vB), fs(Math.min(p.L, vB * t)), fs(p.L / vB)],
      ]),
      `<p>Between F and B the produced water is resident (connate) water with no tracer. Water breakthrough and tracer breakthrough are separate events.${p.alphaL > 0 ? ` With dispersivity αL = ${fs(p.alphaL)} ${L} the tracer boundary is smeared as c/c₀ = ½ erfc[(x − vB t)/(2√(αL vB t))] (approximation).` : ''}</p>`,
    ].join('')));
  }

  if (mode === 'polymer') {
    const vI = sol.u * sol.mI;
    const Sa = sol.Sa;
    out.push(`<h3 class="sec-title">Polymer: viscous injection and the oil bank</h3>`);
    out.push(step('P1', 'Two fractional-flow curves', [
      eq(`Injected solution: μI = μp·Rk = ${fs(p.muP)} × ${fs(p.Rk)} = ${fs(sol.muI)} cP     Resident water: μw = ${fs(p.muW)} cP`, 'po'),
      `<p>At the same Sw the viscous solution carries a smaller share of the flow. Example at Sw = ${fx((sol.Siw + sol.Smax) / 2, 3)}: fw,R = ${fx(sol.res.f((sol.Siw + sol.Smax) / 2), 4)}, fw,I = ${fx(sol.inj.f((sol.Siw + sol.Smax) / 2), 4)}.</p>`,
    ].join('')));
    out.push(step('P2', 'Polymer front I from the common line', [
      `<p>Total water and polymer must both be conserved across I. That puts I and the resident state R on one straight line through (${fx(Sa, 2)}, 0)${Sa !== 0 ? ' (shifted from the origin by IPV − D)' : ''}; the line is tangent to the polymer curve at I.</p>`,
      eq(`fI/(SI − Sa) = fR/(SR − Sa) = (fI − fR)/(SI − SR) = vI/u\nSI = ${fx(sol.SI, 6)}, fI = ${fx(sol.fI, 6)}\nSR = ${fx(sol.SR, 6)}, fR = ${fx(sol.fR, 6)}`, 'po'),
      eq(`check: ${fx(sol.fI / (sol.SI - Sa), 4)} ≈ ${fx(sol.fR / (sol.SR - Sa), 4)} ≈ ${sol.hasBank ? fx((sol.fI - sol.fR) / (sol.SI - sol.SR), 4) : '—'}     vI = ${fs(sol.u)} × ${fx(sol.mI, 4)} = ${fs(vI)} ${U.speed}`, 'po'),
    ].join('')));
    out.push(step('P3', 'Features passing the outlet', [
      table(['Feature', 'How', `Speed (${U.speed})`, `Arrival (${T})`], [
        ['F leading water front', sol.SR >= sol.Swf ? 'u·fF/(SF − Siw)' : 'u·fR/(SR − Siw)', fs(sol.u * sol.vF), fs(sol.tBT)],
        ...(sol.hasBank ? [['E start of bank SR', 'u·f′R(SR)', fs(sol.u * sol.zE), fs(p.L / (sol.u * sol.zE))]] : []),
        ['I polymer front', 'u·fI/(SI − Sa)', fs(vI), fs(p.L / vI)],
      ]),
      table(['Location', 'Sw', 'So = 1 − Sw'], [
        ['Polymer side I', fx(sol.SI, 4), fx(1 - sol.SI, 4)],
        ['Oil bank R', fx(sol.SR, 4), fx(1 - sol.SR, 4)],
        ['Initial core', fx(sol.Siw, 4), fx(1 - sol.Siw, 4)],
      ]),
      `<p>The bank is oil-rich compared with the polymer region behind it. The water produced while the bank passes the outlet is resident water (c = 0).</p>`,
    ].join('')));
  }
  return out.join('');
}

export function renderTheory() {
  return `
  <p class="intro">The ideal Buckley–Leverett displacement. Use it as a benchmark, then examine which assumption explains any mismatch with a real core.</p>
  ${step('A', 'Assumptions', table(['Assumption', 'Consequence'], [
    ['Homogeneous, horizontal, one-dimensional flow, constant A', 'Each cross-section has one saturation'],
    ['Incompressible fluids and rigid rock', 'qt is uniform along the core; water in replaces an equal fluid volume'],
    ['Negligible capillary-pressure and gravity gradients', 'Both phases share one pressure gradient, so fw = λw/(λw + λo)'],
    ['Injection into immobile initial water (krw(Siw) = 0)', 'Oil only until breakthrough'],
    ['Constant injection rate', 'Saturations travel distances proportional to time'],
    ['Fixed residual oil Sor', 'Recovery is capped at (1 − Siw − Sor)/(1 − Siw)'],
  ]))}
  ${step('B', 'Equations', [
    eq('∂Sw/∂t + [qt/(Aφ)] ∂fw/∂x = 0          (water conservation)'),
    eq('vs = (qt/Aφ) f′w(Sw)                    (smooth wave: dSw = 0 along its path)'),
    eq('vf = (qt/Aφ)(fwf − fwi)/(Swf − Siw)     (jump balance across the front)'),
    eq('f′w(Swf) = fwf/(Swf − Siw)              (tangent from (Siw, 0))'),
    eq('tD,BT = 1/mf,  xD = tD f′w(Sw)'),
    eq('S̄w = Sw,out + tD (1 − fw,out),  Np = PV(S̄w − Siw),  Wp = qt t − Np'),
    eq('Tracer:  vB/u = fB/SB = f′w(SB)          (tangent from the origin)', 'tr'),
    eq('Polymer: fI/(SI − Sa) = fR/(SR − Sa) = (fI − fR)/(SI − SR),  Sa = IPV − D', 'po'),
  ].join(''))}
  ${step('C', 'The three modes', `<ul>
    <li><b>Waterflood.</b> Classical Welge solution: a shock from Siw to Swf followed by a spreading wave up to 1 − Sor.</li>
    <li><b>Water + tracer.</b> Same saturation solution. An ideal tracer marks injected water and travels at u·fB/SB, behind the saturation front, so resident water is produced first. Optional dispersivity smears the tracer boundary (approximate erfc model).</li>
    <li><b>Polymer.</b> Lecture extension “viscous injection”: injected water with viscosity μp·Rk behind boundary I, resident water ahead. The common-line construction gives the oil bank SR. Optional adsorption D (pore volumes) and inaccessible pore volume shift the line's anchor to (IPV − D, 0), as in Pope's fractional-flow theory. Polymer does not change Sor here.</li>
  </ul>`)}
  ${step('D', 'When the ideal model and a real core disagree', table(['Observation', 'Physics to investigate'], [
    ['Front spread over a finite distance', 'Capillary effects, dispersion, measurement resolution'],
    ['Early arrival through a preferential path', 'Heterogeneity, channelling, viscous fingering'],
    ['Water moving along the bottom', 'Gravity segregation'],
    ['Field recovery below the ideal prediction', 'Areal and vertical sweep, flow-path distribution'],
  ]))}
  ${step('E', 'Pressure drop', [
    eq('Δp = (qt/(A k)) ∫₀ᴸ dx / λt(Sw),   λt = krw/μw + kro/μo'),
    `<p>Permeability cancels from the saturation solution at a fixed rate but sets the required pressure. The lecture gives no k for Core A; 2000 mD is an illustrative default.</p>`,
  ].join(''))}`;
}
