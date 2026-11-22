// All 2D plots (Plotly). Full redraw on parameter change; light updates on time / Sw change.
/* global Plotly */

const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export function theme() {
  return {
    bg: css('--surface'), fg: css('--fg'), muted: css('--muted'), grid: css('--grid'), line: css('--line'),
    water: css('--water'), waterLight: css('--water-light'), oil: css('--oil'), tracer: css('--tracer'),
    poly: css('--polymer'), front: css('--front'), bank: css('--bank'),
  };
}
const alpha = (hex, a) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const CONFIG = { displaylogo: false, responsive: true, displayModeBar: 'hover', modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d', 'toggleSpikelines'] };

function layout(T, xTitle, yTitle, extra = {}) {
  return {
    paper_bgcolor: T.bg, plot_bgcolor: T.bg,
    font: { family: 'IBM Plex Sans, system-ui, sans-serif', size: 12, color: T.fg },
    margin: { l: 56, r: 14, t: 10, b: 44 },
    xaxis: { title: { text: xTitle, font: { size: 12, color: T.muted } }, gridcolor: T.grid, zeroline: false, linecolor: T.line, tickfont: { color: T.muted }, ...extra.xaxis },
    yaxis: { title: { text: yTitle, font: { size: 12, color: T.muted } }, gridcolor: T.grid, zeroline: false, linecolor: T.line, tickfont: { color: T.muted }, ...extra.yaxis },
    legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', font: { size: 11 }, bgcolor: 'rgba(0,0,0,0)', ...extra.legend },
    hovermode: extra.hovermode || 'closest',
    hoverlabel: { font: { family: 'IBM Plex Mono, monospace', size: 11 } },
    showlegend: extra.showlegend !== false,
    shapes: extra.shapes || [], annotations: extra.annotations || [],
  };
}
const vline = (x, color, dash = 'dot', width = 1.5) => ({ type: 'line', xref: 'x', yref: 'paper', x0: x, x1: x, y0: 0, y1: 1, line: { color, width, dash } });
const hline = (y, color, dash = 'dot', width = 1.5) => ({ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: y, y1: y, line: { color, width, dash } });
const note = (x, y, text, color, opts = {}) => ({ x, y, text, showarrow: false, font: { size: 11, color }, xanchor: 'left', yanchor: 'bottom', ...opts });

function linspace(a, b, n) { const r = []; for (let i = 0; i < n; i++) r.push(a + (b - a) * i / (n - 1)); return r; }

/** Exact profile points with crisp jumps at the features. */
export function profilePoints(sol, tD, n = 500) {
  const xs = new Set(linspace(0, 1, n));
  if (tD > 0) for (const f of sol.features) {
    const x = f.v * tD;
    if (x > 0 && x < 1) { xs.add(x * (1 - 1e-9)); xs.add(Math.min(1, x * (1 + 1e-9))); }
  }
  const arr = [...xs].sort((a, b) => a - b);
  return arr.map((xD) => ({ xD, st: tD > 0 ? sol.stateAt(xD / tD) : { S: sol.Siw, c: 0, region: 'init' } }));
}

export function createPlots(ids) {
  const el = Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, document.getElementById(v)]));
  let T = theme();
  let ctx = null;

  // ---------- helpers that depend on ctx ----------
  const tOf = (tD) => tD * ctx.sol.tScale;
  const xOf = (xD) => xD * ctx.sol.p.L;

  function cursorShapes() {
    const t = tOf(ctx.tD);
    return [vline(t, T.fg, 'solid', 1.2)];
  }
  function arrivalShapes() {
    const s = [];
    const tEnd = ctx.sol.p.tDend;
    for (const f of ctx.sol.features) {
      const ta = 1 / f.v;
      if (ta <= tEnd) s.push(vline(ta * ctx.sol.tScale, colorOf(f.id), 'dot', 1.2));
    }
    return s;
  }
  function arrivalNotes() {
    const a = [];
    const tEnd = ctx.sol.p.tDend;
    for (const f of ctx.sol.features) {
      const ta = 1 / f.v;
      if (ta <= tEnd) a.push({ x: ta * ctx.sol.tScale, y: 1, yref: 'paper', text: f.id, showarrow: false, font: { size: 11, color: colorOf(f.id) }, xanchor: 'left', yanchor: 'top', xshift: 3 });
    }
    return a;
  }
  const colorOf = (id) => ({ F: T.front, B: T.tracer, I: T.poly, E: T.bank }[id] || T.fg);
  // baseline is compared at the same physical time when units match, otherwise at the same tD
  const sameUnits = () => ctx.baseline && ctx.baseline.sol.U.key === ctx.sol.U.key;
  const baseTD = (tD) => (sameUnits() ? tD * ctx.sol.tScale / ctx.baseline.sol.tScale : tD);
  const baseT = (o) => (sameUnits() ? o.t : o.tD * ctx.sol.tScale);
  const injColor = () => (ctx.mode === 'polymer' ? T.poly : T.tracer);

  // ---------- profile ----------
  function figProfile() {
    const { sol, tD, U, mode } = ctx;
    const pts = profilePoints(sol, tD);
    const x = pts.map((p) => xOf(p.xD)), S = pts.map((p) => p.st.S);
    const data = [
      { x, y: S, name: 'Water Sw', mode: 'lines', line: { color: T.water, width: 2.5 }, fill: 'tozeroy', fillcolor: alpha(T.water, 0.16),
        hovertemplate: `x = %{x:.2f} ${U.length}<br>Sw = %{y:.4f}<extra></extra>` },
      { x, y: x.map(() => 1), name: 'Oil So = 1 − Sw', mode: 'lines', line: { color: alpha(T.oil, 0), width: 0 }, fill: 'tonexty', fillcolor: alpha(T.oil, 0.22), hoverinfo: 'skip' },
    ];
    if (mode !== 'water') {
      const c = mode === 'tracer' ? ctx.snap.xs.map((_, i) => ctx.snap.c[i]) : pts.map((p) => p.st.c);
      const cx = mode === 'tracer' ? ctx.snap.xs.map(xOf) : x;
      data.push({ x: cx, y: c, name: mode === 'tracer' ? 'Tracer c / c₀ (injected-water fraction)' : 'Polymer c / c_inj', mode: 'lines',
        line: { color: injColor(), width: 2, dash: 'dash' }, hovertemplate: `x = %{x:.2f} ${U.length}<br>c = %{y:.3f}<extra></extra>` });
    }
    if (ctx.showRaw && mode !== 'polymer' && tD > 0) {
      const Ss = linspace(sol.Siw, sol.Smax, 300);
      data.push({ x: Ss.map((s) => xOf(tD * sol.res.df(s))), y: Ss, name: 'Raw x = u t f′w(Sw) (multivalued)', mode: 'lines',
        line: { color: T.muted, width: 1.5, dash: 'dot' }, hovertemplate: `x = %{x:.2f}<br>Sw = %{y:.4f}<extra>raw</extra>` });
    }
    if (ctx.baseline) {
      const bp = profilePoints(ctx.baseline.sol, baseTD(tD), 300);
      data.push({ x: bp.map((p) => p.xD * ctx.baseline.sol.p.L), y: bp.map((p) => p.st.S), name: `Baseline: ${ctx.baseline.label}`, mode: 'lines',
        line: { color: T.muted, width: 1.5, dash: 'dash' }, hoverinfo: 'skip' });
    }
    const shapes = [], ann = [];
    for (const f of sol.features) {
      const xd = f.v * tD;
      if (tD > 0 && xd > 0.002 && xd < 0.999) {
        shapes.push(vline(xOf(xd), colorOf(f.id), 'dot', 1.2));
        ann.push({ x: xOf(xd), y: 1, yref: 'paper', text: f.id, showarrow: false, font: { size: 12, color: colorOf(f.id) }, xanchor: 'left', yanchor: 'top', xshift: 3 });
      }
    }
    const sw = ctx.swInfo;
    if (sw) {
      shapes.push({ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: sw.Sw, y1: sw.Sw, line: { color: T.muted, width: 1, dash: 'dash' } });
      if (sw.xD !== null) data.push({ x: [xOf(sw.xD)], y: [sw.Sw], mode: 'markers', name: 'Sw explorer', showlegend: false,
        marker: { size: 11, color: T.fg, line: { color: T.bg, width: 2 } }, hovertemplate: `Sw = %{y:.4f} at x = %{x:.2f} ${U.length}<extra></extra>` });
    }
    return { data, layout: layout(T, `Position x (${U.length})`, 'Pore-volume fraction', {
      xaxis: { range: [0, sol.p.L] }, yaxis: { range: [0, 1.0] }, shapes, annotations: ann, hovermode: 'x unified' }) };
  }

  // ---------- fractional flow ----------
  function figFw() {
    const { sol, mode, tD } = ctx;
    const x0 = mode === 'water' ? Math.max(0, sol.Siw - 0.04) : Math.max(0, Math.min(sol.Sa, 0) - 0.02);
    const Ss = linspace(sol.Siw, sol.Smax, 240);
    const data = [{ x: Ss, y: Ss.map(sol.res.f), name: mode === 'polymer' ? `Resident water (μw = ${sol.p.muW} cP)` : 'fw(Sw)', mode: 'lines', line: { color: T.water, width: 2.5 },
      hovertemplate: 'Sw = %{x:.4f}<br>fw = %{y:.4f}<extra></extra>' }];
    if (mode === 'polymer') data.push({ x: Ss, y: Ss.map(sol.inj.f), name: `Polymer solution (μ = ${sol.muI.toFixed(2)} cP)`, mode: 'lines', line: { color: T.poly, width: 2.5 },
      hovertemplate: 'Sw = %{x:.4f}<br>fw,I = %{y:.4f}<extra></extra>' });
    if (ctx.baseline) {
      const b = ctx.baseline.sol;
      const Sb = linspace(b.Siw, b.Smax, 160);
      data.push({ x: Sb, y: Sb.map(b.res.f), name: `Baseline: ${ctx.baseline.label}`, mode: 'lines', line: { color: T.muted, width: 1.5, dash: 'dash' }, hoverinfo: 'skip' });
    }
    // Welge tangent from (Siw, 0) to fw = 1
    const Sbt = sol.Siw + 1 / sol.vF;
    data.push({ x: [sol.Siw, Math.min(Sbt, 1)], y: [0, Math.min(1, sol.vF * (Math.min(Sbt, 1) - sol.Siw))], name: `Front tangent, slope ${sol.vF.toFixed(4)}`, mode: 'lines',
      line: { color: T.front, width: 1.5, dash: 'dash' }, hoverinfo: 'skip' });
    data.push({ x: [sol.SF, Sbt], y: [sol.fF, 1], mode: 'markers+text', text: ['F', 'S̄w,BT'], textposition: ['top left', 'middle right'], showlegend: false,
      marker: { size: 9, color: T.front }, textfont: { color: T.front, size: 11 }, hovertemplate: 'Sw = %{x:.4f}<br>fw = %{y:.4f}<extra></extra>' });
    if (mode !== 'water') {
      const Sa = sol.Sa, end = Sa + 1 / sol.mI;
      data.push({ x: [Sa, Math.min(end, 1)], y: [0, Math.min(1, sol.mI * (Math.min(end, 1) - Sa))], name: mode === 'tracer' ? `Origin tangent, slope ${sol.mI.toFixed(4)}` : `Common line from (${Sa.toFixed(2)}, 0), slope ${sol.mI.toFixed(4)}`,
        mode: 'lines', line: { color: injColor(), width: 1.5, dash: 'dash' }, hoverinfo: 'skip' });
      const pts = mode === 'tracer' ? [[sol.SI, sol.fI, 'B']] : (sol.hasBank ? [[sol.SI, sol.fI, 'I'], [sol.SR, sol.fR, 'R']] : [[sol.SI, sol.fI, 'I']]);
      data.push({ x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), text: pts.map((p) => p[2]), mode: 'markers+text', textposition: 'top left', showlegend: false,
        marker: { size: 9, color: injColor() }, textfont: { color: injColor(), size: 11 }, hovertemplate: 'Sw = %{x:.4f}<br>fw = %{y:.4f}<extra></extra>' });
    }
    // outlet state
    if (tD > 1 / sol.vF) {
      const o = ctx.snap;
      data.push({ x: [o.Sout], y: [o.fout], mode: 'markers', name: 'Outlet now', marker: { size: 10, symbol: 'square', color: T.fg }, hovertemplate: 'outlet Sw = %{x:.4f}<br>fw,out = %{y:.4f}<extra></extra>' });
    }
    const sw = ctx.swInfo;
    if (sw) {
      const d = 0.06;
      data.push({ x: [sw.Sw - d, sw.Sw + d], y: [sw.fw - d * sw.dfw, sw.fw + d * sw.dfw], mode: 'lines', showlegend: false, line: { color: T.fg, width: 1.2, dash: 'dot' }, hoverinfo: 'skip' });
      data.push({ x: [sw.Sw], y: [sw.fw], mode: 'markers', name: 'Sw explorer', showlegend: false, marker: { size: 11, color: T.fg, line: { color: T.bg, width: 2 } },
        hovertemplate: `Sw = %{x:.4f}<br>fw = %{y:.4f}<br>f′w = ${sw.dfw.toFixed(4)}<extra></extra>` });
    }
    return { data, layout: layout(T, 'Water saturation Sw', 'Water fractional flow fw', { xaxis: { range: [x0, sol.Smax + 0.03] }, yaxis: { range: [0, 1.05] },
      legend: { orientation: 'v', x: 1, y: 0.02, xanchor: 'right', yanchor: 'bottom', bgcolor: alpha(T.bg, 0.85), bordercolor: T.line, borderwidth: 1 } }) };
  }

  // ---------- relative permeability ----------
  function figKr() {
    const { sol } = ctx;
    const Ss = linspace(sol.Siw, sol.Smax, 200);
    const data = [
      { x: Ss, y: Ss.map(sol.res.krw), name: 'krw (water)', mode: 'lines', line: { color: T.water, width: 2.5 }, hovertemplate: 'Sw = %{x:.4f}<br>krw = %{y:.4f}<extra></extra>' },
      { x: Ss, y: Ss.map(sol.res.kro), name: 'kro (oil)', mode: 'lines', line: { color: T.oil, width: 2.5 }, hovertemplate: 'Sw = %{x:.4f}<br>kro = %{y:.4f}<extra></extra>' },
    ];
    const sw = ctx.swInfo;
    if (sw) data.push({ x: [sw.Sw, sw.Sw], y: [sw.krw, sw.kro], mode: 'markers', showlegend: false, marker: { size: 10, color: [T.water, T.oil], line: { color: T.bg, width: 2 } },
      hovertemplate: 'Sw = %{x:.4f}<br>kr = %{y:.4f}<extra></extra>' });
    const shapes = sw ? [vline(sw.Sw, T.muted, 'dash', 1)] : [];
    return { data, layout: layout(T, 'Water saturation Sw', 'Relative permeability kr', { xaxis: { range: [sol.Siw - 0.02, sol.Smax + 0.02] }, yaxis: { rangemode: 'tozero' }, shapes }) };
  }

  // ---------- slope ----------
  function figDfw() {
    const { sol, mode, tD } = ctx;
    const Ss = linspace(sol.Siw, sol.Smax, 240);
    const fr = Ss.map(sol.res.df);
    const data = [{ x: Ss, y: fr, name: mode === 'polymer' ? 'f′w resident' : 'f′w(Sw)', mode: 'lines', line: { color: T.water, width: 2.5 }, hovertemplate: 'Sw = %{x:.4f}<br>f′w = %{y:.4f}<extra></extra>' }];
    let ymax = Math.max(...fr);
    if (mode === 'polymer') {
      const fi = Ss.map(sol.inj.df); ymax = Math.max(ymax, ...fi);
      data.push({ x: Ss, y: fi, name: 'f′w polymer', mode: 'lines', line: { color: T.poly, width: 2.5 }, hovertemplate: 'Sw = %{x:.4f}<br>f′w,I = %{y:.4f}<extra></extra>' });
    }
    const shapes = [hline(sol.vF, T.front, 'dash', 1.2)];
    const ann = [{ x: 1, xref: 'paper', y: sol.vF, text: `front ${sol.vF.toFixed(3)}`, showarrow: false, xanchor: 'right', yanchor: 'bottom', font: { size: 11, color: T.front } }];
    if (tD > 1 / sol.vF) {
      shapes.push(hline(1 / tD, T.fg, 'dot', 1.2));
      ann.push({ x: 1, xref: 'paper', y: 1 / tD, text: `outlet: 1/tD = ${(1 / tD).toFixed(3)}`, showarrow: false, xanchor: 'right', yanchor: 'bottom', font: { size: 11, color: T.fg } });
    }
    const sw = ctx.swInfo;
    if (sw) data.push({ x: [sw.Sw], y: [sw.dfw], mode: 'markers', showlegend: false, marker: { size: 11, color: T.fg, line: { color: T.bg, width: 2 } }, hovertemplate: 'Sw = %{x:.4f}<br>f′w = %{y:.4f}<extra></extra>' });
    return { data, layout: layout(T, 'Water saturation Sw', 'dfw/dSw', { xaxis: { range: [sol.Siw - 0.02, sol.Smax + 0.02] }, yaxis: { range: [0, ymax * 1.08] }, shapes, annotations: ann }) };
  }

  // ---------- distance–time ----------
  function figXt() {
    const { sol, U, mode } = ctx;
    const tEnd = sol.p.tDend, L = sol.p.L;
    const data = [];
    const path = (v, name, color, width, dash, legend = true) => {
      const tHit = Math.min(tEnd, v > 0 ? 1 / v : tEnd);
      data.push({ x: [0, xOf(Math.min(1, v * tHit))], y: [0, tOf(tHit)], name, mode: 'lines', line: { color, width, dash }, showlegend: legend,
        hovertemplate: `${name}<br>x = %{x:.2f} ${U.length}<br>t = %{y:.2f} ${U.time}<extra></extra>` });
    };
    // characteristic fans
    const fan = (curve, a, b, color, label) => {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const S = a + (b - a) * (i + 0.5) / n;
        path(curve.df(S), `${label} Sw = ${S.toFixed(3)}`, color, 1, 'solid', false);
      }
    };
    if (mode === 'polymer') {
      fan(sol.inj, sol.SI, sol.Smax, alpha(T.poly, 0.55), 'polymer');
      if (sol.SR > sol.Swf) fan(sol.res, sol.Swf, sol.SR, alpha(T.water, 0.55), 'resident');
    } else fan(sol.res, sol.Swf, sol.Smax, alpha(T.water, 0.55), '');
    data.push({ x: [null], y: [null], name: 'Constant-Sw paths', mode: 'lines', line: { color: alpha(T.water, 0.55), width: 1 } });
    for (const f of sol.features) path(f.v, `${f.id}: ${f.name}`, colorOf(f.id), 2.5, f.id === 'F' ? 'solid' : 'dash');
    const shapes = [hline(tOf(ctx.tD), T.fg, 'solid', 1.2)];
    if (1 / sol.vF <= tEnd) shapes.push(hline(tOf(1 / sol.vF), T.front, 'dot', 1));
    return { data, layout: layout(T, `Position x (${U.length})`, `Time t (${U.time})`, { xaxis: { range: [0, L] }, yaxis: { range: [0, tOf(tEnd)] }, shapes,
      annotations: [{ x: 0, xref: 'paper', y: tOf(ctx.tD), text: 'now', showarrow: false, xanchor: 'left', yanchor: 'bottom', font: { size: 11, color: T.fg } }] }) };
  }

  // ---------- histories ----------
  function histFig(traces, yTitle, yopts = {}) {
    const { U } = ctx;
    return { data: traces, layout: layout(T, `Time t (${U.time})`, yTitle, {
      xaxis: { range: [0, tOf(ctx.sol.p.tDend)] }, yaxis: yopts, hovermode: 'x unified',
      shapes: [...arrivalShapes(), ...cursorShapes()], annotations: arrivalNotes() }) };
  }
  function figOutlet() {
    const h = ctx.hist, t = h.map((o) => o.t);
    const tr = [
      { x: t, y: h.map((o) => o.Sout), name: 'Outlet Sw,out', mode: 'lines', line: { color: T.water, width: 2.5, shape: 'linear' }, hovertemplate: '%{y:.4f}' },
      { x: t, y: h.map((o) => o.fout), name: 'Water cut fw,out', mode: 'lines', line: { color: T.front, width: 2 }, hovertemplate: '%{y:.4f}' },
    ];
    if (ctx.mode !== 'water') tr.push({ x: t, y: h.map((o) => o.cout), name: ctx.mode === 'tracer' ? 'Tracer c/c₀ in produced water' : 'Polymer c/c_inj', mode: 'lines', line: { color: injColor(), width: 2, dash: 'dash' }, hovertemplate: '%{y:.3f}' });
    return histFig(tr, 'Fraction', { range: [0, 1.05] });
  }
  function figProd() {
    const h = ctx.hist, t = h.map((o) => o.t), U = ctx.U;
    const tr = [
      { x: t, y: h.map((o) => o.Vinj), name: 'Injected qt·t', mode: 'lines', line: { color: T.muted, width: 1.5, dash: 'dash' }, hovertemplate: `%{y:.2f} ${U.volume}` },
      { x: t, y: h.map((o) => o.Np), name: 'Oil produced Np', mode: 'lines', line: { color: T.oil, width: 2.5 }, hovertemplate: `%{y:.2f} ${U.volume}` },
      { x: t, y: h.map((o) => o.Wp), name: 'Water produced Wp', mode: 'lines', line: { color: T.water, width: 2.5 }, hovertemplate: `%{y:.2f} ${U.volume}` },
    ];
    return histFig(tr, `Volume (${U.volume})`, { rangemode: 'tozero' });
  }
  function figRf() {
    const h = ctx.hist, t = h.map((o) => o.t);
    const tr = [{ x: t, y: h.map((o) => o.RF * 100), name: 'Recovery factor', mode: 'lines', line: { color: T.oil, width: 2.5 }, hovertemplate: '%{y:.2f} %' }];
    if (ctx.baseline) {
      const b = ctx.baseline;
      tr.push({ x: b.hist.map(baseT), y: b.hist.map((o) => o.RF * 100), name: `Baseline: ${b.label}`, mode: 'lines', line: { color: T.muted, width: 1.5, dash: 'dash' }, hovertemplate: '%{y:.2f} %' });
    }
    const fig = histFig(tr, 'RF (% of OOIP)', { rangemode: 'tozero' });
    fig.layout.shapes.push(hline(ctx.sol.RFmax * 100, T.muted, 'dash', 1));
    fig.layout.annotations.push({ x: 0, xref: 'paper', y: ctx.sol.RFmax * 100, text: `RFmax ${(ctx.sol.RFmax * 100).toFixed(1)} %`, showarrow: false, xanchor: 'left', yanchor: 'bottom', font: { size: 11, color: T.muted } });
    fig.layout.yaxis.range = [0, ctx.sol.RFmax * 105];
    return fig;
  }
  function figDp() {
    const h = ctx.hist, t = h.map((o) => o.t);
    const tr = [{ x: t, y: h.map((o) => o.dP), name: 'Δp', mode: 'lines', line: { color: ctx.mode === 'polymer' ? T.poly : T.water, width: 2.5 }, showlegend: false,
      customdata: h.map((o) => o.dP * 0.145038), hovertemplate: '%{y:.2f} kPa (%{customdata:.2f} psi)' }];
    if (ctx.baseline) {
      const b = ctx.baseline;
      tr.push({ x: b.hist.map(baseT), y: b.hist.map((o) => o.dP), name: `Baseline: ${b.label}`, mode: 'lines', line: { color: T.muted, width: 1.5, dash: 'dash' }, hovertemplate: '%{y:.2f} kPa' });
    }
    return histFig(tr, 'Δp (kPa)', { rangemode: 'tozero' });
  }

  const builders = { profile: figProfile, fw: figFw, kr: figKr, dfw: figDfw, xt: figXt, outlet: figOutlet, prod: figProd, rf: figRf, dp: figDp };

  function draw(names) {
    for (const n of names) {
      if (!el[n]) continue;
      const f = builders[n]();
      Plotly.react(el[n], f.data, f.layout, CONFIG);
    }
  }
  function moveCursors() {
    const t = tOf(ctx.tD);
    for (const n of ['outlet', 'prod', 'rf', 'dp']) {
      const lay = el[n].layout; if (!lay) continue;
      const shapes = (lay.shapes || []).slice();
      shapes[shapes.length - (n === 'rf' ? 2 : 1)] = vline(t, T.fg, 'solid', 1.2);
      Plotly.relayout(el[n], { shapes });
    }
    const lay = el.xt.layout;
    if (lay) {
      const shapes = lay.shapes.slice(); shapes[0] = hline(t, T.fg, 'solid', 1.2);
      Plotly.relayout(el.xt, { shapes, 'annotations[0].y': t });
    }
  }

  return {
    setContext(c) { ctx = c; },
    full() { T = theme(); draw(Object.keys(builders)); },
    time() { draw(['profile', 'fw', 'dfw']); moveCursors(); },
    sw() { draw(['profile', 'fw', 'kr', 'dfw']); },
    retheme() { T = theme(); draw(Object.keys(builders)); },
  };
}
