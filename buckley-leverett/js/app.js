import { PRESETS, UNIT_SYSTEMS, solve, history, snapshot, exploreSw, normalize } from './physics.js';
import { createPlots } from './plots.js';
import { renderCalc, renderTheory, fx, fs } from './calc.js';

// ---------- parameter definitions ----------
const GROUPS = [
  { id: 'core', title: 'Core & rock', note: 'Geometry sets the velocity scale u = qt/(Aφ); k only sets the pressure.', open: true },
  { id: 'sat', title: 'Saturation endpoints', note: 'The mobile interval is Siw ≤ Sw ≤ 1 − Sor.', open: true },
  { id: 'kr', title: 'Relative permeability (Corey)', note: 'krw = krw*·Se^nw,  kro = kro*·(1 − Se)^no', open: true },
  { id: 'fl', title: 'Fluids', note: 'Viscosities change the fw curve; B factors only convert WOR to surface.', open: true },
  { id: 'inj', title: 'Injection', open: true },
  { id: 'tracer', title: 'Tracer', modes: ['tracer'], note: 'Ideal tracer dissolved in injected water.', open: true },
  { id: 'poly', title: 'Polymer', modes: ['polymer'], note: 'Injected water becomes a viscous solution (μp·Rk).', open: true },
];
const P = [
  { k: 'L', g: 'core', sym: 'L', nm: 'Core length', u: (U) => U.length, r: { lab: [10, 300, 1], field: [50, 2000, 10] }, help: 'Distance from injector to producer.' },
  { k: 'A', g: 'core', sym: 'A', nm: 'Cross-section area', u: (U) => U.area, r: { lab: [1, 50, 0.5], field: [10, 1000, 10] } },
  { k: 'phi', g: 'core', sym: 'φ', nm: 'Porosity', u: () => 'fraction', r: [0.05, 0.4, 0.01] },
  { k: 'k', g: 'core', sym: 'k', nm: 'Absolute permeability', u: () => 'mD', r: [10, 5000, 10] },
  { k: 'Siw', g: 'sat', sym: 'Siw', nm: 'Initial (connate) water', u: () => 'fraction', r: [0.05, 0.5, 0.01], help: 'Immobile at the start: krw(Siw) = 0.' },
  { k: 'Sor', g: 'sat', sym: 'Sor', nm: 'Residual oil', u: () => 'fraction', r: [0.05, 0.5, 0.01] },
  { k: 'krwMax', g: 'kr', sym: 'krw*', nm: 'Water endpoint at 1 − Sor', u: () => '–', r: [0.05, 1, 0.01] },
  { k: 'kroMax', g: 'kr', sym: 'kro*', nm: 'Oil endpoint at Siw', u: () => '–', r: [0.1, 1, 0.01] },
  { k: 'nw', g: 'kr', sym: 'nw', nm: 'Water Corey exponent', u: () => '–', r: [1, 6, 0.1] },
  { k: 'no', g: 'kr', sym: 'no', nm: 'Oil Corey exponent', u: () => '–', r: [1, 6, 0.1] },
  { k: 'muW', g: 'fl', sym: 'μw', nm: 'Water viscosity', u: () => 'cP', r: [0.3, 10, 0.1] },
  { k: 'muO', g: 'fl', sym: 'μo', nm: 'Oil viscosity', u: () => 'cP', r: [0.3, 200, 0.1] },
  { k: 'Bo', g: 'fl', sym: 'Bo', nm: 'Oil formation volume factor', u: () => 'rm³/sm³', r: [1, 2, 0.01] },
  { k: 'Bw', g: 'fl', sym: 'Bw', nm: 'Water formation volume factor', u: () => 'rm³/sm³', r: [0.95, 1.1, 0.01] },
  { k: 'qt', g: 'inj', sym: 'qt', nm: 'Injection rate', u: (U) => U.rate, r: { lab: [0.01, 2, 0.01], field: [10, 1000, 5] } },
  { k: 'tDend', g: 'inj', sym: 'tD,end', nm: 'Pore volumes to simulate', u: () => 'PV', r: [0.2, 5, 0.05], help: 'Length of the timeline. The lecture case breaks through at 0.185 PV.' },
  { k: 'alphaL', g: 'tracer', sym: 'αL', nm: 'Dispersivity (0 = sharp)', u: (U) => U.length, r: { lab: [0, 5, 0.05], field: [0, 20, 0.1] }, help: 'Approximate smearing of the tracer boundary.' },
  { k: 'muP', g: 'poly', sym: 'μp', nm: 'Polymer solution viscosity', u: () => 'cP', r: [1, 100, 0.5], help: 'Lecture case B uses 4 cP.' },
  { k: 'Rk', g: 'poly', sym: 'Rk', nm: 'Permeability reduction', u: () => '–', r: [1, 5, 0.1], help: 'Water mobility in the polymer zone is krw/(μp·Rk).' },
  { k: 'D', g: 'poly', sym: 'D', nm: 'Adsorption', u: () => 'PV', r: [0, 0.5, 0.01], help: 'Polymer retained by the rock, in pore volumes of injected solution.' },
  { k: 'ipv', g: 'poly', sym: 'IPV', nm: 'Inaccessible pore volume', u: () => 'fraction', r: [0, 0.3, 0.01], help: 'Pore space polymer cannot enter; makes polymer travel faster.' },
];

