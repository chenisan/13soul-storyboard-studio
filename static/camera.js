// 鏡頭語言字典：Z 景別、Y 俯仰、X 方位、R 關係、M 運鏡、修飾，以及相容規則與提示詞組裝。
// 只有這一份；改代碼或英文描述都在這裡改。

export const Z = [
  { id: "Z1", zh: "大特寫", en: "extreme close-up, a single detail fills the frame", top: 0.04, bot: 0.12 },
  { id: "Z2", zh: "特寫", en: "close-up, the whole face fills the frame", top: 0.0, bot: 0.17 },
  { id: "Z3", zh: "近景", en: "medium close-up, framed from the chest up", top: 0.0, bot: 0.28 },
  { id: "Z4", zh: "中近景", en: "medium shot framed from the waist up", top: 0.0, bot: 0.42 },
  { id: "Z5", zh: "中景", en: "medium shot framed from the hips up", top: 0.0, bot: 0.52 },
  { id: "Z6", zh: "四分之三身景", en: "three-quarter body shot, American shot framed from the knees up", top: 0.0, bot: 0.74 },
  { id: "Z7", zh: "全景", en: "full shot, the entire body head to toe in frame", top: 0.0, bot: 1.0 },
  { id: "Z8", zh: "遠景", en: "long shot, the figure occupies about a third of the frame height, environment around", top: 0.0, bot: 1.0 },
  { id: "Z9", zh: "大遠景", en: "extreme long shot, the figure is tiny within a vast environment", top: 0.0, bot: 1.0 },
];

export const Y = [
  { id: "Y1", zh: "蟲視", deg: -75, en: "worm's-eye view, camera on the ground looking steeply up" },
  { id: "Y2", zh: "仰視", deg: -40, en: "low-angle shot looking up at the subject" },
  { id: "Y3", zh: "輕微仰視", deg: -15, en: "slightly low angle" },
  { id: "Y4", zh: "平視", deg: 0, en: "eye-level camera" },
  { id: "Y5", zh: "輕微俯視", deg: 15, en: "slightly high angle" },
  { id: "Y6", zh: "俯視", deg: 40, en: "high-angle shot looking down on the subject" },
  { id: "Y7", zh: "垂直頂視", deg: 90, en: "top-down overhead shot, camera directly above looking straight down" },
];

// 以主體臉部朝向為 0°，從上方看順時鐘（主體的右手邊為 90°）
export const X = [
  { id: "X1", zh: "正面", deg: 0, en: "front view, the subject faces the camera" },
  { id: "X2", zh: "右前四分之三", deg: 45, en: "three-quarter front view, camera at the subject's front-right" },
  { id: "X3", zh: "右側面", deg: 90, en: "side profile view from the subject's right side" },
  { id: "X4", zh: "右後四分之三", deg: 135, en: "three-quarter rear view, camera behind the subject's right shoulder" },
  { id: "X5", zh: "背面", deg: 180, en: "rear view from directly behind the subject" },
  { id: "X6", zh: "左後四分之三", deg: 225, en: "three-quarter rear view, camera behind the subject's left shoulder" },
  { id: "X7", zh: "左側面", deg: 270, en: "side profile view from the subject's left side" },
  { id: "X8", zh: "左前四分之三", deg: 315, en: "three-quarter front view, camera at the subject's front-left" },
];

export const R = [
  { id: "single", zh: "單人", en: "" },
  { id: "two", zh: "雙人同框", en: "two-shot, both characters clearly in frame" },
  { id: "ots", zh: "過肩", en: "over-the-shoulder shot" },
  { id: "pov", zh: "主觀鏡頭", en: "point-of-view shot" },
  { id: "fg", zh: "前景遮擋", en: "foreground elements partly framing the shot" },
];

export const M = [
  { id: "static", zh: "固定", en: "locked-off static camera" },
  { id: "push", zh: "推", en: "slow push-in toward the subject" },
  { id: "pull", zh: "拉", en: "pull-back revealing the surroundings" },
  { id: "orbit_ccw", zh: "逆時鐘環繞", en: "camera orbits counter-clockwise around the subject" },
  { id: "orbit_cw", zh: "順時鐘環繞", en: "camera orbits clockwise around the subject" },
  { id: "rotate", zh: "旋轉", en: "camera rolls and rotates around its lens axis" },
  { id: "crane_up", zh: "升", en: "crane up" },
  { id: "crane_down", zh: "降", en: "crane down" },
  { id: "track", zh: "跟拍", en: "tracking shot following the subject" },
  { id: "whip", zh: "甩鏡", en: "fast whip pan" },
  { id: "handheld", zh: "手持", en: "handheld camera with subtle drift" },
];

