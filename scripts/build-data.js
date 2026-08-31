#!/usr/bin/env node
/**
 * NudtBus13 data builder
 * Parses Firecrawl-scraped app.js sources + official image transcriptions
 * into a single merged schedule.json used by the website.
 *
 * Usage: node scripts/build-data.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "data", "sources");
const OUT = path.join(ROOT, "data", "merged");

// ---------- helpers ----------
function read(p) {
  return fs.readFileSync(p, "utf8");
}
function unescapeFirecrawlMd(md) {
  // Firecrawl escapes markdown specials inside code: \_ \* \[
  md = md.replace(/\\([_*[\]`])/g, "$1");
  // Fix double-encoded UTF-8 (mojibake) when present.
  // Compute each known correct string's latin1-misdecoded form programmatically
  // (hand-typing it fails because it contains invisible control chars).
  const nonLatin = (md.match(/[\u00C0-\u00FF]/g) || []).length;
  if (nonLatin > 50) {
    const correct = [
      "8号线", "气海班车", "系统班车", "理学院班车", "空天班车",
      "主楼旁发车", "系统楼东侧发车", "气海学院楼前发车", "气海学院楼北侧发车",
      "老系统楼前发车", "理学院南侧发车", "空天楼前发车", "高超楼前发车",
    ];
    for (const good of correct) {
      const bad = Buffer.from(good, "utf8").toString("latin1");
      md = md.split(bad).join(good);
    }
  }
  return md;
}
function extractBetween(text, startMarker, endMarker) {
  const i = text.indexOf(startMarker);
  if (i < 0) throw new Error(`marker not found: ${startMarker}`);
  const j = endMarker ? text.indexOf(endMarker, i) : text.length;
  return text.slice(i, j > 0 ? j : undefined);
}
function parseTimes(block) {
  return [...block.matchAll(/"(\d{2}:\d{2})"/g)].map((m) => m[1]);
}

// nudtbus Chinese labels are lossy-mojibake'd at fetch time; times/structure are
// intact. Map each (dayProfile, origin, departures) signature to the known line+note.
const NUDT_SIGNATURES = (() => {
  const l8 = { line: "8号线", notes: { one: "主楼旁发车", three: "系统楼东侧发车" } };
  const map = {};
  const L8monThuOne = ["07:10","07:20","07:30","09:20","09:30","11:25","13:50","14:00","15:30","16:25","18:55","21:00"];
  const L8monThuThree = ["07:50","09:45","10:00","12:00","12:35","13:45","16:25","17:05","17:30","17:40","17:55","18:25","21:00","21:30","21:35","21:55","22:15"];
  const L8friThree = ["07:50","09:45","10:00","12:00","12:35","13:45","16:25","17:05","17:30","17:40","17:55","18:25","21:00","21:35","21:55","22:15"];
  const L8satOne = ["07:20","09:30","11:25","13:50","15:30","18:55"];
  const L8satThree = ["07:50","10:00","12:00","12:35","16:25","17:30","18:25","21:35","22:15"];
  const L8sunOne = ["07:20","09:30","13:50"];
  const L8sunThree = ["12:35","17:30","22:15"];
  map[`monThu>one:${L8monThuOne}`] = l8; map[`friday>one:${L8monThuOne}`] = l8;
  map[`monThu>three:${L8monThuThree}`] = l8; map[`friday>three:${L8friThree}`] = l8;
  map[`saturday>one:${L8satOne}`] = l8; map[`saturday>three:${L8satThree}`] = l8;
  map[`sunday>one:${L8sunOne}`] = l8; map[`sunday>three:${L8sunThree}`] = l8;
  const put = (line, note, dayProfile, origin, deps) => { map[`${dayProfile}>${origin}:${deps}`] = { line, notes: { [origin]: note } }; };
  put("气海班车", "气海学院楼北侧发车", "weekday", "three", ["07:30","18:00","20:30"]);
  put("气海班车", "气海学院楼前发车", "weekday", "one", ["08:30","18:50","21:10"]);
  put("系统班车", "老系统楼前发车", "weekday", "one", ["07:25","14:00"]);
  put("系统班车", "系统楼东侧发车", "weekday", "three", ["12:05","17:50","21:00"]);
  put("理学院班车", "主楼旁发车", "weekday", "one", ["07:15","20:55"]);
  put("理学院班车", "理学院南侧发车", "weekday", "three", ["20:20"]);
  put("空天班车", "空天楼前发车", "weekday", "one", ["07:25"]);
  put("空天班车", "高超楼前发车", "weekday", "three", ["09:50"]);
  return map;
})();

// ---------- 1. nudtbus.online ----------
function parseNudtbus() {
  const md = unescapeFirecrawlMd(read(path.join(SRC, "nudtbus", "nudtbus-appjs.md")));
  const servicesBlock = extractBetween(md, "const SERVICES = [", "\n];\n\nconst elements");
  const chunks = servicesBlock.split("createService(").slice(1);
  const lines = [];
  for (const c of chunks) {
    const args = c.split("],")[0];
    const labelM = c.match(/"([^"]+)",\s*"(monThu|friday|saturday|sunday|weekday)",\s*"(one|three)",\s*"(one|three)"/);
    if (!labelM) continue;
    const [, lineLabel, dayProfile, origin, dest] = labelM;
    const times = parseTimes(c);
    let note = "";
    const noteM = c.match(/\],\s*"([^"]*)"\s*\)/);
    if (noteM && noteM[1]) note = noteM[1];
    else if (lineLabel === "8号线") note = origin === "one" ? "主楼旁发车" : "系统楼东侧发车";
    const sig = `${dayProfile}>${origin}:${times.join(",")}`;
    const known = NUDT_SIGNATURES[sig];
    if (!known) throw new Error(`Unknown nudtbus service signature: ${sig}`);
    lines.push({
      line: known.line,
      dayProfile,
      origin,
      dest,
      departures: times,
      note: known.notes[origin] || note,
      sources: ["nudtbus-v29"],
    });
  }
  const holidayM = md.match(/HOLIDAY_NOTICE_START_DATE = "([^"]+)"/);
  const holidayEndM = md.match(/HOLIDAY_NOTICE_END_EXCLUSIVE_DATE = "([^"]+)"/);
  return {
    lines,
    holidayNotice: {
      start: holidayM ? holidayM[1] : null,
      endExclusive: holidayEndM ? holidayEndM[1] : null,
      text: "假期期间班车停运，请勿按页面班次候车。具体安排请以学校最新通知为准。",
    },
    version: "v29-holiday-notice",
  };
}

// ---------- 2. bus2.qiutao20.online ----------
function parseBus2() {
  const md = unescapeFirecrawlMd(read(path.join(SRC, "bus2", "bus2-appjs.md")));
  const out = { stops: {}, schedules: {}, sightseeing: [], crowdRules: null, holidays2026: [], version: "v20260725-v8-dev3" };

  // stops
  const stopsBlock = extractBetween(md, "const STOPS = {", "const COLLEGE");
  for (const m of stopsBlock.matchAll(/(\w+): \{\s*id: "(\w+)",\s*label: "([^"]+)"/g)) {
    out.stops[m[1]] = { id: m[2], label: m[3] };
  }

  // main schedules
  const schedBlock = extractBetween(md, "const SCHEDULES = {", "\nconst elements");
  for (const dayKey of ["everyday", "monThu", "friday", "saturday", "sunday"]) {
    const dayM = schedBlock.match(new RegExp(`${dayKey}: \\[([\\s\\S]*?)(?=\\n  \\],|\\n\\],|$)`));
    if (!dayM) continue;
    out.schedules[dayKey] = [];
    for (const c of dayM[1].split("createService(").slice(1)) {
      const headM = c.match(/"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/);
      if (!headM) continue;
      const [, line, origin, dest] = headM;
      const times = parseTimes(c);
      let offsets = {};
      const offM = c.match(/\{([\s\S]*)\}\)/);
      if (offM) {
        for (const om of offM[1].matchAll(/(\w+):\s*([A-Z_]+|\d+)/g)) {
          offsets[om[1]] = om[2] === "COLLEGE_OFFSET_SPECIAL_MINUTES" ? 7 : parseInt(om[2], 10);
        }
      }
      out.schedules[dayKey].push({ line, origin, dest, departures: times, offsets, sources: ["bus2-v8dev3"] });
    }
  }

  // sightseeing
  const sightBlocks = [
    ["weekend", extractBetween(md, "const WEEKEND_HOLIDAY_SIGHTSEEING_SERVICES = [", "\n];")],
    ["weekday", extractBetween(md, "const WEEKDAY_SIGHTSEEING_SERVICES = [", "\n];")],
  ];
  for (const [tag, block] of sightBlocks) {
    for (const c of block.split("createService(").slice(1)) {
      const headM = c.match(/"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/);
      if (!headM) continue;
      const [, line, origin, dest] = headM;
      const times = parseTimes(c);
      let offsets = {};
      const offM = c.match(/\{([\s\S]*)\}\)/);
      if (offM) {
        for (const om of offM[1].matchAll(/(\w+):\s*(\d+)/g)) offsets[om[1]] = parseInt(om[2], 10);
      }
      out.sightseeing.push({ line, origin, dest, dayType: tag, departures: times, offsets, sources: ["bus2-v8dev3"] });
    }
  }

  // crowd rules
  const crowdBlock = extractBetween(md, "const CROWD_RULES = {", "\nconst DORM_WALK_LINES");
  out.crowdRules = { dorm: {}, college: {} };
  for (const m of crowdBlock.matchAll(/(mild|high): \[([^\]]*)\]/g)) {
    const times = [...m[2].matchAll(/"(\d{2}:\d{2})"/g)].map((x) => x[1]);
    if (crowdBlock.indexOf("dorm") < crowdBlock.indexOf(m[0])) out.crowdRules.dorm[m[1]] = times;
    else out.crowdRules.college[m[1]] = times;
  }

  // holidays
  const holBlock = extractBetween(md, "const HOLIDAY_DATES_2026 = new Set([", "])");
  out.holidays2026 = [...holBlock.matchAll(/"(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);

  // walk notice + offsets constants
  const walkM = md.match(/const DORM_WALK_NOTICE = "([^"]+)"/);
  out.dormWalkNotice = walkM ? walkM[1] : null;
  const collegeSpecialM = md.match(/const COLLEGE_OFFSET_SPECIAL_MINUTES = (\d+)/);
  out.collegeOffsetSpecialMinutes = collegeSpecialM ? parseInt(collegeSpecialM[1], 10) : null;
  for (const [name, key] of [
    ["LOOP_ONE_ADDITIONAL_STOP_OFFSETS", "loopOneOffsets"],
    ["LOOP_THREE_FROM_DORM_ADDITIONAL_STOP_OFFSETS", "loopThreeFromDormOffsets"],
    ["LOOP_THREE_FROM_COLLEGE_ADDITIONAL_STOP_OFFSETS", "loopThreeFromCollegeOffsets"],
    ["DINING_ADDITIONAL_STOP_OFFSETS", "diningOffsets"],
  ]) {
    const b = extractBetween(md, `const ${name} = {`, "};");
    const o = {};
    for (const m of b.matchAll(/(\w+):\s*(\d+)/g)) o[m[1]] = parseInt(m[2], 10);
    out[key] = o;
  }
  return out;
}

// ---------- 3. official image transcriptions (curated inline; parsed from md files) ----------
function parseOfficialCampus() {
  const md = read(path.join(SRC, "official", "campus-shuttle-2026-03-09.md"));
  const rows = [];
  for (const m of md.matchAll(/\| (线路\d) \| ([^|]+)\| ([^|]+)\| ([^|]*)\|/g)) {
    const line = m[1].trim();
    const dir = m[2].trim();
    const times = [...m[3].matchAll(/(\d{2}:\d{2})(（[六日]）)?/g)].map(
      (t) => ({ time: t[1], day: t[2] ? (t[2].includes("六") ? "saturday" : "sunday") : "monFri" })
    );
    rows.push({ line, dir, times, note: m[4].trim(), sources: ["official-2026-03-09"] });
  }
  return rows;
}

// ---------- 4. normalize into unified services model ----------
const DAYS = { monThu: ["mon", "tue", "wed", "thu"], friday: ["fri"], saturday: ["sat"], sunday: ["sun"], weekday: ["mon", "tue", "wed", "thu", "fri"], monFri: ["mon", "tue", "wed", "thu", "fri"], all7: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], weekend: ["sat", "sun"] };

function normalize(nudt, bus2, official) {
  const services = [];
  const add = (s) => services.push(s);

  // -- nudtbus: 8号线 + 4 college shuttles --
  for (const l of nudt.lines) {
    const isL8 = l.line === "8号线";
    add({
      id: `nb-${isL8 ? "l8" : l.dayProfile}-${l.origin}-${l.dest}`,
      line: isL8 ? "8号线（线路8）" : l.line,
      kind: isL8 ? "intercampus" : "college",
      from: l.origin, to: l.dest,
      orderedStops: isL8
        ? (l.origin === "one"
          ? [{ stop: "one", m: 0 }, { stop: "dorm", m: 25 }, { stop: "three", m: 35 }]
          : [{ stop: "three", m: 0 }, { stop: "one", m: 35 }])
        : [{ stop: l.origin, m: 0 }, { stop: l.dest, m: null }],
      circular: false,
      express: !isL8,
      note: l.note || "",
      extraNote: isL8 ? "全程约35分钟（院际专线口径）" : "",
      trips: l.departures.map((t) => ({ depart: t, days: DAYS[l.dayProfile], sources: ["nudtbus-v29"] })),
    });
  }

  // -- bus2 环线1路 + 就餐专线 (everyday) --
  for (const s of bus2.schedules.everyday || []) {
    const isLoop = s.line === "环线1路";
    const off = { ...s.offsets };
    let ordered;
    if (isLoop) {
      ordered = [
        { stop: "dorm", m: 0 }, { stop: "eastGate", m: off.eastGate ?? 1 }, { stop: "militaryCenter", m: off.militaryCenter ?? 3 },
        { stop: "laserInstitute", m: off.laserInstitute ?? 5 }, { stop: "northGate", m: off.northGate ?? 6 },
        { stop: "three", m: off.college ?? 7 }, { stop: "gaochaoNorth", m: off.gaochaoNorth ?? 8 },
        { stop: "scienceCollege", m: off.scienceCollege ?? 8 }, { stop: "secondCanteen", m: off.secondCanteen ?? 11 },
      ].sort((a, b) => a.m - b.m);
    } else {
      ordered = [{ stop: "three", m: 0 }, { stop: "scienceCollege", m: off.scienceCollege ?? 1 }, { stop: "secondCanteen", m: off.secondCanteen ?? 5 }];
    }
    add({
      id: `b2-${s.line}-${s.origin}`,
      line: s.line, kind: isLoop ? "loop" : "dining",
      from: s.origin === "college" ? "three" : s.origin, to: s.dest === "college" ? "three" : s.dest,
      orderedStops: ordered, circular: isLoop, express: false,
      note: isLoop ? "环线：按顺序沿线停靠" : "就餐专线：系统楼→二食堂（研究生宿舍方向）",
      extraNote: "",
      trips: s.departures.map((t) => ({ depart: t, days: DAYS.all7, sources: ["bus2-v8dev3"] })),
    });
  }

  // -- bus2 线路2/5/7/8 (inter-campus) --
  const B2LINES = {
    "线路2": { from: "kjy", destEta: 23, viaOut: [{ stop: "dorm", m: 20 }, { stop: "three", m: 23 }] },
    "线路5": { from: "jingyuanEast", destEta: 18, viaOut: [{ stop: "dorm", m: 15 }, { stop: "three", m: 18 }] },
    "线路7": { from: "family4", destEta: 43, viaOut: [{ stop: "dorm", m: 40 }, { stop: "three", m: 43 }] },
    "线路8": { from: "one", destEta: 35, viaOut: [{ stop: "dorm", m: 25 }, { stop: "three", m: 35 }] },
  };
  const mergedB2 = {};
  for (const dayKey of ["monThu", "friday", "saturday", "sunday"]) {
    for (const s of bus2.schedules[dayKey] || []) {
      const def = B2LINES[s.line];
      if (!def) continue;
      const out = s.origin !== "college" && s.origin !== "three";
      const key = `${s.line}|${out ? "out" : "ret"}`;
      if (!mergedB2[key]) {
        mergedB2[key] = out
          ? { line: s.line, from: def.from, to: "three", orderedStops: def.viaOut, destEta: def.destEta, trips: new Map() }
          : { line: s.line, from: "three", to: def.from, orderedStops: [{ stop: "three", m: 0 }, { stop: def.from, m: def.destEta }], destEta: def.destEta, trips: new Map() };
      }
      for (const t of s.departures) {
        if (!mergedB2[key].trips.has(t)) mergedB2[key].trips.set(t, { depart: t, days: new Set(), sources: new Set() });
        const trip = mergedB2[key].trips.get(t);
        for (const d of DAYS[dayKey]) trip.days.add(d);
        s.sources.forEach((x) => trip.sources.add(x));
      }
    }
  }

  // -- official campus table: merge 线路2/5/7/8; keep 1/3/4/6 as new services --
  const DIRMAP = { "科大佳园": "kjy", "一号院": "one", "三号院": "three", "四号院": "fourth", "科大景园西门": "jingyuanWest", "科大景园东门": "jingyuanEast", "四号院家属区": "family4" };
  const OFF_NEW = new Set(["线路1", "线路3", "线路4", "线路6"]);
  for (const row of official) {
    const parts = row.dir.split("→");
    const from = DIRMAP[parts[0].trim()], to = DIRMAP[(parts[1] || "").trim()];
    if (!from || !to) continue;
    if (OFF_NEW.has(row.line)) {
      add({
        id: `off-${row.line}-${from}`,
        line: `${row.line}（官方表）`, kind: "family",
        from, to, orderedStops: [{ stop: from, m: 0 }, { stop: to, m: null }],
        circular: false, express: row.note.includes("军车"),
        note: row.note || "", extraNote: "仅见于官方时刻表（网站未收录）",
        trips: row.times.map((t) => ({ depart: t.time, days: DAYS[t.day] || DAYS.monFri, sources: ["official-2026-03-09"] })),
      });
    } else {
      const out = to === "three";
      const key = `${row.line}|${out ? "out" : "ret"}`;
      if (mergedB2[key]) {
        for (const t of row.times) {
          if (!mergedB2[key].trips.has(t.time)) mergedB2[key].trips.set(t.time, { depart: t.time, days: new Set(), sources: new Set() });
          const trip = mergedB2[key].trips.get(t.time);
          for (const d of DAYS[t.day] || DAYS.monFri) trip.days.add(d);
          trip.sources.add("official-2026-03-09");
        }
      }
    }
  }

  for (const [key, svc] of Object.entries(mergedB2)) {
    add({
      id: `b2-${key}`,
      line: svc.line === "线路8" ? "线路8（8号线）" : svc.line,
      kind: svc.line === "线路8" ? "intercampus" : "family",
      from: svc.from, to: svc.to, orderedStops: svc.orderedStops, circular: false, express: false,
      note: svc.line === "线路8" ? "与官方线路8/8号线同一班线" : "家属区/校区接驳线",
      extraNote: "上车点不在宿舍楼下，需步行至对应站点",
      destEtaMin: svc.destEta,
      trips: [...svc.trips.values()].map((t) => ({ depart: t.depart, days: [...t.days], sources: [...t.sources] })),
    });
  }

  // -- sightseeing 环线3路 --
  for (const s of bus2.sightseeing) {
    const out = s.origin === "dorm";
    const ordered = out
      ? [{ stop: "dorm", m: 0 }, { stop: "militaryCenter", m: 3 }, { stop: "laserInstitute", m: 4 }, { stop: "three", m: 5 }, { stop: "gaochaoSouth", m: 6 }, { stop: "scienceCollege", m: 7 }, { stop: "secondCanteen", m: 10 }]
      : [{ stop: "three", m: 0 }, { stop: "scienceCollege", m: 1 }, { stop: "secondCanteen", m: 4 }, { stop: "dorm", m: 7 }, { stop: "militaryCenter", m: 12 }, { stop: "laserInstitute", m: 13 }, { stop: "gaochaoSouth", m: 15 }];
    add({
      id: `b2-loop3-${s.origin}-${s.dayType}`,
      line: "环线3路（观光车）", kind: "sightseeing",
      from: s.origin, to: s.dest, orderedStops: ordered, circular: true, express: false,
      note: "新增观光环线",
      extraNote: s.dayType === "weekend" ? "周末/节假日运行表" : "工作日运行表",
      holidayOk: s.dayType === "weekend",
      trips: s.departures.map((t) => ({ depart: t, days: s.dayType === "weekend" ? DAYS.weekend : DAYS.weekday, sources: ["bus2-v8dev3"] })),
    });
  }

  // -- 系统班车 = 院际专线: enrich sources (official image table confirms) --
  for (const s of services) {
    if (s.line === "系统班车") {
      s.line = "系统班车（院际专线）";
      s.trips.forEach((t) => t.sources.push("official-2025-05-19"));
      s.extraNote = "院际专线：全程约35-40分钟；17:50/21:00 班次途经科大佳园南苑东门";
    }
  }

  return services;
}

// ---------- merge ----------
function main() {
  const nudt = parseNudtbus();
  const bus2 = parseBus2();
  const official = parseOfficialCampus();

  // Cross-check: nudtbus 8号线 vs bus2 线路8 (already known identical); merge into unified "8号线/线路8"
  const merged = {
    meta: {
      generatedAt: new Date().toISOString(),
      snapshotNote: "班车时刻随学期调整，以学校最新通知为准",
      sources: {
        nudtbus: { url: "https://nudtbus.online", version: nudt.version, method: "Firecrawl self-hosted /v2/scrape" },
        bus2: { url: "https://bus2.qiutao20.online", version: bus2.version, method: "Firecrawl self-hosted /v2/scrape" },
        officialCampus: { effective: "2026-03-09", method: "image transcription (redacted)" },
        officialInstitute: { effective: "2025-05-19", method: "image transcription (PII redacted)" },
        handSummary: { method: "image transcription, cross-check only" },
      },
    },
    stops: { ...bus2.stops, one: { id: "one", label: "一号院" }, three: { id: "three", label: "三号院（系统楼）" } },
    lines: { nudtbus: nudt.lines, bus2Schedules: bus2.schedules, sightseeing: bus2.sightseeing, officialCampus: official },
    extras: {
      holidayNotice: nudt.holidayNotice,
      holidays2026: bus2.holidays2026,
      crowdRules: bus2.crowdRules,
      dormWalkNotice: bus2.dormWalkNotice,
      collegeOffsetSpecialMinutes: bus2.collegeOffsetSpecialMinutes,
      offsets: {
        loopOne: bus2.loopOneOffsets,
        loopThreeFromDorm: bus2.loopThreeFromDormOffsets,
        loopThreeFromCollege: bus2.loopThreeFromCollegeOffsets,
        dining: bus2.diningOffsets,
      },
    },
  };

  // normalize into unified services model for the website
  merged.services = normalize(nudt, bus2, official);

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "schedule.json"), JSON.stringify(merged, null, 2));
  const nLines = nudt.lines.length + Object.values(bus2.schedules).flat().length + bus2.sightseeing.length + official.length;
  console.log(`OK schedule.json written: ${nLines} service rows, ${merged.services.length} normalized services`);
  console.log(`  nudtbus lines: ${nudt.lines.length}`);
  console.log(`  bus2 schedule rows: ${Object.values(bus2.schedules).flat().length} + sightseeing ${bus2.sightseeing.length}`);
  console.log(`  official campus rows: ${official.length}`);
  console.log(`  stops: ${Object.keys(merged.stops).length}`);
  console.log(`  holidays2026: ${bus2.holidays2026.length}`);
}

main();