// ---------- state ----------
const state = {
  mode: 'water', preset: 'coreA', params: { ...PRESETS.coreA },
  tD: 0.12, swFrac: 0.5, playing: false, speed: 1,
  showRaw: false, fractions: true, baseline: null, tab: 'plots',
};
let sol, hist, snap, swInfo;

const $ = (id) => document.getElementById(id);
const U = () => UNIT_SYSTEMS[state.params.units];

// ---------- inputs UI ----------
function rangeFor(d) { const r = d.r; return Array.isArray(r) ? r : r[state.params.units]; }
function buildInputs() {
  const host = $('param-groups');
  host.innerHTML = '';
  for (const g of GROUPS) {
    const det = document.createElement('details');
    det.className = 'group'; det.open = g.open; det.id = `grp-${g.id}`;
    det.dataset.modes = (g.modes || []).join(',');
    det.innerHTML = `<summary>${g.title}</summary>${g.note ? `<p class="gnote">${g.note}</p>` : ''}`;
    for (const d of P.filter((q) => q.g === g.id)) {
      const [mn, mx, st] = rangeFor(d);
      const row = document.createElement('div');
      row.className = 'param';
      row.innerHTML = `
        <div class="pl"><span class="sym">${d.sym}</span><span class="nm" title="${d.nm}">${d.nm}</span></div>
        <div class="num"><input type="number" id="n-${d.k}" step="${st}" aria-label="${d.nm}"></div>
        <input type="range" id="r-${d.k}" min="${mn}" max="${mx}" step="${st}" aria-label="${d.nm} slider">
        <div class="unit">${d.u(U())}</div>
        ${d.help ? `<p class="help">${d.help}</p>` : ''}`;
      det.appendChild(row);
      const num = row.querySelector('input[type=number]'), rng = row.querySelector('input[type=range]');
      const set = (v) => { const x = parseFloat(v); if (!isFinite(x)) return; state.params[d.k] = x; syncInput(d.k); recompute(); };
      num.addEventListener('change', () => set(num.value));
      rng.addEventListener('input', () => { num.value = rng.value; state.params[d.k] = parseFloat(rng.value); scheduleRecompute(); });
    }
    host.appendChild(det);
  }
  syncInputs();
  applyModeVisibility();
}
function syncInput(k) {
  const v = state.params[k];
  const n = $(`n-${k}`), r = $(`r-${k}`);
  if (n && document.activeElement !== n) n.value = +(+v).toPrecision(6);
  if (r) r.value = v;
}
function syncInputs() { for (const d of P) syncInput(d.k); }
function applyModeVisibility() {
  document.querySelectorAll('details.group').forEach((d) => {
    const m = d.dataset.modes; d.hidden = !!m && !m.split(',').includes(state.mode);
  });
}