// 修飾：still＝生圖用描述（時間類要轉成可畫出的樣子），video＝影片用描述
export const MODS = [
  { group: "光線", items: [
    { id: "backlit", zh: "逆光剪影", still: "strong backlight, the figure reads as a silhouette", video: "strong backlight silhouette" },
    { id: "sidelight", zh: "側光", still: "hard side light carving the face and body", video: "hard side light" },
    { id: "toplight", zh: "頂光", still: "top light from directly above", video: "top light" },
    { id: "rim", zh: "輪廓光", still: "rim light outlining the figure", video: "rim light" },
    { id: "sunset", zh: "夕陽色調", still: "low warm sunset light", video: "low warm sunset light" },
    { id: "volumetric", zh: "霧中體積光", still: "layered haze with volumetric light shafts", video: "layered haze with volumetric light shafts" },
  ]},
  { group: "景深", items: [
    { id: "bokeh", zh: "大光圈虛化", still: "shallow depth of field, wide aperture, creamy background blur", video: "shallow depth of field" },
    { id: "deep", zh: "全景深", still: "deep focus, everything sharp", video: "deep focus" },
    { id: "rackfocus", zh: "移焦", still: "focus on the foreground subject", video: "rack focus between foreground and background" },
  ]},
  { group: "時間", items: [
    { id: "slowmo", zh: "慢動作升格", still: "a frozen instant, debris and cloth suspended mid-air", video: "slow motion, high frame rate" },
    { id: "freeze", zh: "高速快門凝結", still: "high shutter speed, motion frozen crisp", video: "high shutter speed, crisp frozen motion" },
    { id: "blur", zh: "動態模糊", still: "motion blur on the moving limbs", video: "natural motion blur" },
  ]},
  { group: "構圖", items: [
    { id: "dutch", zh: "荷蘭角", still: "dutch angle, the horizon tilted", video: "dutch angle" },
    { id: "symmetry", zh: "幾何對稱", still: "strict geometric symmetrical composition", video: "symmetrical composition" },
    { id: "thirds", zh: "三分法", still: "rule-of-thirds composition", video: "rule-of-thirds composition" },
    { id: "frame", zh: "框中框", still: "frame within a frame", video: "frame within a frame" },
    { id: "negative", zh: "負空間", still: "large negative space around the subject", video: "large negative space" },
    { id: "flare", zh: "鏡頭光斑", still: "subtle lens flare from a light source visible in frame", video: "subtle lens flare" },
  ]},
];

