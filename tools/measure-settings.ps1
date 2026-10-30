# measure-settings.ps1 — measure step-12 settings + snapshot export IN A BROWSER.
#
# Run: pwsh -File tools\measure-settings.ps1
#
# Why a browser: step-12's claims are about real interaction and browser APIs —
#   「切 palette/motion/detail/nodeLimit 立即改变面板表现，F5 后保留」
#   （2026-10 起 soft 已迁移：运行中卡片外框与运行中单元的 status ring 也跟着 --wf-soft-1/2，
#    故这两条断言的是 soft token，不再是彩虹）
#   「导出 Markdown/JSON：步骤数、节点数、标题与面板逐条一致」
#   「下载文件名含 sessionId 前缀」
#   「localStorage 损坏时用缺省值并自愈，不白屏」
# The page carries the REAL bundle and the REAL settings/export code, clicks controls by
# re-rendering from T.applyPrefsPatch, reads real computed styles, calls real localStorage
# and the real Blob/URL path, then writes <pre id="wf-measure">. This script asserts that
# report against evidence/preview/settings-expect.json (written by the renderer's own model).
#
# On this machine headless Chrome must be started with Start-Process (a direct call returns
# immediately and silently writes nothing).
param(
  [string]$Chrome = '',
  [int]$Width = 1400,
  [int]$Height = 900
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$preview = Join-Path $root 'evidence\preview'
$evidence = Join-Path $root 'evidence'

if ([string]::IsNullOrWhiteSpace($Chrome)) {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe'),
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { $Chrome = $candidate; break }
  }
}
if (-not (Test-Path $Chrome)) { throw "no Chromium browser found (pass -Chrome <path>): $Chrome" }

