// 建立「_範例」專案：同一個角色、同一個場景，每組只改一個變數，當作構圖對照表。
// 角色與場景在 .env 的 SAMPLE_* 設定（見 .env.example）。
//
//   node make_samples.mjs              只建立／更新範例專案的分鏡，不生成
//   node make_samples.mjs z,y,x        把這幾組還沒生成過的範例送進生成佇列（依序生成）
//   node make_samples.mjs all          全部送進佇列
//
// 組別：z 景別、y 俯仰、x 方位、f 焦段、l 鏡頭、b 機身／底片。需要分鏡設計台正在執行。
import { buildPrompt, refsOf, codeLine } from "./static/camera.js";

try { process.loadEnvFile(new URL(".env", import.meta.url)); } catch { /* 沒有 .env 就只用環境變數 */ }
const E = process.env;
const API = `http://127.0.0.1:${E.STUDIO_PORT || 8790}`;
const NAME = "_範例";
const SRC_PROJECT = E.SAMPLE_SOURCE_PROJECT || "";  // 選填：沿用這個專案的角色鎖定描述、質感與規則
const CHAR = { image: E.SAMPLE_CHARACTER_IMAGE, name: E.SAMPLE_CHARACTER_NAME, name_en: E.SAMPLE_CHARACTER_NAME_EN, lock: E.SAMPLE_CHARACTER_LOCK || "" };
const SCENE = { image: E.SAMPLE_SCENE_IMAGE, name: E.SAMPLE_SCENE_NAME, name_en: E.SAMPLE_SCENE_NAME_EN, desc: E.SAMPLE_SCENE_DESC || "" };
const missing = ["SAMPLE_CHARACTER_IMAGE", "SAMPLE_CHARACTER_NAME", "SAMPLE_CHARACTER_NAME_EN", "SAMPLE_SCENE_IMAGE", "SAMPLE_SCENE_NAME", "SAMPLE_SCENE_NAME_EN"].filter(k => !E[k]);
if (missing.length) { console.error(`請先在 .env 設定：${missing.join("、")}（說明見 .env.example）`); process.exit(1); }
const q = `p=${encodeURIComponent(NAME)}`;

async function api(path, body) {
  const r = await fetch(API + path, body === undefined ? {} : { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok || data?.error) throw new Error(`${path}：${data?.error || r.status}`);
  return data;
}

// 基準：四分之三身景、平視、右前 ¾、50mm；每組只改一個變數
const BASE = { z: "Z6", y: "Y4", x: "X2", gear: { focal: 50 } };
const TIGHT = { ...BASE, z: "Z4" };  // 焦段／鏡頭／機身組：腰部以上，比較透視與質感
const ACTION = `${CHAR.name_en} stands naturally in ${SCENE.name_en}, arms relaxed at the sides, calm expression.`;
// 特寫、大特寫只描述臉部，避免「站著、雙手垂放」把畫面拉寬
const ACTION_FACE = `${CHAR.name_en} looks calmly ahead, eyes steady, a quiet expression.`;

function sampleShots() {
  const shots = [];
  const add = (id, title, over, sample) => {
    const old = shots.find(s => s.id === id);
    if (old) { old.sample.push(...sample); return; }
    shots.push({ id, title, action: ["Z1", "Z2"].includes(over.z) ? ACTION_FACE : ACTION, chars: ["C1"], subject: "C1", scene: "SC1", r: "single", m: "static", mods: [],
      ...BASE, ...over, gear: { ...BASE.gear, ...(over.gear || {}) }, sample });
  };
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) add(n === 6 ? "BASE" : `Z${n}`, n === 6 ? "基準（Z6 Y4 X2 50mm）" : `景別 Z${n}`, { z: `Z${n}` }, [["z", `Z${n}`]]);
  for (const n of [1, 2, 3, 4, 5, 6, 7]) add(n === 4 ? "BASE" : `Y${n}`, `俯仰 Y${n}`, { y: `Y${n}`, x: n === 7 ? null : "X2" }, [["y", `Y${n}`]]);
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) add(n === 2 ? "BASE" : `X${n}`, `方位 X${n}`, { x: `X${n}` }, [["x", `X${n}`]]);
  for (const mm of [14, 24, 50, 85, 135]) add(`F${mm}`, `焦段 ${mm}mm`, { ...TIGHT, gear: { focal: mm } }, [["f", String(mm)]]);
  for (const lens of ["cooke_s4", "pana_c", "helios44", "zeiss_mp"]) add(`L_${lens}`, `鏡頭 ${lens}`, { ...TIGHT, gear: { focal: 50, lens } }, [["l", lens]]);
  add("F50", "", {}, [["b", "arricam"]]);  // 預設設備就是 Arricam 35mm 底片＋500T
  add("B_alexa35", "機身 Alexa 35", { ...TIGHT, gear: { focal: 50, body: "alexa35" } }, [["b", "alexa35"]]);
  add("B_bolex", "機身 Bolex 16mm", { ...TIGHT, gear: { focal: 50, body: "bolex", stock: "v3_500t" } }, [["b", "bolex"]]);
  add("B_doublex", "底片 Double-X 黑白", { ...TIGHT, gear: { focal: 50, stock: "doublex" } }, [["b", "doublex"]]);
  return shots;
}