// ---------------- 攝影設備：機身、鏡頭、焦段、底片 ----------------
// sensor＝感光元件／片門寬度（mm），3D 導演台用它和焦段算視角
export const BODIES = [
  { id: "alexa35", name: "ARRI Alexa 35", fmt: "Super 35", sensor: 27.99, film: false, en: "soft natural highlight roll-off, gentle filmic contrast, natural skin tones" },
  { id: "alexa65", name: "ARRI Alexa 65", fmt: "65mm", sensor: 54.12, film: false, en: "large-format 65mm sensor, very shallow depth of field, immersive sense of space" },
  { id: "venice2", name: "Sony Venice 2", fmt: "全片幅", sensor: 36, film: false, en: "full-frame, clean image with rich shadow detail" },
  { id: "vraptor", name: "RED V-Raptor", fmt: "全片幅", sensor: 40.96, film: false, en: "full-frame, crisp high-resolution detail" },
  { id: "dxl2", name: "Panavision Millennium DXL2", fmt: "全片幅", sensor: 40.96, film: false, en: "large-format, rich cinematic color" },
  { id: "arricam", name: "Arricam LT 35mm", fmt: "35mm 底片", sensor: 24.89, film: true, en: "35mm motion picture film camera" },
  { id: "imax", name: "IMAX 65mm 底片", fmt: "IMAX", sensor: 70.41, film: true, en: "IMAX 15-perf 65mm film, enormous image detail and depth" },
  { id: "bolex", name: "Bolex 16mm", fmt: "16mm 底片", sensor: 12.52, film: true, en: "16mm film camera, coarse grain, vintage independent-film texture" },
];
export const LENSES = [
  { id: "cooke_s4", name: "Cooke S4/i", type: "球面", en: "warm, gentle 'Cooke look' rendering" },
  { id: "cooke_panchro", name: "Cooke Panchro Classic", type: "球面復古", en: "vintage spherical lens, low contrast, soft edges" },
  { id: "zeiss_mp", name: "Zeiss Master Prime", type: "球面", en: "extremely sharp, clean modern rendering" },
  { id: "zeiss_ss", name: "Zeiss Super Speed", type: "球面復古", en: "fast vintage lens, soft out-of-focus areas" },
  { id: "canon_k35", name: "Canon K35", type: "球面復古", en: "1970s warmth, gentle halation and flare" },
  { id: "leica_summilux", name: "Leica Summilux-C", type: "球面", en: "refined detail, round smooth bokeh" },
  { id: "pana_c", name: "Panavision C-Series", type: "變形寬銀幕", anamorphic: true, en: "anamorphic lens, oval bokeh, horizontal blue streak flares" },
  { id: "atlas_orion", name: "Atlas Orion", type: "變形寬銀幕", anamorphic: true, en: "anamorphic lens, oval bokeh, amber horizontal flares" },
  { id: "helios44", name: "Helios 44", type: "復古球面", en: "vintage Soviet lens, swirly bokeh" },
  { id: "zeiss_macro", name: "Zeiss Master Macro", type: "微距", macro: true, en: "macro lens, extreme close-focus detail" },
];
export const FOCALS = [
  { mm: 14, en: "ultra-wide perspective with strong depth exaggeration" },
  { mm: 18, en: "very wide perspective" },
  { mm: 24, en: "wide-angle perspective" },
  { mm: 35, en: "natural, slightly wide perspective" },
  { mm: 50, en: "normal perspective" },
  { mm: 85, en: "flattering portrait compression" },
  { mm: 100, en: "telephoto compression" },
  { mm: 135, en: "long telephoto compression, background pulled close" },
];
export const STOCKS = [
  { id: "v3_500t_push", name: "Kodak Vision3 500T（增感一級）", en: "Kodak Vision3 500T film stock pushed one stop: organic film grain, soft highlight roll-off with gentle halation, lifted film-grey blacks" },
  { id: "v3_500t", name: "Kodak Vision3 500T", en: "Kodak Vision3 500T tungsten film stock: fine organic grain, soft highlight roll-off, gentle halation" },
  { id: "v3_250d", name: "Kodak Vision3 250D", en: "Kodak Vision3 250D daylight film stock: fine grain, natural daylight color" },
  { id: "v3_50d", name: "Kodak Vision3 50D", en: "Kodak Vision3 50D film stock: extremely fine grain, saturated clean color" },
  { id: "doublex", name: "Kodak Double-X 黑白", en: "Kodak Double-X black-and-white film stock: classic monochrome grain and contrast" },
];
export const bodyOfId = id => BODIES.find(b => b.id === id), lensOfId = id => LENSES.find(l => l.id === id), stockOfId = id => STOCKS.find(x => x.id === id);

// 實際使用的設備：分鏡個別設定優先，否則用專案預設
export function gearOf(s, project) {
  const g = s.gear || {}, d = project.gear || {};
  const body = bodyOfId(g.body || d.body), lens = lensOfId(g.lens || d.lens);
  const stock = body?.film ? stockOfId(g.stock || d.stock) : null;
  return { body, lens, stock, focal: g.focal || null };
}

// 舊資料轉換：修飾欄的焦段改成毫米數／微距鏡頭（回傳是否有變動）
const OLD_FOCAL = { ultrawide: 14, wide: 24, normal: 50, tele: 100, macro: 100 };
export function migrateShotGear(s) {
  const old = (s.mods || []).filter(m => m in OLD_FOCAL);
  if (!old.length) return false;
  s.gear ??= {};
  s.gear.focal ??= OLD_FOCAL[old.includes("macro") ? "macro" : old[old.length - 1]];
  if (old.includes("macro")) s.gear.lens ??= "zeiss_macro";
  s.mods = s.mods.filter(m => !(m in OLD_FOCAL));
  return true;
}

