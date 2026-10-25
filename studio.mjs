// 分鏡設計台指令工具：用指令建立專案、匯入分鏡計畫、檢查、送生成。
// 提示詞與規則檢查直接用網頁同一份 static/camera.js，結果和網頁一致。需要分鏡設計台正在執行。
//
//   node studio.mjs new <專案> [--ratio youtube|reel|square] [--lang zh|en]
//   node studio.mjs import <計畫檔.json> [--replace] [--dry-run]
//   node studio.mjs list <專案>
//   node studio.mjs export <專案> [輸出檔.json]        把專案輸出成計畫檔格式（可改完再 import --replace）
//   node studio.mjs gen <專案> <S01,S02|all> [--missing] [--yes]   沒加 --yes 只列出、不送出
//   node studio.mjs status
//
// 計畫檔格式見 examples/plan_example.json 與 README「指令工具」。
import fs from "node:fs";
import path from "node:path";
import { X, Y, Z, R, M, MODS, BODIES, LENSES, STOCKS, FOCALS, EN_LOOK, EN_RULES, ZH_LOOK, ZH_RULES,
  buildPrompt, refsOf, codeLine, checkShot, checkPair } from "./static/camera.js";

try { process.loadEnvFile(new URL(".env", import.meta.url)); } catch { /* 沒有 .env */ }
const API = `http://127.0.0.1:${process.env.STUDIO_PORT || 8790}`;
const RATIOS = ["youtube", "reel", "square"];