function buildPresets() {
  $('reset').addEventListener('click', () => loadPreset('coreA'));
}
function loadPreset(key) {
  state.preset = key;
  state.params = { ...PRESETS[key] };
  buildInputs();
  recompute();
}

// ---------- derived panel & KPIs ----------
function renderDerived() {
  const u = U(), p = sol.p;
  const M = (p.krwMax / p.muW) / (p.kroMax / p.muO);
  const rows = [
    ['Pore volume PV', `${fs(sol.PV)} ${u.volume}`],
    ['Interstitial velocity u', `${fs(sol.u)} ${u.speed}`],
    ['Time per PV (PV/qt)', `${fs(sol.tScale)} ${u.time}`],
    ['Original oil in place', `${fs(sol.OOIP)} ${u.volume}`],
    ['Movable oil', `${fs(sol.PV * (1 - sol.Siw - p.Sor))} ${u.volume}`],
    ['End-point mobility ratio M', fs(M, 3)],
  ];
  if (state.mode === 'polymer') rows.push(['M with polymer', fs((p.krwMax / sol.muI) / (p.kroMax / p.muO), 3)]);
  $('derived').innerHTML = `<div class="h">Derived from inputs</div>` + rows.map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('');
}

function renderKpis() {
  const u = U(), o = snap;
  const k = [];
  k.push({ t: 'Breakthrough', v: `${fs(sol.tBT)} ${u.time}`, s: `tD = ${fx(sol.tDBT, 4)} PV`, hl: true });
  k.push({ t: 'Recovery at breakthrough', v: `${fx(sol.RFBT * 100, 2)} %`, s: `Np = ${fs(sol.NpBT)} ${u.volume}` });
  if (state.mode === 'tracer') k.push({ t: 'Tracer arrives', v: `${fs(sol.p.L / (sol.u * sol.mI))} ${u.time}`, s: `tD = ${fx(1 / sol.mI, 4)}` });
  if (state.mode === 'polymer') k.push({ t: 'Polymer arrives', v: `${fs(sol.p.L / (sol.u * sol.mI))} ${u.time}`, s: sol.hasBank ? `bank So = ${fx(1 - sol.SR, 3)}` : 'no oil bank' });
  k.push({ t: 'Oil produced now', v: `${fs(o.Np)} ${u.volume}`, s: `RF = ${fx(o.RF * 100, 2)} %` });
  k.push({ t: 'Water cut now', v: fx(o.fout, 4), s: `WOR = ${isFinite(o.WORres) ? fs(o.WORres, 3) : '∞'}` });
  k.push({ t: 'Average Sw', v: fx(o.Savg, 4), s: `outlet Sw = ${fx(o.Sout, 4)}` });
  k.push({ t: 'Pressure drop', v: `${fs(o.dP, 3)} kPa`, s: `${fs(o.dP * 0.145038, 3)} psi` });
  $('kpis').innerHTML = k.map((q) => `<div class="kpi${q.hl ? ' hl' : ''}"><div class="t">${q.t}</div><div class="v">${q.v}</div><div class="s">${q.s}</div></div>`).join('');
}

