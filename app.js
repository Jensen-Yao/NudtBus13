/* 班车助手 · Apple glassmorphism
 * Data: data/merged/schedule.json (5-source merged) + data/merged/poi.json (WGS-84)
 * Modes: campus (校区通勤) / inner (院内通勤)
 */
"use strict";

const STOP_LABELS = {
  one: "一号院", three: "三号院（系统楼）", dorm: "宿舍（研究生宿舍）",
  eastGate: "东门", northGate: "北门", militaryCenter: "军体", laserInstitute: "激光所",
  gaochaoNorth: "高超北侧", gaochaoSouth: "高超南侧", scienceCollege: "理学院",
  secondCanteen: "二食堂", kjy: "科大佳园", kjySouthGate: "科大佳园南苑东门",
  jingyuanEast: "科大景园东门", jingyuanWest: "科大景园西门", fourth: "四号院", family4: "四号院家属区",
};
const KIND_BADGE = { intercampus: "校际", college: "学院专线", loop: "环线", dining: "就餐", family: "家属区", sightseeing: "观光" };
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const PROFILE_DAYS = {
  monThu: ["mon", "tue", "wed", "thu"],
  friday: ["fri"],
  saturday: ["sat"],
  sunday: ["sun"],
};
const PROFILE_LABELS = { monThu: "周一至周四运行表", friday: "周五运行表", saturday: "周六运行表", sunday: "周日运行表" };

// 院区模型（数据侧 schedule.json.areas 为权威；此处仅缓存）
let AREAS = {};
function areaOf(stop) { return AREAS[stop] || "unknown"; }

// 模式定义（标签驱动，自动扩展）：
//   campus-commute = 教学区之间（一号院↔三号院）=> 校区通勤
//   three-life / one-life / four-life / commute-other => 院内通勤（各院区生活圈，新增自动纳入）
const MODES = {
  campus: {
    label: "校区通勤",
    test: () => true, // 全网全集：囊括所有站点与服务
    defaultFrom: "one", defaultTo: "three",
  },
  inner: {
    label: "院内通勤",
    test: (svc) => !(svc.tags || []).includes("campus-commute"),
    defaultFrom: "dorm", defaultTo: "three",
  },
};
const LIFE_TAG_TITLES = { "three-life": "三号院生活圈", "one-life": "一号院生活圈", "four-life": "四号院生活圈", "commute-other": "其他通勤" };

// 站点池由该模式下的服务数据派生 —— 新增服务/站点自动出现，具备扩展性
function deriveStops(m) {
  const cfg = MODES[m];
  const set = new Set();
  for (const svc of DATA.services) {
    if (!cfg.test(svc)) continue;
    for (const s of svc.orderedStops) set.add(s.stop);
  }
  if (m === "campus") for (const s of Object.keys(STOP_LABELS)) set.add(s); // 全网模式兜底：全部已知站点
  const order = m === "campus"
    ? ["one", "three", "kjy", "kjySouthGate", "jingyuanWest", "jingyuanEast", "fourth", "family4", "dorm"]
    : ["dorm", "three", "eastGate", "northGate", "militaryCenter", "laserInstitute", "gaochaoNorth", "gaochaoSouth", "scienceCollege", "secondCanteen", "one", "kjy"];
  const known = [...set].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  const extra = [...set].filter((s) => !order.includes(s)); // 未来新增站点自动归入
  return { all: [...known, ...extra], extras: extra, cfg };
}

