/* 班车助手 · Apple-inspired
 * Data: data/merged/schedule.json (5-source merged) + data/merged/poi.json (WGS-84)
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

let DATA = null, POI = null, map = null, markerLayer = null, lineLayer = null;
let queryMode = "now";
let ttProfile = "monThu";

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

// ---------- canonical dedupe ----------
function canonLine(line) {
  return line.replace("（线路8/8号线）", "").replace("8号线（线路8）", "线路8").replace("线路8（8号线）", "线路8");
}

function collectCandidates(from, to, ctx, whenMin) {
  const out = [];
  const seen = new Set();
  for (const svc of DATA.services) {
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
        const ex = out.find((r) => r._key === key);
        if (ex) trip.sources.forEach((s) => { if (!ex.sources.includes(s)) ex.sources.push(s); });
        continue;
      }
      seen.add(key);
      out.push({
        _key: key, line: svc.line, canon: canonLine(svc.line), kind: svc.kind,
        fromTime, toTime, sources: [...trip.sources], express: svc.express,
        extraNote: svc.extraNote, walk: svc.extraNote && svc.extraNote.includes("步行"),
      });
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

let currentTo = null;

function renderResults(list, ctx, from, to, whenMin) {
  const box = $("resultList");
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
    box.innerHTML = `<div class="empty">今日 ${esc(label(from))} → ${esc(label(to))} 暂无后续班次。<br>试试 ⇅ 反向查询或其他站点组合。</div>`;
    return;
  }
  const next = list[0];
  const waitMin = Math.max(0, toMinutes(next.fromTime) - whenMin);
  let html = `<div class="next-card">
    <p class="next-line">${esc(next.line)}${next.express ? '<span class="express-label">（快车）</span>' : ""} ${next.sources.map(sourceBadge).join("")}</p>
    <p class="next-time">${next.fromTime}</p>
    <p class="next-wait">${waitMin === 0 ? "即将发车" : `还有 ${waitMin} 分钟`}${next.toTime ? ` · 到达 ${esc(label(to))} 约 ${next.toTime}` : ""}</p>
    ${next.extraNote ? `<p class="note-line">${esc(next.extraNote)}</p>` : ""}
  </div>`;
  if (list.length > 1) {
    html += `<p class="sub-head">后面几班</p>`;
    html += list.slice(1, 9).map(renderCard).join("");
  }
  box.innerHTML = html;
}

function renderCard(r) {
  return `<div class="trip-card">
    <div class="trip-top"><span class="trip-line">${esc(r.line)}${r.express ? '<span class="express-label">（快车）</span>' : ""}</span>
    <span class="trip-time">${r.fromTime}</span></div>
    <div class="trip-meta">${r.kind && KIND_BADGE[r.kind] ? `<span class="kind-badge">${KIND_BADGE[r.kind]}</span>` : ""}
    ${r.toTime ? `<span>到达 ${esc(label(currentTo))} ${r.toTime}</span>` : ""}
    ${r.sources.map(sourceBadge).join("")}</div>
    ${r.walk ? `<div class="walk-note">🚶 ${esc(DATA.extras.dormWalkNotice || "上车点需步行前往")}</div>` : ""}
  </div>`;
}

function doQuery() {
  const from = $("fromStop").value, to = $("toStop").value;
  if (from === to) { $("resultList").innerHTML = '<div class="empty">起点和终点不能相同</div>'; return; }
  currentTo = to;
  const ctx = dayContext(new Date());
  let when = new Date();
  if (queryMode === "manual") {
    const v = $("queryDateTime").value;
    if (v) when = new Date(v);
  }
  const whenMin = when.getHours() * 60 + when.getMinutes();
  const list = collectCandidates(from, to, ctx, whenMin);
  $("dayLabel").textContent = ctx.suspended ? "假期停运" : (ctx.isHoliday ? "节假日" : PROFILE_LABELS[ctx.profile].replace("运行表", ""));
  $("queryMeta").textContent = `${isoDate(when)} ${fmtHM(when)} · ${label(from)} → ${label(to)}`;
  renderResults(list, ctx, from, to, whenMin);
}

// ---------- timetable detail (expandable) ----------
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
    ? "今日为法定节假日：常规班车停开，观光车按周末运行表开行。"
    : `显示${PROFILE_LABELS[profile]}`;
  const groups = {};
  for (const svc of DATA.services) {
    const ordered = svc.orderedStops;
    const times = svc.trips.filter((t) => tripRunsOnProfile(t, profile))
      .map((t) => t.depart).sort();
    if (!times.length) continue;
    const routeStr = ordered.map((s) => label(s.stop) + (s.m ? ` +${s.m}分` : "")).join(" → ");
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
  highlightPolyline = L.polyline(coords, { color: "#0071e3", weight: 5, opacity: 0.85, dashArray: "10 6" }).addTo(lineLayer);
  map.fitBounds(highlightPolyline.getBounds().pad(0.25));
  $("mapPanel").scrollIntoView({ behavior: "smooth" });
}

// ---------- init ----------
function fillStops() {
  const stops = Object.keys(STOP_LABELS).filter((k) => POI.poi[k]);
  const opts = stops.map((k) => `<option value="${k}">${esc(label(k))}</option>`).join("");
  $("fromStop").innerHTML = opts;
  $("toStop").innerHTML = opts;
  $("fromStop").value = "one";
  $("toStop").value = "three";
}

function tickClock() {
  const now = new Date();
  $("currentTime").textContent = fmtHM(now);
  $("currentDate").textContent = `${now.getMonth() + 1}月${now.getDate()}日 星期${["日", "一", "二", "三", "四", "五", "六"][now.getDay()]}`;
}

async function main() {
  [DATA, POI] = await Promise.all([
    fetch("./data/merged/schedule.json").then((r) => r.json()),
    fetch("./data/merged/poi.json").then((r) => r.json()),
  ]);
  fillStops();
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

  $("querySubmit").addEventListener("click", doQuery);
  $("swapBtn").addEventListener("click", () => {
    const f = $("fromStop").value, t = $("toStop").value;
    $("fromStop").value = t;
    $("toStop").value = f;
    doQuery();
  });

  document.querySelectorAll("[data-query-mode]").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("[data-query-mode]").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      queryMode = b.dataset.queryMode;
      $("manualField").classList.toggle("is-hidden", queryMode !== "manual");
      if (queryMode === "manual" && !$("queryDateTime").value) {
        const d = new Date();
        $("queryDateTime").value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${fmtHM(d)}`;
      }
    });
  });

  // 班车表明细 toggle
  $("ttToggle").addEventListener("click", () => {
    const card = $("timetableCard");
    const open = card.classList.toggle("open");
    $("timetableBody").hidden = !open;
    $("ttToggle").setAttribute("aria-expanded", String(open));
    if (open) renderTimetable(ttProfile);
  });
  document.querySelectorAll("#ttTabs .seg").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#ttTabs .seg").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      ttProfile = b.dataset.profile;
      renderTimetable(ttProfile);
    });
  });
  document.querySelectorAll("#ttTabs .seg").forEach((b) => {
    b.classList.toggle("active", b.dataset.profile === ttProfile);
  });

  doQuery();
}

main().catch((e) => {
  document.body.insertAdjacentHTML("afterbegin", `<div class="banner">数据加载失败: ${esc(e.message)}</div>`);
  console.error(e);
});