// ---------- timeline ----------
function tDFromSlider() { return (+$('time').value / 1000) * sol.p.tDend; }
function setTD(tD, fromSlider = false) {
  state.tD = Math.max(0, Math.min(sol.p.tDend, tD));
  if (!fromSlider) $('time').value = Math.round(state.tD / sol.p.tDend * 1000);
  onTimeChange();
}
function renderTicks() {
  const host = $('time-ticks');
  const ticks = [];
  for (const f of sol.features) {
    const ta = 1 / f.v;
    if (ta <= sol.p.tDend) ticks.push({ pos: ta / sol.p.tDend, label: f.id, id: f.id });
  }
  host.innerHTML = ticks.map((t) => `<span class="tk" style="left:${(t.pos * 100).toFixed(2)}%;color:var(${{ F: '--front', B: '--tracer', I: '--polymer', E: '--bank' }[t.id]})">${t.label}</span>`).join('');
  const jumps = [['t = 0', 0]];
  const names = { F: 'Water breakthrough (F)', B: 'Tracer arrives (B)', I: 'Polymer arrives (I)', E: 'Oil bank reaches outlet (E)' };
  for (const f of [...sol.features].sort((a, b) => b.v - a.v)) {
    const ta = 1 / f.v;
    if (ta <= sol.p.tDend) jumps.push([names[f.id], ta]);
  }
  jumps.push(['End', sol.p.tDend]);
  $('jumps').innerHTML = jumps.map(([n, t], i) => `<button type="button" class="ghost small" data-t="${t}" id="jump-${i}">${n}</button>`).join('');
  $('jumps').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { stop(); setTD(+b.dataset.t); }));
}
function renderTimeReadout() {
  const u = U();
  const t = state.tD * sol.tScale;
  $('time-readout').innerHTML = `<b>t = ${fs(t)} ${u.time}</b><br><span>tD = ${fx(state.tD, 3)} PV · Vinj = ${fs(state.tD * sol.PV)} ${u.volume}</span>`;
  const after = state.tD > sol.tDBT;
  const chip = $('phase-chip');
  chip.textContent = after ? 'After water breakthrough' : 'Before breakthrough · oil only';
  chip.classList.toggle('after', after);
}

// ---------- Sw explorer ----------
function SwValue() { return sol.Siw + state.swFrac * (sol.Smax - sol.Siw); }
function renderSw() {
  const u = U(), i = swInfo;
  const chips = [
    ['Sw', fx(i.Sw, 4)], ['Se', fx(i.curve.se(i.Sw), 3)], ['krw', fx(i.krw, 4)], ['kro', fx(i.kro, 4)],
    ['fw', fx(i.fw, 4)], ['f′w', fx(i.dfw, 4)],
  ];
  if (i.present && i.v !== null) chips.push(['vs', `${fs(i.v)} ${u.speed}`]);
  if (i.present) chips.push(['x(t)', i.xD !== null ? `${fs(i.xD * sol.p.L)} ${u.length}` : (state.tD === 0 ? 'at inlet' : 'past outlet')]);
  if (i.present && i.arrivalTD) chips.push(['reaches outlet', `${fs(i.arrivalTD * sol.tScale)} ${u.time}`]);
  $('sw-readout').innerHTML = chips.map(([k, v]) => `<span class="chip"><i>${k}</i> ${v}</span>`).join('');
  const nt = $('sw-note');
  nt.textContent = i.note + (state.mode === 'polymer' && i.curve === sol.inj ? ' (polymer fw curve)' : '');
  nt.classList.toggle('skip', !i.present);
}

// ---------- 3D legend ----------
function renderLegend() {
  const m = state.mode;
  const inj = m === 'tracer' ? ['--tracer', 'Injected water (tracer)'] : m === 'polymer' ? ['--polymer', 'Polymer solution'] : null;
  $('legend3d').innerHTML = `
    <div class="row"><span class="sw" style="background:var(--oil)"></span>Oil zone at Siw</div>
    <div><div class="bar" style="background:linear-gradient(90deg,var(--water-light),var(--water))"></div>
    <div class="scale"><span>Sw ${fx(sol.Siw, 2)}</span><span>${fx(sol.Smax, 2)}</span></div></div>
    ${inj ? `<div class="row"><span class="sw" style="background:var(${inj[0]})"></span>${inj[1]}</div>` : ''}
    ${state.fractions ? '<div class="row" style="color:var(--muted)">Front face: water height = Sw · top: Sw map</div>' : ''}`;
}