function stopGroups(m) {
  const { all } = deriveStops(m);
  if (m === "campus") {
    // 校区通勤：按院区分组
    const titleOf = (s) => {
      const a = areaOf(s);
      if (a === "campus-one") return "一号院";
      if (a === "campus-three") return "三号院";
      if (a === "campus-four") return "四号院";
      if (a === "family-zone") return "家属区";
      return "其他站点";
    };
    const groups = []; const seen = new Set();
    for (const title of [...new Set(all.map(titleOf))]) {
      const stops = all.filter((s) => titleOf(s) === title && !seen.has(s));
      stops.forEach((s) => seen.add(s));
      if (stops.length) groups.push({ title, stops });
    }
    return groups;
  }
  // 院内通勤：按生活圈分组（基于打标数据自动扩展）
  const groups = []; const seen = new Set();
  for (const svc of DATA.services) {
    if (!MODES.inner.test(svc)) continue;
    for (const tag of (svc.tags || [])) {
      const title = LIFE_TAG_TITLES[tag];
      if (!title) continue;
      if (!groups.find((g) => g.title === title)) groups.push({ title, stops: [] });
      const g = groups.find((x) => x.title === title);
      for (const s of svc.orderedStops) {
        if (!seen.has(s.stop)) { seen.add(s.stop); g.stops.push(s.stop); }
      }
    }
  }
  // 全局排序（preferredOrder 思路）：按 deriveStops 顺序重排各组内站点
  const order = deriveStops("inner").all;
  for (const g of groups) g.stops.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return groups.filter((g) => g.stops.length);
}

let DATA = null, POI = null, map = null, markerLayer = null, lineLayer = null;
let queryMode = "now";
let ttProfile = "monThu";
let mode = "campus";
let picks = { campus: { from: null, to: null }, inner: { from: null, to: null } };
let sheetTarget = null; // "from" | "to"
let nextBusInfo = null; // {hhmm, seenAt} for live countdown

