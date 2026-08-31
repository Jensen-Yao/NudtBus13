# 数据工程（DATA.md）

> 本页面向维护者：数据从哪来、如何复跑。网站用户无需阅读。

## 数据快照
- 快照日期：2026-08-27
- 成品数据：`data/merged/schedule.json`（34 条服务 / 297 个班次）+ `data/merged/poi.json`（15 站点坐标）

## 五源来源
| 源 | 内容 | 采集方式 |
|----|------|----------|
| 网站A（校区通勤视角） | 8号线×4日表×双向、学院班车、假期停运公告 | Firecrawl 自托管 `/v2/scrape` 抓取其 app.js |
| 网站B（园区通勤视角） | 10 站点、环线1路、观光车、就餐专线、线路2/5/7/8、拥挤规则、假期表 | 同上（页面为 JS 空壳，数据全在 app.js） |
| 官方《长沙校区班车运行时刻表》 | 线路1~8 官方时刻（2026.03.09 起） | 照片视觉转录（脱敏） |
| 官方《系统工程学院院际专线》 | 5 班院际专线 + 途经站点/用时 | 照片视觉转录（驾驶员/车牌已脱敏） |
| OSM/Photon 地图 | 15 站点坐标 + 距离可行性校验 | 构建期地理编码，坐标固化入仓 |

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
- services = 34；环线1路 61 班×9 站；观光车工作日 45 班；就餐专线 9 班；节假日 33 天
- 网站A 中文标签经签名映射修复（源站字符集缺陷），详情见 `scripts/build-data.js` 注释

## 分歧裁决
见 [data/comparison.md](../data/comparison.md)（五源逐条核对与裁决记录）。
