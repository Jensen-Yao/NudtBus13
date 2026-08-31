# 班车助手数据抓取脚本（全部经由 Docker 自托管 Firecrawl）
# 数据源 URL 读取 scripts/sources.local.json（不入仓）
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$CfgPath = Join-Path $PSScriptRoot "sources.local.json"

if (-not (Test-Path $CfgPath)) {
  Write-Host "缺少 scripts/sources.local.json，请参照 README 创建（含 firecrawl 地址与抓取目标）"
  exit 1
}
$cfg = Get-Content $CfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$FC = $cfg.firecrawl

foreach ($t in $cfg.targets) {
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
Write-Host "==> done. 后续: node scripts/build-data.js && node scripts/geocode.js"