// ---------------- 共用 ----------------
async function api(p, body) {
  let r;
  try {
    r = await fetch(API + p, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
  } catch {
    throw new Error(`連不到分鏡設計台（${API}），請先啟動服務（start.bat 或 python run.py）`);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.error) { const e = new Error(data?.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return data;
}
const qp = name => `p=${encodeURIComponent(name)}`;
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const flags = new Set(process.argv.filter(a => a.startsWith("--")));
const opt = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const args = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !(i > 0 && ["--ratio", "--lang"].includes(all[i - 1])));

async function loadProject(name) {
  const p = await api(`/api/project?${qp(name)}`);
  if (!p) throw new Error(`找不到專案「${name}」`);
  p.characters ??= []; p.scenes ??= []; p.shots ??= [];
  return p;
}
// 存檔：版本號對不上（網頁或別的程式剛改過）就停下來，不覆蓋
async function saveProject(name, p) {
  try {
    const { rev } = await api(`/api/project?${qp(name)}`, p);
    p._rev = rev;
  } catch (e) {
    if (e.message === "conflict") throw new Error(`專案「${name}」剛被其他地方修改（例如網頁），為了不覆蓋已停止；請再執行一次`);
    throw e;
  }
}
function setLang(p, lang) {
  if (!lang) return;
  if (!["zh", "en"].includes(lang)) throw new Error(`--lang 只能是 zh 或 en：${lang}`);
  if (lang === "zh") { if ((p.look || "").trim() === EN_LOOK) p.look = ZH_LOOK; if ((p.rules || "").trim() === EN_RULES) p.rules = ZH_RULES; }
  else { if ((p.look || "").trim() === ZH_LOOK) p.look = EN_LOOK; if ((p.rules || "").trim() === ZH_RULES) p.rules = EN_RULES; }
  p.lang = lang;
}

// 名稱或代號都接受（例如修飾寫「逆光剪影」或 "backlit"；鏡頭寫 "Cooke S4/i" 或 "cooke_s4"）
const norm = v => String(v ?? "").trim().toLowerCase();
const findBy = (list, v, keys) => list.find(x => keys.some(k => norm(x[k]) === norm(v)));
const MOD_LIST = MODS.flatMap(g => g.items);

// ---------------- 指令 ----------------
async function cmdNew([name]) {
  if (!name) throw new Error("用法：node studio.mjs new <專案> [--ratio youtube] [--lang zh]");
  const { name: real } = await api("/api/projects", { name });
  const p = await loadProject(real);
  const ratio = opt("--ratio");
  if (ratio) { if (!RATIOS.includes(ratio)) throw new Error(`--ratio 只能是 ${RATIOS.join("／")}`); p.ratio = ratio; }
  setLang(p, opt("--lang"));
  await saveProject(real, p);
  console.log(`已建立專案「${real}」（${p.ratio}，提示詞${p.lang === "zh" ? "中文" : "英文"}）`);
}

async function cmdImport([file]) {
  if (!file) throw new Error("用法：node studio.mjs import <計畫檔.json> [--replace] [--dry-run]");
  const planPath = path.resolve(file);
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const baseDir = path.dirname(planPath);
  const name = plan.project;
  if (!name) throw new Error("計畫檔缺少 project（專案名稱）");
  const errors = [], notes = [];
  const imgPath = v => (v ? path.resolve(baseDir, v) : null);

  // 先全部檢查，有錯就整份不匯入
  for (const [i, c] of (plan.characters || []).entries()) {
    if (!c.name) errors.push(`角色 #${i + 1} 缺少 name`);
    if (c.image && !fs.existsSync(imgPath(c.image))) errors.push(`角色「${c.name}」的圖片不存在：${imgPath(c.image)}`);
  }
  for (const [i, sc] of (plan.scenes || []).entries()) {
    if (!sc.name) errors.push(`場景 #${i + 1} 缺少 name`);
    if (sc.image && !fs.existsSync(imgPath(sc.image))) errors.push(`場景「${sc.name}」的圖片不存在：${imgPath(sc.image)}`);
  }
  if (plan.ratio && !RATIOS.includes(plan.ratio)) errors.push(`ratio 只能是 ${RATIOS.join("／")}`);
  if (plan.lang && !["zh", "en"].includes(plan.lang)) errors.push("lang 只能是 zh 或 en");

  // 用現有專案＋計畫裡的角色、場景名單來檢查分鏡（還沒建立的先用暫時代號）
  let existing = null;
  try { existing = await loadProject(name); } catch (e) { if (!String(e.message).startsWith("找不到專案")) throw e; }
  const charNames = new Set([...(existing?.characters || []).map(c => c.name), ...(plan.characters || []).map(c => c.name)]);
  const sceneNames = new Set([...(existing?.scenes || []).map(s => s.name), ...(plan.scenes || []).map(s => s.name)]);

  const shotsIn = (plan.shots || []).map((sh, i) => {
    const tag = `分鏡 #${i + 1}${sh.title ? `「${sh.title}」` : ""}`;
    const chk = (val, list, label, keys = ["id", "zh"]) => {
      if (val === undefined || val === null || val === "") return null;
      const hit = findBy(list, val, keys);
      if (!hit) errors.push(`${tag}：${label}「${val}」不存在（可用：${list.map(x => x.id).join("、")}）`);
      return hit?.id ?? null;
    };
    const out = { title: sh.title || "", action: sh.action || "" };
    out.z = chk(sh.z, Z, "景別 z"); out.y = chk(sh.y, Y, "俯仰 y"); out.x = chk(sh.x, X, "方位 x");
    if (!out.z) errors.push(`${tag}：缺少景別 z`);
    if (!out.y) errors.push(`${tag}：缺少俯仰 y`);
    out.r = chk(sh.r || "single", R, "人物關係 r") || "single";
    out.m = chk(sh.m || "static", M, "運鏡 m") || "static";
    out.mods = (sh.mods || []).map(m => chk(m, MOD_LIST, "修飾")).filter(Boolean);
    out.chars = (sh.chars || []).map(n => { if (!charNames.has(n)) errors.push(`${tag}：角色「${n}」不在角色清單`); return n; });
    out.subject = sh.subject || out.chars[0] || null;
    if (out.subject && !out.chars.includes(out.subject)) errors.push(`${tag}：主體「${out.subject}」沒有勾為出場角色`);
    out.scene = sh.scene || null;
    if (out.scene && !sceneNames.has(out.scene)) errors.push(`${tag}：場景「${out.scene}」不在場景清單`);
    const gear = {};
    if (sh.focal !== undefined) { if (!FOCALS.some(f => f.mm === +sh.focal)) errors.push(`${tag}：焦段 ${sh.focal} 不在 ${FOCALS.map(f => f.mm).join("／")}`); else gear.focal = +sh.focal; }
    if (sh.lens) { const l = findBy(LENSES, sh.lens, ["id", "name"]); l ? (gear.lens = l.id) : errors.push(`${tag}：鏡頭「${sh.lens}」不存在`); }
    if (sh.body) { const b = findBy(BODIES, sh.body, ["id", "name"]); b ? (gear.body = b.id) : errors.push(`${tag}：機身「${sh.body}」不存在`); }
    if (sh.stock) { const st = findBy(STOCKS, sh.stock, ["id", "name"]); st ? (gear.stock = st.id) : errors.push(`${tag}：底片「${sh.stock}」不存在`); }
    if (Object.keys(gear).length) out.gear = gear;
    if (sh.id) out.id = String(sh.id);
    return out;
  });
  const gearDefault = {};
  for (const [k, list] of [["body", BODIES], ["lens", LENSES], ["stock", STOCKS]]) {
    if (plan.gear?.[k]) { const hit = findBy(list, plan.gear[k], ["id", "name"]); hit ? (gearDefault[k] = hit.id) : errors.push(`專案設備 ${k}「${plan.gear[k]}」不存在`); }
  }

  if (errors.length) {
    console.error(`計畫檔有 ${errors.length} 個問題，沒有匯入任何東西：`);
    for (const e of errors) console.error("  ・" + e);
    process.exit(1);
  }
  if (flags.has("--dry-run")) { console.log(`檢查通過：${plan.characters?.length || 0} 個角色、${plan.scenes?.length || 0} 個場景、${shotsIn.length} 顆分鏡（--dry-run，沒有匯入）`); return; }

  // 建立／更新
  if (!existing) { await api("/api/projects", { name }); notes.push(`建立專案「${name}」`); }
  const p = await loadProject(name);
  if (plan.ratio) p.ratio = plan.ratio;
  setLang(p, plan.lang);
  if (Object.keys(gearDefault).length) p.gear = { ...(p.gear || {}), ...gearDefault };
  if (plan.look) p.look = plan.look;
  if (plan.rules) p.rules = plan.rules;

  const upsert = async (kind, list, item, fields) => {
    let cur = list.find(x => x.name === item.name);
    if (!cur) { cur = { id: uid(kind === "characters" ? "c" : "s"), name: item.name }; list.push(cur); notes.push(`新增${kind === "characters" ? "角色" : "場景"}「${item.name}」`); }
    for (const k of fields) if (item[k] !== undefined) cur[k] = item[k];
    if (item.image) {
      const src = imgPath(item.image);
      if (cur.src !== src || !cur.image) {  // 同一張來源圖不重複複製
        const { path: rel } = await api(`/api/import_path?${qp(name)}`, { kind, path: src });
        cur.image = rel; cur.src = src;
      }
    }
    return cur;
  };
  for (const c of plan.characters || []) await upsert("characters", p.characters, c, ["name_en", "lock", "outfit", "height", "color"]);
  for (const sc of plan.scenes || []) await upsert("scenes", p.scenes, sc, ["name_en", "desc"]);

  const charId = n => p.characters.find(c => c.name === n)?.id;
  const sceneId = n => p.scenes.find(s => s.name === n)?.id;
  // 分鏡代號：接在用過的最大號碼後面（含已刪除、生成紀錄裡的），避免和舊版本的圖混在一起
  const gens = await api(`/api/gens?${qp(name)}`);
  let maxNo = Math.max(0, ...[...p.shots.map(s => s.id), ...Object.keys(gens)].map(id => parseInt(String(id).replace(/\D/g, ""), 10) || 0));
  if (flags.has("--replace")) { notes.push(`取代原本的 ${p.shots.length} 顆分鏡`); p.shots = []; }
  let added = 0, updated = 0;
  for (const sh of shotsIn) {
    const data = { ...sh, chars: sh.chars.map(charId), subject: sh.subject ? charId(sh.subject) : null, scene: sh.scene ? sceneId(sh.scene) : null };
    const old = data.id && p.shots.find(s => s.id === data.id);
    if (old) { Object.assign(old, data); updated++; }
    else { data.id ??= "S" + String(++maxNo).padStart(2, "0"); p.shots.push(data); added++; }
  }
  await saveProject(name, p);
  for (const n of notes) console.log("・" + n);
  console.log(`匯入完成：新增 ${added} 顆、更新 ${updated} 顆分鏡。網頁開著這個專案的話，10 秒內會自動重新載入。`);
  printList(p, gens);
}

function printList(p, gens) {
  console.log(`\n專案「${p.name}」：${p.shots.length} 顆分鏡（${p.ratio}，提示詞${p.lang === "zh" ? "中文" : "英文"}）`);
  for (const [i, s] of p.shots.entries()) {
    const g = gens?.[s.id], v = g?.versions?.find(x => x.v === g.current);
    const ws = checkShot(s, p).filter(w => w.level !== "info");
    console.log(`${s.id.padEnd(5)} ${v?.file ? "■" : "□"} ${(s.title || "").padEnd(10)} ${codeLine(s, p)}`);
    if (s.action) console.log(`        畫面：${s.action}`);
    for (const w of ws) console.log(`        ${w.level === "error" ? "✖" : "⚠"} ${w.msg}`);
    if (i > 0) for (const w of checkPair(p.shots[i - 1], s)) console.log(`        ↔ ${w.msg}`);
  }
  console.log("\n■ 已有首幀　□ 尚未生成");
}

async function cmdList([name]) {
  if (!name) throw new Error("用法：node studio.mjs list <專案>");
  const p = await loadProject(name);
  printList(p, await api(`/api/gens?${qp(name)}`));
}

async function cmdExport([name, out]) {
  if (!name) throw new Error("用法：node studio.mjs export <專案> [輸出檔.json]");
  const p = await loadProject(name);
  const cName = id => p.characters.find(c => c.id === id)?.name;
  const plan = {
    project: p.name || name, ratio: p.ratio, lang: p.lang || "en", gear: p.gear,
    characters: p.characters.map(c => ({ name: c.name, name_en: c.name_en, image: c.src || undefined, lock: c.lock, outfit: c.outfit })),
    scenes: p.scenes.map(s => ({ name: s.name, name_en: s.name_en, image: s.src || undefined, desc: s.desc })),
    shots: p.shots.map(s => ({ id: s.id, title: s.title, chars: (s.chars || []).map(cName), subject: cName(s.subject), scene: p.scenes.find(x => x.id === s.scene)?.name,
      z: s.z, y: s.y, x: s.x || undefined, r: s.r, m: s.m, mods: s.mods?.length ? s.mods : undefined, ...(s.gear || {}), action: s.action })),
  };
  const text = JSON.stringify(plan, null, 2);
  if (out) { fs.writeFileSync(out, text, "utf8"); console.log(`已輸出 ${out}`); } else console.log(text);
}

async function cmdGen([name, which]) {
  if (!name || !which) throw new Error("用法：node studio.mjs gen <專案> <S01,S02|all> [--missing] [--yes]");
  const p = await loadProject(name);
  const gens = await api(`/api/gens?${qp(name)}`);
  const ids = which === "all" ? p.shots.map(s => s.id) : which.split(",").map(s => s.trim());
  const targets = [], skipped = [];
  for (const id of ids) {
    const s = p.shots.find(x => x.id === id);
    if (!s) { skipped.push(`${id}（不存在）`); continue; }
    const vs = gens[id]?.versions || [];
    if (vs.some(v => v.status === "queued" || v.status === "running")) { skipped.push(`${id}（已在生成）`); continue; }
    if (flags.has("--missing") && vs.some(v => v.status === "done")) { skipped.push(`${id}（已有圖）`); continue; }
    if (!s.z || !s.y) { skipped.push(`${id}（缺景別或俯仰）`); continue; }
    if (checkShot(s, p).some(w => w.level === "error")) { skipped.push(`${id}（有紅色錯誤，先修正）`); continue; }
    targets.push(s);
  }
  if (skipped.length) console.log("略過：" + skipped.join("、"));
  if (!targets.length) { console.log("沒有要生成的分鏡。"); return; }
  const mins = [Math.round(targets.length * 1), Math.round(targets.length * 1.5)];
  if (!flags.has("--yes")) {
    console.log(`將會生成 ${targets.length} 張（約 ${mins[0]}–${mins[1]} 分鐘，會用到 ChatGPT 訂閱額度）：`);
    for (const s of targets) console.log(`  ${s.id}  ${codeLine(s, p)}`);
    console.log("確認要生成，請加上 --yes 再執行一次。");
    return;
  }
  for (const s of targets) {
    const auto = buildPrompt(s, p, "still");
    const prompt = s.manual?.still?.text ?? auto.en;  // 網頁上手改過的提示詞優先
    await api(`/api/generate?${qp(name)}`, { shot_id: s.id, prompt, prompt_zh: auto.zh, code: codeLine(s, p), refs: refsOf(s, p).map(r => r.path), ratio: p.ratio, manual: !!s.manual?.still });
    console.log(`排入 ${s.id}　${codeLine(s, p)}`);
  }
  console.log(`共排入 ${targets.length} 張，依序生成，約 ${mins[0]}–${mins[1]} 分鐘。進度：node studio.mjs status`);
}

async function cmdStatus() {
  const q = await api("/api/queue");
  const run = q.filter(j => j.state === "running"), wait = q.filter(j => j.state === "queued");
  if (!run.length && !wait.length) { console.log("佇列是空的。"); return; }
  for (const j of run) console.log(`生成中：${j.project} ${j.shot_id} v${j.v}（${j.elapsed}s，第 ${j.step}/${j.steps} 步：${j.tail}）`);
  console.log(`排隊：${wait.length} 張${wait.length ? "（" + wait.map(j => `${j.project}/${j.shot_id}`).join("、") + "）" : ""}`);
}

const cmds = { new: cmdNew, import: cmdImport, list: cmdList, export: cmdExport, gen: cmdGen, status: cmdStatus };
const [cmd, ...rest] = args;
if (!cmds[cmd]) {
  const lines = fs.readFileSync(new URL(import.meta.url), "utf8").split("\n");
  console.log(lines.slice(0, lines.findIndex(l => !l.startsWith("//"))).map(l => l.slice(3)).join("\n"));  // 開頭說明
  process.exit(cmd ? 1 : 0);
}
try { await cmds[cmd](rest); } catch (e) { console.error("錯誤：" + e.message); process.exit(1); }
