// 3D 導演台的幾何計算（不依賴 three.js，分鏡列的越軸檢查也用這份）
// 座標：Y 朝上，地面為 XZ，單位公尺。角色面向角 yaw：0° 面向 -Z（俯視圖的上方），順時鐘增加。
import { X, Y, Z, xOf, yOf, gearOf } from "./camera.js";

export const DEFAULT_HEIGHT = 1.75;
export const POSES = [
  { id: "stand", zh: "站", scale: 1 },
  { id: "punch", zh: "出拳", scale: 1 },
  { id: "crouch", zh: "蹲", scale: 0.62 },
  { id: "lying", zh: "倒地", scale: 0.2 },
  { id: "air", zh: "空中", scale: 1 },
];
const poseOf = id => POSES.find(p => p.id === id) || POSES[0];

// 焦段與片幅：攝影設備沒選焦段就用 35mm、沒選機身就用全片幅 36mm 寬
export const focalOf = (shot, project) => gearOf(shot, project).focal || 35;
export const sensorOf = (shot, project) => gearOf(shot, project).body?.sensor || 36;
// 由視角反推同一片幅下的焦段
const focalFromFov = (fov, aspect, sensor) => Math.round(sensor / (2 * Math.tan(fov / 2) * (aspect >= 1 ? aspect : 1)));
export function vfovOf(focal, aspect, sensor = 36) {
  const longHalf = Math.atan(sensor / (2 * focal));
  return aspect >= 1 ? 2 * Math.atan(Math.tan(longHalf) / aspect) : 2 * longHalf;
}

// 各景別在身高上的取景範圍（由頭頂往下的比例）與畫面高度（以身高為單位）
const PAD = 0.03;
export const Z_FRAME = Object.fromEntries(Z.map(z => {
  if (z.id === "Z1") return [z.id, { center: 0.07, extent: 0.08 }];
  if (z.id === "Z7") return [z.id, { center: 0.5, extent: 1.12 }];
  if (z.id === "Z8") return [z.id, { center: 0.5, extent: 3 }];
  if (z.id === "Z9") return [z.id, { center: 0.5, extent: 9 }];
  return [z.id, { center: (z.top - PAD + z.bot) / 2, extent: z.bot - z.top + PAD }];
}));

const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const norm360 = d => ((d % 360) + 360) % 360;
export const dirOf = yawDeg => [Math.sin(rad(yawDeg)), 0, -Math.cos(rad(yawDeg))];

export function charHeight(project, id) {
  return +(project.characters.find(c => c.id === id)?.height) || DEFAULT_HEIGHT;
}

// 分鏡缺站位時：沿用同場景上一顆，否則預設面對面相距 1.2 公尺
export function ensureBlocking(project, shot) {
  shot.blocking ??= {};
  const idx = project.shots.indexOf(shot);
  const prev = project.shots.slice(0, Math.max(idx, 0)).reverse().find(s => s.scene === shot.scene && s.blocking);
  const defaults = [{ pos: [-0.6, 0], yaw: 90 }, { pos: [0.6, 0], yaw: 270 }, { pos: [0, 1.5], yaw: 0 }, { pos: [0, -1.5], yaw: 180 }];
  let k = 0;
  for (const id of shot.chars || []) {
    if (shot.blocking[id]) continue;
    const from = prev?.blocking?.[id];
    shot.blocking[id] = from ? structuredClone(from) : { ...structuredClone(defaults[k % defaults.length]), pose: "stand", lift: 0 };
    k++;
  }
  for (const id of Object.keys(shot.blocking)) if (!(shot.chars || []).includes(id)) delete shot.blocking[id];
  return shot.blocking;
}

// 某角色的高度資訊
export function bodyOf(project, shot, id) {
  const b = shot.blocking?.[id] || { pos: [0, 0], yaw: 0, pose: "stand", lift: 0 };
  const H = charHeight(project, id);
  const pose = poseOf(b.pose);
  const lift = b.pose === "air" ? (b.lift ?? 1) : (b.lift || 0);
  const Hs = b.pose === "lying" ? H : H * pose.scale;
  // 某比例（由頭頂往下）所在的世界高度；倒地時身體是平的，一律取離地 0.15
  const heightAt = f => (b.pose === "lying" ? 0.15 : lift + Hs * (1 - f));
  return { b, H, Hs, lift, heightAt, pos: [b.pos[0], 0, b.pos[1]] };
}