export const MOD_BY_ID = Object.fromEntries(MODS.flatMap(g => g.items.map(i => [i.id, { ...i, group: g.group }])));
const by = (arr, id) => arr.find(a => a.id === id);
export const zOf = id => by(Z, id), yOf = id => by(Y, id), xOf = id => by(X, id), rOf = id => by(R, id), mOf = id => by(M, id);
const num = id => (id ? parseInt(id.slice(1), 10) : null);

// ---------------- 單鏡規則 ----------------
// 回傳 [{level:'error'|'warn'|'info', msg, fix?:{label, patch}}]
export function checkShot(s, project) {
  const out = [];
  const z = num(s.z), y = num(s.y), x = num(s.x);
  const mods = new Set(s.mods || []);
  const chars = s.chars || [];

  if (!s.z || !s.y) out.push({ level: "error", msg: "還沒選 Z 景別或 Y 俯仰。" });
  if (!s.scene) out.push({ level: "warn", msg: "沒有綁場景，背景會由模型自由發揮。" });
  if (!chars.length) out.push({ level: "warn", msg: "沒有綁角色卡。" });
  if (chars.length && !s.subject) out.push({ level: "warn", msg: "沒指定主體，X 方位不知道以誰為準。",
    fix: { label: `以 ${charName(project, chars[0])} 為主體`, patch: { subject: chars[0] } } });

  // 單人卻勾了多個角色：提示詞會同時說「只有一人」又附上別人的角色卡
  if ((s.r || "single") === "single" && chars.length >= 2) out.push({ level: "error",
    msg: `選了「單人」，但勾了 ${chars.length} 個角色；其他人的角色卡也會送出，模型很可能畫出多人。`,
    fix: { label: `只留 ${charName(project, s.subject || chars[0])}`, patch: { chars: [s.subject || chars[0]] } } });
  // 畫面內容提到沒有出場的角色
  const absent = project.characters.filter(c => !chars.includes(c.id) &&
    [c.name, c.name_en].some(n => n && n.trim().length >= 2 && (s.action || "").toLowerCase().includes(n.trim().toLowerCase())));
  if (absent.length) out.push({ level: "error",
    msg: `「畫面內容」提到沒有出場的 ${absent.map(c => c.name).join("、")}；這段文字會原樣送出，模型會把他畫進來。請改文字，或把他勾為出場角色。`, rewrite: true });

  if (y === 7 && s.x) out.push({ level: "warn", msg: "垂直頂視時每個方位看起來都一樣，X 沒有意義；改用旋轉或對稱構圖。",
    fix: { label: "清掉 X，改幾何對稱", patch: { x: null, mods: [...mods, "symmetry"] } } });
  if (y === 1 && z && z <= 3) out.push({ level: "warn", msg: "蟲視（貼地）配近距離景別，主體必須在地面：腳、倒地的臉、撐地的手。站著的人拍不到。" });
  if (z && z >= 8 && y && y <= 2) out.push({ level: "info", msg: "遠景卻仰視：主體要在高處（屋頂、空中）才成立。" });
  if (x && x >= 4 && x <= 6 && z && z <= 2) out.push({ level: "warn", msg: "背面角度的特寫看不到臉，只能拍細節（後頸、斗笠邊、手背）。要看臉請改用過肩。",
    fix: { label: "改右前四分之三", patch: { x: "X2" } } });
  if (x && x >= 4 && x <= 6 && s.r !== "ots" && chars.length >= 2 && z && z <= 6) out.push({ level: "info",
    msg: "主體背對鏡頭；若要看另一人的臉與接觸點，改成越過主體肩膀拍。", fix: { label: "改過肩", patch: { r: "ots" } } });

  if (s.r === "ots") {
    if (chars.length < 2) out.push({ level: "error", msg: "過肩鏡頭需要兩個角色。" });
    if (z && (z < 3 || z > 5)) out.push({ level: "warn", msg: "過肩通常落在 Z3–Z5，太近或太遠都不成立。", fix: { label: "改 Z4 中近景", patch: { z: "Z4" } } });
  }
  if (s.r === "two" && chars.length < 2) out.push({ level: "error", msg: "雙人同框需要兩個角色。" });

  const gear = gearOf(s, project);
  if (gear.body && !gear.body.film && /film|vision3|grain|halation|底片/i.test(project.look || ""))
    out.push({ level: "warn", msg: `選的是數位機身 ${gear.body.name}，但「專案設定」的質感描述還寫著底片（film、grain、halation）；兩者會互相矛盾。` });
  if (gear.body?.film && !gear.stock) out.push({ level: "info", msg: "選了底片機身，可以在「專案設定」或這顆鏡頭選底片型號。" });
  if (gear.lens?.anamorphic && project.ratio === "reel") out.push({ level: "warn", msg: "變形寬銀幕鏡頭配直式 9:16 很不尋常，橢圓散景與橫向光斑會很怪。" });
  if (gear.lens?.macro && z && z >= 4) out.push({ level: "warn", msg: "微距鏡頭只適合 Z1–Z2 的細節特寫。" });
  if (gear.focal && gear.focal <= 18 && z && z <= 2) out.push({ level: "info", msg: `${gear.focal}mm 拍特寫會嚴重變形臉部（鼻子變大）；除非要刻意誇張，否則改 50–85mm。` });
  if (mods.has("bokeh") && mods.has("deep")) out.push({ level: "error", msg: "大光圈虛化與全景深互相衝突。" });
  if (mods.has("bokeh") && z && z >= 8) out.push({ level: "warn", msg: "遠景幾乎虛化不了，大光圈虛化效果無效。" });
  if (mods.has("backlit") && z && z <= 3) out.push({ level: "warn", msg: "逆光剪影會讓臉變黑，角色卡的臉等於白鎖了。" });
  if (mods.has("flare")) out.push({ level: "info", msg: "鏡頭光斑需要畫面中有光源。" });
  if (mods.has("slowmo")) out.push({ level: "info", msg: "慢動作是時間屬性，首幀改寫成「飛濺凝結、衣襬懸空」；影片提示詞才真的放慢。" });
  if (mods.has("dutch") && y === 7) out.push({ level: "warn", msg: "頂視加荷蘭角沒有可傾斜的地平線。" });
  return out;
}