Push-Location $root
try {
  node tools\preview-settings.mjs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'preview-settings.mjs failed' }

  $expectPath = Join-Path $preview 'settings-expect.json'
  if (-not (Test-Path $expectPath)) { throw "expectations missing: $expectPath" }
  $expect = Get-Content $expectPath -Raw | ConvertFrom-Json

  $checks = New-Object System.Collections.Generic.List[object]
  function Add-Check([string]$id, [bool]$pass, [string]$detail) {
    $checks.Add([pscustomobject]@{ id = $id; pass = $pass; detail = $detail })
  }
  function Dump-Page([string]$htmlPath, [int]$budget) {
    $profile = Join-Path $env:TEMP ('wf-settings-' + [guid]::NewGuid().ToString('N'))
    $dump = Join-Path $env:TEMP ('wf-settings-dom-' + [guid]::NewGuid().ToString('N') + '.html')
    $url = 'file:///' + ($htmlPath -replace '\\', '/')
    $chromeArgs = @(
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', "--window-size=$Width,$Height",
      "--virtual-time-budget=$budget", '--dump-dom', "--user-data-dir=$profile", $url
    )
    # Read the DOM over CDP: the Edge launcher detaches from the real browser process,
    # so `--dump-dom` writes into a stdout nobody holds and the dump file stays empty.
    $nodeExe = if (Get-Command node -ErrorAction SilentlyContinue) { (Get-Command node).Source } else { 'D:\nodejs\node.exe' }
    $sizeArg = ($chromeArgs | Where-Object { $_ -like '--window-size=*' } | Select-Object -First 1)
    $budgetArg = ($chromeArgs | Where-Object { $_ -like '--virtual-time-budget=*' } | Select-Object -First 1)
    $dumpWidth = if ($sizeArg) { ($sizeArg -split '=')[1].Split(',')[0] } else { '1400' }
    $dumpHeight = if ($sizeArg) { ($sizeArg -split '=')[1].Split(',')[1] } else { '900' }
    $dumpBudget = if ($budgetArg) { ($budgetArg -split '=')[1] } else { '6000' }
    & $nodeExe (Join-Path $PSScriptRoot 'cdp-dump.mjs') $dump $url $dumpWidth $dumpHeight $dumpBudget $Chrome
    if ($LASTEXITCODE -ne 0) { throw "cdp-dump failed ($LASTEXITCODE) for $url" }
    if (-not (Test-Path $dump)) { throw "chrome wrote no DOM: $dump" }
    $html = Get-Content $dump -Raw
    $match = [regex]::Match($html, '(?s)<pre id="wf-measure">(.*?)</pre>')
    if (-not $match.Success) { throw "the page produced no #wf-measure block: $htmlPath" }
    $json = $match.Groups[1].Value
    $json = $json -replace '&quot;', '"' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&amp;', '&'
    return ($json | ConvertFrom-Json)
  }
  function HasText($value, [string]$needle) {
    return ($null -ne $value) -and ([string]$value).IndexOf($needle, [System.StringComparison]::Ordinal) -ge 0
  }
  function ActiveHas($facts, [string]$pair) {
    return (@($facts.settings.active) -contains $pair)
  }

  $measured = [ordered]@{}

  # ---------------------------------------------------------------------------
  # page 1 — default → brand → always → title → 30 → all → soft/static → reset
  # ---------------------------------------------------------------------------
  $defaultHtml = (Resolve-Path (Join-Path $preview 'panel-settings-default.html')).Path
  $page = Dump-Page $defaultHtml 14000
  $measured['default'] = $page
  Add-Check 'settings.page.bound' ([string]::IsNullOrEmpty([string]$page.error)) "error=$($page.error)"
  Add-Check 'settings.page.panel' ($page.facts.default.panelPresent -eq $true) "panel=$($page.facts.default.panelPresent)"
  Add-Check 'settings.page.stepCount' ($page.facts.default.stepCards -eq $expect.stepCount) "stepCards=$($page.facts.default.stepCards)"
  Add-Check 'settings.page.units' ($page.facts.default.units -eq $expect.stepCount) "units=$($page.facts.default.units)"

  $d = $page.facts.default
  Add-Check 'settings.card.present' ($null -ne $d.settings -and $d.settings.rows -eq 4 -and $d.settings.buttons -eq 12) "rows=$($d.settings.rows) buttons=$($d.settings.buttons)"
  Add-Check 'settings.card.visibleButtons' ($d.settings.visibleButtons -eq 12) "visible=$($d.settings.visibleButtons)"
  Add-Check 'settings.card.exportButtons' ((@($d.settings.exportButtons) -join ',') -eq 'copy-md,copy-json,download-md,download-json') (@($d.settings.exportButtons) -join ',')
  Add-Check 'settings.card.noHorizontalOverflow' ($d.settings.overflow -le 0) "overflow=$($d.settings.overflow)"
  Add-Check 'settings.card.insidePanel' ($d.settings.panelWidth -le $Width -and $d.settings.rect.width -gt 0) "panel=$($d.settings.panelWidth) rect=$($d.settings.rect.width)x$($d.settings.rect.height)"
  Add-Check 'settings.card.defaultActive' ((ActiveHas $d 'palette=rainbow') -and (ActiveHas $d 'motion=full') -and (ActiveHas $d 'detail=summary') -and (ActiveHas $d 'nodeLimit=60')) (@($d.settings.active) -join ',')
  Add-Check 'settings.default.attributes' ($d.root.palette -eq $expect.defaultPalette -and $d.root.motionPref -eq $expect.defaultMotion -and $d.root.detail -eq $expect.defaultDetail -and [string]$d.root.nodeLimit -eq [string]$expect.defaultNodeLimit) ($d.root | ConvertTo-Json -Compress)
  Add-Check 'settings.default.secondLine' ($d.subLines -ge 1 -and $d.agoLines -ge 1 -and $d.dockTiming -eq 'one') "sub=$($d.subLines) ago=$($d.agoLines) timing=$($d.dockTiming)"
  Add-Check 'settings.default.rightClosed' ($d.nodeDetail -eq 0 -and $d.stepDetail -eq 0) "node=$($d.nodeDetail) step=$($d.stepDetail)"
  Add-Check 'settings.default.idlePaused' ($d.root.idle -eq '1' -and $d.ring.animationName -eq 'wf-ring' -and $d.ring.animationPlayState -eq 'paused') "idle=$($d.root.idle) anim=$($d.ring.animationName)/$($d.ring.animationPlayState)"
  Add-Check 'settings.default.rainbowRing' ((HasText $d.cardFrame.backgroundImage $expect.rainbowFirst) -and (HasText $d.runningFill.backgroundImage $expect.brandFirst)) "frame=rainbow fill=brand"

  $b = $page.facts.brand
  Add-Check 'settings.brand.attributes' ($b.root.palette -eq 'brand' -and (ActiveHas $b 'palette=brand')) ($b.root | ConvertTo-Json -Compress)
  Add-Check 'settings.brand.fillSwitches' (HasText $b.runningFill.backgroundImage $expect.brandFirst) "fill=$($b.runningFill.backgroundImage)"
  # OPEN-1 fixed: the brand rule now also names the live card's own selector
  # (.wf-unit[data-status='running']>.wf-unit-center>.wf-unit-card::after), so the running
  # frame follows the brand token exactly like the fill already did.
  Add-Check 'settings.brand.frameMigrated' (HasText $b.cardFrame.backgroundImage $expect.brandFirst) "frame=$($b.cardFrame.backgroundImage)"
  Add-Check 'settings.brand.persisted' ($page.storage.brand.palette -eq 'brand' -and $page.storage.loadBack.palette -eq 'brand') "stored=$($page.storage.brand.palette) loaded=$($page.storage.loadBack.palette)"
  Add-Check 'settings.brand.unitsUnchanged' ($b.units -eq $expect.stepCount) "units=$($b.units)"

  $a = $page.facts.always
  Add-Check 'settings.always.attributes' ($a.root.motionPref -eq 'always' -and $a.root.idle -eq '0' -and (ActiveHas $a 'motion=always')) ($a.root | ConvertTo-Json -Compress)
  Add-Check 'settings.always.running' ($a.ring.animationName -eq 'wf-ring' -and $a.ring.animationPlayState -eq 'running') "idle=$($a.root.idle) anim=$($a.ring.animationName)/$($a.ring.animationPlayState)"
  Add-Check 'settings.always.persisted' ($page.storage.always.motion -eq 'always') "loaded=$($page.storage.always.motion)"

  $t = $page.facts.title
  Add-Check 'settings.title.attributes' ($t.root.detail -eq 'title' -and (ActiveHas $t 'detail=title')) ($t.root | ConvertTo-Json -Compress)
  Add-Check 'settings.title.compact' ($t.subLines -eq 0 -and $t.agoLines -eq 0 -and $t.dockTiming -eq 'none') "sub=$($t.subLines) ago=$($t.agoLines) timing=$($t.dockTiming)"
  Add-Check 'settings.title.unitsKept' ($t.units -eq $expect.stepCount) "units=$($t.units)"

  $l30 = $page.facts.limit30
  Add-Check 'settings.limit30.window' ([string]$l30.root.nodeLimit -eq '30' -and (ActiveHas $l30 'nodeLimit=30') -and $l30.units -eq $expect.stepCount) "limit=$($l30.root.nodeLimit) units=$($l30.units)"
  $all = $page.facts.all
  Add-Check 'settings.limitAll.window' ([string]$all.root.nodeLimit -eq '0' -and (ActiveHas $all 'nodeLimit=0') -and $all.units -eq $expect.stepCount) "limit=$($all.root.nodeLimit) units=$($all.units)"

  $s = $page.facts.softStatic
  Add-Check 'settings.soft.attributes' ($s.root.palette -eq 'soft' -and $s.root.motion -eq 'static' -and $s.root.motionPref -eq 'static' -and (ActiveHas $s 'palette=soft')) ($s.root | ConvertTo-Json -Compress)
  Add-Check 'settings.soft.stopColor' ([string]$s.root.softOne -eq [string]$expect.softOne) "soft1=$($s.root.softOne)"
  Add-Check 'settings.soft.fillGradient' (HasText $s.runningFill.backgroundImage $expect.softFill) "fill=$($s.runningFill.backgroundImage)"
  Add-Check 'settings.static.noAnimation' ($s.ring.animationName -eq 'none' -and $s.root.motion -eq 'static') "anim=$($s.ring.animationName) motion=$($s.root.motion)"
  # soft palette now names the live selectors too: the running card's frame follows --wf-soft-1/2
  # exactly like the rail fill does, and so does the running unit's status ring.
  Add-Check 'settings.soft.frameMigrated' (HasText $s.cardFrame.backgroundImage $expect.softFill) "frame=$($s.cardFrame.backgroundImage)"
  Add-Check 'settings.soft.ringColor' ([string]$s.ring.color -eq [string]$expect.softFill) "ring=$($s.ring.color)"

  $r = $page.facts.reset
  Add-Check 'settings.reset.attributes' ($r.root.palette -eq 'rainbow' -and $r.root.motionPref -eq 'full' -and $r.root.detail -eq 'summary' -and [string]$r.root.nodeLimit -eq '60') ($r.root | ConvertTo-Json -Compress)
  Add-Check 'settings.reset.active' ((ActiveHas $r 'palette=rainbow') -and (ActiveHas $r 'motion=full') -and (ActiveHas $r 'detail=summary') -and (ActiveHas $r 'nodeLimit=60')) (@($r.settings.active) -join ',')
  Add-Check 'settings.reset.rendering' ($r.units -eq $expect.stepCount -and $r.subLines -ge 1 -and (HasText $r.cardFrame.backgroundImage $expect.rainbowFirst)) "units=$($r.units) sub=$($r.subLines)"
  Add-Check 'settings.reset.storage' ($page.storage.reset.palette -eq 'rainbow' -and $page.storage.reset.motion -eq 'full' -and $page.storage.reset.detail -eq 'summary' -and [int]$page.storage.reset.nodeLimit -eq 60 -and $page.storage.resetLoad.palette -eq 'rainbow') ($page.storage.reset | ConvertTo-Json -Compress)

  # ---------------------------------------------------------------------------
  # export: Markdown / JSON agree with the panel, no file body, Blob revoke
  # ---------------------------------------------------------------------------
  Add-Check 'export.markdown.stepHeadings' ($page.copy.mdCount -eq $expect.markdownStepHeadings) "mdCount=$($page.copy.mdCount)"
  Add-Check 'export.markdown.nodeLines' ($page.copy.mdNodeLines -eq $expect.markdownNodeLines) "mdNodeLines=$($page.copy.mdNodeLines)"
  Add-Check 'export.markdown.task' (HasText $page.copy.md $expect.markdownTask) 'task heading present'
  Add-Check 'export.markdown.noSecret' ($page.copy.mdHasSecret -eq $false) "secret=$($page.copy.mdHasSecret)"
  Add-Check 'export.json.steps' (@($page.copy.json.steps).Count -eq $expect.stepCount) "steps=$(@($page.copy.json.steps).Count)"
  Add-Check 'export.json.session' ($page.copy.json.sessionId -eq $expect.sessionId) "session=$($page.copy.json.sessionId)"
  Add-Check 'export.json.task' ($page.copy.json.task -eq $expect.markdownTask) "task=$($page.copy.json.task)"
  Add-Check 'export.json.schema' ($page.copy.json.schema -eq 'dsh-workflow-map.snapshot/v1') "schema=$($page.copy.json.schema)"
  Add-Check 'export.json.noSecret' ($page.copy.jsonHasSecret -eq $false) "secret=$($page.copy.jsonHasSecret)"

  $dl = $page.download
  Add-Check 'export.download.ok' ($dl.result.ok -eq $true) "ok=$($dl.result.ok)"
  Add-Check 'export.download.filename' ($dl.result.filename -eq $expect.downloadMd -and $dl.clicked -eq $expect.downloadMd) "filename=$($dl.result.filename) clicked=$($dl.clicked)"
  Add-Check 'export.download.blobUrl' (HasText $dl.result.url 'blob:') "url=$($dl.result.url)"
  Add-Check 'export.download.revoked' ($dl.urls -eq 1 -and $dl.revoked -eq 1 -and $dl.after -eq 0) "urls=$($dl.urls) revoked=$($dl.revoked) after=$($dl.after)"

  # ---------------------------------------------------------------------------
  # page 2 — corrupted localStorage: defaults + a rendered panel, no white screen
  # ---------------------------------------------------------------------------
  $corruptHtml = (Resolve-Path (Join-Path $preview 'panel-settings-corrupt.html')).Path
  $corrupt = Dump-Page $corruptHtml 12000
  $measured['corrupt'] = $corrupt
  Add-Check 'settings.corrupt.bound' ([string]::IsNullOrEmpty([string]$corrupt.error)) "error=$($corrupt.error)"
  Add-Check 'settings.corrupt.loadedDefaults' ($corrupt.corruptLoaded.palette -eq $expect.defaultPalette -and [int]$corrupt.corruptLoaded.nodeLimit -eq 60 -and [int]$corrupt.corruptLoaded.width -eq 720) ($corrupt.corruptLoaded | ConvertTo-Json -Compress)
  Add-Check 'settings.corrupt.panel' ($corrupt.facts.default.panelPresent -eq $true) "panel=$($corrupt.facts.default.panelPresent)"
  Add-Check 'settings.corrupt.settingsCard' ($corrupt.facts.default.settings.rows -eq 4 -and $corrupt.facts.default.settings.overflow -le 0) "rows=$($corrupt.facts.default.settings.rows) overflow=$($corrupt.facts.default.settings.overflow)"
  Add-Check 'settings.corrupt.defaults' ($corrupt.facts.default.root.palette -eq $expect.defaultPalette -and [string]$corrupt.facts.default.root.nodeLimit -eq '60') ($corrupt.facts.default.root | ConvertTo-Json -Compress)

  # ---------------------------------------------------------------------------
  # report
  # ---------------------------------------------------------------------------
  $failed = @($checks | Where-Object { -not $_.pass })
  foreach ($check in $checks) {
    Write-Output ("{0}  {1}  {2}" -f ($(if ($check.pass) { 'PASS' } else { 'FAIL' })), $check.id, $check.detail)
  }
  Write-Output ""
  Write-Output ("{0}/{1} browser checks passed" -f ($checks.Count - $failed.Count), $checks.Count)

  $record = [ordered]@{
    asOf = (Get-Date).ToString('o')
    chrome = $Chrome
    viewport = @{ width = $Width; height = $Height }
    checks = $checks
    counts = @{ total = $checks.Count; pass = $checks.Count - $failed.Count; fail = $failed.Count }
    measured = $measured
  }
  $record | ConvertTo-Json -Depth 30 | Set-Content -Path (Join-Path $evidence 'step12-measure.json') -Encoding utf8
  if ($failed.Count -gt 0) { exit 1 }
}
finally {
  Pop-Location
}
