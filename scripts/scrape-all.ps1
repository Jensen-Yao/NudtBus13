# NudtBus13 数据抓取脚本（全部经由 Docker 自托管 Firecrawl）
# 用法: pwsh scripts/scrape-all.ps1   （需先启动 Firecrawl: docker compose up -d）
$ErrorActionPreference = "Continue"
$FC = "http://localhost:3002"
$Root = Split-Path -Parent $PSScriptRoot

$targets = @(
  @{ dir = "nudtbus"; name = "nudtbus-page";  url = "https://nudtbus.online" },
  @{ dir = "nudtbus"; name = "nudtbus-appjs"; url = "https://nudtbus.online/app.js" },
  @{ dir = "bus2";    name = "bus2-page";     url = "https://bus2.qiutao20.online" },
  @{ dir = "bus2";    name = "bus2-appjs";    url = "https://bus2.qiutao20.online/app.js?v=20260725-v8-dev3" }
)

foreach ($t in $targets) {
  Write-Host "==> scraping $($t.url)"
  $body = @{ url = $t.url; formats = @("markdown") } | ConvertTo-Json -Depth 5
  try {
    $r = Invoke-WebRequest -Uri "$FC/v2/scrape" -Method Post -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 120
    $json = $r.Content | ConvertFrom-Json
    if ($json.success) {
      $out = Join-Path $Root "data/sources/$($t.dir)/$($t.name).md"
      [IO.File]::WriteAllText($out, $json.data.markdown, [Text.UTF8Encoding]::new($false))
      Write-Host "    OK -> $out ($($json.data.markdown.Length) chars)"
    } else { Write-Host "    FAIL: $($json.error)" }
  } catch { Write-Host "    ERR: $($_.Exception.Message)" }
  Start-Sleep 2
}
Write-Host "==> done. 复跑: node scripts/build-data.js && node scripts/geocode.js"
