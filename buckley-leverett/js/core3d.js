// 3D reservoir block view. The saturation field is streamed into a 1D texture;
// shaders colour the block by Sw (map view on top) and the front face by pore-volume fractions.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const LEN = 10;    // visual length (injector → producer)
const H = 1.5;     // visual thickness
const DEP = 3.2;   // visual width (into the screen); not to scale
const NTEX = 512;

const vert = /* glsl */`
  varying vec3 vPos; varying vec3 vN; varying vec3 vView;
  void main() {
    vPos = position;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

const common = /* glsl */`
  uniform sampler2D uTex; uniform float uSiw; uniform float uSmax; uniform int uMode;
  uniform vec3 uOil; uniform vec3 uWaterLo; uniform vec3 uWaterHi; uniform vec3 uInj;
  uniform float uLen; uniform float uH;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec3 swColor(float s, float c){
    float sn = clamp((s - uSiw) / max(uSmax - uSiw, 1e-4), 0.0, 1.0);
    vec3 col = sn < 0.02 ? uOil : mix(uWaterLo, uWaterHi, pow(sn, 0.8));
    if (uMode > 0) col = mix(col, uInj * (0.75 + 0.45 * sn), 0.72 * c);
    return col;
  }
  vec4 sampleX(float x){ return texture2D(uTex, vec2(clamp(x, 0.0, 1.0), 0.5)); }
  // thin sedimentary bedding so the block reads as rock
  float bedding(float y, float x){ return 0.94 + 0.06 * sin(y * 46.0 + sin(x * 3.0) * 1.5); }`;

// top, back, ends: Sw colour (map view)
const blockFrag = /* glsl */`
  ${common}
  varying vec3 vPos; varying vec3 vN; varying vec3 vView;
  void main(){
    vec4 t = sampleX(vPos.x / uLen + 0.5);
    vec3 col = swColor(t.r, t.g);
    vec3 n = normalize(vN);
    vec3 L = normalize(vec3(0.3, 0.9, 0.5));
    float diff = 0.6 + 0.4 * max(dot(n, L), 0.0);
    float grain = (hash(floor(vPos.xz * 40.0) + floor(vPos.y * 40.0)) - 0.5) * 0.06;
    gl_FragColor = vec4(col * diff * bedding(vPos.y, vPos.x) + grain, 1.0);
  }`;

// front face: vertical cross-section, water height = Sw (like the lecture's bar sketches)
const faceFrag = /* glsl */`
  ${common}
  uniform int uFractions;
  varying vec3 vPos; varying vec3 vN; varying vec3 vView;
  void main(){
    float x = vPos.x / uLen + 0.5;
    float v = vPos.y / uH + 0.5;
    vec4 t = sampleX(x);
    float s = t.r, c = t.g;
    vec3 col;
    if (uFractions == 1) {
      vec3 wcol = mix(uWaterHi, uInj, uMode > 0 ? c : 0.0);
      if (uMode > 0 && c < 0.5) wcol = mix(uWaterLo, uWaterHi, 0.55);
      col = v < s ? wcol : uOil;
      float edge = smoothstep(0.0, 0.008, abs(v - s));
      col = mix(col * 0.75, col, edge);
    } else {
      col = swColor(s, c);
    }
    col *= bedding(vPos.y, vPos.x) * (0.92 + 0.1 * hash(floor(vPos.xy * 36.0)));
    gl_FragColor = vec4(col, 1.0);
  }`;

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function col(name) { return new THREE.Color(css(name) || '#888'); }

export function createCore3D(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  container.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 2, 0.1, 200);
  const camDir = new THREE.Vector3(0.18, 0.42, 1).normalize();
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.4, 0.3, 0);
  controls.enableDamping = true;
  controls.minDistance = 3; controls.maxDistance = 45;
  controls.zoomSpeed = 1.2;
  controls.maxPolarAngle = Math.PI * 0.62;

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const dl = new THREE.DirectionalLight(0xffffff, 1.1); dl.position.set(4, 9, 6); scene.add(dl);

  const data = new Uint8Array(NTEX * 4);
  const tex = new THREE.DataTexture(data, NTEX, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;

  const uniforms = {
    uTex: { value: tex }, uSiw: { value: 0.3 }, uSmax: { value: 0.7 }, uMode: { value: 0 },
    uOil: { value: new THREE.Color() }, uWaterLo: { value: new THREE.Color() }, uWaterHi: { value: new THREE.Color() },
    uInj: { value: new THREE.Color() }, uLen: { value: LEN }, uH: { value: H }, uFractions: { value: 1 },
  };

  const world = new THREE.Group();
  scene.add(world);

  // reservoir block: BoxGeometry material order is +x, −x, +y, −y, +z, −z
  const blockMat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: blockFrag });
  const faceMat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: faceFrag });
  const block = new THREE.Mesh(new THREE.BoxGeometry(LEN, H, DEP), [blockMat, blockMat, blockMat, blockMat, faceMat, blockMat]);
  world.add(block);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(block.geometry), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
  world.add(edges);

  // cap rock above and base rock below (impermeable bounding layers)
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9c958a, roughness: 0.95 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x9c958a, roughness: 0.95, transparent: true, opacity: 0.16, depthWrite: false });
  const base = new THREE.Mesh(new THREE.BoxGeometry(LEN + 1.4, 0.45, DEP + 0.6), rockMat);
  base.position.y = -H / 2 - 0.225; world.add(base);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(LEN + 1.4, 0.55, DEP + 0.6), capMat);
  cap.position.y = H / 2 + 0.275; world.add(cap);

  // wells: vertical strings at each end of the flow path, completed across the reservoir
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a949c, metalness: 0.6, roughness: 0.35 });
  const wellTop = H / 2 + 2.1;
  const wells = {};
  for (const [id, sx] of [['inj', -1], ['prod', 1]]) {
    const g = new THREE.Group();
    g.position.set(sx * (LEN / 2 + 0.22), 0, 0);
    const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, wellTop + H / 2, 24), steel);
    casing.position.y = (wellTop - H / 2) / 2; g.add(casing);
    const perf = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, H * 0.92, 24), new THREE.MeshStandardMaterial({ color: 0x2a78d6, roughness: 0.4 }));
    g.add(perf);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.42), steel);
    head.position.y = wellTop; g.add(head);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 24), new THREE.MeshStandardMaterial({ color: 0x777777 }));
    arrow.position.y = wellTop + 0.6;
    if (sx < 0) arrow.rotation.z = Math.PI; // pointing down into the injector
    g.add(arrow);
    world.add(g);
    wells[id] = { g, perf, arrow };
  }

  function label(text, cls, pos, parent = world) {
    const el = document.createElement('div');
    el.className = 'lbl3d ' + (cls || '');
    el.textContent = text;
    const o = new CSS2DObject(el);
    o.position.copy(pos);
    parent.add(o);
    return o;
  }
  const lblIn = label('Injector', 'end', new THREE.Vector3(-LEN / 2 - 0.22, wellTop + 1.15, 0));
  label('Producer', 'end', new THREE.Vector3(LEN / 2 + 0.22, wellTop + 1.15, 0));

  // distance ruler along the front bottom edge
  const rulerMat = new THREE.LineBasicMaterial({ color: 0x8a949c });
  const ry = -H / 2 - 0.5, rz = DEP / 2 + 0.3;
  world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-LEN / 2, ry, rz), new THREE.Vector3(LEN / 2, ry, rz)]), rulerMat));
  const tickLabels = [];
  for (let i = 0; i <= 4; i++) {
    const x = -LEN / 2 + LEN * i / 4;
    world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, ry, rz), new THREE.Vector3(x, ry - 0.15, rz)]), rulerMat));
    tickLabels.push(label('', i % 2 ? 'tick minor' : 'tick', new THREE.Vector3(x, ry - 0.42, rz)));
  }

  // production tank at surface beside the producer (oil floats on water)
  const glassH = 2.2, glassR = 0.5;
  const prod = new THREE.Group();
  prod.position.set(LEN / 2 + 1.7, H / 2 + 0.55 + glassH / 2 + 0.05, 0.6);
  world.add(prod);
  prod.add(new THREE.Mesh(new THREE.CylinderGeometry(glassR, glassR, glassH, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xbfd4e6, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })));
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(glassR * 1.2, glassR * 1.2, 0.08, 48), steel);
  plate.position.y = -glassH / 2 - 0.04; prod.add(plate);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x2a78d6, roughness: 0.3 });
  const oilMat = new THREE.MeshStandardMaterial({ color: 0xeda100, roughness: 0.3 });
  const wLiq = new THREE.Mesh(new THREE.CylinderGeometry(glassR * 0.94, glassR * 0.94, 1, 48), waterMat);
  const oLiq = new THREE.Mesh(new THREE.CylinderGeometry(glassR * 0.94, glassR * 0.94, 1, 48), oilMat);
  prod.add(wLiq, oLiq);
  const flow = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 12), steel);
  flow.rotation.z = Math.PI / 2; flow.position.set(LEN / 2 + 0.95, wellTop, 0.3); world.add(flow);
  const lblProd = label('', 'tick', new THREE.Vector3(0, -glassH / 2 - 0.25, 0.6), prod);

  // front markers: rectangular frames around the block cross-section
  const frames = {};
  function frame(id) {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const t = 0.05, hh = H + 0.12, dd = DEP + 0.12;
    const bars = [
      [t, t, dd, 0, hh / 2, 0], [t, t, dd, 0, -hh / 2, 0],
      [t, hh, t, 0, 0, dd / 2], [t, hh, t, 0, 0, -dd / 2],
    ];
    for (const [a, b, c, x, y, z] of bars) { const bar = new THREE.Mesh(new THREE.BoxGeometry(a, b, c), m); bar.position.set(x, y, z); g.add(bar); }
    world.add(g);
    const l = label(id, '', new THREE.Vector3(0, H / 2 + 0.75, DEP / 2));
    frames[id] = { g, m, label: l };
  }
  ['F', 'B', 'E', 'I', 'Sw'].forEach(frame);

  world.position.x = -0.7;

  let colors = {};
  function applyTheme() {
    colors = {
      oil: col('--oil'), water: col('--water'), waterLo: col('--water-light'), inj: col('--tracer'),
      poly: col('--polymer'), front: col('--front'), bank: col('--bank'), fg: col('--fg'), rock: col('--rock'),
    };
    uniforms.uOil.value.copy(colors.oil);
    uniforms.uWaterHi.value.copy(colors.water);
    uniforms.uWaterLo.value.copy(colors.waterLo);
    waterMat.color.copy(colors.water); oilMat.color.copy(colors.oil);
    rockMat.color.copy(colors.rock); capMat.color.copy(colors.rock);
    edges.material.color.copy(colors.fg);
    wells.prod.arrow.material.color.copy(colors.fg);
    wells.prod.perf.material.color.copy(colors.fg);
    frames.F.m.color.copy(colors.front);
    frames.B.m.color.copy(colors.inj);
    frames.I.m.color.copy(colors.poly);
    frames.E.m.color.copy(colors.bank);
    frames.Sw.m.color.copy(colors.fg);
  }
  applyTheme();

  function setOptions({ fractions }) { uniforms.uFractions.value = fractions ? 1 : 0; }

  const xToWorld = (xD) => -LEN / 2 + LEN * xD;

  /** state: { snap, sol, mode, swInfo, maxVol, fmtLen, fmtVol } */
  function update(st) {
    const { snap, sol, mode } = st;
    uniforms.uSiw.value = sol.Siw; uniforms.uSmax.value = sol.Smax;
    uniforms.uMode.value = mode === 'water' ? 0 : 1;
    const injCol = mode === 'water' ? colors.water : mode === 'tracer' ? colors.inj : colors.poly;
    uniforms.uInj.value.copy(mode === 'polymer' ? colors.poly : colors.inj);
    wells.inj.arrow.material.color.copy(injCol);
    wells.inj.perf.material.color.copy(injCol);
    const n = snap.xs.length - 1;
    for (let i = 0; i < NTEX; i++) {
      const j = Math.min(n, Math.round(i / (NTEX - 1) * n));
      data[i * 4] = Math.round(snap.S[j] * 255);
      data[i * 4 + 1] = Math.round(snap.c[j] * 255);
      data[i * 4 + 2] = 0; data[i * 4 + 3] = 255;
    }
    tex.needsUpdate = true;

    const show = (id, xD, text, lift = 0) => {
      const f = frames[id];
      const vis = xD !== null && xD !== undefined && xD > 0.001 && xD < 0.999;
      f.g.visible = vis; f.label.visible = vis;
      f.label.element.style.display = vis ? '' : 'none';
      if (vis) {
        f.g.position.x = xToWorld(xD);
        f.label.position.set(xToWorld(xD), H / 2 + 0.75 + lift, DEP / 2);
        f.label.element.textContent = text;
      }
    };
    const t = snap.tD;
    show('F', sol.vF * t, 'F front');
    show('B', mode === 'tracer' ? sol.mI * t : null, 'B tracer');
    show('I', mode === 'polymer' ? sol.mI * t : null, 'I polymer');
    show('E', mode === 'polymer' && sol.hasBank ? sol.zE * t : null, 'E bank', 0.45);
    const sw = st.swInfo;
    show('Sw', sw && sw.xD !== null ? sw.xD : null, `Sw ${sw ? sw.Sw.toFixed(3) : ''}`, 0.9);

    for (let i = 0; i <= 4; i++) tickLabels[i].element.textContent = st.fmtLen(sol.p.L * i / 4);

    const maxVol = Math.max(st.maxVol, 1e-9);
    const hw = Math.max(1e-4, glassH * snap.Wp / maxVol), ho = Math.max(1e-4, glassH * snap.Np / maxVol);
    wLiq.scale.y = hw; wLiq.position.y = -glassH / 2 + hw / 2;
    oLiq.scale.y = ho; oLiq.position.y = -glassH / 2 + hw + ho / 2;
    wLiq.visible = snap.Wp > 1e-9; oLiq.visible = snap.Np > 1e-9;
    lblProd.element.textContent = `oil ${st.fmtVol(snap.Np)}\nwater ${st.fmtVol(snap.Wp)}`;
    lblIn.element.textContent = mode === 'water' ? 'Injector · water' : mode === 'tracer' ? 'Injector · water + tracer' : 'Injector · polymer';
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    labels.setSize(w, h);
    container.classList.toggle('narrow', w < 600);
    camera.aspect = w / Math.max(h, 1);
    if (!userMoved) fitView();
    camera.updateProjectionMatrix();
  }
  const HOME_TARGET = new THREE.Vector3(0.4, 0.3, 0);
  let userMoved = false;
  controls.addEventListener('start', () => { userMoved = true; });
  // fit the whole assembly (≈ 15 units wide) horizontally
  function fitView() {
    const halfW = 8.2;
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const dist = Math.max(15, halfW / Math.tan(hfov / 2) + DEP / 2);
    controls.target.copy(HOME_TARGET);
    camera.position.copy(HOME_TARGET).addScaledVector(camDir, dist);
    controls.maxDistance = Math.max(45, dist * 1.6);
  }
  function zoom(factor) {
    userMoved = true;
    const off = camera.position.clone().sub(controls.target);
    const len = THREE.MathUtils.clamp(off.length() * factor, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(off.setLength(len));
  }
  function resetView() { userMoved = false; fitView(); }
  new ResizeObserver(resize).observe(container);
  resize();

  let running = true;
  (function loop() {
    if (!running) return;
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
    requestAnimationFrame(loop);
  })();

  return { update, setOptions, applyTheme, zoom, resetView, dispose() { running = false; } };
}