// ---------- compute + render ----------
let plots, core;
function ctx() {
  return { sol, hist, snap, tD: state.tD, U: sol.U, mode: state.mode, swInfo, baseline: state.baseline, showRaw: state.showRaw };
}
function render3D() {
  if (!core) return;
  const u = U();
  core.update({
    snap, sol, mode: state.mode, swInfo,
    maxVol: sol.p.tDend * sol.PV,
    fmtLen: (v) => `${fs(v, 3)} ${u.length}`, fmtVol: (v) => `${fs(v, 3)} ${u.volume}`,
  });
}
function recompute() {
  state.params = normalize(state.params);
  sol = solve(state.params, state.mode);
  hist = history(sol, sol.p.tDend, 360);
  if (state.tD > sol.p.tDend) state.tD = sol.p.tDend;
  $('time').value = Math.round(state.tD / sol.p.tDend * 1000);
  snap = snapshot(sol, state.tD, 500);
  swInfo = exploreSw(sol, SwValue(), state.tD);
  renderDerived(); renderTicks(); renderTimeReadout(); renderKpis(); renderSw(); renderLegend();
  plots.setContext(ctx()); plots.full();
  render3D();
  if (state.tab === 'calc') $('calc').innerHTML = renderCalc(sol, state.tD);
}
let rcPending = false;
function scheduleRecompute() {
  if (rcPending) return;
  rcPending = true;
  requestAnimationFrame(() => { rcPending = false; recompute(); syncInputs(); });
}

let lastPlot = 0, plotPending = false;
function onTimeChange() {
  snap = snapshot(sol, state.tD, 500);
  swInfo = exploreSw(sol, SwValue(), state.tD);
  renderTimeReadout(); renderKpis(); renderSw();
  render3D();
  // throttle plot updates during playback / dragging
  const now = performance.now();
  const doPlots = () => { plotPending = false; lastPlot = performance.now(); plots.setContext(ctx()); plots.time(); if (state.tab === 'calc') $('calc').innerHTML = renderCalc(sol, state.tD); };
  if (now - lastPlot > 60) doPlots();
  else if (!plotPending) { plotPending = true; setTimeout(doPlots, 60); }
}
function onSwChange() {
  swInfo = exploreSw(sol, SwValue(), state.tD);
  renderSw(); render3D();
  plots.setContext(ctx()); plots.sw();
}

// ---------- playback ----------
let lastFrame = 0;
function play() {
  if (state.tD >= sol.p.tDend - 1e-9) state.tD = 0;
  state.playing = true; $('play-icon').setAttribute('d', 'M7 5h4v14H7zM13 5h4v14h-4z'); $('play').setAttribute('aria-label', 'Pause');
  lastFrame = performance.now();
  requestAnimationFrame(tick);
}
function stop() { state.playing = false; $('play-icon').setAttribute('d', 'M7 5l12 7-12 7z'); $('play').setAttribute('aria-label', 'Play'); }
function tick(now) {
  if (!state.playing) return;
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  const runSeconds = 14; // full timeline at 1×
  let tD = state.tD + dt * state.speed * sol.p.tDend / runSeconds;
  if (tD >= sol.p.tDend) { tD = sol.p.tDend; stop(); }
  setTD(tD);
  if (state.playing) requestAnimationFrame(tick);
}

