// 3D 導演台：抽象代理體（膠囊＋球頭＋鼻尖），兩種檢視
//   鏡頭視角：透過分鏡鏡頭看，可拖動鏡頭並反推代碼
//   導演視角：自由俯瞰，拖曳角色與佈景方塊，看 180 度線與所有分鏡機位
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { POSES, ensureBlocking, bodyOf, solveCamera, nearestCodes, focalOf } from "./stagemath.js";

const PALETTE = [0x3fb8a5, 0xf2efe6, 0xe5684a, 0xd9b56a, 0x7aa7d9, 0xb48ed9];
export const colorOf = (project, id) => {
  const c = project.characters.find(c => c.id === id);
  if (c?.color) return new THREE.Color(c.color).getHex();
  return PALETTE[Math.max(0, project.characters.indexOf(c)) % PALETTE.length];
};
export const colorName = hex => ({ 0x3fb8a5: "teal", 0xf2efe6: "white", 0xe5684a: "orange-red", 0xd9b56a: "gold", 0x7aa7d9: "blue", 0xb48ed9: "violet" }[hex] || "#" + hex.toString(16).padStart(6, "0"));

export class Stage {
  constructor() {
    this.el = document.createElement("div");
    this.el.className = "stage3d";
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.el.appendChild(this.renderer.domElement);
    this.hud = document.createElement("div");
    this.hud.className = "stage-hud";
    this.el.appendChild(this.hud);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x15171a);
    this.scene.fog = new THREE.Fog(0x15171a, 30, 90);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 8, 3);
    this.scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x24272b }));
    ground.rotation.x = -Math.PI / 2;
    ground.name = "ground";
    this.ground = ground;
    this.scene.add(ground);
    this.grid = new THREE.GridHelper(40, 40, 0x50555c, 0x34383d);
    this.grid.position.y = 0.002;
    this.scene.add(this.grid);
    // 正北標記：-Z 方向
    const north = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 3), new THREE.MeshBasicMaterial({ color: 0x50555c }));
    north.rotation.x = -Math.PI / 2; north.position.set(0, 0.01, -19);
    this.scene.add(north);

    this.dyn = new THREE.Group();   // 角色、方塊、輔助線：每次 update 重建
    this.scene.add(this.dyn);

    this.shotCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.02, 400);
    this.dirCam = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 400);
    this.dirCam.position.set(6, 9, 9);
    this.controls = new OrbitControls(this.dirCam, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener("change", () => this.onControls());

    this.mode = "shot";     // shot | director
    this.showAll = true;
    this.selected = null;   // {type:'char'|'block', id}
    this.raycaster = new THREE.Raycaster();
    this.drag = null;
    const cv = this.renderer.domElement;
    cv.addEventListener("pointerdown", e => this.pointerDown(e));
    cv.addEventListener("pointermove", e => this.pointerMove(e));
    window.addEventListener("pointerup", () => this.pointerUp());
    new ResizeObserver(() => this.resize()).observe(this.el);
    const loop = () => { if (this.dirty && this.el.isConnected) { this.render(); this.dirty = false; } requestAnimationFrame(loop); };
    loop();
  }

  // ctx: {project, shot, aspect, onChange(kind), onSelect()}
  update(ctx) {
    this.ctx = ctx;
    const { project, shot } = ctx;
    ensureBlocking(project, shot);
    this.sceneData = project.scenes.find(s => s.id === shot.scene) || null;
    this.rebuild();
    if (this.mode === "shot") this.placeShotCam();
    else this.updateHud();
    this.resize();
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === "shot") this.placeShotCam();
    else {
      // 導演視角：從鏡頭後上方看整個場
      const c = solveCamera(this.ctx.project, this.ctx.shot, this.ctx.aspect);
      this.controls.object = this.dirCam;
      this.controls.target.set(c.target[0], 0.8, c.target[2]);
      this.dirCam.position.set(c.target[0] + 3.5, 4.5, c.target[2] + 5);
      this.dirCam.up.set(0, 1, 0);
      this.silent = true; this.controls.update(); this.silent = false;
    }
    this.rebuild();
    this.updateHud();
    this.resize();
  }

  placeShotCam() {
    const c = solveCamera(this.ctx.project, this.ctx.shot, this.ctx.aspect);
    const cam = this.shotCam;
    cam.position.set(...c.pos);
    cam.up.set(...c.up);
    cam.fov = c.fov;
    cam.aspect = this.ctx.aspect;
    cam.updateProjectionMatrix();
    this.controls.object = cam;
    this.controls.target.set(...c.target);
    cam.lookAt(...c.target);
    this.silent = true; this.controls.update(); this.silent = false;
    this.cam = c;
    this.free = false;
    this.updateHud();
    this.dirty = true;
  }

  onControls() {
    if (this.mode === "shot" && !this.silent) { this.free = true; this.updateHud(); }
    this.dirty = true;
  }

  currentShotCam() {
    const cam = this.shotCam, t = this.controls.target;
    return { pos: cam.position.toArray(), target: [t.x, t.y, t.z], up: cam.up.toArray(), fov: cam.fov, focal: this.cam?.focal || focalOf(this.ctx.shot, this.ctx.project) };
  }

  updateHud() {
    const { project, shot, aspect } = this.ctx;
    if (this.mode !== "shot") {
      this.hud.innerHTML = `<span>導演視角：拖曳角色或方塊移動；右鍵平移、滾輪縮放</span>`;
      return;
    }
    const c = this.currentShotCam();
    const n = nearestCodes(project, shot, c, aspect);
    const codes = n ? [n.z, n.y, n.x].filter(Boolean).join(" · ") : "—";
    const same = n && n.z === shot.z && n.y === shot.y && (n.x || null) === (shot.x || null);
    const limited = !this.free && !shot.cam3d && n && !same;
    this.hud.innerHTML = `<span>${shot.cam3d ? "精確機位" : this.free ? "已拖動鏡頭" : "依代碼機位"}　約等於 <b>${codes}</b>　${Math.round(c.focal)}mm　俯仰 ${n ? n.el : 0}°${limited ? "　<i>（受地面限制，達不到所選角度）</i>" : ""}</span>
      ${this.free || shot.cam3d ? `<button class="small" data-stage="apply" ${same && !shot.cam3d ? "disabled" : ""}>套用成代碼</button>
      <button class="small ghost" data-stage="keep">保留這個機位</button>` : ""}
      ${this.free || shot.cam3d ? `<button class="small ghost" data-stage="reset">回到代碼機位</button>` : ""}`;
    this.hud.onclick = e => {
      const act = e.target.closest("[data-stage]")?.dataset.stage;
      if (!act) return;
      if (act === "apply") { Object.assign(shot, { x: n.x, y: n.y, z: n.z }); delete shot.cam3d; this.ctx.onChange("codes"); }
      if (act === "keep") { shot.cam3d = this.currentShotCam(); Object.assign(shot, { x: n.x, y: n.y, z: n.z }); this.ctx.onChange("codes"); }
      if (act === "reset") { delete shot.cam3d; this.placeShotCam(); this.ctx.onChange("cam"); }
    };
  }

  // ---------- 場景物件 ----------
  rebuild() {
    const { project, shot } = this.ctx;
    for (const o of [...this.dyn.children]) { this.dyn.remove(o); o.traverse?.(m => { m.geometry?.dispose(); m.material?.dispose?.(); }); }
    this.pickables = [];
    for (const blk of this.sceneData?.set || []) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(blk.size[0], blk.size[2], blk.size[1]),
        new THREE.MeshLambertMaterial({ color: this.selected?.id === blk.id ? 0x8a7a55 : 0x5a5f66 }));
      m.position.set(blk.pos[0], blk.size[2] / 2, blk.pos[1]);
      m.rotation.y = -(blk.rot || 0) * Math.PI / 180;
      m.userData = { type: "block", id: blk.id };
      this.dyn.add(m); this.pickables.push(m);
    }
    for (const id of shot.chars || []) {
      const g = this.mannequin(project, shot, id);
      this.dyn.add(g); this.pickables.push(g);
    }
    if (this.mode === "director") {
      this.addLine();
      this.addCameras();
    }
    this.dirty = true;
  }

  mannequin(project, shot, id) {
    const B = bodyOf(project, shot, id);
    const color = colorOf(project, id);
    const sel = this.selected?.type === "char" && this.selected.id === id;
    const mat = new THREE.MeshLambertMaterial({ color, emissive: sel ? 0x332200 : 0x000000 });
    const g = new THREE.Group();
    const H = B.H, r = H * 0.12;
    const headR = H * 0.065;
    const bodyLen = H - 2 * headR - 2 * r - H * 0.008;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.05, bodyLen), 6, 12), mat);
    body.position.y = r + bodyLen / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 16, 12), mat);
    head.position.y = H - headR;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(headR * 0.35, headR * 0.9, 8), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, H - headR, -headR * 1.2);
    g.add(body, head, nose);
    if (B.b.pose === "punch") {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.32, r * 0.32, H * 0.42, 8), mat);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(H * 0.1, H * 0.78, -H * 0.24);
      g.add(arm);
    }
    // 腳下面向箭頭
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 3), new THREE.MeshBasicMaterial({ color }));
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(0, 0.01, -r - 0.25);
    const inner = new THREE.Group();
    inner.add(g);
    if (B.b.pose === "crouch") g.scale.set(1.1, 0.62, 1.1);
    if (B.b.pose === "lying") { g.rotation.x = -Math.PI / 2; g.position.set(0, r, H / 2 - r); }
    inner.position.y = B.lift;
    const root = new THREE.Group();
    root.add(inner, arrow);
    root.position.set(B.pos[0], 0, B.pos[2]);
    root.rotation.y = -B.b.yaw * Math.PI / 180;
    root.userData = { type: "char", id };
    if (this.mode === "director") root.add(this.label(project.characters.find(c => c.id === id)?.name || id, color, H + B.lift + 0.35));
    return root;
  }

  label(text, color, y) {
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 64;
    const g = cv.getContext("2d");
    g.font = "bold 34px 'Microsoft JhengHei', sans-serif";
    g.fillStyle = "#" + new THREE.Color(color).getHexString();
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, 128, 32);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
    sp.scale.set(1.2, 0.3, 1);
    sp.position.y = y;
    return sp;
  }

  addLine() {
    const { project, shot } = this.ctx;
    const ids = shot.chars || [];
    if (ids.length < 2) return;
    const a = bodyOf(project, shot, ids[0]).pos, b = bodyOf(project, shot, ids[1]).pos;
    const d = new THREE.Vector3(b[0] - a[0], 0, b[2] - a[2]).normalize().multiplyScalar(15);
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0], 0.02, a[2]).sub(d), new THREE.Vector3(b[0], 0.02, b[2]).add(d)]);
    this.dyn.add(new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xe0b04f, dashSize: 0.3, gapSize: 0.2 })).computeLineDistances());
  }

  addCameras() {
    const { project, shot, aspect } = this.ctx;
    const list = this.showAll ? project.shots.filter(s => s.scene === shot.scene && s.blocking) : [shot];
    for (const s of list) {
      const c = s === shot && this.free ? this.currentShotCam() : solveCamera(project, s, aspect);
      const cur = s === shot;
      const cam = new THREE.PerspectiveCamera(c.fov, aspect, 0.05, cur ? Math.hypot(c.pos[0] - c.target[0], c.pos[1] - c.target[1], c.pos[2] - c.target[2]) : 0.8);
      cam.position.set(...c.pos); cam.up.set(...c.up); cam.lookAt(...c.target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      const helper = new THREE.CameraHelper(cam);
      helper.setColors?.(new THREE.Color(cur ? 0xe5684a : 0x7aa7d9), new THREE.Color(cur ? 0xe5684a : 0x7aa7d9), new THREE.Color(0x888888), new THREE.Color(0x888888), new THREE.Color(0x888888));
      this.dyn.add(helper);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.26), new THREE.MeshBasicMaterial({ color: cur ? 0xe5684a : 0x7aa7d9 }));
      body.position.set(...c.pos); body.lookAt(...c.target);
      this.dyn.add(body);
      const lb = this.label(s.id, cur ? 0xe5684a : 0x7aa7d9, 0);
      lb.position.set(c.pos[0], c.pos[1] + 0.3, c.pos[2]);
      this.dyn.add(lb);
    }
  }

  // ---------- 互動（導演視角） ----------
  ndc(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  groundPoint(e) {
    this.raycaster.setFromCamera(this.ndc(e), this.dirCam);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }
  pointerDown(e) {
    if (this.mode !== "director" || e.button !== 0) return;
    this.raycaster.setFromCamera(this.ndc(e), this.dirCam);
    const hit = this.raycaster.intersectObjects(this.pickables, true)[0];
    let o = hit?.object;
    while (o && !o.userData.type) o = o.parent;
    if (!o) { if (this.selected) { this.selected = null; this.rebuild(); this.ctx.onSelect(); } return; }
    this.selected = { type: o.userData.type, id: o.userData.id };
    const gp = this.groundPoint(e);
    const item = this.itemOf(this.selected);
    this.drag = gp && item ? { off: [item.pos[0] - gp.x, item.pos[1] - gp.z] } : null;
    this.controls.enabled = false;
    this.rebuild(); this.ctx.onSelect();
  }
  pointerMove(e) {
    if (!this.drag) return;
    const gp = this.groundPoint(e);
    const item = this.itemOf(this.selected);
    if (!gp || !item) return;
    item.pos = [+(gp.x + this.drag.off[0]).toFixed(2), +(gp.z + this.drag.off[1]).toFixed(2)];
    this.rebuild();
  }
  pointerUp() {
    if (this.drag) { this.drag = null; this.ctx.onChange(this.selected.type === "block" ? "set" : "blocking"); }
    this.controls.enabled = true;
  }
  itemOf(sel) {
    if (!sel) return null;
    if (sel.type === "char") return this.ctx.shot.blocking?.[sel.id];
    return this.sceneData?.set?.find(b => b.id === sel.id);
  }

  // ---------- 畫面 ----------
  resize() {
    if (!this.ctx) return;
    const w = this.el.clientWidth || 800;
    const h = Math.round(w / Math.max(this.ctx.aspect, 0.75));
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + "px";
    this.renderer.domElement.style.height = h + "px";
    for (const cam of [this.shotCam, this.dirCam]) { cam.aspect = this.mode === "shot" ? this.ctx.aspect : w / h; cam.updateProjectionMatrix(); }
    this.dirty = true;
  }
  render() {
    const cam = this.mode === "shot" ? this.shotCam : this.dirCam;
    if (this.mode === "shot") {
      // 畫幅比例不同時（直式），用 setViewOffset 讓畫面完整呈現
      this.shotCam.aspect = this.ctx.aspect; this.shotCam.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, cam);
  }

  // 以專案比例離屏拍一張構圖參考圖（只有代理體、方塊和淡網格）
  async snapshot() {
    const prevMode = this.mode, prevSel = this.selected;
    this.selected = null;
    if (prevMode !== "shot") { this.mode = "shot"; }
    this.rebuild();
    const c = this.ctx.shot.cam3d ? this.ctx.shot.cam3d : (this.free ? this.currentShotCam() : solveCamera(this.ctx.project, this.ctx.shot, this.ctx.aspect));
    const cam = new THREE.PerspectiveCamera(c.fov, this.ctx.aspect, 0.02, 400);
    cam.position.set(...c.pos); cam.up.set(...c.up); cam.lookAt(...c.target); cam.updateProjectionMatrix();
    const [W, H] = this.ctx.aspect > 1.2 ? [1792, 1024] : this.ctx.aspect < 0.8 ? [1024, 1792] : [1024, 1024];
    const rt = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    rt.setSize(W, H, false);
    rt.render(this.scene, cam);
    const blob = await new Promise(r => rt.domElement.toBlob(r, "image/png"));
    rt.dispose();
    this.mode = prevMode; this.selected = prevSel;
    this.rebuild();
    return blob;
  }
}

export { POSES };
