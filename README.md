# 班车助手（NudtBus13）

> 一号院 · 三号院 · 家属区班车**双向整合查询**。合并多源班车数据（两个现有一/三号院查询工具 + 三张官方时刻表 + 真实地图校验），构建的复刻升级版底座。

**🌐 在线使用：https://jensen-yao.github.io/NudtBus13/**（数据快照 2026-08-27）

## ✨ 能力总览

| 能力 | 说明 |
|------|------|
| **任意站点对双向查询** | 17 个站点自由组合，跨线路匹配最近班次（含环线区间、就餐专线、家属区线） |
| **校际班车** | 8号线（线路8）+ 系统/气海/理学院/空天 四条学院专线 |
| **家属区线路** | 线路1/2/3/4/5/6/7（官方时刻表收录，现网工具未覆盖） |
| **园区环线** | 环线1路、环线3路（观光车，周末/节假日运行）、就餐专线v2 |
| **班车表明细** | 完整时刻表一键展开，按 周一至四/周五/周六/周日 四套运行表切换 |
| **线路地图** | OSM 地理编码 + GCJ-02 纠偏，站点精度分级标注，点击时刻卡高亮线路 |
| **节假日感知** | 2026 全年节假日 + 假期停运横幅，法定节假日仅观光车运行 |
| **数据来源徽标** | 每个班次标注来源（官方表/网站A/网站B），多源印证透明可见 |

## 🕷️ 数据来源（5 源合并）

1. **网站A**（一号院视角查询工具）— Firecrawl 抓取运行脚本（8号线×4日表、学院班车）
2. **网站B**（园区视角查询工具）— Firecrawl 抓取（10 站点、环线、观光车、拥挤规则、假期表）
3. **官方《长沙校区班车运行时刻表》**（2026.03.09 起，照片转录）— 独有线路 1/3/4/6
4. **官方《系统工程学院院际专线》**（2025.05.19 起，照片转录，个人信息已脱敏）— 印证系统班车 + 途经站点/用时
5. **OSM/Photon 真实地图** — 15 站点地理编码 + 距离可行性校验（35 分钟院际专线等）

分歧裁决与逐条核对见 **[data/comparison.md](data/comparison.md)**。

## 🚀 本地运行 / 部署

纯静态站点，无后端：

```bash
python -m http.server 8000      # 或任意静态服务器
# 访问 http://localhost:8000
```

部署：GitHub Pages（本仓库已启用，master 分支根目录）。

## 🔁 数据更新（可复跑）

```powershell
# 0. 启动 Firecrawl（Docker 自托管，见 Firecrawl 官方仓库）
docker compose up -d

# 1. 配置数据源地址（不入仓）：编辑 scripts/sources.local.json
# 2. 抓取
pwsh scripts/scrape-all.ps1
# 3. 解析合并 → data/merged/schedule.json
node scripts/build-data.js
# 4. 站点地理编码 → data/merged/poi.json
node scripts/geocode.js
```

## 📁 目录结构

```
NudtBus13/
├── index.html / app.js / styles.css   # 班车助手网页（PWA，Apple 风格）
├── data/
│   ├── merged/schedule.json           # 五源合并后的唯一数据源（services 模型）
│   ├── merged/poi.json                # 站点坐标（WGS-84，运行时转 GCJ-02）
│   ├── comparison.md                  # 五源对比裁决文档 ⭐
│   └── sources/                       # Firecrawl 原始抓取（site-a/site-b）+ 官方表脱敏转录
├── scripts/
│   ├── scrape-all.ps1                 # Firecrawl 抓取（URL 读 sources.local.json，不入仓）
│   ├── build-data.js                  # 解析合并（可复跑）
│   └── geocode.js                     # Photon/OSM 地理编码
└── docs/
```

## 🧭 数据模型（schedule.json → services）

每条服务：`orderedStops`（站点序列 + 到站偏移分钟）× `trips`（发车时刻 + 适用日 + 来源）。查询 = 站点对在有序站点表中匹配 → 发车时刻 + 偏移。环线按顺序区间乘坐。

## ⚠️ 免责与说明

- 时刻数据版权归原相关方所有，本项目仅作学习/复刻参考，**请以学校最新通知为准**
- 假期（如 2026-08-03 ~ 08-29）班车停运，请勿按班次候车
- 院际专线原表含驾驶员个人信息，本仓库转录件已脱敏