// 舊專案質感開頭寫死的 35mm 底片句子改由攝影設備負責，不然數位機身的範例也會寫著底片
const OLD_LOOK = "Shot on 35mm motion picture film, Kodak Vision3 500T pushed one stop, organic film grain, soft highlight roll-off with gentle halation, lifted film-grey blacks, vintage spherical cinema lens.";

async function ensureProject() {
  await api("/api/projects", { name: NAME });
  const p = await api(`/api/project?${q}`);
  const src = SRC_PROJECT ? await api(`/api/project?p=${encodeURIComponent(SRC_PROJECT)}`).catch(() => null) : null;
  const same = src?.characters.find(c => c.name_en === CHAR.name_en || c.name === CHAR.name) || {};
  // 角色、場景每次依 .env 重建；圖檔只在來源路徑換了才重新複製進專案
  const oldC = p.characters.find(c => c.id === "C1"), oldS = p.scenes.find(s => s.id === "SC1");
  const cImg = oldC?.src === CHAR.image ? oldC.image : (await api(`/api/import_path?${q}`, { kind: "characters", path: CHAR.image })).path;
  const sImg = oldS?.src === SCENE.image ? oldS.image : (await api(`/api/import_path?${q}`, { kind: "scenes", path: SCENE.image })).path;
  p.characters = [{ id: "C1", name: CHAR.name, name_en: CHAR.name_en, image: cImg, src: CHAR.image, lock: CHAR.lock || same.lock || "", outfit: same.outfit || "" }];
  p.scenes = [{ id: "SC1", name: SCENE.name, name_en: SCENE.name_en, image: sImg, src: SCENE.image, desc: SCENE.desc }];
  if (src) {
    p.look = (src.look || "").startsWith(OLD_LOOK) ? src.look.slice(OLD_LOOK.length).trim() : src.look;
    p.rules = src.rules;
  }
  if ((p.look || "").startsWith(OLD_LOOK)) p.look = p.look.slice(OLD_LOOK.length).trim();  // 舊版伺服器建立的專案預設
  p.ratio = "youtube";
  p.gear = { body: "arricam", lens: "cooke_panchro", stock: "v3_500t_push" };
  p.shots = sampleShots();
  await api(`/api/project?${q}`, p);
  return p;
}

const p = await ensureProject();
console.log(`範例專案「${NAME}」：${p.shots.length} 顆鏡頭（${CHAR.name}・${SCENE.name}）`);
const arg = process.argv[2];
if (!arg) { console.log("只建立分鏡，沒有生成。要生成請加組別，例如：node make_samples.mjs z,y,x"); process.exit(0); }

const groups = arg === "all" ? ["z", "y", "x", "f", "l", "b"] : arg.split(",");
const gens = await api(`/api/gens?${q}`);
let n = 0;
for (const s of p.shots) {
  if (!s.sample.some(([axis]) => groups.includes(axis))) continue;
  if (gens[s.id]?.versions?.some(v => ["done", "queued", "running"].includes(v.status))) continue;  // 已有或已在排隊
  const b = buildPrompt(s, p, "still");
  await api(`/api/generate?${q}`, { shot_id: s.id, prompt: b.en, prompt_zh: b.zh, code: codeLine(s, p), refs: refsOf(s, p).map(r => r.path), ratio: "youtube", manual: false });
  n++;
  console.log(`排入 ${s.id}　${codeLine(s, p)}`);
}
console.log(`共排入 ${n} 張，會依序生成。`);
