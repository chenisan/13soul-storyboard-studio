import { BODIES, LENSES, FOCALS, STOCKS, gearOf, migrateShotGear, midjourneyRefs } from "./camera.js";
import { X, Y, Z, R, M, MODS, zOf, rOf, codeLine, checkShot, checkPair, buildPrompt, refsOf, wordDiff, charNameEn } from "./camera.js";
import { Stage, POSES, colorOf, colorName } from "./stage3d.js";
import { checkPair3d, DEFAULT_HEIGHT } from "./stagemath.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const RATIO = { youtube: 16 / 9, reel: 9 / 16, square: 1 };
const RATIO_ZH = { youtube: "橫式 16:9", reel: "直式 9:16", square: "方形 1:1" };

const URL_ARGS = new URLSearchParams(location.search);  // ?view=3d&mode=director&shot=S02
const st = { P: null, project: null, gens: {}, queue: [], cur: null, tab: "still", showDiff: false, view: URL_ARGS.get("view") || localGet("studio.view") || "2d", stage: null, jobStart: {}, justDone: null, queueAll: [] };
const aspect = () => RATIO[st.project?.ratio] || 16 / 9;

// ---------------- API ----------------
async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(data.error || r.statusText);
  return data;
}
const q = () => `p=${encodeURIComponent(st.P)}`;
const fileUrl = path => `/files/${encodeURIComponent(st.P)}/${path.split("/").map(encodeURIComponent).join("/")}`;

let saveTimer;
function save() {
  $("#saveState").textContent = "儲存中…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await api(`/api/project?${q()}`, { method: "POST", body: JSON.stringify(st.project) });
      $("#saveState").textContent = "已儲存";
    } catch (e) { $("#saveState").textContent = "儲存失敗：" + e.message; }
  }, 400);
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

// ---------------- 專案 ----------------
async function loadProjects(select) {
  // 「_」開頭的是範例、參考用專案，排在最後
  const list = (await api("/api/projects")).sort((a, b) => (a.startsWith("_") - b.startsWith("_")) || a.localeCompare(b));
  const sel = $("#projectSel");
  sel.innerHTML = list.map(n => `<option>${esc(n)}</option>`).join("") || "<option value=''>（尚無專案）</option>";
  const want = select || localGet("studio.project") || list[0];
  if (want && list.includes(want)) { sel.value = want; await loadProject(want); }
  else renderAll();
}

async function loadProject(name) {
  st.P = name;
  localSet("studio.project", name);
  st.project = await api(`/api/project?${q()}`);
  st.project.characters ??= []; st.project.scenes ??= []; st.project.shots ??= [];
  if (migrateGear(st.project)) save();
  st.gens = await api(`/api/gens?${q()}`);
  st.cur = st.project.shots.find(s => s.id === URL_ARGS.get("shot"))?.id || st.project.shots[0]?.id || null;
  renderAll();
  if (URL_ARGS.get("mode") === "director" && st.stage) { st.stage.setMode("director"); renderEditor(); }
}

// 舊專案：修飾欄焦段 → 毫米數；專案質感開頭寫死的 35mm 底片 → 攝影設備預設
const OLD_LOOK = "Shot on 35mm motion picture film, Kodak Vision3 500T pushed one stop, organic film grain, soft highlight roll-off with gentle halation, lifted film-grey blacks, vintage spherical cinema lens.";
function migrateGear(p) {
  let changed = false;
  for (const s of p.shots) changed = migrateShotGear(s) || changed;
  if (!p.gear && p.look?.startsWith(OLD_LOOK)) {
    p.gear = { body: "arricam", lens: "cooke_panchro", stock: "v3_500t_push" };
    p.look = p.look.slice(OLD_LOOK.length).trim();
    changed = true;
  }
  return changed;
}

function localGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localSet(k, v) { try { localStorage.setItem(k, v); } catch { /* 無痕模式 */ } }

const shot = () => st.project?.shots.find(s => s.id === st.cur);
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

// ---------------- 左側：角色卡、場景 ----------------
function renderAssets() {
  const p = st.project;
  const item = (a, kind) => `<div class="asset" data-kind="${kind}" data-id="${esc(a.id)}">
      <img src="${fileUrl(a.image)}" data-zoom="${esc(a.image)}" alt="">
      <div><div class="name">${esc(a.name)}</div><div class="sub">${esc(kind === "characters" ? (a.lock || "（未填鎖定描述）") : (a.desc || "（未填場景描述）"))}</div></div>
      <button class="small ghost" data-edit>編輯</button></div>`;
  $("#charList").innerHTML = p ? p.characters.map(c => item(c, "characters")).join("") : "";
  $("#sceneList").innerHTML = p ? p.scenes.map(c => item(c, "scenes")).join("") : "";
  $("#assetToggle").textContent = p ? `角色卡 ${p.characters.length}／場景 ${p.scenes.length}` : "角色卡／場景";
}