// ---------------- 相鄰鏡頭規則 ----------------
export function checkPair(a, b) {
  const out = [];
  if (!a || !b) return out;
  const za = num(a.z), zb = num(b.z), xa = num(a.x), xb = num(b.x);
  const sameSubject = a.subject && a.subject === b.subject && a.scene === b.scene;
  if (sameSubject && a.z === b.z && a.y === b.y) {
    const dx = xa && xb ? Math.min(Math.abs(xa - xb), 8 - Math.abs(xa - xb)) : 0;
    if (dx <= 1) out.push({ level: "warn", msg: `${a.id}→${b.id} 景別、俯仰相同、方位差不到 45°，會像跳接。` });
  } else if (sameSubject && za && zb && Math.abs(za - zb) === 1 && a.y === b.y && a.x === b.x) {
    out.push({ level: "info", msg: `${a.id}→${b.id} 只差一格景別，變化可能不夠明顯。` });
  }
  const side = x => (x >= 2 && x <= 4 ? "R" : x >= 6 && x <= 8 ? "L" : null);
  if (sameSubject && side(xa) && side(xb) && side(xa) !== side(xb) && !(b.m || "").startsWith("orbit"))
    out.push({ level: "warn", msg: `${a.id}→${b.id} 鏡頭從主體${side(xa) === "R" ? "右" : "左"}側跳到另一側，可能越過 180 度線；用環繞運鏡過去或先插正面鏡。` });
  return out;
}

export function charName(project, id) {
  return (project.characters.find(c => c.id === id) || {}).name || id;
}
// 英文提示詞用：有填英文名就用英文名
const nameEn = a => a?.name_en?.trim() || a?.name;
export function charNameEn(project, id) {
  return nameEn(project.characters.find(c => c.id === id)) || id;
}

