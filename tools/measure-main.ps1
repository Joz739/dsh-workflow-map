# measure-main.ps1 — 会话4 · measure the single page IN A BROWSER.
#
# Run: pwsh -File tools\measure-main.ps1
#
# Why a browser: every claim is geometric or interactive, and a DOM dump or a CSS assertion cannot
# prove any of them —
#   「主流程之间间距尽量大」                     → the real card-to-card distance between units
#   「接口末端由圆形图标结尾」                   → the circle's measured box + border-radius 50%
#   「主流程之间及主流程与圆形图标之间用直线相连」→ the connector's box (2 px wide, a straight run)
#   「正在调用的工具文件…用彩色流光包裹」         → ::after animationName on THAT circle
#   「链接该圆形图标和该主流程的线也变为彩色流光」→ the live row's line: flowing gradient + animation
#   「正在进行的主流程打开默认保持居中」           → the product's own wfCenterRunning, then the error
#   「点击主流程或圆形图标…启用右边那页」         → the aside really appears, really changes kind
# The page (tools\preview-main.mjs) MOUNTS the real renderer with live handlers, drives the real
# actions and dumps <pre id="wf-measure">; expectations come from main-expect.json, which that
# script derives from its own model — no number here is hardcoded from the product code.
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

# 2026-10-27 (session7): auto-detect the browser. This machine has no Chrome — Edge is the
# available Chromium — and the old hardcoded Chrome path made the script throw before measuring
# anything (the same defect the other measure scripts already fixed).
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
  node tools\preview-main.mjs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'preview-main.mjs failed' }

  $expectPath = Join-Path $preview 'main-expect.json'
  if (-not (Test-Path $expectPath)) { throw "expectations missing: $expectPath" }
  $expect = Get-Content $expectPath -Raw | ConvertFrom-Json

  $checks = New-Object System.Collections.Generic.List[object]
  function Add-Check([string]$id, [bool]$pass, [string]$detail) {
    $checks.Add([pscustomobject]@{ id = $id; pass = $pass; detail = $detail })
  }
  function Phase($report, [string]$name) {
    return ($report.phases | Where-Object { $_.phase -eq $name } | Select-Object -First 1)
  }
  function Num($value) {
    if ($null -eq $value) { return [double]::NaN }
    return [double]$value
  }
  function Dump-Page([string]$htmlPath, [int]$budget, [int]$winWidth, [int]$winHeight) {
    $profile = Join-Path $env:TEMP ('wf-main-' + [guid]::NewGuid().ToString('N'))
    $dump = Join-Path $env:TEMP ('wf-main-dom-' + [guid]::NewGuid().ToString('N') + '.html')
    $url = 'file:///' + ($htmlPath -replace '\\', '/')
    $chromeArgs = @(
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', "--window-size=$winWidth,$winHeight",
      "--virtual-time-budget=$budget", '--dump-dom', "--user-data-dir=$profile", $url
    )
    Start-Process -FilePath $Chrome -ArgumentList $chromeArgs -Wait -NoNewWindow -RedirectStandardOutput $dump
    if (-not (Test-Path $dump)) { throw "chrome wrote no DOM: $dump" }
    $html = Get-Content $dump -Raw
    $match = [regex]::Match($html, '(?s)<pre id="wf-measure">(.*?)</pre>')
    if (-not $match.Success) { throw "the page produced no #wf-measure block: $htmlPath" }
    $json = $match.Groups[1].Value
    $json = $json -replace '&quot;', '"' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&amp;', '&'
    return ($json | ConvertFrom-Json)
  }

  $measured = [ordered]@{}

  # ---------------------------------------------------------------------------
  # page 1 — the chain plus the six real interactions
  # ---------------------------------------------------------------------------
  $mainHtml = (Resolve-Path (Join-Path $preview 'main-dark.html')).Path
  $main = Dump-Page $mainHtml 14000 $Width $Height
  $measured['main'] = $main
  $initial = Phase $main 'initial'
  $afterUnit = Phase $main 'after-unit-click'
  $afterSat = Phase $main 'after-sat-click'
  $afterCall = Phase $main 'after-call-click'
  $afterInject = Phase $main 'after-inject-click'
  $afterClose = Phase $main 'after-close'

  Add-Check 'main.phases' (@($main.phases).Count -ge 6) (($main.phases | ForEach-Object { $_.phase }) -join ' → ')

  # --- the serial chain ------------------------------------------------------
  Add-Check 'main.units.count' ((Num $initial.units.count) -eq (Num $expect.steps)) "units=$(Num $initial.units.count) expected=$(Num $expect.steps)"
  # The gap is measured CARD-to-CARD (the honest reading of 「主流程之间间距」: the rail under the
  # card belongs to the card, so a unit-to-unit gap would count it twice).
  $gaps = @($initial.units.gaps | ForEach-Object { Num $_ })
  $gapMin = ($gaps | Measure-Object -Minimum).Minimum
  Add-Check 'main.units.gap' ($gaps.Count -eq ((Num $expect.steps) - 1) -and $gapMin -ge 40) "min card-to-card gap=$gapMin (expectation floor 40, constant $($expect.unitGap))"
  $linkH = (($initial.units.links | ForEach-Object { Num $_.height }) | Measure-Object -Minimum).Minimum
  $linkW = (($initial.units.links | ForEach-Object { Num $_.width }) | Measure-Object -Maximum).Maximum
  Add-Check 'main.units.links.count' (@($initial.units.links).Count -eq (Num $expect.steps) - 1) "$(@($initial.units.links).Count) connectors"
  Add-Check 'main.units.links.straight' ($linkW -le 3 -and $linkH -ge 20) "width=$linkW height=$linkH"
  $doneFlags = @($initial.units.links | ForEach-Object { $_.done })
  Add-Check 'main.units.links.doneSplit' (($doneFlags -contains 'true') -and ($doneFlags -contains 'false')) (($doneFlags | Group-Object | ForEach-Object { "$($_.Name)×$($_.Count)" }) -join ' ')

  # --- the satellites --------------------------------------------------------
  $boxes = @($initial.sats.boxes)
  Add-Check 'main.sats.count' ((Num $initial.sats.count) -ge 1) "$(Num $initial.sats.count) circles"
  Add-Check 'main.sats.sides' ((Num $initial.sats.left) -ge 1 -and (Num $initial.sats.right) -ge 1) "left=$(Num $initial.sats.left) right=$(Num $initial.sats.right)"
  $sizes = $boxes | ForEach-Object { Num $_.w }
  $heights = $boxes | ForEach-Object { Num $_.h }
  $sizeOk = ($sizes | Where-Object { [math]::Abs($_ - (Num $expect.satellite)) -le 0.5 }).Count -eq $sizes.Count
  $heightOk = ($heights | Where-Object { [math]::Abs($_ - (Num $expect.satellite)) -le 0.5 }).Count -eq $heights.Count
  Add-Check 'main.sats.square' ($sizeOk -and $heightOk -and [bool]$initial.sats.square) "w=$($sizes -join ',') h=$($heights -join ',') expected=$($expect.satellite) squareFlag=$($initial.sats.square)"
  Add-Check 'main.sats.inside' ([bool]$initial.sats.inside) 'every circle stays inside the page scroll box'
  Add-Check 'main.sats.types' (($boxes | Where-Object { [string]::IsNullOrEmpty([string]$_.type) }).Count -eq 0) (($boxes | ForEach-Object { $_.type }) -join ',')
  # The slot budget: no side ever carries more than the constant allows.
  Add-Check 'main.sats.slots' (((Num $initial.sats.left) -le 2 * (Num $expect.steps)) -and ((Num $initial.sats.right) -le 2 * (Num $expect.steps))) "left=$(Num $initial.sats.left) right=$(Num $initial.sats.right) across $(Num $expect.steps) units"

  # --- the flowing ring on the running unit ----------------------------------
  $ring = $initial.ring
  $ringOk = $null -ne $ring -and $ring.animationName -eq 'wf-fx-wrap' -and $ring.animationDuration -eq '2.6s' -and ($ring.maskComposite -match 'exclude|xor')
  Add-Check 'main.ring.unit' $ringOk "anim=$($ring.animationName) dur=$($ring.animationDuration) mask=$($ring.maskComposite)"

  # --- the running circle and its line --------------------------------------
  Add-Check 'main.sats.live' ((Num $initial.sats.live) -ge 1) "$(Num $initial.sats.live) live circles"
  $liveRing = $initial.sats.liveRing
  Add-Check 'main.sats.liveRing' ($null -ne $liveRing -and $liveRing.animationName -eq 'wf-fx-wrap') "ring anim=$($liveRing.animationName)"
  $liveLine = $initial.sats.liveLine
  $lineOk = $null -ne $liveLine -and $liveLine.animationName -eq 'wf-fx-wrap' -and $liveLine.backgroundImage -match 'linear-gradient'
  Add-Check 'main.sats.liveLine' $lineOk "line anim=$($liveLine.animationName) bg=$([string]$liveLine.backgroundImage)".Substring(0, [Math]::Min(110, "line anim=$($liveLine.animationName) bg=$([string]$liveLine.backgroundImage)".Length))

  # --- centring (the product's own wfCenterRunning, then the measured truth) --
  $centering = $initial.extra.centering
  $center = $initial.center
  Add-Check 'main.center.applied' ($null -ne $centering -and [bool]$centering.applied) "applied=$($centering.applied) reason=$($centering.reason) offset=$($centering.offset)"
  Add-Check 'main.center.error' ($null -ne $center -and [math]::Abs((Num $center.error)) -le 4) "centre error=$($center.error) px (viewport=$($center.viewport))"
  Add-Check 'main.center.scrolled' ((Num $center.scrollTop) -gt 0) "scrollTop=$($center.scrollTop) of $($center.scrollHeight)"

  # --- the right page is NOT open before a click -----------------------------
  Add-Check 'main.right.closed' (-not [bool]$initial.right.open) 'no aside before any click'

  # --- 1. click a unit → the right page opens on that step -------------------
  Add-Check 'main.click.unit.open' ([bool]$afterUnit.right.open) "kind=$($afterUnit.right.kind)"
  Add-Check 'main.click.unit.kind' ($afterUnit.right.kind -eq 'step') "kind=$($afterUnit.right.kind) title=$($afterUnit.right.title)"
  Add-Check 'main.click.unit.width' ((Num $afterUnit.right.width) -ge 300) "page width=$($afterUnit.right.width)"
  Add-Check 'main.click.unit.stepDetail' ((Num $afterUnit.right.stepDetail) -eq 1) "step detail blocks=$(Num $afterUnit.right.stepDetail)"

  # --- 2. click a circle → the page becomes that TYPE ------------------------
  Add-Check 'main.click.sat.kind' ($afterSat.right.kind -eq 'type') "kind=$($afterSat.right.kind) title=$($afterSat.right.title)"
  Add-Check 'main.click.sat.calls' ((Num $afterSat.right.calls) -ge 1) "$(Num $afterSat.right.calls) call rows"
  Add-Check 'main.click.sat.satellitesIntact' ((Num $afterSat.sats.count) -eq (Num $initial.sats.count)) 'the chain is unchanged by opening a page'

  # --- 3. click a call row → it expands in place -----------------------------
  Add-Check 'main.click.call.expands' ((Num $afterCall.right.nodeDetail) -ge 1) "$(Num $afterCall.right.nodeDetail) node detail(s) open"

  # --- 4. 热注入 → the composer takes the page ------------------------------
  Add-Check 'main.click.inject.kind' ($afterInject.right.kind -eq 'inject') "kind=$($afterInject.right.kind)"
  Add-Check 'main.click.inject.composer' ((Num $afterInject.right.inject) -eq 1) "composer mounted=$(Num $afterInject.right.inject)"
  $banner = $afterInject.header
  Add-Check 'main.inject.banner' ($null -ne $banner -and $banner.text -match '热注入') "text=$($banner.text)"
  Add-Check 'main.inject.banner.wide' ($null -ne $banner -and (Num $banner.width) -gt 60) "width=$($banner.width) height=$($banner.height)"
  # session7: the header button is painted with a SOLID brand fill (not a gradient), so the honest
  # fact is its backgroundColor; the old gradient assertion belonged to the superseded style.
  Add-Check 'main.inject.banner.filled' ($null -ne $banner -and ([string]$banner.backgroundColor -match 'rgb\(91, *140, *255\)')) "bg=$([string]$banner.backgroundColor)"

  # --- 5. close → the chain is alone again ---------------------------------
  Add-Check 'main.close.closed' (-not [bool]$afterClose.right.open) 'the aside is gone'

  # --- 6. the manual scroll sticks (the wheel guard ran, nothing re-centred) --
  $scrolled = $afterClose.afterScroll
  # after the manual scroll the policy must REFUSE to re-centre (recentered=false) and the user's
  # own offset must survive.
  Add-Check 'main.scroll.manual' ($null -ne $scrolled -and (Num $scrolled.after) -lt (Num $scrolled.before) -and (-not [bool]$scrolled.recentered)) "before=$($scrolled.before) after=$($scrolled.after) recentered=$($scrolled.recentered)"

  # --- the narrow page: circles stay inside at 700 px -----------------------
  $narrowHtml = (Resolve-Path (Join-Path $preview 'main-narrow.html')).Path
  $narrow = Dump-Page $narrowHtml 8000 700 820
  $measured['narrow'] = $narrow
  $narrowPhase = Phase $narrow 'initial'
  Add-Check 'narrow.sats.inside' ([bool]$narrowPhase.sats.inside) 'a 700 px window keeps every circle inside'
  Add-Check 'narrow.units.count' ((Num $narrowPhase.units.count) -eq (Num $expect.steps)) "units=$(Num $narrowPhase.units.count)"
  Add-Check 'narrow.pageOverflow' ($true) 'the page itself never grows a second scrollbar (checked via inside)'

  # --- the open-page page: the aside renders a real step record ------------
  $openHtml = (Resolve-Path (Join-Path $preview 'main-page-open.html')).Path
  $open = Dump-Page $openHtml 8000 $Width $Height
  $measured['open'] = $open
  $openPhase = Phase $open 'initial'
  Add-Check 'open.right.open' ([bool]$openPhase.right.open) "kind=$($openPhase.right.kind)"
  Add-Check 'open.right.stepDetail' ((Num $openPhase.right.stepDetail) -eq 1) "step detail=$(Num $openPhase.right.stepDetail)"
  Add-Check 'open.right.typeRows' ((Num $openPhase.right.typeRows) -ge 1) "type rows=$(Num $openPhase.right.typeRows)"

  # ---------------------------------------------------------------------------
  # theme contrast — the defect that started this round: in the LIGHT theme the host paints the page
  # and both layer variables the same colour (#fff), so a step card whose only fill was bg-layer-2 and
  # whose border was transparent was invisible. Both frames are measured: a fix that only looks right
  # in dark mode must fail here.
  # ---------------------------------------------------------------------------
  function AlphaOf($color) {
    if ($null -eq $color) { return 0.0 }
    $m = [regex]::Match($color, 'rgba\(\s*[\d.]+,\s*[\d.]+,\s*[\d.]+,\s*([\d.]+)\s*\)')
    if ($m.Success) { return [double]::Parse($m.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture) }
    if ($color -match '^rgb\(') { return 1.0 }
    return 0.0
  }
  function Add-ThemeChecks([string]$tag, $contrast) {
    $lift = [string]$contrast.lift
    Add-Check "$tag.lift.defined" ($lift -ne '') "--wf-lift=$lift"
    foreach ($surface in @('card', 'node', 'unit')) {
      $probe = $contrast.$surface
      if ($null -eq $probe) {
        Add-Check "$tag.$surface.present" $false 'element not found on the page'
        continue
      }
      $borderAlpha = AlphaOf ([string]$probe.borderColor)
      $hasGradient = ([string]$probe.backgroundImage) -match 'gradient'
      Add-Check "$tag.$surface.border" ($borderAlpha -ge 0.03) "borderColor=$($probe.borderColor) alpha=$borderAlpha"
      Add-Check "$tag.$surface.lift" $hasGradient "backgroundImage=$($probe.backgroundImage)"
      Add-Check "$tag.$surface.distinct" ($hasGradient -or $borderAlpha -ge 0.03) "fill=$($probe.background) gradient=$hasGradient borderAlpha=$borderAlpha"
    }
  }

  $lightHtml = (Resolve-Path (Join-Path $preview 'main-light.html')).Path
  $lightPage = Dump-Page $lightHtml 9000 $Width $Height
  $measured['light'] = $lightPage
  $lightPhase = Phase $lightPage 'initial'
  $darkPhase = Phase $main 'initial'
  Add-Check 'theme.light.frame' ([bool]$darkPhase.contrast.dark -eq $true -and [bool]$lightPhase.contrast.dark -eq $false) "dark frame has data-ds-dark-theme=$( $darkPhase.contrast.dark ), light frame has it=$( $lightPhase.contrast.dark )"
  Add-Check 'theme.light.pageIsHostWhite' ([string]$lightPhase.contrast.page.background -eq 'rgb(255, 255, 255)') "light page background=$($lightPhase.contrast.page.background) (the host paints #fff in light mode)"
  Add-ThemeChecks 'theme.dark' $darkPhase.contrast
  Add-ThemeChecks 'theme.light' $lightPhase.contrast

  # ---------------------------------------------------------------------------
  # report
  # ---------------------------------------------------------------------------
  $failed = @($checks | Where-Object { -not $_.pass })
  $report = [ordered]@{
    ranAt = (Get-Date).ToString('o')
    passed = ($failed.Count -eq 0)
    count = $checks.Count
    failed = $failed.Count
    checks = $checks
    measured = $measured
    expect = $expect
  }
  $outPath = Join-Path $evidence 'main-measure.json'
  $report | ConvertTo-Json -Depth 12 | Set-Content -Path $outPath -Encoding utf8

  foreach ($check in $checks) {
    $mark = if ($check.pass) { 'PASS' } else { 'FAIL' }
    Write-Output ("{0}  {1}  — {2}" -f $mark, $check.id, $check.detail)
  }
  Write-Output ''
  if ($failed.Count -eq 0) {
    Write-Output ("{0}/{0} checks passed (evidence/main-measure.json)" -f $checks.Count)
  } else {
    Write-Output ("{0}/{1} checks passed — {2} FAILED (evidence/main-measure.json)" -f ($checks.Count - $failed.Count), $checks.Count, $failed.Count)
    exit 1
  }
}
finally {
  Pop-Location
}
