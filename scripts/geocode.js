#!/usr/bin/env node
/**
 * Geocode NUDT campus shuttle stops via Photon (OSM-based, keyless).
 * Coordinates are WGS-84; the website converts to GCJ-02 at runtime for
 * GCJ-tiled base maps (AMap raster tiles).
 *
 * Usage: node scripts/geocode.js
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "data", "merged", "poi.json");
const BBOX = "112.8,27.8,113.5,28.7"; // greater Changsha

// Query candidates per stop — first hit whose name passes the filter wins.
const QUERIES = {
  one: [{ q: "中国人民解放军国防科技大学", must: ["国防科技"] }],
  three: [{ q: "国防科技大学三号院", must: ["三号院"] }],
  kjy: [{ q: "科大佳园", must: ["科大佳园"] }],
  kjySouthGate: [{ q: "科大佳园南苑", must: ["科大佳园"] }],
  jingyuanEast: [{ q: "科大景园", must: ["科大景园"] }],
  jingyuanWest: [{ q: "科大景园", must: ["科大景园"] }],
  fourth: [{ q: "国防科技大学四号院", must: ["国防科技|四号院"] }, { q: "国防科技大学前沿交叉学科学院", must: ["前沿交叉"] }],
  family4: [{ q: "国防科技大学 四号院家属区", must: ["四号院|家属"] }],
  eastGate: [{ q: "国防科技大学三号院 东门", must: ["东门|国防"] }],
  northGate: [{ q: "国防科技大学三号院 北门", must: ["北门|国防"] }],
  northGateOne: [{ q: "国防科技大学 北门", must: ["国防|北门"] }],
  secondCanteen: [{ q: "国防科技大学 二食堂", must: ["食堂|国防"] }],
  scienceCollege: [{ q: "国防科技大学理学院", must: ["理学院|国防"] }],
  laserInstitute: [{ q: "国防科技大学 激光所", must: ["激光|国防"] }],
  militaryCenter: [{ q: "国防科技大学 军体", must: ["军体|国防"] }],
  gaochaoNorth: [{ q: "国防科技大学 高超", must: ["高超|国防"] }],
  gaochaoSouth: [{ q: "国防科技大学 高超", must: ["高超|国防"] }],
};

// Fallback anchors (from verified campus locations; sub-stops offset within campus)
const ANCHORS = {
  one: { lat: 28.2290273, lng: 112.9949229, src: "OSM 德雅路109号 国防科技大学" },
  three: { lat: 28.2595826, lng: 113.0423792, src: "OSM 万家丽北路 国防科技大学三号院" },
  kjy: { lat: 28.2408, lng: 112.9959, src: "OSM 双拥路 科大佳园北苑" },
  kjySouthGate: { lat: 28.23862, lng: 112.99563, src: "Photon 科大佳园南苑（双拥路）" },
  northGateOne: { lat: 28.2322, lng: 112.9936, src: "approx 一号院北侧（德雅路一带）" },
  fourth: { lat: 28.1670497, lng: 112.9836019, src: "OSM 芙蓉中路 前沿交叉学科学院" },
  jingyuanEast: { lat: 28.2432, lng: 113.0012, src: "approx 科大景园东门（双拥路东）" },
  jingyuanWest: { lat: 28.2431, lng: 112.9996, src: "approx 科大景园西门（双拥路西）" },
  gaochaoNorth: { lat: 28.2587, lng: 113.0408, src: "approx 三号院高超楼北侧" },
  gaochaoSouth: { lat: 28.2577, lng: 113.0404, src: "approx 三号院高超楼南侧" },
};

const UA = "NudtBus13-build/1.0 (github.com/Jensen-Yao/NudtBus13)";

async function photon(q) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&bbox=${BBOX}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return j.features || [];
}

function extStr(o) {
  const p = o.properties || {};
  return [p.name, p.street, p.district, p.city, p.locality].filter(Boolean).join(" ");
}

async function main() {
  const poi = {};
  for (const [key, candidates] of Object.entries(QUERIES)) {
    let hit = null;
    for (const { q, must } of candidates) {
      try {
        const feats = await photon(q);
        const musts = Array.isArray(must) ? must : String(must).split("|");
        const res = feats.find((f) => {
          const s = extStr(f);
          return musts.every((m) => s.includes(m) || (f.properties && f.properties.name || "").includes(m));
        });
        if (res) { hit = { lat: res.geometry.coordinates[1], lng: res.geometry.coordinates[0], display: extStr(res), query: q }; break; }
      } catch (e) {
        console.error(`  ${key}: ${q} -> ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    if (hit) {
      poi[key] = { ...hit, precision: "geocoded" };
      console.log(`OK  ${key}: ${hit.lat.toFixed(5)},${hit.lng.toFixed(5)}  ${hit.display}`);
    } else {
      const a = ANCHORS[key] || ANCHORS.three;
      const internal = !ANCHORS[key];
      let lat = a.lat, lng = a.lng;
      // Visual offsets for campus-internal stops (approx positions inside 三号院)
      const INTERNAL_OFFSETS = {
        eastGate: [0.003, 0.004],
        northGate: [0.003, -0.002],
        militaryCenter: [0.002, 0.001],
        laserInstitute: [0.001, 0.0],
        gaochaoNorth: [-0.0009, -0.0016],
        gaochaoSouth: [-0.0019, -0.0020],
        scienceCollege: [-0.002, -0.001],
        secondCanteen: [-0.003, 0.001],
        dorm: [-0.001, -0.001],
        family4: null, // handled via fourth anchor below
        jingyuanWest: [-0.0008, -0.0008],
      };
      if (key === "family4" && ANCHORS.fourth) {
        lat = ANCHORS.fourth.lat + 0.0005; lng = ANCHORS.fourth.lng + 0.0005;
      } else if (internal && INTERNAL_OFFSETS[key]) {
        lat = a.lat + INTERNAL_OFFSETS[key][0]; lng = a.lng + INTERNAL_OFFSETS[key][1];
      }
      poi[key] = { lat, lng, precision: internal ? "approx-campus-internal" : "approx", display: a.src || key };
      console.log(`APP ${key}: ${lat.toFixed(5)},${lng.toFixed(5)}  (${internal ? "campus-internal approx" : a.src})`);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify({ coordinateSystem: "WGS-84", note: "runtime converts to GCJ-02 for AMap raster tiles", poi }, null, 2));
  console.log(`OK poi.json written (${Object.keys(poi).length} stops)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
