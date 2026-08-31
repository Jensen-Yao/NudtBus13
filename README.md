# NudtBus13 · NUDT 班车整合查询

> 一号院 · 三号院 · 家属区班车**双向整合查询**。在 [nudtbus.online](https://nudtbus.online)（去三号院上班）与 [bus2.qiutao20.online](https://bus2.qiutao20.online)（班车查询）两套系统基础上，用 **Docker 自托管 Firecrawl** 抓取数据、合并三张官方时刻表照片、经 OSM 真实地图校验后构建的复刻升级版底座。

**🌐 在线使用：https://jensen-yao.github.io/NudtBus13/**（数据快照 2026-08-27）

## ✨ 相比现网的升级

| 能力 | nudtbus.online | bus2 | **NudtBus13** |
|------|:---:|:---:|:---:|
| 一号院 ↔ 三号院 双向查询 | ✅ | 部分 | ✅ |
| 任意站点对查询（含环线区间/就餐专线/家属区线） | ❌ | 部分 | ✅ |
| 学院班车（系统/气海/理学院/空天） | ✅ | ❌ | ✅ |
| 家属区线路 1/3/4/6（官方表） | ❌ | ❌ | ✅ |
| 环线1路 / 观光车环线3路 / 就餐专线 | ❌ | ✅ | ✅ |
| 五源数据来源徽标（官方表/网站双源印证） | ❌ | ❌ | ✅ |
| 线路地图（GCJ-02 纠偏） | ❌ | ❌ | ✅ |
| 2026 节假日 + 假期停运横幅 | ✅ | ✅ | ✅ |

## 🕷️ 数据来源（5 源合并）

1. **nudtbus.online** v29 — Firecrawl 抓取 `app.js`（8号线×4日表、学院班车）
2. **bus2.qiutao20.online** v8-dev3 — Firecrawl 抓取（10 站点、环线、观光车、拥挤规则、假期表）
3. **官方《长沙校区班车运行时刻表》**（2026.03.09 起，照片转录）— 独有线路 1/3/4/6
4. **官方《系统工程学院院际专线》**（2025.05.19 起，照片转录，个人信息已脱敏）— 印证系统班车 + 途经站点/用时
5. **OSM/Photon 真实地图** — 15 站点地理编码 + 距离可行性校验（35 分钟院际专线等）

分歧裁决与逐条核对见 **[data/comparison.md](data/comparison.md)**。

## 🚀 本地运行 / 部署

纯静态站点，无后端：

```bash
# 本地预览
python -m http.server 8000      # 或任意静态服务器
# 访问 http://localhost:8000
```

部署到 GitHub Pages：仓库 Settings → Pages → 分支 main / 根目录（本仓库已启用）。

## 🔁 数据更新（可复跑）

```powershell
# 0. 启动 Firecrawl（Docker 自托管）
docker compose up -d   # 见 firecrawl 仓库

# 1. 抓取两站最新数据（全部经由 Firecrawl /v2/scrape）
pwsh scripts/scrape-all.ps1

# 2. 解析合并 → data/merged/schedule.json
node scripts/build-data.js

# 3. 站点地理编码 → data/merged/poi.json
node scripts/geocode.js
```

## 📁 目录结构

```
NudtBus13/
├── index.html / app.js / styles.css   # 整合版网页（PWA）
├── data/
│   ├── merged/schedule.json           # 五源合并后的唯一数据源（services 模型）
│   ├── merged/poi.json                # 站点坐标（WGS-84，运行时转 GCJ-02）
│   ├── comparison.md                  # 五源对比裁决文档 ⭐
│   └── sources/                       # Firecrawl 原始抓取 + 官方表脱敏转录
├── scripts/
│   ├── scrape-all.ps1                 # Firecrawl 抓取（可复跑）
│   ├── build-data.js                  # 解析合并（可复跑）
│   └── geocode.js                     # Photon/OSM 地理编码
└── docs/
```

## 🧭 数据模型（schedule.json → services）

每条服务：`orderedStops`（站点序列 + 到站偏移分钟）× `trips`（发车时刻 + 适用日 + 来源）。查询 = 站点对在有序站点表中匹配 → 发车时刻 + 偏移。环线按顺序区间乘坐。

## ⚠️ 免责与致谢

- 时刻数据版权归 nudtbus.online、bus2.qiutao20.online 及学校官方所有，本项目仅作学习/复刻参考，**请以学校最新通知为准**
- 假期（如 2026-08-03 ~ 08-29）班车停运，请勿按班次候车
- 院际专线原表含驾驶员个人信息，本仓库转录件已脱敏
- 感谢原站作者的开创性工作，本项目定位为社区复刻与整合升级