// ---------- wiring ----------
async function init() {
  buildPresets();
  buildInputs();
  plots = createPlots({ profile: 'p-profile', fw: 'p-fw', kr: 'p-kr', dfw: 'p-dfw', xt: 'p-xt', outlet: 'p-outlet', prod: 'p-prod', rf: 'p-rf', dp: 'p-dp' });

  document.querySelectorAll('.mode-btn').forEach((b) => b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    applyModeVisibility();
    recompute();
  }));
  $('time').addEventListener('input', () => { stop(); setTD(tDFromSlider(), true); });
  $('sw').addEventListener('input', () => { state.swFrac = +$('sw').value / 1000; onSwChange(); });
  $('play').addEventListener('click', () => (state.playing ? stop() : play()));
  $('speed').addEventListener('change', () => { state.speed = +$('speed').value; });
  $('opt-raw').addEventListener('change', () => { state.showRaw = $('opt-raw').checked; plots.setContext(ctx()); plots.time(); });
  const opt3d = () => { state.fractions = $('opt-fractions').checked; core && core.setOptions(state); renderLegend(); };
  $('opt-fractions').addEventListener('change', opt3d);
  // light / dark / auto theme toggle (remembered per browser when storage is available)
  const applyThemeChoice = (choice) => {
    const root = document.documentElement;
    if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice);
    else root.removeAttribute('data-theme');
    document.querySelectorAll('.theme-btn').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeSet === choice)));
    try { localStorage.setItem('bl-theme', choice); } catch (e) { /* storage unavailable */ }
  };
  document.querySelectorAll('.theme-btn').forEach((b) => b.addEventListener('click', () => applyThemeChoice(b.dataset.themeSet)));
  let savedTheme = 'auto';
  try { savedTheme = localStorage.getItem('bl-theme') || 'auto'; } catch (e) { /* ignore */ }
  applyThemeChoice(savedTheme);
  $('pin').addEventListener('click', () => {
    if (state.baseline) { state.baseline = null; $('pin').textContent = 'Pin as baseline'; $('pin').classList.remove('active'); }
    else {
      const p = sol.p;
      const label = `${state.mode}, μo ${fs(p.muO, 3)}, μw ${fs(p.muW, 3)}${state.mode === 'polymer' ? `, μp ${fs(p.muP, 3)}` : ''}, Siw ${fx(p.Siw, 2)}`;
      state.baseline = { sol, hist, label };
      $('pin').textContent = 'Clear baseline'; $('pin').classList.add('active');
    }
    plots.setContext(ctx()); plots.full();
  });
  document.querySelectorAll('[role=tab]').forEach((t) => t.addEventListener('click', () => {
    state.tab = t.dataset.tab;
    document.querySelectorAll('[role=tab]').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
    $('panel-plots').hidden = state.tab !== 'plots';
    $('panel-calc').hidden = state.tab !== 'calc';
    $('panel-theory').hidden = state.tab !== 'theory';
    if (state.tab === 'calc') $('calc').innerHTML = renderCalc(sol, state.tD);
    if (state.tab === 'plots') window.dispatchEvent(new Event('resize'));
  }));
  $('inputs-toggle').addEventListener('click', () => {
    const body = $('inputs-body'); const open = body.hidden;
    body.hidden = !open;
    $('inputs-toggle').textContent = open ? 'Hide' : 'Show';
    $('inputs-toggle').setAttribute('aria-expanded', String(open));
    document.querySelector('.layout').classList.toggle('inputs-collapsed', !open);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  });
  $('theory').innerHTML = renderTheory();

  $('sw').value = Math.round(state.swFrac * 1000);
  recompute();

  // 3D (loaded separately so the plots still work if WebGL is unavailable)
  try {
    const { createCore3D } = await import('./core3d.js');
    core = createCore3D($('viewport'));
    core.setOptions(state);
    render3D();
    $('zoom-in').addEventListener('click', () => core.zoom(0.8));
    $('zoom-out').addEventListener('click', () => core.zoom(1.25));
    $('zoom-reset').addEventListener('click', () => core.resetView());
  } catch (e) {
    console.error(e);
    $('viewport').insertAdjacentHTML('beforeend', '<p style="padding:60px 16px;text-align:center;color:var(--muted)">The 3D view needs WebGL, which this browser could not start. All plots still work.</p>');
  }

  const rethemeAll = () => { plots.retheme(); core && core.applyTheme(); render3D(); };
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rethemeAll);
  new MutationObserver(rethemeAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

init();