async function addFiles(kind, files) {
  if (!st.P) return toast("請先建立專案");
  for (const f of files) {
    try {
      const { path } = await api(`/api/upload?${q()}&kind=${kind}&name=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
      addAsset(kind, path, f.name);
    } catch (e) { toast(`${f.name}：${e.message}`); }
  }
}

function addAsset(kind, path, filename) {
  const name = filename.replace(/\.[^.]+$/, "");
  const list = st.project[kind];
  list.push(kind === "characters" ? { id: uid("c"), name, image: path, lock: "", outfit: "" } : { id: uid("s"), name, image: path, desc: "" });
  save(); renderAssets(); renderEditor();
  toast(`已加入「${name}」，按「編輯」補上描述`);
}

function editAsset(kind, id) {
  const list = st.project[kind];
  const a = list.find(x => x.id === id);
  const isChar = kind === "characters";
  openDialog(`<h3>${isChar ? "角色卡" : "場景"}</h3>
    <img class="big-img" src="${fileUrl(a.image)}" style="max-height:40vh">
    <div class="muted">${esc(a.image)}</div>
    <div class="row"><label class="field" style="flex:1"><span>名稱</span><input type="text" name="name" value="${esc(a.name)}"></label>
    <label class="field" style="flex:1"><span>英文名（選填，英文提示詞用；空白就用名稱）</span><input type="text" name="name_en" value="${esc(a.name_en || "")}"></label></div>
    ${isChar ? `
    <label class="field"><span>臉部／髮型鎖定（英文較準；可留空，只靠角色卡）</span><textarea name="lock" rows="3">${esc(a.lock)}</textarea></label>
    <label class="field"><span>服裝描述</span><textarea name="outfit" rows="3">${esc(a.outfit)}</textarea></label>
    <div class="row"><label class="field"><span>身高（公尺，3D 用）</span><input type="text" name="height" value="${esc(a.height || DEFAULT_HEIGHT)}" style="width:90px"></label>
    <label class="field"><span>3D 代理體顏色</span><input type="color" name="color" value="#${colorOf(st.project, a.id).toString(16).padStart(6, "0")}"></label></div>` : `
    <label class="field"><span>場景描述：時段、光源方向、空氣層、空間錨點</span><textarea name="desc" rows="4">${esc(a.desc)}</textarea></label>`}
    <div class="dlg-actions"><button type="button" class="ghost" data-act="del" style="margin-right:auto">從專案移除（檔案保留）</button>
      <button value="cancel" class="ghost">取消</button><button value="ok" data-act="ok">儲存</button></div>`,
  (form, act) => {
    if (act === "del") {
      if (!confirm(`移除「${a.name}」？已綁定的分鏡會失去這張參考圖。`)) return false;
      list.splice(list.indexOf(a), 1);
      for (const s of st.project.shots) {
        s.chars = (s.chars || []).filter(c => c !== id);
        if (s.subject === id) s.subject = s.chars[0] || null;
        if (s.scene === id) s.scene = null;
      }
    } else if (act === "ok") {
      for (const k of ["name", "name_en", "lock", "outfit", "desc", "color"]) if (form.elements[k]) a[k] = form.elements[k].value;
      if (form.elements.height) a.height = parseFloat(form.elements.height.value) || DEFAULT_HEIGHT;
    } else return true;
    save(); renderAssets(); renderEditor(); renderStrip();
    return true;
  });
}

// ---------------- 對話框 ----------------
function openDialog(html, onAct) {
  const dlg = $("#dlg"), form = $("#dlgBody");
  form.innerHTML = html;
  let dirty = false;
  form.oninput = () => { dirty = true; };
  dlg.onclick = e => {
    if (e.target !== dlg) return;  // dialog 本身沒有內距，點到它就是點到外面的遮罩
    if (dirty) { toast("視窗裡有修改還沒存，請按「取消」或「儲存」"); return; }
    dlg.close();
  };
  form.onclick = async e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    e.preventDefault();
    const close = await onAct(form, b.dataset.act, b);
    if (close !== false) dlg.close();
  };
  dlg.showModal();
  return form;
}

// ---------------- 選鏡器 SVG ----------------
function xDial(s) {
  const W = 240, c = 120, r = 88;
  const pts = X.map(x => {
    const a = x.deg * Math.PI / 180, px = c + r * Math.sin(a), py = c - r * Math.cos(a);
    const lx = c + (r + 22) * Math.sin(a), ly = c - (r + 22) * Math.cos(a);
    return `<g class="pt ${s.x === x.id ? "on" : ""}" data-x="${x.id}">
      <line x1="${px}" y1="${py}" x2="${c}" y2="${c}" stroke="${s.x === x.id ? "var(--accent)" : "transparent"}" stroke-dasharray="3 3"/>
      <circle cx="${px}" cy="${py}" r="11"/><text x="${px}" y="${py + 4}" text-anchor="middle">${x.id.slice(1)}</text>
      <text class="lbl" x="${lx}" y="${ly + 4}" text-anchor="middle">${x.zh.replace("四分之三", "¾")}</text></g>`;
  }).join("");
  return `<svg viewBox="-24 -4 ${W + 48} ${W + 8}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--line)" stroke-dasharray="2 4"/>
    <circle cx="${c}" cy="${c}" r="16" fill="#e8e6e1"/>
    <path d="M${c - 7} ${c - 12} L${c} ${c - 26} L${c + 7} ${c - 12}Z" fill="#e8e6e1"/>
    <text x="${c}" y="${c + 4}" text-anchor="middle" style="fill:#111;font-size:10px">主體</text>
    ${pts}</svg>`;
}

function yArc(s) {
  const cx = 40, cy = 150, r = 150;
  const pts = Y.map(y => {
    const a = y.deg * Math.PI / 180, px = cx + r * Math.cos(a), py = cy - r * Math.sin(a);
    return `<g class="pt ${s.y === y.id ? "on" : ""}" data-y="${y.id}">
      <line x1="${px}" y1="${py}" x2="${cx}" y2="${cy}" stroke="${s.y === y.id ? "var(--accent)" : "var(--line)"}" stroke-width="${s.y === y.id ? 1.5 : .6}"/>
      <rect x="${px - 9}" y="${py - 7}" width="18" height="14" rx="3"/>
      <text class="lbl" x="${px + 14}" y="${py + 4}">${y.id} ${y.zh}</text></g>`;
  }).join("");
  return `<svg viewBox="0 -18 300 330">
    <path d="M${cx + r * Math.cos(-75 * Math.PI / 180)} ${cy + r * Math.sin(75 * Math.PI / 180)} A${r} ${r} 0 0 0 ${cx} ${cy - r}" fill="none" stroke="var(--line)" stroke-dasharray="3 4"/>
    <circle cx="${cx}" cy="${cy}" r="9" fill="#e8e6e1"/>${pts}</svg>`;
}

// 依景別裁切一個簡單人形，示意畫面裡看到多少
function framePreview(s) {
  const ar = RATIO[st.project.ratio] || 16 / 9;
  const H = 200, z = s.z ? zOf(s.z) : null;
  let y0, h;
  if (!z) { y0 = -20; h = 240; }
  else if (s.z === "Z8") { h = H * 3; y0 = H - h * 0.8; }
  else if (s.z === "Z9") { h = H * 9; y0 = H - h * 0.85; }
  else if (s.z === "Z7") { y0 = -H * 0.07; h = H * 1.12; }
  else { y0 = z.top * H - (s.z === "Z1" ? 0 : H * 0.03); h = (z.bot - z.top) * H + (s.z === "Z1" ? 0 : H * 0.03); }
  const w = h * ar, x0 = (s.z === "Z1" ? 108 : 100) - w / 2;
  const fig = `<g fill="#cfc9bd" stroke="#cfc9bd">
    <ellipse cx="100" cy="17" rx="12" ry="16"/>
    <circle cx="95" cy="15" r="1.6" fill="#111" stroke="none"/><circle cx="105" cy="15" r="1.6" fill="#111" stroke="none"/>
    <rect x="96" y="31" width="8" height="8"/>
    <path d="M78 40 Q100 34 122 40 L118 100 L82 100Z"/>
    <path d="M80 42 L66 104 L70 106 L86 50Z M120 42 L134 104 L130 106 L114 50Z"/>
    <path d="M82 100 L118 100 L116 112 L84 112Z"/>
    <path d="M85 110 L95 110 L94 196 L86 196Z M105 110 L115 110 L114 196 L106 196Z"/>
    <rect x="82" y="194" width="14" height="5" rx="2"/><rect x="104" y="194" width="14" height="5" rx="2"/></g>`;
  return `<svg class="frame-prev" viewBox="${x0} ${y0} ${w} ${h}" style="aspect-ratio:${ar}">
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#0b0c0d"/>
    <line x1="${x0}" y1="199" x2="${x0 + w}" y2="199" stroke="#333" stroke-width="${h / 200}"/>${fig}</svg>`;
}

// ---------------- 編輯區 ----------------
function renderEditor() {
  const ed = $("#editor");
  const p = st.project;
  if (!p) { ed.innerHTML = `<div class="empty">先按上方「＋專案」建立專案。</div>`; return; }
  const s = shot();
  if (!s) { ed.innerHTML = `<div class="empty">下方按「＋」新增第一顆分鏡。</div>`; return; }
  const chip = (on, attrs, label) => `<span class="chip ${on ? "on" : ""}" ${attrs}>${label}</span>`;

  ed.innerHTML = `
  <div class="card">
    <div class="row">
      <label class="field" style="width:110px"><span>鏡號</span><input type="text" id="fId" value="${esc(s.id)}" disabled></label>
      <label class="field" style="flex:1;min-width:200px"><span>標題</span><input type="text" id="fTitle" value="${esc(s.title || "")}" placeholder="例：主角俯衝入鏡"></label>
      <div class="field"><span>&nbsp;</span><div class="row" style="gap:6px">
        <button class="ghost small" id="mvL">← 前移</button><button class="ghost small" id="mvR">後移 →</button>
        <button class="ghost small" id="dup">複製此鏡</button><button class="ghost small" id="del">刪除</button></div></div>
    </div>
    <div class="field" style="margin-top:8px"><div class="row" style="align-items:center;gap:8px">
      <span class="muted">畫面內容（動作、表情、走位；中英文都可以，會原樣放進提示詞）</span><span class="grow"></span>
      <button class="small ghost" id="rewriteBtn" title="把目前的出場角色、人物關係、鏡頭交給 codex，改寫成相符的句子">依選項改寫</button></div>
      <textarea id="fAction" rows="3">${esc(s.action || "")}</textarea></div>
    <div id="rewriteBox"></div>
  </div>

  <div class="card">
    <h3>綁定角色卡與場景</h3>
    <div class="field"><span>出場角色（可多選）</span><div class="chips">${p.characters.map(c =>
      chip(s.chars?.includes(c.id), `data-char="${esc(c.id)}"`, `<img src="${fileUrl(c.image)}">${esc(c.name)}`)).join("") || '<span class="muted">左側先上傳角色卡</span>'}</div></div>
    <div class="field" style="margin-top:8px"><span>主體（X 方位以誰的臉部朝向為 0°）</span><div class="chips">${(s.chars || []).map(id =>
      chip(s.subject === id, `data-subject="${esc(id)}"`, esc(p.characters.find(c => c.id === id)?.name))).join("") || '<span class="muted">先勾選角色</span>'}</div></div>
    <div class="field" style="margin-top:8px"><span>場景</span><div class="chips">${chip(!s.scene, `data-scene=""`, "不綁")}${p.scenes.map(c =>
      chip(s.scene === c.id, `data-scene="${esc(c.id)}"`, `<img src="${fileUrl(c.image)}">${esc(c.name)}`)).join("")}</div></div>
  </div>

  <div class="card">
    <div class="tabs"><h3 style="margin:0 8px 0 0">鏡頭座標</h3>
      <button class="${st.view === "2d" ? "on" : ""}" data-view="2d">2D 選鏡</button>
      <button class="${st.view === "3d" ? "on" : ""}" data-view="3d">3D 導演台</button></div>
    ${st.view === "3d" ? `<div class="stage-bar">
      <button class="small ${st.stage?.mode !== "director" ? "" : "ghost"}" data-smode="shot">鏡頭視角</button>
      <button class="small ${st.stage?.mode === "director" ? "" : "ghost"}" data-smode="director">導演視角</button>
      <label class="muted"><input type="checkbox" id="showAll" ${st.stage?.showAll !== false ? "checked" : ""}> 顯示同場景所有機位</label>
      <button class="small ghost" id="addBlock">＋佈景方塊</button>
      <span class="grow"></span>
      <button class="small ghost" id="snapBtn">拍下構圖</button>
      ${s.layout ? `<img class="layout-th" src="${fileUrl(s.layout)}" data-zoom="${esc(s.layout)}" title="最近一次構圖截圖">` : ""}
    </div><div id="stageHost"></div><div id="inspector" class="inspector"></div>` : ""}
    <div class="pickers">
      <div class="picker"><div class="muted">X 方位（俯視，主體面向上方）</div>${xDial(s)}
        <div class="chips" style="justify-content:center">${chip(!s.x, 'data-x=""', "不指定方位")}</div></div>
      <div class="picker"><div class="muted">Y 俯仰（側視）</div>${yArc(s)}</div>
      <div class="picker"><div class="muted">Z 景別</div><div class="ladder">${Z.map(z =>
        `<button class="${s.z === z.id ? "on" : ""}" data-z="${z.id}"><b>${z.id}</b>${z.zh}</button>`).join("")}</div>
        <div class="muted" style="margin-top:6px">取景示意（${RATIO_ZH[p.ratio] || ""}）</div>${framePreview(s)}</div>
    </div>
    <div class="field" style="margin-top:12px"><span>人物關係</span><div class="chips">${R.map(r => chip((s.r || "single") === r.id, `data-r="${r.id}"`, r.zh)).join("")}</div></div>
    <div class="field" style="margin-top:8px"><span>運鏡（只寫進影片提示詞；首幀是靜態）</span><div class="chips">${M.map(m => chip((s.m || "static") === m.id, `data-m="${m.id}"`, m.zh)).join("")}</div></div>
    <div class="field" style="margin-top:8px"><span>修飾</span>${MODS.map(g => `<div class="mod-group"><b>${g.group}</b><div class="chips">${g.items.map(i =>
      chip(s.mods?.includes(i.id), `data-mod="${i.id}"`, i.zh)).join("")}</div></div>`).join("")}</div>
    ${gearHtml(s)}
  </div>

  <div class="card">
    <div class="code" id="codeLine"></div>
    <div class="warns" id="warns"></div>
  </div>

  <div class="card">
    <div class="tabs">
      <button class="${st.tab === "still" ? "on" : ""}" data-tab="still">首幀提示詞（送 codex）</button>
      <button class="${st.tab === "video" ? "on" : ""}" data-tab="video">影片提示詞（Seedance）</button>
      <button class="${st.tab === "mj" ? "on" : ""}" data-tab="mj">Midjourney</button>
      <span id="manualBadge"></span><span class="grow"></span>
      <button class="ghost small" id="toggleDiff">看差異</button>
      <button class="ghost small" id="resetPrompt">還原成自動版</button>
      <button class="ghost small" id="copyPrompt">複製</button>
    </div>
    <div id="staleNote" class="muted"></div>
    <div class="refs" id="refs"></div>
    <textarea class="prompt-en" id="promptEn" spellcheck="false"></textarea>
    <div id="diffBox"></div>
    <div id="mjBox"></div>
    <div class="field" style="margin-top:6px"><span>中文對照（唯讀）</span><textarea class="prompt-zh" id="promptZh" readonly></textarea></div>
    <div class="row" id="genRow" style="margin-top:8px;align-items:center">
      <button id="genBtn">生成首幀…</button>
      <span class="muted">比例：${RATIO_ZH[p.ratio] || p.ratio}（在「專案設定」改）。生成前會再讓你確認提示詞。</span>
    </div>
  </div>

  <div class="card"><div class="tabs"><h3 style="margin:0">生成版本</h3><span class="grow"></span><span id="verTools"></span></div>
    <div class="versions" id="versions"></div></div>`;
  refreshDerived();
  renderVersions();
  if (st.view === "3d") mountStage();
  renderRewrite();
}

// ---------------- 依選項改寫畫面內容（codex） ----------------
function rewriteContext(s) {
  const p = st.project, chars = s.chars || [];
  const r = rOf(s.r || "single"), sc = p.scenes.find(x => x.id === s.scene);
  return {
    title: s.title || "",
    characters_in_shot: chars.map(id => { const c = p.characters.find(c => c.id === id); return { name: c?.name || id, name_en: c?.name_en || "", subject: id === s.subject }; }),
    characters_not_in_shot: p.characters.filter(c => !chars.includes(c.id)).map(c => c.name_en ? `${c.name} (${c.name_en})` : c.name),
    relationship: `${r.zh} ${r.id}`,
    camera: codeLine(s, p),
    scene: sc ? `${sc.name} ${sc.name_en || ""}`.trim() : "",
  };
}

async function rewriteAction() {
  const s = shot();
  st.rewrite = { sid: s.id, state: "busy" };
  renderRewrite();
  try {
    const { text } = await api("/api/rewrite_action", { method: "POST", body: JSON.stringify({ action: s.action || "", context: rewriteContext(s) }) });
    st.rewrite = { sid: s.id, state: "done", text };
  } catch (e) { st.rewrite = { sid: s.id, state: "error", text: e.message }; }
  renderRewrite();
}

function renderRewrite() {
  const box = $("#rewriteBox"), s = shot(); if (!box || !s) return;
  const r = st.rewrite?.sid === s.id ? st.rewrite : null;
  const btn = $("#rewriteBtn"); if (btn) btn.disabled = r?.state === "busy";
  if (!r) { box.innerHTML = ""; return; }
  if (r.state === "busy") box.innerHTML = `<div class="rewrite"><span class="spin tiny"></span> codex 依目前選項改寫中…（約 10 秒）</div>`;
  else if (r.state === "error") box.innerHTML = `<div class="w error">改寫失敗：${esc(r.text)}<button class="small ghost" id="rewriteCancel">關閉</button></div>`;
  else box.innerHTML = `<div class="rewrite"><div class="muted">建議改寫（可以先修改；按「套用」才會換掉上面的原文）</div>
    <textarea id="rewriteText" rows="2">${esc(r.text)}</textarea>
    <div class="row" style="gap:6px"><button class="small" id="rewriteApply">套用</button>
    <button class="small ghost" id="rewriteAgain">再改一次</button><button class="small ghost" id="rewriteCancel">取消</button></div></div>`;
}

function stageCtx() {
  return { project: st.project, shot: shot(), aspect: aspect(),
    onChange: kind => {
      save();
      if (kind === "codes") { renderEditor(); renderStrip(); return; }
      refreshDerived(); renderStrip(); renderInspector();
    },
    onSelect: () => renderInspector() };
}

function mountStage() {
  st.stage ??= new Stage();
  $("#stageHost").appendChild(st.stage.el);
  st.stage.update(stageCtx());
  renderInspector();
}

function renderInspector() {
  const box = $("#inspector"); if (!box || !st.stage) return;
  const s = shot(), sel = st.stage.selected, p = st.project;
  if (st.stage.mode !== "director") { box.innerHTML = `<span class="muted">鏡頭視角：拖曳畫面轉動鏡頭、滾輪推近拉遠、右鍵平移；拖完可以「套用成代碼」或「保留這個機位」。站位和佈景請切到導演視角。</span>`; return; }
  if (sel?.type === "char" && s.blocking?.[sel.id]) {
    const b = s.blocking[sel.id], name = p.characters.find(c => c.id === sel.id)?.name || sel.id;
    const lift = b.pose === "air" ? (b.lift ?? 1) : (b.lift || 0);
    box.innerHTML = `<b>${esc(name)}</b>
      <label>面向 <input type="range" min="0" max="355" step="5" data-ins="yaw" value="${b.yaw}"> <span>${b.yaw}°</span></label>
      <label>姿勢 <select data-ins="pose">${POSES.map(o => `<option value="${o.id}" ${b.pose === o.id ? "selected" : ""}>${o.zh}</option>`).join("")}</select></label>
      <label>離地 <input type="range" min="0" max="6" step="0.1" data-ins="lift" value="${lift}"> <span>${lift}m</span></label>
      <button class="small ghost" data-ins="face">面向對方</button>
      <span class="muted">位置 ${b.pos[0]}, ${b.pos[1]}</span>`;
  } else if (sel?.type === "block") {
    const sc = p.scenes.find(x => x.id === s.scene), blk = sc?.set?.find(x => x.id === sel.id);
    if (!blk) { box.innerHTML = ""; return; }
    box.innerHTML = `<b>佈景方塊</b><span class="muted">（${esc(sc.name)}，所有分鏡共用）</span>
      <label>寬 <input type="text" data-blk="0" value="${blk.size[0]}" style="width:56px"></label>
      <label>深 <input type="text" data-blk="1" value="${blk.size[1]}" style="width:56px"></label>
      <label>高 <input type="text" data-blk="2" value="${blk.size[2]}" style="width:56px"></label>
      <label>旋轉 <input type="range" min="0" max="355" step="5" data-ins="rot" value="${blk.rot || 0}"> <span>${blk.rot || 0}°</span></label>
      <button class="small ghost" data-ins="delblock">刪除方塊</button>`;
  } else box.innerHTML = `<span class="muted">導演視角：點選角色或方塊後拖曳移動；選取後可改面向、姿勢、離地高度。黃色虛線是兩人之間的 180 度線，紅色是這顆鏡頭，藍色是同場景其他鏡頭。</span>`;
}

function onInspector(e) {
  const t = e.target, s = shot(), sel = st.stage?.selected;
  if (!sel) return;
  if (sel.type === "char") {
    const b = s.blocking[sel.id];
    const k = t.dataset.ins;
    if (k === "yaw") b.yaw = +t.value;
    else if (k === "pose") { b.pose = t.value; if (b.pose === "air" && b.lift == null) b.lift = 1; }
    else if (k === "lift") b.lift = +t.value;
    else if (k === "face") {
      const other = (s.chars || []).find(c => c !== sel.id); if (!other) return;
      const o = s.blocking[other].pos;
      b.yaw = Math.round(((Math.atan2(o[0] - b.pos[0], -(o[1] - b.pos[1])) * 180 / Math.PI) + 360) % 360);
    } else return;
  } else {
    const sc = st.project.scenes.find(x => x.id === s.scene);
    const blk = sc?.set?.find(x => x.id === sel.id);
    if (!blk) return;
    if (t.dataset.blk != null) blk.size[+t.dataset.blk] = Math.max(0.05, parseFloat(t.value) || 0.1);
    else if (t.dataset.ins === "rot") blk.rot = +t.value;
    else if (t.dataset.ins === "delblock") { sc.set = sc.set.filter(x => x !== blk); st.stage.selected = null; }
    else return;
  }
  st.stage.update(stageCtx());
  save(); renderStrip();
  if (e.type === "click" || e.type === "change") renderInspector();
  else { const out = t.parentElement.querySelector("span"); if (out && t.type === "range") out.textContent = t.value + (t.dataset.ins === "lift" ? "m" : "°"); }
}

async function snapLayout(s) {
  st.stage ??= new Stage();
  const prevShot = st.stage.ctx?.shot;
  st.stage.update({ ...stageCtx(), shot: s });
  const blob = await st.stage.snapshot();
  if (prevShot && prevShot !== s) st.stage.update({ ...stageCtx(), shot: prevShot });
  const { path } = await api(`/api/snapshot?${q()}&shot=${encodeURIComponent(s.id)}`, { method: "POST", body: blob });
  s.layout = path; save();
  return path;
}

function guideSentence(s, n) {
  const p = st.project;
  const who = (s.chars || []).map(id => `${charNameEn(p, id)} is the ${colorName(colorOf(p, id))} figure`).join(", ");
  return `Image ${n} is only a grey-block blocking guide rendered from the exact camera position: follow it for camera angle, lens perspective, framing, and each character's position, size and facing${who ? ` (${who})` : ""}. Do not draw any mannequins, blocks, grid lines or arrows.`;
}

const autoPrompt = (s, kind) => buildPrompt(s, st.project, kind);

// ---------------- 範例對照（「_範例」專案，由 make_samples.mjs 產生） ----------------
const SAMPLE_P = "_範例";
const SAMPLE_GROUPS = [
  { axis: "z", title: "Z 景別（平視、右前 ¾、50mm）", items: Z.map(z => [z.id, `${z.id} ${z.zh}`]) },
  { axis: "y", title: "Y 俯仰（四分之三身景、右前 ¾）", items: Y.map(y => [y.id, `${y.id} ${y.zh}`]) },
  { axis: "x", title: "X 方位（四分之三身景、平視）", items: X.map(x => [x.id, `${x.id} ${x.zh}`]) },
  { axis: "f", title: "焦段（都框成腰部以上，看透視差異）", items: [14, 24, 50, 85, 135].map(mm => [String(mm), `${mm}mm`]) },
  { axis: "l", title: "鏡頭（50mm、同一構圖）", items: ["cooke_s4", "pana_c", "helios44", "zeiss_mp"].map(id => [id, LENSES.find(l => l.id === id).name]) },
  { axis: "b", title: "機身／底片（50mm、同一構圖）", items: [["arricam", "Arricam 35mm＋Vision3 500T（基準）"], ["alexa35", "ARRI Alexa 35（數位）"], ["bolex", "Bolex 16mm＋500T"], ["doublex", "35mm＋Double-X 黑白"]] },
];
const sampleUrl = path => `/files/${encodeURIComponent(SAMPLE_P)}/${path.split("/").map(encodeURIComponent).join("/")}`;
st.samples = {};  // "z:Z3" → {file, status, shot}
async function loadSamples() {
  try {
    const p = await api(`/api/project?p=${encodeURIComponent(SAMPLE_P)}`);
    if (!p) return;
    const g = await api(`/api/gens?p=${encodeURIComponent(SAMPLE_P)}`);
    const map = {};
    for (const s of p.shots) {
      const e = g[s.id], cur = e?.versions?.find(v => v.v === e.current && v.file);
      const last = e?.versions?.at(-1);
      for (const [axis, val] of s.sample || []) map[`${axis}:${val}`] = { file: cur?.file, status: cur ? "done" : last?.status || "none", shot: s.id };
    }
    st.samples = map;
    st.sampleTitle = [p.characters[0]?.name, p.scenes[0]?.name].filter(Boolean).join("・");
    const body = $("#sampleBody");  // 對照表開著就直接刷新內容
    if (body && $("#dlg").open) body.innerHTML = samplesHtml();
  } catch { /* 還沒有範例專案 */ }
}
loadSamples();
// 對照表開著時每 5 秒更新，平常 20 秒（給滑鼠停留的範例縮圖用）
let sampleTick = 0;
setInterval(() => { sampleTick++; if ($("#sampleBody") && $("#dlg").open || sampleTick % 4 === 0) loadSamples(); }, 5000);

// 滑鼠停在選項上：跳出範例縮圖
function sampleKeyOf(el) {
  const d = el.dataset;
  if (d.z) return `z:${d.z}`;
  if (d.y) return `y:${d.y}`;
  if (d.x) return `x:${d.x}`;
  if (d.focal) return `f:${d.focal}`;
  if (d.gear) { const g = gearOf(shot(), st.project); return d.gear === "lens" ? `l:${g.lens?.id}` : d.gear === "body" ? `b:${g.body?.id}` : null; }
  return null;
}
document.addEventListener("mouseover", e => {
  const el = e.target.closest?.("#editor [data-z], #editor [data-y], #editor [data-x], #editor [data-focal], #editor [data-gear]");
  const tip = $("#sampleTip");
  const smp = el && st.samples[sampleKeyOf(el)];
  if (!smp || !smp.file) { tip.hidden = true; return; }
  tip.innerHTML = `<img src="${sampleUrl(smp.file)}"><div>範例：${esc(sampleKeyOf(el).split(":")[1])}　（範例對照表看全部）</div>`;
  tip.hidden = false;
});
document.addEventListener("mousemove", e => {
  const tip = $("#sampleTip"); if (tip.hidden) return;
  const w = 340, x = e.clientX + 18 + w > innerWidth ? e.clientX - w - 18 : e.clientX + 18;
  tip.style.left = x + "px"; tip.style.top = Math.min(e.clientY + 18, innerHeight - 240) + "px";
});

function samplesHtml() {
  const s = shot();
  const card = ([val, label], axis) => {
    const smp = st.samples[`${axis}:${val}`];
    const ph = smp?.file ? `<img src="${sampleUrl(smp.file)}"><a class="sample-open" href="${sampleUrl(smp.file)}" target="_blank" title="開原圖">↗</a>`
      : `<div class="ph">${smp?.status === "running" ? '<span class="spin tiny"></span> 生成中' : smp?.status === "queued" ? "排隊中" : smp?.status === "failed" ? "生成失敗" : "尚未生成"}</div>`;
    const on = s && sampleSelected(s, axis, val);
    return `<figure class="sample ${on ? "on" : ""}" data-apply="${axis}:${esc(val)}" title="${s ? `套用到 ${esc(s.id)}` : ""}">${ph}<figcaption>${esc(label)}${on ? '　<span class="badge ok">目前</span>' : ""}</figcaption></figure>`;
  };
  const done = Object.values(st.samples).filter(x => x.file).length;
  return `<div class="muted">${s ? `點一張圖就把那個設定套用到 <b>${esc(s.id)}</b>，提示詞會跟著改；框起來的是 ${esc(s.id)} 目前的設定。` : "先選一顆分鏡，點圖就能套用設定。"}
    同一個角色、同一個場景，每組只改一個變數（已完成 ${done} 格）。右上角 ↗ 開原圖。重新產生：<code>node make_samples.mjs all</code></div>
    ${SAMPLE_GROUPS.map(g => `<h4>${esc(g.title)}</h4><div class="sample-grid">${g.items.map(it => card(it, g.axis)).join("")}</div>`).join("")}`;
}

// 範例格與分鏡設定的對應（機身組同時決定底片）
const SAMPLE_BODY = { arricam: { body: "arricam", stock: "v3_500t_push" }, alexa35: { body: "alexa35", stock: null },
  bolex: { body: "bolex", stock: "v3_500t" }, doublex: { body: "arricam", stock: "doublex" } };
function sampleSelected(s, axis, val) {
  const g = gearOf(s, st.project);
  if (axis === "z" || axis === "y" || axis === "x") return s[axis] === val;
  if (axis === "f") return g.focal === +val;
  if (axis === "l") return g.lens?.id === val;
  const b = SAMPLE_BODY[val];
  return b && g.body?.id === b.body && (g.stock?.id || null) === b.stock;
}
function applySample(axis, val) {
  const s = shot();
  if (!s) return toast("先選一顆分鏡");
  s.gear ??= {};
  if (axis === "z" || axis === "y" || axis === "x") s[axis] = val;
  else if (axis === "f") s.gear.focal = +val;
  else if (axis === "l") s.gear.lens = val;
  else if (axis === "b") for (const [k, v] of Object.entries(SAMPLE_BODY[val])) { if (v) s.gear[k] = v; else delete s.gear[k]; }
  save(); renderEditor(); renderStrip();
  const label = SAMPLE_GROUPS.find(g => g.axis === axis)?.items.find(([v]) => v === val)?.[1] || val;
  toast(`已套用「${label}」到 ${s.id}，提示詞已更新`);
}

function openSamples() {
  openDialog(`<h3>範例對照表${st.sampleTitle ? "：" + esc(st.sampleTitle) : ""}</h3><div id="sampleBody">${samplesHtml()}</div>
    <div class="dlg-actions"><button value="cancel" class="ghost">關閉</button></div>`, () => true);
}

// ---------------- 攝影設備 ----------------
function gearSelect(kind, list, value, defId, label) {
  const def = list.find(x => x.id === defId);
  return `<label class="gear-sel">${label}<select data-gear="${kind}">
    <option value="">${def ? `專案預設：${esc(def.name)}` : "不指定"}</option>
    ${list.map(x => `<option value="${x.id}" ${value === x.id ? "selected" : ""}>${esc(x.name)}${x.fmt ? `（${x.fmt}）` : x.type ? `（${x.type}）` : ""}</option>`).join("")}</select></label>`;
}
function gearHtml(s) {
  const p = st.project, g = s.gear || {}, d = p.gear || {}, eff = gearOf(s, p);
  return `<div class="field" style="margin-top:8px"><span>攝影設備（留「專案預設」就跟著專案設定走）</span>
    <span class="muted">實測：生圖模型對鏡頭品牌、數位機身、焦段的差異反應有限；黑白底片、變形鏡的橫向光斑比較明顯。滑鼠停在選項上可看範例。</span>
    <div class="row" style="gap:10px">${gearSelect("body", BODIES, g.body, d.body, "機身")}${gearSelect("lens", LENSES, g.lens, d.lens, "鏡頭")}
    ${eff.body?.film ? gearSelect("stock", STOCKS, g.stock, d.stock, "底片") : ""}</div>
    <div class="mod-group" style="margin-top:6px"><b>焦段</b><div class="chips">${FOCALS.map(f =>
      `<span class="chip ${g.focal === f.mm ? "on" : ""}" data-focal="${f.mm}">${f.mm}mm</span>`).join("")}</div></div></div>`;
}

// ---------------- 參考圖列：排除、額外、拖曳排序 ----------------
function renderRefs(s) {
  const list = refsOf(s, st.project, { all: true });
  let n = 0;
  $("#refs").innerHTML = list.map(r => {
    const num = r.excluded ? "已排除" : `圖片${++n}`;
    const extra = s.refs?.find(x => x.id === r.extraId);
    return `<div class="ref ${r.excluded ? "off" : ""}" draggable="true" data-refkey="${esc(r.key)}">
      <button class="ref-x" data-refx="${esc(r.key)}" title="${r.excluded ? "恢復" : r.kind === "extra" ? "移除這張額外參考圖" : "這顆鏡頭不送這張"}">${r.excluded ? "↺" : "✕"}</button>
      <img src="${fileUrl(r.path)}" data-zoom="${esc(r.path)}">
      <b>${num}</b><span>${r.kind === "extra" ? "額外" : esc(r.labelZh)}</span>
      ${extra ? `<input type="text" data-refnote="${esc(extra.id)}" value="${esc(extra.note || "")}" placeholder="用途，例：劍的造型">` : ""}</div>`;
  }).join("") + `<div class="ref ref-add" id="refAdd" title="加入參考圖">＋<span>加入</span></div>`;
}

function toggleRef(s, key) {
  const extra = (s.refs || []).find(x => x.id === key);
  if (extra) { s.refs = s.refs.filter(x => x !== extra); s.refOrder = (s.refOrder || []).filter(k => k !== key); }
  else {
    const ex = new Set(s.refExclude || []);
    ex.has(key) ? ex.delete(key) : ex.add(key);
    s.refExclude = [...ex];
  }
  save(); refreshDerived(); renderRefs(s);
}

async function addExtraRef(s, path, note = "") {
  s.refs ??= [];
  s.refs.push({ id: uid("r"), path, note });
  save(); refreshDerived(); renderRefs(s);
}

function openAddRef() {
  const s = shot(), p = st.project;
  const frames = p.shots.flatMap(x => {
    const g = st.gens[x.id];
    return (g?.versions || []).filter(v => v.file).reverse().map(v => ({ sid: x.id, v: v.v, file: v.file, cur: g.current === v.v }));
  });
  const pick = (attrs, path, cap) => `<div class="ref pick" ${attrs}><img src="${fileUrl(path)}"><span>${cap}</span></div>`;
  const form = openDialog(`<h3>加入參考圖到 ${esc(s.id)}</h3>
    <label class="field"><span>用途（會寫進提示詞，例：這把劍的造型、延續上一鏡的光線；之後也能在縮圖下改）</span><input type="text" name="note"></label>
    <div class="field"><span>上傳或拖曳新圖（存到專案 refs/，原檔不動）</span>
      <div class="drop" id="refDrop">拖曳圖片到這裡，或 <label class="btn small">選擇檔案<input type="file" accept="image/*" multiple hidden name="file"></label>
      　<button type="button" class="small ghost" data-act="path">貼本機路徑</button></div></div>
    <div class="field"><span>其他鏡頭的成圖（保持連戲）</span><div class="refs">${frames.map(f =>
      pick(`data-act="frame" data-path="${esc(f.file)}" data-sid="${esc(f.sid)}"`, f.file, `${f.sid} v${f.v}${f.cur ? " 現行" : ""}`)).join("") || '<span class="muted">還沒有成圖</span>'}</div></div>
    <div class="field"><span>專案的角色卡與場景</span><div class="refs">${[...p.characters.map(c => ({ path: c.image, cap: c.name, note: `${c.name_en || c.name} character reference` })),
      ...p.scenes.map(c => ({ path: c.image, cap: c.name, note: `${c.name_en || c.name} location reference` }))].map(a =>
      pick(`data-act="asset" data-path="${esc(a.path)}" data-note="${esc(a.note)}"`, a.path, esc(a.cap))).join("")}</div></div>
    <div class="dlg-actions"><button value="cancel" class="ghost">關閉</button></div>`,
  async (form, act, el) => {
    const note = form.elements.note.value.trim();
    if (act === "frame") {
      // 複製一份到 refs/，之後那一版被刪也不影響
      const { path } = await api(`/api/import_path?${q()}`, { method: "POST", body: JSON.stringify({ kind: "refs", rel: el.dataset.path }) });
      await addExtraRef(s, path, note || `previous shot ${el.dataset.sid}: keep lighting, costume details and continuity`);
    } else if (act === "asset") await addExtraRef(s, el.dataset.path, note || el.dataset.note);
    else if (act === "path") {
      const src = prompt("貼上本機圖片完整路徑（會複製一份進專案 refs/）："); if (!src) return false;
      const { path } = await api(`/api/import_path?${q()}`, { method: "POST", body: JSON.stringify({ kind: "refs", path: src }) }).catch(e => { toast(e.message); return {}; });
      if (!path) return false;
      await addExtraRef(s, path, note);
    } else return true;
    toast("已加入參考圖");
    return true;
  });
  const upload = async files => {
    const note = form.elements.note.value.trim();
    for (const f of files) {
      try {
        const { path } = await api(`/api/upload?${q()}&kind=refs&name=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
        await addExtraRef(s, path, note);
      } catch (e) { toast(`${f.name}：${e.message}`); }
    }
    toast("已加入參考圖"); $("#dlg").close();
  };
  form.elements.file.onchange = e => upload([...e.target.files]);
  const drop = $("#refDrop", form);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = e => { e.preventDefault(); upload([...e.dataTransfer.files]); };
}

// 拖曳排序
let dragKey = null;
document.addEventListener("dragstart", e => { const r = e.target.closest?.("[data-refkey]"); if (r) { dragKey = r.dataset.refkey; e.dataTransfer.effectAllowed = "move"; } });
document.addEventListener("dragover", e => { if (dragKey && e.target.closest?.("[data-refkey]")) e.preventDefault(); });
document.addEventListener("drop", e => {
  const r = e.target.closest?.("[data-refkey]");
  if (!dragKey || !r) return;
  e.preventDefault();
  const s = shot();
  const keys = refsOf(s, st.project, { all: true }).map(x => x.key).filter(k => k !== dragKey);
  keys.splice(keys.indexOf(r.dataset.refkey) + (e.offsetX > r.offsetWidth / 2 ? 1 : 0), 0, dragKey);
  s.refOrder = keys; dragKey = null;
  save(); refreshDerived(); renderRefs(s);
});
document.addEventListener("dragend", () => { dragKey = null; });
const currentText = (s, kind) => s.manual?.[kind]?.text ?? autoPrompt(s, kind).en;

// 文字輸入時只更新衍生區塊，不重畫整個編輯區（避免游標跳掉）
function refreshDerived() {
  const s = shot(); if (!s) return;
  const p = st.project;
  $("#codeLine").innerHTML = esc(codeLine(s, p) || "（尚未選鏡頭座標）")
    .replace(/(Z\d [^ +]+)/, '<span class="z">$1</span>').replace(/(Y\d [^ +]+)/, '<span class="y">$1</span>');
  const ws = checkShot(s, p);
  $("#warns").innerHTML = ws.map((w, i) => `<div class="w ${w.level}">${esc(w.msg)}${w.fix ? `<button class="small ghost" data-fix="${i}">${esc(w.fix.label)}</button>` : ""}${w.rewrite ? `<button class="small ghost" data-rewrite>依選項改寫</button>` : ""}</div>`).join("");
  $("#warns").onclick = e => {
    const b = e.target.closest("[data-fix]"); if (!b) return;
    Object.assign(s, ws[+b.dataset.fix].fix.patch);
    save(); renderEditor(); renderStrip();
  };
  const kind = st.tab;
  const auto = autoPrompt(s, kind);
  const man = s.manual?.[kind];
  const ta = $("#promptEn");
  if (document.activeElement !== ta) ta.value = man?.text ?? auto.en;
  $("#promptZh").value = auto.zh + (man ? "\n\n※ 英文提示詞已手改，中文對照仍是自動版內容。" : "");
  $("#manualBadge").innerHTML = man ? '<span class="badge">已手改</span>' : '<span class="badge dim">自動</span>';
  $("#staleNote").textContent = man && man.base !== auto.en ? "選項變了，自動版已更新；你的手改版沒有被覆蓋。要套用新選項請按「還原成自動版」或看差異後手動調整。" : "";
  if (!$("#refs").contains(document.activeElement)) renderRefs(s);
  $("#diffBox").innerHTML = st.showDiff && man ? `<div class="muted" style="margin-top:6px">差異（綠＝手改新增，紅＝自動版有但被刪掉）</div><div class="diff">${wordDiff(auto.en, man.text).map(d => d.t === "same" ? esc(d.s) : `<span class="${d.t}">${esc(d.s)}</span>`).join("")}</div>` : "";
  $("#genBtn").disabled = !s.z || !s.y;
  $("#genRow").hidden = kind === "mj";
  if (kind === "mj") { if (!$("#mjBox").contains(document.activeElement)) renderMj(s); } else $("#mjBox").innerHTML = "";
}

// ---------------- Midjourney（半自動：複製提示詞與參考圖，成圖拖回來） ----------------
function renderMj(s) {
  const roles = midjourneyRefs(s, st.project);
  const omni = roles.some(r => r.role === "omni");
  const box = $("#mjBox");
  box.innerHTML = `<div class="mj-box">
    <div class="muted">在 Midjourney 網頁：① 按上方「複製」，貼上提示詞　② 把下面的圖放到標示的位置（「複製圖片」後在 Midjourney 按 Ctrl+V，或「在資料夾顯示」後拖過去）　③ 生成後把成圖拖回下方。</div>
    <div class="mj-refs">${roles.map(r => `<div class="mj-ref"><img src="${fileUrl(r.path)}" data-zoom="${esc(r.path)}">
      <div><b>${esc(r.roleZh)}</b><br><span class="muted">${esc(r.labelZh)}</span><br>
      <button class="small ghost" data-mjcopy="${esc(r.path)}">複製圖片</button> <button class="small ghost" data-mjreveal="${esc(r.path)}">在資料夾顯示</button></div></div>`).join("") || '<span class="muted">沒有參考圖</span>'}</div>
    ${omni ? `<label class="mj-ow">Omni 權重 --ow <input type="range" id="mjOw" min="10" max="1000" step="10" value="${s.mjOw || 100}"> <b>${s.mjOw || 100}</b>
      <span class="muted">越高越像角色卡；太高連姿勢、構圖都會照抄角色卡</span></label>` : ""}
    ${(s.chars || []).length > 1 ? '<div class="w warn">Omni Reference 一次只能放一張，只鎖定主體；其他角色只能靠文字描述，外觀可能跑掉。</div>' : ""}
    <div class="drop" id="mjDrop">把 Midjourney 成圖拖到這裡（可直接從 Midjourney 網頁拖，或拖下載好的檔案），
      或 <label class="btn small">選擇檔案<input type="file" accept="image/*" hidden id="mjFile"></label></div></div>`;
  const drop = $("#mjDrop");
  drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = e => {
    e.preventDefault(); drop.classList.remove("over");
    const file = e.dataTransfer.files[0];
    const html = e.dataTransfer.getData("text/html");
    const url = e.dataTransfer.getData("text/uri-list").split("\n").find(l => l && !l.startsWith("#"))
      || html.match(/<img[^>]+src="([^"]+)"/i)?.[1] || e.dataTransfer.getData("text/plain");
    if (file) importMj(s, { file }); else if (url?.startsWith("http")) importMj(s, { url: url.trim() });
    else toast("沒有讀到圖片；請改用下載好的檔案拖進來");
  };
  $("#mjFile").onchange = e => { if (e.target.files[0]) importMj(s, { file: e.target.files[0] }); };
}

const fileToB64 = file => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = fail; r.readAsDataURL(file); });

async function importMj(s, { file, url }) {
  const p = st.project;
  const body = { shot_id: s.id, prompt: currentText(s, "mj"), code: codeLine(s, p) + "（Midjourney）", refs: refsOf(s, p).map(r => r.path), ratio: p.ratio, source: "midjourney" };
  try {
    if (file) body.image_b64 = await fileToB64(file); else body.url = url;
    toast("匯入中…");
    const { v } = await api(`/api/gens/import?${q()}`, { method: "POST", body: JSON.stringify(body) });
    st.justDone = `${s.id}:${v}`; st.scrollHero = true;
    await refreshGens(true);
    toast(`已匯入為 ${s.id} v${v}（Midjourney）`);
  } catch (e) { toast("匯入失敗：" + e.message); }
}

async function copyImage(path) {
  try {
    let blob = await (await fetch(fileUrl(path))).blob();
    if (blob.type !== "image/png") {  // 剪貼簿只收 png
      const bmp = await createImageBitmap(blob), c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0);
      blob = await new Promise(r => c.toBlob(r, "image/png"));
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast("已複製圖片，到 Midjourney 按 Ctrl+V 貼上");
  } catch (e) { toast("複製失敗：" + e.message); }
}

function onPromptInput(e) {
  const s = shot(), kind = st.tab;
  const auto = autoPrompt(s, kind).en;
  s.manual ??= {};
  if (e.target.value === auto) delete s.manual[kind];
  else s.manual[kind] = { text: e.target.value, base: auto };
  save(); refreshDerived();
}

// ---------------- 生成進度 ----------------
const jobOf = (sid, v) => st.queue.find(j => j.shot_id === sid && j.v === v);
const activeJobs = sid => st.queue.filter(j => j.shot_id === sid && (j.state === "queued" || j.state === "running"));
function startOf(job) {
  if (!job || job.state !== "running") return null;
  st.jobStart[job.id] ??= Date.now() - (job.elapsed || 0) * 1000;
  return st.jobStart[job.id];
}
const mmss = ms => { const t = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
function loadingHtml(sid, v, big) {
  const job = jobOf(sid, v.v);
  const running = v.status === "running";
  const ahead = job ? st.queueAll.filter(j => j.state === "running" || (j.state === "queued" && j.queued_order < job.queued_order)).length : 0;
  const start = startOf(job) || Date.now();
  return `<div class="loading ${big ? "big" : ""}"><div class="spin"></div>
    <div>${running ? `生成中 <span data-start="${start}">${mmss(Date.now() - start)}</span>${big ? "" : ` · ${job?.step || 1}/${job?.steps || 4}`}` : `排隊中${ahead ? `，前面還有 ${ahead} 張` : ""}`}</div>
    ${big ? `<div class="muted">${esc(v.code || "")}</div>
      ${running ? `<div class="steps">${Array.from({ length: job?.steps || 4 }, (_, i) => `<i class="${i + 1 < (job?.step || 1) ? "done" : i + 1 === (job?.step || 1) ? "now" : ""}"></i>`).join("")}</div>
      <div class="progress-line">第 ${job?.step || 1}／${job?.steps || 4} 步：${esc(job?.tail || "啟動 codex")}</div>` : `<div class="progress-line">等前面的完成後自動開始</div>`}
      <div class="muted">通常 1–2 分鐘，完成後會直接顯示在這裡</div>` : ""}</div>`;
}

function renderHero(s, g, vers) {
  const latest = vers[0];
  if (!latest) return "";
  if (latest.status === "queued" || latest.status === "running") return `<div class="hero">${loadingHtml(s.id, latest, true)}</div>`;
  const cur = g.versions.find(x => x.v === g.current && x.file);
  const fresh = st.justDone === `${s.id}:${latest.v}`;
  let html = "";
  if (latest.status === "failed") html += `<div class="w error">v${latest.v} 生成失敗。<button class="small ghost" data-v="${latest.v}">看紀錄</button></div>`;
  if (cur) html += `<figure class="hero ${fresh ? "fresh" : ""}" data-v="${cur.v}"><img src="${fileUrl(cur.file)}?t=${encodeURIComponent(cur.finished || "")}">
    <figcaption><b>v${cur.v}</b> 現行 ${reviewBadge(cur)} ${fresh ? '<span class="badge ok">剛完成</span>' : ""}<span class="muted">${esc(cur.finished || "")}　點圖可核可／退回／看提示詞</span></figcaption></figure>`;
  return html;
}

function renderVersions() {
  const s = shot(), box = $("#versions"); if (!s || !box) return;
  const g = st.gens[s.id];
  const vers = [...(g?.versions || [])].reverse();
  const busy = activeJobs(s.id).length;
  const gb = $("#genBtn");
  if (gb) gb.textContent = busy ? `再排一張…（${busy} 張進行中）` : "生成首幀…";
  // 最新一版還在排隊／生成時，上方大框已經顯示它的進度，縮圖列就不再重複
  const inHero = vers[0] && (vers[0].status === "queued" || vers[0].status === "running") ? vers[0].v : null;
  box.innerHTML = (g ? renderHero(s, g, vers) : "") + `<div class="ver-list">` + vers.filter(v => v.v !== inHero).map(v => {
    const ph = v.file ? `<img src="${fileUrl(v.file)}?t=${encodeURIComponent(v.finished || "")}">`
      : v.status === "failed" ? "生成失敗" : loadingHtml(s.id, v, false);
    const canDel = v.status === "done" || v.status === "failed";
    return `<div class="ver ${g.current === v.v ? "cur" : ""}" data-v="${v.v}">${canDel ? `<button class="ver-del" data-delv="${v.v}" title="刪除這一版">✕</button>` : ""}<div class="ph">${ph}</div>
      <div class="meta"><b>v${v.v}</b>${g.current === v.v ? '<span class="badge ok">現行</span>' : ""}${reviewBadge(v)}
      ${v.source === "midjourney" ? '<span class="badge dim">MJ</span>' : ""}${v.manual ? '<span class="badge dim">手改</span>' : ""}<span class="muted">${esc(v.finished || v.created || "")}</span></div></div>`;
  }).join("") + `</div>` + (vers.length ? "" : '<span class="muted">還沒生成過。</span>');
  const failed = vers.filter(v => v.status === "failed").map(v => v.v);
  const tools = $("#verTools");
  if (tools) tools.innerHTML = failed.length ? `<button class="small ghost" data-delfailed="${failed.join(",")}">清除失敗紀錄（${failed.length}）</button>` : "";
  if (st.scrollHero && st.justDone?.startsWith(s.id + ":")) { st.scrollHero = false; box.querySelector(".hero")?.scrollIntoView({ behavior: "smooth", block: "center" }); }
}

async function deleteVersions(sid, vs) {
  const { removed } = await api(`/api/gens/delete?${q()}`, { method: "POST", body: JSON.stringify({ shot_id: sid, vs }) });
  await refreshGens(true);
  toast(removed.length ? `已刪除 ${removed.map(v => "v" + v).join("、")}（檔案移到 frames/_deleted/）` : "沒有可刪除的版本");
}

function reviewBadge(v) {
  if (v.status === "failed") return '<span class="badge err">失敗</span>';
  if (v.status !== "done") return `<span class="badge dim">${v.status === "running" ? "生成中" : "排隊"}</span>`;
  return { approved: '<span class="badge ok">核可</span>', rejected: '<span class="badge err">退回</span>',
    check: '<span class="badge">需核對</span>' }[v.review] || '<span class="badge dim">待核</span>';
}

function openVersion(vn) {
  const s = shot(), g = st.gens[s.id], v = g.versions.find(x => x.v === vn);
  openDialog(`<h3>${esc(s.id)} v${v.v} ${reviewBadge(v)}</h3>
    ${v.file ? `<img class="big-img" src="${fileUrl(v.file)}">` : `<div class="muted">${v.status === "failed" ? "生成失敗，請看下方紀錄。" : "尚未完成。"}</div>`}
    ${v.flag === "fallback" ? '<div class="w warn">這張是從 codex 快取補抓的（log 有 fallback:），請確認真的是這顆分鏡的圖。</div>' : ""}
    <div class="muted">${esc(v.code || "")}　｜　${esc(v.created || "")} 送出　${v.manual ? "｜手改提示詞" : ""}</div>
    <div class="refs">${(v.refs || []).map((r, i) => `<div class="ref"><img src="${fileUrl(r)}">圖片${i + 1}</div>`).join("")}</div>
    <label class="field"><span>這一版用的提示詞</span><textarea class="prompt-en" readonly>${esc(v.prompt)}</textarea></label>
    <div id="logBox"></div>
    <div class="dlg-actions">
      <button type="button" class="ghost" data-act="log" style="margin-right:auto">看生成紀錄</button>
      ${v.status === "done" || v.status === "failed" ? `<button type="button" class="ghost" data-act="delete">刪除這一版</button>` : ""}
      <button type="button" class="ghost" data-act="edit">用這版提示詞再改</button>
      ${v.file ? `<button type="button" class="ghost" data-act="reject">退回</button>
      <button type="button" class="ghost" data-act="approve">核可</button>
      <button type="button" data-act="current">設為現行版</button>` : ""}
      <button value="cancel" class="ghost">關閉</button></div>`,
  async (form, act) => {
    const set = body => api(`/api/gens/set?${q()}`, { method: "POST", body: JSON.stringify({ shot_id: s.id, v: v.v, ...body }) });
    if (act === "log") {
      const { text } = await api(`/api/log?${q()}&path=${encodeURIComponent(v.log || "")}`).catch(() => ({ text: "（沒有紀錄）" }));
      $("#logBox", form).innerHTML = `<div class="diff">${esc(text || "（沒有紀錄）")}</div>`;
      return false;
    }
    if (act === "edit") {
      s.manual ??= {};
      const k = v.source === "midjourney" ? "mj" : "still";  // Midjourney 版本回到 Midjourney 分頁改
      s.manual[k] = { text: v.prompt, base: autoPrompt(s, k).en };
      st.tab = k; save(); renderEditor(); toast("已載入這版提示詞，可以修改後再生成");
      return true;
    }
    if (act === "delete") {
      if (!confirm(`刪除 ${s.id} v${v.v}？圖檔會移到 frames/_deleted/，不會真的刪掉。`)) return false;
      await deleteVersions(s.id, [v.v]);
      return true;
    }
    if (act === "approve") await set({ review: "approved" });
    if (act === "reject") await set({ review: "rejected" });
    if (act === "current") await set({ current: v.v });
    await refreshGens(true);
    return true;
  });
}

function openGenerate() {
  const s = shot(), p = st.project;
  const auto = autoPrompt(s, "still");
  const text = currentText(s, "still");
  const guideLine = guideSentence(s, auto.refs.length + 1);
  const form = openDialog(`<h3>確認後生成 ${esc(s.id)}</h3>
    <div class="code">${esc(codeLine(s, p))}</div>
    ${checkShot(s, p).filter(w => w.level === "error").map(w => `<div class="w error">${esc(w.msg)}</div>`).join("")}
    <div class="refs">${auto.refs.map((r, i) => `<div class="ref"><img src="${fileUrl(r.path)}">圖片${i + 1}<br>${esc(r.labelZh)}</div>`).join("") || '<span class="muted">沒有參考圖</span>'}</div>
    <label class="field"><span>送給 codex 的提示詞（可直接修改；改過會存成這顆鏡頭的手改版）</span>
      <textarea class="prompt-en" name="prompt" spellcheck="false">${esc(text)}</textarea></label>
    <label class="field"><span>中文對照</span><textarea class="prompt-zh" readonly>${esc(auto.zh)}</textarea></label>
    <label class="muted"><input type="checkbox" name="guide"> 附上 3D 構圖參考圖（送出時依目前站位與機位重新拍一張，放在最後一張參考圖）</label>
    <div class="row" style="align-items:center">
      <label>比例 <select name="ratio">${Object.entries(RATIO_ZH).map(([k, v]) => `<option value="${k}" ${p.ratio === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <span class="muted">排進佇列後依序生成，一次只跑一張。</span></div>
    <div class="dlg-actions"><button value="cancel" class="ghost">取消</button><button type="button" data-act="go">確認生成</button></div>`,
  async (form, act, btn) => {
    if (act !== "go") return true;
    btn.disabled = true;
    const prompt = form.elements.prompt.value.trim();
    const guide = form.elements.guide.checked;
    const own = prompt.replace("\n" + guideLine, "").replace(guideLine, "").trim();
    s.manual ??= {};
    if (own === auto.en) delete s.manual.still;
    else s.manual.still = { text: own, base: auto.en };
    save();
    try {
      const refs = auto.refs.map(r => r.path);
      if (guide) refs.push(await snapLayout(s));
      const { v } = await api(`/api/generate?${q()}`, { method: "POST", body: JSON.stringify({
        shot_id: s.id, prompt: guide && !prompt.includes(guideLine) ? prompt + "\n" + guideLine : prompt,
        prompt_zh: auto.zh + (guide ? "\n最後一張是 3D 構圖參考圖，只參考機位、站位、大小與面向，不畫出方塊。" : ""),
        code: codeLine(s, p), refs,
        ratio: form.elements.ratio.value, manual: own !== auto.en }) });
      toast(`${s.id} v${v} 已排入佇列`);
    } catch (e) { toast("送出失敗：" + e.message); btn.disabled = false; return false; }
    refreshDerived(); await refreshGens(true);
    return true;
  });
  form.elements.guide.onchange = e => {
    const ta = form.elements.prompt;
    if (e.target.checked && !ta.value.includes(guideLine)) ta.value = ta.value.trimEnd() + "\n" + guideLine;
    if (!e.target.checked) ta.value = ta.value.replace("\n" + guideLine, "").replace(guideLine, "");
  };
  form.elements.prompt.focus();
}

// ---------------- 下方分鏡列 ----------------
function renderStrip() {
  const p = st.project;
  if (!p) { $("#shotStrip").innerHTML = ""; $("#pairWarn").innerHTML = ""; return; }
  $("#shotStrip").innerHTML = p.shots.map(s => {
    const g = st.gens[s.id], v = g?.versions.find(x => x.v === g.current);
    const errs = checkShot(s, p).filter(w => w.level === "error").length;
    return `<div class="shot ${s.id === st.cur ? "on" : ""}" data-shot="${esc(s.id)}">
      <div class="th">${v?.file ? `<img src="${fileUrl(v.file)}">` : (s.z ? `${esc(s.z)}·${esc(s.y || "?")}` : "—")}${activeJobs(s.id).length ? '<div class="th-busy"><div class="spin"></div></div>' : ""}</div>
      <div class="id">${esc(s.id)} ${errs ? '<span class="badge err">!</span>' : ""} ${esc(s.title || "")}</div>
      <div class="cd">${esc(codeLine(s, p) || "未設定")}</div></div>`;
  }).join("") + `<div class="shot add" id="addShot" title="新增分鏡">＋</div>`;
  const pw = [];
  // 範例、參考用專案（「_」開頭）不是連續劇情，不檢查相鄰鏡頭
  const pairEnd = (p.name || st.P).startsWith("_") ? 0 : p.shots.length;
  for (let i = 1; i < pairEnd; i++) {
    const a = p.shots[i - 1], b = p.shots[i];
    const has3d = a.blocking && b.blocking && a.scene === b.scene && (a.chars || []).length >= 2;
    pw.push(...checkPair(a, b).filter(w => !(has3d && w.msg.includes("180"))));
    if (has3d) pw.push(...checkPair3d(p, a, b, aspect()));
  }
  const rows = pw.map(w => `<div class="w ${w.level}">${esc(w.msg)}</div>`);
  $("#pairWarn").innerHTML = rows.length > 3
    ? `<details><summary>相鄰鏡頭提醒 ${rows.length} 條（跳接、越軸）</summary><div class="pair-warn">${rows.join("")}</div></details>`
    : rows.join("");
}

function nextShotId() {
  const n = Math.max(0, ...st.project.shots.map(s => parseInt(s.id.replace(/\D/g, ""), 10) || 0)) + 1;
  return "S" + String(n).padStart(2, "0");
}

function addShot(from) {
  const prev = from || st.project.shots.at(-1);
  const s = from ? structuredClone(from) : {
    title: "", action: "", chars: prev ? [...(prev.chars || [])] : [], subject: prev?.subject || null,
    scene: prev?.scene || null, x: null, y: "Y4", z: null, r: "single", m: "static", mods: [] };
  s.id = nextShotId();
  delete s.manual;
  const idx = from ? st.project.shots.indexOf(from) + 1 : st.project.shots.length;
  st.project.shots.splice(idx, 0, s);
  st.cur = s.id; save(); renderEditor(); renderStrip();
}

// ---------------- 佇列輪詢 ----------------
async function refreshGens(force) {
  if (!st.P) return;
  try {
    const all = await api("/api/queue");
    all.forEach((j, i) => { j.queued_order = i; });
    const prev = st.prevStates || {};
    st.queueAll = all;
    st.queue = all.filter(j => j.project === st.P);
    st.prevStates = Object.fromEntries(st.queue.map(j => [j.id, j.state]));
    // 剛完成的工作：提示，並把結果顯示在畫面上
    for (const j of st.queue) {
      const was = prev[j.id];
      if (!was || was === j.state || !(j.state === "done" || j.state === "failed")) continue;
      if (j.state === "done") {
        st.justDone = `${j.shot_id}:${j.v}`;
        if (j.shot_id === st.cur) { st.scrollHero = true; toast(`${j.shot_id} v${j.v} 完成`); }
        else toast(`${j.shot_id} v${j.v} 完成，點下方分鏡列的 ${j.shot_id} 查看`);
      } else toast(`${j.shot_id} v${j.v} 生成失敗，點版本看紀錄`);
      force = true;
    }
    const active = st.queue.filter(j => j.state === "queued" || j.state === "running");
    const run = active.find(j => j.state === "running");
    $("#queueInfo").innerHTML = active.length ? `<span class="spin tiny"></span> 生成中：${run ? `${esc(run.shot_id)} v${run.v}（<span data-start="${startOf(run)}">${mmss(Date.now() - startOf(run))}</span>，${esc(run.tail || "")}）` : "—"}　等待 ${active.length - (run ? 1 : 0)}` : "";
    st.pollTick = (st.pollTick || 0) + 1;  // 每 10 秒也讀一次：別的分頁或程式匯入的版本也會出現
    if (force || st.queue.some(j => j.state === "queued" || j.state === "running") || st._hadQueue || st.pollTick % 5 === 0) {
      st.gens = await api(`/api/gens?${q()}`);
      renderVersions(); renderStrip();
    }
    st._hadQueue = st.queue.some(j => j.state === "queued" || j.state === "running");
  } catch { /* 後端重啟中 */ }
}
setInterval(refreshGens, 2000);

// 前端程式更新後提示重新整理（不自動重整，避免打斷正在輸入的內容）
let uiVersion = null;
async function checkUiVersion() {
  try {
    const { v } = await api("/api/version");
    if (uiVersion === null) uiVersion = v;
    else if (v !== uiVersion && !$("#updateBar")) {
      const bar = document.createElement("div");
      bar.id = "updateBar";
      bar.className = "update-bar";
      bar.innerHTML = `介面已更新，重新整理後才會套用。<button class="small" onclick="location.reload()">重新整理</button>`;
      document.body.prepend(bar);
    }
  } catch { /* 後端重啟中 */ }
}
checkUiVersion();
setInterval(checkUiVersion, 5000);
// 生成計時每秒更新
setInterval(() => { for (const el of document.querySelectorAll("[data-start]")) el.textContent = mmss(Date.now() - +el.dataset.start); }, 1000);

// ---------------- 匯出 ----------------
function exportMd() {
  const p = st.project; if (!p) return;
  const lines = [`# ${p.name} 分鏡表`, "", `比例：${RATIO_ZH[p.ratio]}`, ""];
  for (const s of p.shots) {
    const g = st.gens[s.id], v = g?.versions.find(x => x.v === g.current);
    lines.push(`## ${s.id} ${s.title || ""}`, "", `- 鏡頭：${codeLine(s, p)}`, `- 畫面：${s.action || ""}`,
      `- 參考圖：${refsOf(s, p).map((r, i) => `圖片${i + 1} ${r.labelZh}（${r.path}）`).join("；")}`,
      `- 現行首幀：${v?.file || "（未生成）"}`, "", "首幀提示詞：", "```", currentText(s, "still"), "```", "", "影片提示詞：", "```", currentText(s, "video"), "```", "");
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown" }));
  a.download = `${p.name}_分鏡表.md`; a.click();
}

async function copyShotList() {
  const p = st.project; if (!p) return;
  const text = p.shots.map((s, i) => `分鏡${i + 1}　${codeLine(s, p)}${s.action ? `　｜${s.action}` : ""}`).join("\n");
  await navigator.clipboard.writeText(text);
  toast("已複製分鏡清單");
}

function projectSettings() {
  const p = st.project; if (!p) return;
  openDialog(`<h3>專案設定：${esc(p.name)}</h3>
    <label class="field"><span>畫幅</span><select name="ratio">${Object.entries(RATIO_ZH).map(([k, v]) => `<option value="${k}" ${p.ratio === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <div class="field"><span>攝影設備預設（每顆分鏡可以個別覆蓋）</span><div class="row" style="gap:10px">
      ${[["body", BODIES, "機身"], ["lens", LENSES, "鏡頭"], ["stock", STOCKS, "底片（底片機身才會用到）"]].map(([k, list, label]) =>
        `<label class="gear-sel">${label}<select name="gear_${k}"><option value="">不指定</option>${list.map(x =>
          `<option value="${x.id}" ${p.gear?.[k] === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>`).join("")}</div></div>
    <label class="field"><span>質感（每顆提示詞都會附上；底片顆粒、光暈等已由底片型號負責，這裡寫其他共通要求）</span><textarea name="look" rows="4">${esc(p.look)}</textarea></label>
    <label class="field"><span>規則與禁止事項（每顆都附上）</span><textarea name="rules" rows="4">${esc(p.rules)}</textarea></label>
    <div class="dlg-actions"><button value="cancel" class="ghost">取消</button><button type="button" data-act="ok">儲存</button></div>`,
  (form, act) => {
    if (act === "ok") {
      for (const k of ["ratio", "look", "rules"]) p[k] = form.elements[k].value;
      p.gear = Object.fromEntries(["body", "lens", "stock"].map(k => [k, form.elements["gear_" + k].value]).filter(([, v]) => v));
      save(); renderEditor(); renderStrip();
    }
    return true;
  });
}

// ---------------- 事件 ----------------
function renderAll() { renderAssets(); renderEditor(); renderStrip(); }

document.addEventListener("click", e => {
  const t = e.target;
  const zoom = t.closest("[data-zoom]");
  if (zoom && !t.closest("dialog")) { openDialog(`<img class="big-img" src="${fileUrl(zoom.dataset.zoom)}"><div class="dlg-actions"><button value="cancel" class="ghost">關閉</button></div>`, () => true); return; }
  const asset = t.closest(".asset [data-edit]");
  if (asset) { const a = asset.closest(".asset"); editAsset(a.dataset.kind, a.dataset.id); return; }
  const imp = t.closest("[data-import]");
  if (imp) {
    const path = prompt("貼上本機圖片完整路徑（會複製一份進專案，原檔不動）：");
    if (path) api(`/api/import_path?${q()}`, { method: "POST", body: JSON.stringify({ kind: imp.dataset.import, path }) })
      .then(({ path: rel }) => addAsset(imp.dataset.import, rel, rel.split("/").pop())).catch(err => toast(err.message));
    return;
  }
  if (t.closest("#inspector [data-ins]") && t.tagName === "BUTTON") { onInspector(e); return; }
  const sh = t.closest("[data-shot]");
  if (sh) { st.cur = sh.dataset.shot; st.showDiff = false; renderEditor(); renderStrip(); return; }
  if (t.closest("#addShot")) { if (!st.P) return toast("請先建立專案"); addShot(); return; }

  if (!t.closest("#editor")) return;
  const s = shot(); if (!s) return;
  if (t.closest("[data-rewrite]") || t.id === "rewriteBtn" || t.id === "rewriteAgain") { if (st.rewrite?.state !== "busy") rewriteAction(); return; }
  if (t.id === "rewriteCancel") { st.rewrite = null; renderRewrite(); return; }
  if (t.id === "rewriteApply") {
    s.action = $("#rewriteText").value.trim();
    $("#fAction").value = s.action;
    st.rewrite = null;
    save(); refreshDerived(); renderStrip(); renderRewrite();
    toast("已套用改寫");
    return;
  }
  const mc = t.closest("[data-mjcopy]");
  if (mc) { copyImage(mc.dataset.mjcopy); return; }
  const mr = t.closest("[data-mjreveal]");
  if (mr) { api(`/api/reveal?${q()}`, { method: "POST", body: JSON.stringify({ path: mr.dataset.mjreveal }) }).catch(err => toast(err.message)); return; }
  const rx = t.closest("[data-refx]");
  if (rx) { toggleRef(s, rx.dataset.refx); return; }
  if (t.closest("#refAdd")) { openAddRef(); return; }
  const del = t.closest("[data-delv]");
  if (del) {
    if (confirm(`刪除 ${s.id} v${del.dataset.delv}？圖檔會移到 frames/_deleted/，不會真的刪掉。`)) deleteVersions(s.id, [+del.dataset.delv]).catch(err => toast(err.message));
    return;
  }
  const df = t.closest("[data-delfailed]");
  if (df) { deleteVersions(s.id, df.dataset.delfailed.split(",").map(Number)).catch(err => toast(err.message)); return; }
  const d = (t.closest("[data-char],[data-subject],[data-scene],[data-x],[data-y],[data-z],[data-r],[data-m],[data-mod],[data-focal],[data-tab],[data-v],[data-view],[data-smode]") || {}).dataset;
  let changed = true;
  if (d?.char !== undefined) {
    s.chars = s.chars?.includes(d.char) ? s.chars.filter(c => c !== d.char) : [...(s.chars || []), d.char];
    if (!s.chars.includes(s.subject)) s.subject = s.chars[0] || null;
  } else if (d?.subject !== undefined) s.subject = d.subject;
  else if (d?.scene !== undefined) s.scene = d.scene || null;
  else if (d?.x !== undefined) s.x = d.x || null;
  else if (d?.y !== undefined) s.y = d.y;
  else if (d?.z !== undefined) s.z = d.z;
  else if (d?.r !== undefined) s.r = d.r;
  else if (d?.m !== undefined) s.m = d.m;
  else if (d?.focal !== undefined) { s.gear ??= {}; s.gear.focal = s.gear.focal === +d.focal ? null : +d.focal; }
  else if (d?.mod !== undefined) s.mods = s.mods?.includes(d.mod) ? s.mods.filter(m => m !== d.mod) : [...(s.mods || []), d.mod];
  else if (d?.tab !== undefined) { st.tab = d.tab; renderEditor(); return; }
  else if (d?.view !== undefined) { st.view = d.view; localSet("studio.view", d.view); renderEditor(); return; }
  else if (d?.smode !== undefined) { st.stage.selected = null; st.stage.setMode(d.smode); renderEditor(); return; }
  else if (d?.v !== undefined) { openVersion(+d.v); return; }
  else changed = false;
  if (changed) { save(); renderEditor(); renderStrip(); return; }

  const id = t.id;
  if (id === "genBtn") openGenerate();
  else if (id === "copyPrompt") navigator.clipboard.writeText($("#promptEn").value).then(() => toast("已複製"));
  else if (id === "resetPrompt") { if (s.manual?.[st.tab]) { delete s.manual[st.tab]; save(); refreshDerived(); toast("已還原成自動版"); } }
  else if (id === "toggleDiff") { st.showDiff = !st.showDiff; refreshDerived(); }
  else if (id === "dup") addShot(s);
  else if (id === "addBlock") {
    const sc = st.project.scenes.find(x => x.id === s.scene);
    if (!sc) return toast("先綁定場景，佈景方塊存在場景裡");
    sc.set ??= [];
    const blk = { id: uid("b"), pos: [0, -3], size: [3, 0.6, 2.4], rot: 0 };
    sc.set.push(blk);
    if (st.stage.mode !== "director") st.stage.setMode("director");
    st.stage.selected = { type: "block", id: blk.id };
    save(); renderEditor();
  } else if (id === "snapBtn") snapLayout(s).then(() => { renderEditor(); toast("已存構圖截圖"); }).catch(err => toast(err.message));
  else if (id === "del") {
    if (!confirm(`刪除 ${s.id}？已生成的圖檔會保留在 frames/。`)) return;
    const i = st.project.shots.indexOf(s); st.project.shots.splice(i, 1);
    st.cur = st.project.shots[Math.max(0, i - 1)]?.id || null; save(); renderEditor(); renderStrip();
  } else if (id === "mvL" || id === "mvR") {
    const arr = st.project.shots, i = arr.indexOf(s), j = i + (id === "mvL" ? -1 : 1);
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]]; save(); renderStrip();
  }
});

document.addEventListener("input", e => {
  const s = shot();
  if (e.target.id === "fTitle") { s.title = e.target.value; save(); renderStrip(); }
  else if (e.target.id === "fAction") { s.action = e.target.value; save(); refreshDerived(); renderStrip(); }
  else if (e.target.id === "promptEn") onPromptInput(e);
  else if (e.target.id === "mjOw") { s.mjOw = +e.target.value; e.target.nextElementSibling.textContent = e.target.value; save(); refreshDerived(); }
  else if (e.target.dataset?.refnote) {
    const r = (s.refs || []).find(x => x.id === e.target.dataset.refnote);
    if (r) { r.note = e.target.value; save(); refreshDerived(); }
  }
  else if (e.target.closest("#inspector") && e.target.tagName === "INPUT") onInspector(e);
});

document.addEventListener("change", e => {
  if (e.target.dataset?.gear && e.target.closest("#editor")) {
    const s = shot(); s.gear ??= {};
    if (e.target.value) s.gear[e.target.dataset.gear] = e.target.value; else delete s.gear[e.target.dataset.gear];
    save(); renderEditor(); renderStrip(); return;
  }
  if (e.target.id === "showAll") { st.stage.showAll = e.target.checked; st.stage.rebuild(); return; }
  if (e.target.closest("#inspector") && e.target.tagName === "SELECT") { onInspector(e); return; }
  const kind = e.target.dataset?.upload;
  if (kind) { addFiles(kind, [...e.target.files]); e.target.value = ""; }
});

for (const zone of document.querySelectorAll("[data-drop]")) {
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", e => { e.preventDefault(); zone.classList.remove("over"); addFiles(zone.dataset.drop, [...e.dataTransfer.files]); });
}

$("#projectSel").onchange = e => loadProject(e.target.value);
$("#newProject").onclick = async () => {
  const name = prompt("專案名稱："); if (!name) return;
  const r = await api("/api/projects", { method: "POST", body: JSON.stringify({ name }) });
  await loadProjects(r.name);
};
$("#projectSettings").onclick = projectSettings;
$("#sampleBtn").onclick = async () => { await loadSamples(); openSamples(); };
// 範例格點一下就套用（↗ 開原圖除外）
$("#dlg").addEventListener("click", e => {
  if (e.target.closest(".sample-open")) return;
  const card = e.target.closest("[data-apply]");
  if (!card) return;
  const [axis, ...rest] = card.dataset.apply.split(":");
  applySample(axis, rest.join(":"));
  $("#dlg").close();
});

// 角色卡／場景面板
const assetPanel = $("#assetPanel");
const setAssetPanel = open => { assetPanel.hidden = !open; $("#assetToggle").classList.toggle("on", open); };
$("#assetToggle").onclick = e => { e.stopPropagation(); setAssetPanel(assetPanel.hidden); };
document.addEventListener("click", e => {
  // 點面板外面收起；面板開出來的編輯視窗、放大圖不算外面
  if (!assetPanel.hidden && !assetPanel.contains(e.target) && !e.target.closest("dialog") && e.target.id !== "assetToggle") setAssetPanel(false);
}, true);
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#dlg").open) setAssetPanel(false); });
$("#exportMd").onclick = exportMd;
$("#exportList").onclick = copyShotList;

loadProjects();