function $(id) { return document.getElementById(id); }
function pad(n) { return String(n).padStart(2, "0"); }
function fmtHM(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addMin(hhmm, mins) {
  if (mins == null) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h * 60 + m + mins) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
function toMinutes(hhmm) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
function label(stop) { return STOP_LABELS[stop] || stop; }
function esc(s) { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }

// ---------- WGS-84 -> GCJ-02 ----------
function wgs2gcj(lat, lng) {
  const a = 6378245.0, ee = 0.00669342162296594323;
  const tl = (x, y) => {
    let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    r += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
    r += (160 * Math.sin(x / 12 * Math.PI) + 320 * Math.sin(x * Math.PI / 30)) * 2 / 3;
    return r;
  };
  const tl2 = (x, y) => {
    let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    r += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
    r += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
    return r;
  };
  let dLat = tl(lng - 105, lat - 35);
  let dLng = tl2(lng - 105, lat - 35);
  const radLat = (lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return [lat + dLat, lng + dLng];
}

// ---------- date context ----------
function dayContext(date) {
  const day = DAY_NAMES[date.getDay()];
  const iso = isoDate(date);
  const isHoliday = DATA.extras.holidays2026.includes(iso);
  const hn = DATA.extras.holidayNotice;
  const suspended = hn && hn.start && iso >= hn.start && iso < hn.endExclusive;
  let profile;
  if (day === "sat") profile = "saturday";
  else if (day === "sun") profile = "sunday";
  else if (day === "fri") profile = "friday";
  else profile = "monThu";
  return { day, iso, isHoliday, suspended, profile };
}

function tripRunsOnProfile(trip, profile) {
  return trip.days.some((d) => PROFILE_DAYS[profile].includes(d));
}

function canonLine(line) {
  return line.replace("（线路8/8号线）", "").replace("8号线（线路8）", "线路8").replace("线路8（8号线）", "线路8");
}

function collectCandidates(from, to, ctx, whenMin) {
  const out = [];
  const seen = new Map();
  for (const svc of DATA.services) {
    if (!MODES[mode].test(svc)) continue;
    const ordered = svc.orderedStops;
    const fi = ordered.findIndex((s) => s.stop === from);
    const ti = ordered.findIndex((s) => s.stop === to);
    if (fi < 0 || ti < 0 || ti <= fi) continue;
    for (const trip of svc.trips) {
      trip._holidayOk = svc.holidayOk === true;
      if (ctx.suspended) continue;
      if (ctx.isHoliday && !trip._holidayOk) continue;
      if (!tripRunsOnProfile(trip, ctx.profile)) continue;
      const fromTime = addMin(trip.depart, ordered[fi].m);
      if (toMinutes(fromTime) < whenMin - 1) continue;
      const toTime = ordered[ti].m != null ? addMin(trip.depart, ordered[ti].m) : null;
      const key = `${canonLine(svc.line)}|${from}|${to}|${fromTime}`;
      if (seen.has(key)) {
        const ex = seen.get(key);
        trip.sources.forEach((s) => { if (!ex.sources.includes(s)) ex.sources.push(s); });
        continue;
      }
      const row = {
        _key: key, line: svc.line, canon: canonLine(svc.line), kind: svc.kind,
        fromTime, toTime, sources: [...trip.sources], express: svc.express,
        extraNote: svc.extraNote, walk: svc.extraNote && svc.extraNote.includes("步行"),
      };
      seen.set(key, row);
      out.push(row);
    }
  }
  out.sort((a, b) => toMinutes(a.fromTime) - toMinutes(b.fromTime));
  return out;
}

// ---------- badges ----------
function sourceBadge(s) {
  if (s.includes("official")) return '<span class="src-badge src-official">官方表</span>';
  if (s.includes("siteA")) return '<span class="src-badge src-web">网站A</span>';
  if (s.includes("siteB")) return '<span class="src-badge src-web">网站B</span>';
  return "";
}

// ---------- planner UI ----------
function renderPicks() {
  const p = picks[mode];
  const fv = $("fromValue"), tv = $("toValue");
  fv.textContent = p.from ? label(p.from) : MODES[mode].label === "校区通勤" ? "点击选择上车点" : "点击选择上车点";
  fv.classList.toggle("placeholder", !p.from);
  tv.textContent = p.to ? label(p.to) : "点击选择目的地";
  tv.classList.toggle("placeholder", !p.to);
}

function setMode(next) {
  if (mode === next) return;
  mode = next;
  const pool = new Set(deriveStops(mode).all);
  for (const k of ["from", "to"]) {
    if (!pool.has(picks[mode][k])) picks[mode][k] = k === "from" ? MODES[mode].defaultFrom : MODES[mode].defaultTo;
  }
  document.querySelector(".mode-seg").dataset.active = mode;
  document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  renderPicks();
  const ctx = dayContext(new Date());
  const p = picks[mode];
  if (p.from && p.to && p.from !== p.to) doQuery();
  else {
    $("resultList").innerHTML = `<div class="empty">${esc(MODES[mode].label)}模式<br>选择起终点后规划班次</div>`;
    $("dayLabel").textContent = ctx.suspended ? "假期停运" : (ctx.isHoliday ? "节假日" : PROFILE_LABELS[ctx.profile].replace("运行表", ""));
    $("queryMeta").textContent = `${MODES[mode].label} · 默认 ${label(MODES[mode].defaultFrom)} → ${label(MODES[mode].defaultTo)}`;
  }
  renderTimetable(ttProfile);
}

// ---------- bottom sheet ----------
let recentCache = { campus: [], inner: [] };
function loadRecent() {
  try { recentCache = JSON.parse(localStorage.getItem("bushelper-recent") || "{}"); } catch { recentCache = { campus: [], inner: [] }; }
  recentCache.campus = recentCache.campus || []; recentCache.inner = recentCache.inner || [];
}
function pushRecent(stop) {
  const arr = recentCache[mode].filter((x) => x !== stop);
  arr.unshift(stop);
  recentCache[mode] = arr.slice(0, 4);
  localStorage.setItem("bushelper-recent", JSON.stringify(recentCache));
}

function openSheet(target) {
  sheetTarget = target;
  $("sheetTitle").textContent = target === "from" ? "选择上车点" : "选择下车站点";
  $("sheetSearch").value = "";
  renderSheetList("");
  renderRecent();
  const bd = $("sheetBackdrop"), sh = $("sheet");
  bd.hidden = false; sh.hidden = false;
  requestAnimationFrame(() => { bd.classList.add("show"); sh.classList.add("show"); });
  setTimeout(() => $("sheetSearch").focus(), 380);
}
function closeSheet() {
  const bd = $("sheetBackdrop"), sh = $("sheet");
  bd.classList.remove("show"); sh.classList.remove("show");
  setTimeout(() => { bd.hidden = true; sh.hidden = true; }, 420);
}
function renderRecent() {
  const wrap = $("sheetRecent");
  const arr = recentCache[mode] || [];
  if (!arr.length) { wrap.hidden = true; wrap.innerHTML = ""; return; }
  wrap.hidden = false;
  wrap.innerHTML = arr.map((s) => `<button class="recent-chip" data-stop="${s}" type="button">${esc(label(s))}</button>`).join("");
  [...wrap.querySelectorAll(".recent-chip")].forEach((b) => b.addEventListener("click", () => pickStop(b.dataset.stop)));
}
function renderSheetList(filter) {
  const list = $("sheetList");
  const current = picks[mode][sheetTarget];
  const f = (filter || "").trim().toLowerCase();
  let html = "";
  for (const group of stopGroups(mode)) {
    const stops = group.stops.filter((s) => !f || label(s).toLowerCase().includes(f) || s.includes(f));
    if (!stops.length) continue;
    html += `<p class="stop-group-title">${esc(group.title)}</p>`;
    html += stops.map((s) => `
      <button class="stop-item ${s === current ? "selected" : ""}" data-stop="${s}" type="button">
        <span class="stop-name">${esc(label(s))}</span>
        ${s === current ? '<span class="stop-check">✓</span>' : ""}
      </button>`).join("");
  }
  list.innerHTML = html || '<div class="empty">没有匹配的站点</div>';
  [...list.querySelectorAll(".stop-item")].forEach((b) => b.addEventListener("click", () => pickStop(b.dataset.stop)));
}
function pickStop(stop) {
  picks[mode][sheetTarget] = stop;
  pushRecent(stop);
  renderPicks();
  closeSheet();
  if (picks[mode].from && picks[mode].to && picks[mode].from !== picks[mode].to) doQuery();
}

// ---------- results ----------
function sourceBadge(s) {
  if (s.includes("official")) return '<span class="src-badge src-official">官方表</span>';
  if (s.includes("siteA")) return '<span class="src-badge src-web">网站A</span>';
  if (s.includes("siteB")) return '<span class="src-badge src-web">网站B</span>';
  return "";
}

let currentTo = null;

function renderResults(list, ctx, from, to, whenMin) {
  const box = $("resultList");
  nextBusInfo = null;
  if (ctx.suspended) {
    const hn = DATA.extras.holidayNotice;
    box.innerHTML = `<div class="empty">⛔ 假期停运中（${hn.start} ~ ${hn.endExclusive}）<br>请勿按班次候车，具体安排以学校最新通知为准。</div>`;
    return;
  }
  if (ctx.isHoliday) {
    box.innerHTML = `<div class="empty">节假日常规班车停开，仅观光车运行。</div>` + list.map(renderCard).join("");
    return;
  }
  if (!list.length) {
    box.innerHTML = `<div class="empty">今日 ${esc(label(from))} → ${esc(label(to))} 暂无后续班次。<br>
      <button class="link-btn" id="reverseBtn" type="button">⇅ 查反向：${esc(label(to))} → ${esc(label(from))}</button></div>`;
    const rb = $("reverseBtn");
    if (rb) rb.addEventListener("click", () => {
      picks[mode].from = to; picks[mode].to = from;
      renderPicks(); doQuery();
    });
    return;
  }
  const next = list[0];
  const waitMin = Math.max(0, toMinutes(next.fromTime) - whenMin);
  nextBusInfo = { hhmm: next.fromTime };
  let html = `<div class="next-card">
    <p class="next-line">${esc(next.line)}${next.express ? '<span class="express-label">（快车）</span>' : ""} ${next.sources.map(sourceBadge).join("")}</p>
    <p class="next-time" id="nextTime">${next.fromTime}</p>
    <p class="next-wait" id="nextWait"></p>
    ${next.toTime ? `<p class="next-wait">到达 ${esc(label(to))} 约 ${next.toTime}</p>` : ""}
    ${next.extraNote ? `<p class="note-line">${esc(next.extraNote)}</p>` : ""}
  </div>`;
  if (list.length > 1) {
    html += `<p class="sub-head">后面几班</p>`;
    html += list.slice(1, 9).map((r, i) => renderCard(r, i)).join("");
  }
  box.innerHTML = html;
  updateCountdown();
}

function renderCard(r, i) {
  return `<div class="trip-card" style="--td:${(i || 0) * 0.05}s">
    <div class="trip-top"><span class="trip-line">${esc(r.line)}${r.express ? '<span class="express-label">（快车）</span>' : ""}</span>
    <span class="trip-time">${r.fromTime}</span></div>
    <div class="trip-meta">${r.kind && KIND_BADGE[r.kind] ? `<span class="kind-badge">${KIND_BADGE[r.kind]}</span>` : ""}
    ${r.toTime ? `<span>到达 ${esc(label(currentTo))} ${r.toTime}</span>` : ""}
    ${r.sources.map(sourceBadge).join("")}</div>
    ${r.walk ? `<div class="walk-note">🚶 ${esc(DATA.extras.dormWalkNotice || "上车点需步行前往")}</div>` : ""}
  </div>`;
}

function updateCountdown() {
  if (!nextBusInfo) return;
  const el = $("nextWait"), tEl = $("nextTime");
  if (!el) return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const diff = toMinutes(nextBusInfo.hhmm) - nowMin;
  if (diff <= 0) {
    el.innerHTML = `<span class="next-countdown">正在发车 · 请尽快上车</span>`;
    tEl.classList.add("soon");
    return;
  }
  tEl.classList.remove("soon");
  if (diff < 60) {
    el.innerHTML = `<span class="next-countdown">还有 ${Math.ceil(diff)} 分钟</span> · ${nextBusInfo.hhmm} 发车`;
  } else {
    el.innerHTML = `还有 ${Math.floor(diff / 60)} 小时 ${Math.round(diff % 60)} 分 · ${nextBusInfo.hhmm} 发车`;
  }
}
setInterval(updateCountdown, 1000);

function doQuery() {
  const p = picks[mode];
  if (!p.from || !p.to) return;
  if (p.from === p.to) { $("resultList").innerHTML = '<div class="empty">起点和终点不能相同</div>'; return; }
  currentTo = p.to;
  const ctx = dayContext(new Date());
  let when = new Date();
  if (queryMode === "manual") {
    const v = $("queryDateTime") ? $("queryDateTime").value : "";
    if (v) when = new Date(v);
  }
  const whenMin = when.getHours() * 60 + when.getMinutes();
  const list = collectCandidates(p.from, p.to, ctx, whenMin);
  $("dayLabel").textContent = ctx.suspended ? "假期停运" : (ctx.isHoliday ? "节假日" : PROFILE_LABELS[ctx.profile].replace("运行表", ""));
  $("queryMeta").textContent = `${MODES[mode].label} · ${isoDate(when)} ${fmtHM(when)} · ${label(p.from)} → ${label(p.to)}`;
  renderResults(list, ctx, p.from, p.to, whenMin);
}

// ---------- timetable detail ----------
function renderTimetable(profile) {
  const box = $("timetableList");
  const hint = $("ttHint");
  const ctx = dayContext(new Date());
  if (ctx.suspended) {
    hint.textContent = "";
    box.innerHTML = `<div class="empty">⛔ 假期停运中（${DATA.extras.holidayNotice.start} ~ ${DATA.extras.holidayNotice.endExclusive}）。</div>`;
    return;
  }
  hint.textContent = ctx.isHoliday
    ? `今日法定节假日 · 显示${PROFILE_LABELS[profile]}（仅观光车今日实际运行）`
    : `今日为${PROFILE_LABELS[ctx.profile]} · 显示${PROFILE_LABELS[profile]} · ${MODES[mode].label}`;
  const groups = {};
  for (const svc of DATA.services) {
    if (!MODES[mode].test(svc)) continue;
    const times = svc.trips.filter((t) => tripRunsOnProfile(t, profile)).map((t) => t.depart).sort();
    if (!times.length) continue;
    const routeStr = svc.orderedStops.map((s) => label(s.stop) + (s.m ? ` +${s.m}分` : "")).join(" → ");
    const key = `${svc.line}|${routeStr}`;
    if (!groups[key]) groups[key] = { line: svc.line, routeStr, times: new Set(), express: svc.express, extra: svc.extraNote, kind: svc.kind };
    times.forEach((t) => groups[key].times.add(t));
  }
  const html = Object.values(groups).map((g) => `
    <div class="tt-card" data-route="${esc(g.routeStr)}">
      <div class="tt-head"><span class="trip-line">${esc(g.line)}${g.express ? '<span class="express-label">（快车）</span>' : ""}</span>
      <span class="kind-badge">${KIND_BADGE[g.kind] || ""}</span></div>
      <div class="tt-route">${esc(g.routeStr)}</div>
      <div class="tt-times">${[...g.times].sort().map((t) => `<span class="tt-time">${t}</span>`).join("")}</div>
      ${g.extra ? `<div class="note-line">${esc(g.extra)}</div>` : ""}
    </div>`).join("");
  box.innerHTML = html || '<div class="empty">该运行表暂无班次</div>';
  [...box.querySelectorAll(".tt-card")].forEach((el) => {
    el.addEventListener("click", () => highlightRoute(el.dataset.route));
  });
}

// ---------- map ----------
function initMap() {
  map = L.map("map", { scrollWheelZoom: true });
  L.tileLayer("https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}", {
    subdomains: "1234", maxZoom: 18, attribution: "高德栅格瓦片",
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  lineLayer = L.layerGroup().addTo(map);
  const pts = [];
  for (const [key, p] of Object.entries(POI.poi)) {
    const [gLat, gLng] = wgs2gcj(p.lat, p.lng);
    const color = p.precision === "geocoded" ? "#34c759" : "#ff9500";
    L.circleMarker([gLat, gLng], { radius: 7, color, fillColor: color, fillOpacity: 0.9, weight: 2 })
      .bindPopup(`<b>${esc(label(key))}</b><br>精度: ${esc(p.precision)}<br>${esc(p.display || "")}`)
      .addTo(markerLayer);
    pts.push([gLat, gLng]);
  }
  map.fitBounds(L.latLngBounds(pts).pad(0.15));
}

let highlightPolyline = null;
function highlightRoute(routeStr) {
  if (!map || !routeStr) return;
  const stops = routeStr.split(" → ").map((s) => s.replace(/ \+\d+分/, ""));
  const byLabel = {};
  for (const [key, p] of Object.entries(POI.poi)) byLabel[label(key)] = p;
  const coords = stops.map((s) => byLabel[s]).filter(Boolean).map((p) => { const [a, b] = wgs2gcj(p.lat, p.lng); return [a, b]; });
  if (coords.length < 2) return;
  if (highlightPolyline) lineLayer.removeLayer(highlightPolyline);
  highlightPolyline = L.polyline(coords, { color: "#3e73c4", weight: 5, opacity: 0.85, dashArray: "10 6" }).addTo(lineLayer);
  map.fitBounds(highlightPolyline.getBounds().pad(0.25));
  $("mapPanel").scrollIntoView({ behavior: "smooth" });
}

// ---------- init ----------
function tickClock() {
  const now = new Date();
  $("currentTime").textContent = fmtHM(now);
}

async function main() {
  loadRecent();
  const VER = "13.1"; // 数据版本：更新数据后递增以击穿缓存
  [DATA, POI] = await Promise.all([
    fetch(`./data/merged/schedule.json?v=${VER}`).then((r) => r.json()),
    fetch(`./data/merged/poi.json?v=${VER}`).then((r) => r.json()),
  ]);
  AREAS = DATA.areas || {};
  tickClock(); setInterval(tickClock, 1000);
  initMap();

  const ctx = dayContext(new Date());
  ttProfile = ctx.profile;
  const hn = DATA.extras.holidayNotice;
  if (ctx.suspended && hn) {
    $("holidayBannerText").textContent = `假期期间班车停运（${hn.start} ~ ${hn.endExclusive}），请勿按班次候车。以学校最新通知为准。`;
    $("holidayBanner").hidden = false;
  } else if (ctx.isHoliday) {
    $("holidayBannerText").textContent = "今日为法定节假日：常规班车停开，观光车按周末运行表开行。";
    $("holidayBanner").hidden = false;
  }

  // defaults per mode
  picks.campus = { from: MODES.campus.defaultFrom, to: MODES.campus.defaultTo };
  picks.inner = { from: MODES.inner.defaultFrom, to: MODES.inner.defaultTo };
  renderPicks();

  // mode switching
  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.addEventListener("click", () => setMode(b.dataset.mode));
  });

  // planner
  $("fromPick").addEventListener("click", () => openSheet("from"));
  $("toPick").addEventListener("click", () => openSheet("to"));
  $("swapBtn").addEventListener("click", () => {
    const p = picks[mode];
    const t = p.from; p.from = p.to; p.to = t;
    renderPicks();
    if (p.from && p.to && p.from !== p.to) doQuery();
  });
  $("querySubmit").addEventListener("click", doQuery);

  // sheet
  $("sheetClose").addEventListener("click", closeSheet);
  $("sheetBackdrop").addEventListener("click", closeSheet);
  $("sheetSearch").addEventListener("input", (e) => renderSheetList(e.target.value));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

  // query mode seg (now vs manual) injected into planner card
  const plannerCard = $("fromPick").parentElement;
  const manualWrap = document.createElement("div");
  manualWrap.className = "seg-control small";
  manualWrap.style.marginTop = "4px";
  manualWrap.innerHTML = `
    <span class="seg-thumb" id="qThumb"></span>
    <button class="seg active" data-query-mode="now" type="button">现在出发</button>
    <button class="seg" data-query-mode="manual" type="button">稍后出发</button>`;
  plannerCard.insertBefore(manualWrap, $("querySubmit"));
  const dtInput = document.createElement("input");
  dtInput.className = "input";
  dtInput.type = "datetime-local";
  dtInput.id = "queryDateTime";
  dtInput.hidden = true;
  dtInput.style.marginBottom = "12px";
  plannerCard.insertBefore(dtInput, $("querySubmit"));
  document.querySelectorAll("[data-query-mode]").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("[data-query-mode]").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      queryMode = b.dataset.queryMode;
      const inp = $("queryDateTime");
      inp.hidden = queryMode !== "manual";
      if (queryMode === "manual" && !inp.value) {
        const d = new Date();
        inp.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${fmtHM(d)}`;
      }
      $("qThumb").style.transform = queryMode === "manual" ? "translateX(100%)" : "translateX(0)";
      if (queryMode === "manual") inp.hidden = false; else inp.hidden = true;
    });
  });

  // timetable toggle + tabs
  $("ttToggle").addEventListener("click", () => {
    const card = $("timetableCard");
    const open = card.classList.toggle("open");
    $("ttToggle").setAttribute("aria-expanded", String(open));
    if (open) renderTimetable(ttProfile);
  });
  document.querySelectorAll("#ttTabs .seg").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#ttTabs .seg").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      ttProfile = b.dataset.profile;
      const idx = [...document.querySelectorAll("#ttTabs .seg")].indexOf(b);
      $("ttThumb").style.transform = `translateX(${idx * 100}%)`;
      renderTimetable(ttProfile);
    });
  });
  document.querySelectorAll("#ttTabs .seg").forEach((b, i) => {
    const on = b.dataset.profile === ttProfile;
    b.classList.toggle("active", on);
    if (on) $("ttThumb").style.transform = `translateX(${i * 100}%)`;
  });

  // remove skeletons and run first query
  document.body.classList.remove("loading");
  doQuery();
}

main().catch((e) => {
  document.body.classList.remove("loading");
  $("resultList").innerHTML = `<div class="empty">数据加载失败: ${esc(e.message)}</div>`;
  console.error(e);
});
