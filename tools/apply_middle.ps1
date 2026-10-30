# 中級画像の取り込み〜公開を一括実行（2026-10-30 19:00 予約実行用）
$ErrorActionPreference = 'Stop'
$app = 'C:\Users\myuda\original-app-all\korean-word-test'
$log = Join-Path $app 'tools\apply_middle_run.log'
Set-Location $app
$env:PYTHONIOENCODING = 'utf-8'
Start-Transcript -Path $log -Append | Out-Null
try {
  Write-Output "==== $(Get-Date -Format 'yyyy-MM-dd HH:mm') 開始 ===="
  python tools\apply_middle.py
  if ($LASTEXITCODE -ne 0) { throw "apply_middle.py failed" }
  python tools\check_images.py
  if ($LASTEXITCODE -ne 0) { throw "check_images.py で不合格あり。公開を中止" }
  python tools\gen_imgbox.py
  if ($LASTEXITCODE -ne 0) { throw "gen_imgbox.py failed" }
  (Get-Content sw.js -Raw -Encoding UTF8) -replace 'const CACHE = "ktango-v5";', 'const CACHE = "ktango-v6";' | Set-Content sw.js -Encoding UTF8 -NoNewline
  (Get-Content index.html -Raw -Encoding UTF8) -replace 'const APP_VERSION="v8\.5 \(2026-10-28\)";', 'const APP_VERSION="v8.6 (2026-10-30)";' | Set-Content index.html -Encoding UTF8 -NoNewline
  if (-not (Select-String -Path sw.js -Pattern 'ktango-v6' -Quiet)) { throw "sw.js cache bump failed" }
  if (-not (Select-String -Path index.html -Pattern 'v8\.6' -Quiet)) { throw "APP_VERSION bump failed" }
  git add images-thumb words-images.js words-imgbox.js sw.js index.html tools/apply_middle.py tools/apply_middle.ps1
  git commit -m @'
v8.6: 中級2555語の単語画像を反映（images-middle→images-thumb/2001〜4562.webp、tools/apply_middle.py新設）。透過失敗16枚は再透過、不合格7枚は未反映（要再生成）。swキャッシュをktango-v6へ

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
'@
  if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
  git push origin HEAD
  if ($LASTEXITCODE -ne 0) { throw "git push failed" }
  powershell -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\myuda\_sandbox\ktango_deploy_cf.ps1'
  if ($LASTEXITCODE -ne 0) { throw "cloudflare deploy failed" }
  Write-Output "==== 完了 $(Get-Date -Format 'HH:mm') ===="
} catch {
  Write-Output "!! 失敗: $_"
} finally {
  Stop-Transcript | Out-Null
}