// ---------------- 代碼與提示詞 ----------------
export function codeLine(s, project) {
  const parts = [];
  if (s.z) parts.push(`${s.z} ${zOf(s.z).zh}`);
  if (s.y) parts.push(`${s.y} ${yOf(s.y).zh}`);
  if (s.x) parts.push(`${s.x} ${xOf(s.x).zh}${s.subject ? "@" + charName(project, s.subject) : ""}`);
  if (s.r && s.r !== "single") parts.push(rOf(s.r).zh);
  if (s.m && s.m !== "static") parts.push(mOf(s.m).zh);
  const gear = gearOf(s, project);
  if (gear.focal || s.gear?.lens || s.gear?.body) parts.push([s.gear?.body && gear.body?.name, (s.gear?.lens || gear.focal) && gear.lens?.name, gear.focal && `${gear.focal}mm`].filter(Boolean).join(" "));
  const mods = (s.mods || []).map(m => MOD_BY_ID[m]?.zh).filter(Boolean);
  if (mods.length) parts.push(mods.join("／"));
  return parts.join(" + ");
}

// 參考圖：綁定的角色卡、場景圖（auto）＋這顆鏡頭的額外參考圖（extra），
// 再套用 s.refExclude（排除的 auto 圖路徑）與 s.refOrder（拖曳後的順序，以路徑為鍵）。
// 回傳 [{key, path, label, labelZh, kind, excluded, extraId}]；all=true 時連排除的一起回傳（給畫面顯示）
export function refsOf(s, project, { all = false } = {}) {
  const refs = [];
  const ex = new Set(s.refExclude || []);
  for (const id of s.chars || []) {
    const c = project.characters.find(c => c.id === id);
    if (c?.image) refs.push({ path: c.image, label: `character reference for ${nameEn(c)}`, labelZh: `${c.name} 角色卡`, kind: "auto" });
  }
  const sc = project.scenes.find(x => x.id === s.scene);
  if (sc?.image) refs.push({ path: sc.image, label: `location reference for ${nameEn(sc)}`, labelZh: `${sc.name} 場景`, kind: "auto" });
  for (const r of s.refs || []) {
    const note = r.note?.trim();
    refs.push({ path: r.path, label: note ? `additional reference: ${note}` : "additional reference image", labelZh: note || "額外參考圖", kind: "extra", extraId: r.id });
  }
  for (const r of refs) { r.key = r.extraId || r.path; r.excluded = r.kind === "auto" && ex.has(r.path); }
  const order = s.refOrder || [];
  const rank = r => { const i = order.indexOf(r.key); return i < 0 ? order.length + refs.indexOf(r) : i; };
  refs.sort((a, b) => rank(a) - rank(b));
  return all ? refs : refs.filter(r => !r.excluded);
}

function cameraEn(s, project, kind) {
  const bits = [];
  const subj = s.subject ? charNameEn(project, s.subject) : "the subject";
  const others = (s.chars || []).filter(c => c !== s.subject).map(c => charNameEn(project, c));
  if (s.z) bits.push(zOf(s.z).en);
  if (s.y) bits.push(yOf(s.y).en);
  if (s.x) bits.push(xOf(s.x).en.replaceAll("the subject", subj));
  if (s.r === "ots") bits.push(others.length ? `over-the-shoulder shot past ${subj}'s shoulder, looking toward ${others.join(" and ")}, whose face is clearly visible` : rOf("ots").en);
  else if ((s.r || "single") === "single") bits.push(`single-character shot: only ${subj} is in the frame, no other people anywhere in the shot`);
  else bits.push(rOf(s.r).en);
  if (kind === "video" && s.m) bits.push(mOf(s.m).en.replaceAll("the subject", subj));
  const gear = gearOf(s, project);
  if (gear.body || gear.lens || gear.focal) {
    const lensPart = [gear.lens?.name, gear.focal && `${gear.focal}mm`].filter(Boolean).join(" ");
    bits.push(`shot on ${[gear.body?.name, lensPart && (gear.body ? `with a ${lensPart} lens` : `${lensPart} lens`)].filter(Boolean).join(" ")}`);
    if (gear.focal) bits.push(FOCALS.find(f => f.mm === gear.focal)?.en);
    if (gear.lens) bits.push(gear.lens.en);
    if (gear.body) bits.push(gear.body.en);
  }
  for (const m of s.mods || []) if (MOD_BY_ID[m]) bits.push(MOD_BY_ID[m][kind === "video" ? "video" : "still"]);
  return bits.filter(Boolean).join(", ");
}