// 由代碼算機位：回傳 {pos, target, up, fov, focal}
export function solveCamera(project, shot, aspect) {
  if (shot.cam3d) return { ...shot.cam3d, focal: shot.cam3d.focal || focalOf(shot, project) };
  const focal = focalOf(shot, project), sensor = sensorOf(shot, project);
  let fov = vfovOf(focal, aspect, sensor);
  const subj = shot.subject && (shot.chars || []).includes(shot.subject) ? shot.subject : (shot.chars || [])[0];
  if (!subj) return { pos: [0, 1.6, 5], target: [0, 1, 0], up: [0, 1, 0], fov: deg(fov), focal };
  const S = bodyOf(project, shot, subj);
  const zf = Z_FRAME[shot.z || "Z5"];
  const el = shot.y ? yOf(shot.y).deg : 0;

  if (shot.r === "ots") {
    const otherId = (shot.chars || []).find(c => c !== subj);
    if (otherId) {
      const O = bodyOf(project, shot, otherId);
      const target = [O.pos[0], O.heightAt(zf.center), O.pos[2]];
      const toS = [S.pos[0] - O.pos[0], S.pos[2] - O.pos[2]];
      const len = Math.hypot(...toS) || 1;
      const back = [toS[0] / len, toS[1] / len];
      const left = shot.x === "X6" || shot.x === "X7" || shot.x === "X8";
      const side = left ? [back[1], -back[0]] : [-back[1], back[0]];
      const h = S.heightAt(0.17) + Math.tan(rad(el)) * 0.6;
      const pos = [S.pos[0] + back[0] * 0.7 + side[0] * 0.38, Math.max(0.12, h), S.pos[2] + back[1] * 0.7 + side[1] * 0.38];
      const dist = Math.hypot(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]);
      fov = Math.min(2 * Math.atan((zf.extent * O.Hs / 2) / dist), rad(80));
      return { pos, target, up: [0, 1, 0], fov: deg(fov), focal: focalFromFov(fov, aspect, sensor) };
    }
  }

  const target = [S.pos[0], S.heightAt(zf.center), S.pos[2]];
  const dist = (zf.extent * S.Hs / 2) / Math.tan(fov / 2);
  const az = S.b.yaw + (shot.x ? xOf(shot.x).deg : 0);
  const d = dirOf(az);
  const ce = Math.cos(rad(el)), se = Math.sin(rad(el));
  const pos = [target[0] + dist * ce * d[0], target[1] + dist * se, target[2] + dist * ce * d[2]];
  let up = [0, 1, 0];
  if (el > 85) { const f = dirOf(S.b.yaw); pos[0] = target[0] + f[0] * 0.001; pos[2] = target[2] + f[2] * 0.001; up = f; }
  if (pos[1] < 0.12 && se < 0) {
    // 蟲視：鏡頭貼地。保持仰角、靠近主體，改用更廣的鏡頭維持同樣景別
    // 最廣只用到 18mm；再廣就貼地往後退，仰角變緩
    const rise = target[1] - 0.12;
    const d2 = rise / -se;
    const fovMax = vfovOf(18 * sensor / 36, aspect, sensor);  // 最廣相當於全片幅 18mm
    const need = (zf.extent * S.Hs / 2) / Math.tan(fovMax / 2);
    const dist2 = Math.max(d2, need);
    const horiz = Math.sqrt(Math.max(dist2 * dist2 - rise * rise, 0));
    for (const i of [0, 2]) pos[i] = target[i] + horiz * d[i];
    pos[1] = 0.12;
    fov = Math.min(2 * Math.atan((zf.extent * S.Hs / 2) / dist2), fovMax);
    return { pos, target, up, fov: deg(fov), focal: focalFromFov(fov, aspect, sensor) };
  }
  return { pos, target, up, fov: deg(fov), focal };
}

// 反推：任意機位 → 最接近的代碼
export function nearestCodes(project, shot, cam, aspect) {
  const subj = shot.subject || (shot.chars || [])[0];
  if (!subj) return null;
  const S = bodyOf(project, shot, subj);
  const v = [cam.pos[0] - cam.target[0], cam.pos[1] - cam.target[1], cam.pos[2] - cam.target[2]];
  const horiz = Math.hypot(v[0], v[2]);
  const el = deg(Math.atan2(v[1], horiz));
  const y = Y.reduce((a, b) => Math.abs(b.deg - el) < Math.abs(a.deg - el) ? b : a);
  let x = null;
  if (y.id !== "Y7") {
    const az = deg(Math.atan2(v[0], -v[2]));
    const rel = norm360(az - S.b.yaw);
    x = X.reduce((a, b) => Math.min(Math.abs(b.deg - rel), 360 - Math.abs(b.deg - rel)) < Math.min(Math.abs(a.deg - rel), 360 - Math.abs(a.deg - rel)) ? b : a);
  }
  const dist = Math.hypot(...v);
  // 過肩時景別看的是對面那個人
  const other = shot.r === "ots" ? (shot.chars || []).find(c => c !== subj) : null;
  const F = other ? bodyOf(project, shot, other) : S;
  const extent = 2 * dist * Math.tan(rad(cam.fov) / 2) / F.Hs;
  const z = Object.entries(Z_FRAME).reduce((a, b) => Math.abs(Math.log(b[1].extent / extent)) < Math.abs(Math.log(a[1].extent / extent)) ? b : a)[0];
  return { x: x?.id || null, y: y.id, z, el: Math.round(el), extent };
}

// 鏡頭在兩人軸線的哪一側（+1／-1），不足兩人回傳 0
export function lineSide(project, shot, aspect = 16 / 9) {
  const ids = shot.chars || [];
  if (ids.length < 2 || !shot.blocking) return 0;
  const a = bodyOf(project, shot, ids[0]).pos, b = bodyOf(project, shot, ids[1]).pos;
  const c = solveCamera(project, shot, aspect).pos;
  const cross = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
  return Math.sign(cross);
}

// 相鄰兩鏡用真實站位判斷越軸
export function checkPair3d(project, a, b, aspect) {
  if (!a?.blocking || !b?.blocking || a.scene !== b.scene) return [];
  const ka = (a.chars || []).slice(0, 2).sort().join(), kb = (b.chars || []).slice(0, 2).sort().join();
  if (ka !== kb || (a.chars || []).length < 2) return [];
  // 比較時以同一對角色的固定順序判斷
  const order = (a.chars || []).slice(0, 2);
  const sa = lineSide(project, { ...a, chars: order }, aspect), sb = lineSide(project, { ...b, chars: order }, aspect);
  if (sa && sb && sa !== sb && !(b.m || "").startsWith("orbit"))
    return [{ level: "warn", msg: `${a.id}→${b.id}（3D）鏡頭跨過兩人之間的 180 度線；用環繞運鏡過去或先插中性鏡。` }];
  return [];
}
