# 数据工程（DATA.md）

> 本页面向维护者：数据从哪来、如何复跑。网站用户无需阅读。

## 数据快照
- 快照日期：2026-08-27
- 成品数据：`data/merged/schedule.json`（38 条服务 / 299 个班次）+ `data/merged/poi.json`（15 站点坐标）

## 数据来源
| 内容 | 采集方式 |
|------|----------|
| 8号线×4日表×双向、学院班车、假期停运公告 | 公开查询站点脚本解析（Firecrawl 自托管抓取，目标地址见本地配置） |
| 园区 10 站点、环线1路、观光车、就餐专线、线路2/5/7/8、拥挤规则、节假日表 | 同上 |
| 官方《长沙校区班车运行时刻表》（2026.03.09 起）线路1~8 | 官方时刻表照片视觉转录 |
| 官方《系统工程学院院际专线》（2025.05.19 起）5 班 + 途经站点/用时 | 照片视觉转录（个人信息已脱敏） |
| 15 站点坐标 + 距离可行性校验 | OSM/Photon 构建期地理编码，坐标固化入仓 |

## 复跑流程
```powershell
# 0. Firecrawl 自托管（见 Firecrawl 官方仓库 docker compose）
docker compose up -d

# 1. 配置抓取目标（不入仓）：scripts/sources.local.json
# 2. 抓取 → data/sources/
pwsh scripts/scrape-all.ps1
# 3. 解析合并 → data/merged/schedule.json（含 services 规范化模型）
node scripts/build-data.js
# 4. 地理编码 → data/merged/poi.json
node scripts/geocode.js
```

## 断言基线（build 后应全部成立）
- services = 38；环线1路 61 班×9 站；观光车工作日 45 班；就餐专线 9 班；节假日 33 天
- 拥挤规则：dorm mild=08:10/08:20/14:12，high=08:30/08:40/08:50/14:24/14:36/14:48
- 服务带 tags（campus-commute / three-life / one-life / four-life），驱动前端双模式分组

## 扩展指南
- **新增线路**：在 `scripts/build-data.js` 的 normalize 段添加服务（orderedStops 含到站偏移）
- **新增院区**：在 `areas` 登记站点院区 → 标签与生活圈分组自动生成
- **新增拥挤规则**：更新 extras.crowdRules（按站点：mild/high 时刻数组）