function cameraZh(s, project, kind) {
  const bits = [];
  const subj = s.subject ? charName(project, s.subject) : "主體";
  if (s.z) bits.push(zOf(s.z).zh);
  if (s.y) bits.push(yOf(s.y).zh);
  if (s.x) bits.push(`從${subj}的${xOf(s.x).zh}拍`);
  if (s.r === "ots") bits.push(`越過${subj}肩膀拍另一人，對方臉部清楚`);
  else if ((s.r || "single") === "single") bits.push(`單人鏡頭：畫面中只有${subj}，沒有其他人`);
  else bits.push(rOf(s.r).zh);
  if (kind === "video" && s.m) bits.push(`運鏡：${mOf(s.m).zh}`);
  const gear = gearOf(s, project);
  if (gear.body || gear.lens || gear.focal) bits.push(`攝影機 ${[gear.body?.name, gear.lens?.name, gear.focal && `${gear.focal}mm`].filter(Boolean).join("＋")}`);
  for (const m of s.mods || []) if (MOD_BY_ID[m]) bits.push(MOD_BY_ID[m].zh);
  return bits.join("，");
}

// kind: 'still'＝送 codex 的首幀；'video'＝給 Seedance 等影片模型的影片提示詞
export function buildPrompt(s, project, kind = "still") {
  const refs = refsOf(s, project);
  const en = [], zh = [];
  en.push(kind === "still" ? "A single cinematic film still, one continuous scene, no collage, no split panels." : "Cinematic live-action shot.");
  zh.push(kind === "still" ? "單張電影劇照，單一場景，不拼貼、不分格。" : "電影實拍鏡頭。");
  if (refs.length) {
    en.push(refs.map((r, i) => `Image ${i + 1} is ${r.kind === "extra" ? "an" : "the"} ${r.label}`).join("; ") + ". Keep each character's face, hair and costume exactly as in their reference; use the location reference for the environment, light direction and atmosphere.");
    zh.push(refs.map((r, i) => `圖片${i + 1}＝${r.labelZh}`).join("；") + "。角色的臉、髮型、服裝照角色卡；環境、光向、空氣感照場景圖。");
  }
  const cam = cameraEn(s, project, kind);
  if (cam) { en.push(`Camera: ${cam}.`); zh.push(`鏡頭：${cameraZh(s, project, kind)}。`); }
  if (s.action?.trim()) { en.push(`Action: ${s.action.trim()}`); zh.push(`畫面內容：${s.action.trim()}`); }
  for (const id of s.chars || []) {
    const c = project.characters.find(c => c.id === id);
    if (!c) continue;
    const desc = [c.lock, c.outfit].filter(x => x?.trim()).join(" ");
    if (desc) { en.push(`${nameEn(c)}: ${desc}`); zh.push(`${c.name}：（角色鎖定描述，見英文）`); }
  }
  const sc = project.scenes.find(x => x.id === s.scene);
  if (sc?.desc?.trim()) { en.push(`Location: ${sc.desc.trim()}`); zh.push(`場景：${sc.desc.trim()}`); }
  const stock = gearOf(s, project).stock;
  if (stock) { en.push(`${stock.en}.`); zh.push(`底片：${stock.name}。`); }
  if (project.look?.trim()) { en.push(project.look.trim()); zh.push("質感：專案質感設定。"); }
  if (project.rules?.trim()) { en.push(project.rules.trim()); zh.push("規則：手部解剖正確、不要數位感、不要文字與標誌。"); }
  return { en: en.join("\n"), zh: zh.join("\n"), refs };
}

// 字詞層級差異（給「手改版 vs 自動版」）
export function wordDiff(a, b) {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/);
  const n = A.length, m = B.length;
  if (n * m > 4_000_000) return [{ t: "same", s: b }];
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  const push = (t, s) => { if (out.length && out.at(-1).t === t) out.at(-1).s += s; else out.push({ t, s }); };
  while (i < n && j < m) {
    if (A[i] === B[j]) { push("same", A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("del", A[i]); i++; }
    else { push("add", B[j]); j++; }
  }
  while (i < n) push("del", A[i++]);
  while (j < m) push("add", B[j++]);
  return out;
}
