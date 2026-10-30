# measure-branches.ps1 — the step's parallel interfaces (the branch lanes' successor), IN A BROWSER.
#
# Run: pwsh -File tools\measure-branches.ps1
#
# session7 (2026-10-27) rewrote both halves to the 会话4 single-page layout. The old script measured
# the subagent/background-job LANES of Branches.js (a 6 px coloured link per lane, lane hues, lane
# breathing dots) — that component is no longer mounted anywhere. What carries a step's parallel
# work today: the unit's round SATELLITES, one per tool/file-type bucket, each a real <button> that
# opens that type's call list. This script measures what only a browser can:
#
#   · the per-side slot cap (WF_SIDE_SLOTS = 2) really bites — a step with six buckets draws at most
#     two per side, and the card prints 「另有 N 类未画在两侧」 instead of silently trimming (the
#     honest successor of the old 4-lane cap);
#   · every drawn satellite is a <button> carrying type / side / tone / count and an accessible name
#     that states the count, with a real box on screen;
#   · the RUNNING bucket's satellite and its row carry data-live='true' — the one animated lane;
#   · clicking a satellite runs the product's own onOpenType: the type's page opens and the
#     satellite flips data-open / aria-pressed;
#   · a step whose buckets fit shows NO dropped note at all.
#
# The browser is auto-detected (this machine has no Chrome; Edge is the Chromium), and headless
# Chromium must be started with Start-Process (a direct call returns immediately and writes nothing).
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
  node tools\preview-branches.mjs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'preview-branches.mjs failed' }

  $expectPath = Join-Path $preview 'branch-expect.json'
  if (-not (Test-Path $expectPath)) { throw "expectations missing: $expectPath" }
  $expect = Get-Content $expectPath -Raw | ConvertFrom-Json

  $checks = New-Object System.Collections.Generic.List[object]
  function Add-Check([string]$id, [bool]$pass, [string]$detail) {
    $checks.Add([pscustomobject]@{ id = $id; pass = $pass; detail = $detail })
  }
  function Dump-Page([string]$htmlPath, [int]$budget) {
    $profile = Join-Path $env:TEMP ('wf-branch-' + [guid]::NewGuid().ToString('N'))
    $dump = Join-Path $env:TEMP ('wf-branch-dom-' + [guid]::NewGuid().ToString('N') + '.html')
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

  $measured = [ordered]@{}

  $page = Dump-Page (Resolve-Path (Join-Path $preview 'panel-branches-live.html')).Path 9000
  $measured['page'] = $page
  Add-Check 'branches.page.bound' ([string]::IsNullOrEmpty([string]$page.error)) "error=$($page.error)"
  Add-Check 'branches.units.count' ([int]$page.facts.units -eq [int]$expect.unitCount) "units=$($page.facts.units) expected=$($expect.unitCount)"

  $crowded = $page.facts.crowded
  $quiet = $page.facts.quiet

  # --- 1. the per-side cap really bites -------------------------------------------------
  Add-Check 'branches.cap.perSide' ([int]$crowded.left -le [int]$expect.sideSlots -and [int]$crowded.right -le [int]$expect.sideSlots -and [int]$crowded.left -gt 0 -and [int]$crowded.right -gt 0) "left=$($crowded.left) right=$($crowded.right) slots=$($expect.sideSlots)"
  Add-Check 'branches.cap.accounted' (([int]$crowded.left + [int]$crowded.right + [int]$expect.crowded.droppedTotal) -eq [int]$expect.crowded.types) "drawn=$([int]$crowded.left + [int]$crowded.right) dropped=$($expect.crowded.droppedTotal) types=$($expect.crowded.types)"
  Add-Check 'branches.cap.note' ($crowded.note -eq [string]$expect.crowded.noteText) "note='$($crowded.note)'"
  Add-Check 'branches.cap.noteTitle' (HasText $crowded.noteTitle ([string]$expect.crowded.droppedTotal)) "title='$($crowded.noteTitle)'"

  # --- 2. every drawn satellite is a real, labelled button --------------------------------
  $sats = @($crowded.sats)
  $bad = @($sats | Where-Object {
      [string]::IsNullOrEmpty($_.type) -or [string]::IsNullOrEmpty($_.tone) -or $_.tag -ne 'button' -or
      [string]::IsNullOrEmpty($_.label) -or [int]$_.count -lt 1 -or $_.w -le 0 -or $_.h -le 0 -or
      ($_.side -ne 'left' -and $_.side -ne 'right')
    })
  Add-Check 'branches.sat.wellFormed' ($sats.Count -gt 0 -and $bad.Count -eq 0) "$($sats.Count) sats, $($bad.Count) malformed"
  Add-Check 'branches.sat.counted' ((@($sats | Where-Object { (HasText $_.label ([string]$_.count)) -or [int]$_.count -eq 1 }).Count) -eq $sats.Count) "labels state their counts"

  # --- 3. the running bucket is the one live lane -----------------------------------------
  $live = @($sats | Where-Object { $_.type -eq $expect.liveType })[0]
  $liveRow = @($crowded.rows | Where-Object { $_.live -eq 'true' })
  Add-Check 'branches.live.sat' ($null -ne $live -and $live.live -eq 'true') "live=$($live.live) type=$($live.type)"
  Add-Check 'branches.live.row' ($liveRow.Count -ge 1) "$($liveRow.Count) live rows"

  # --- 4. a step whose buckets fit shows no note ------------------------------------------
  Add-Check 'branches.quiet.noNote' ([string]::IsNullOrEmpty([string]$quiet.note) -and [int]$quiet.droppedTotal -eq 0) "note='$($quiet.note)' dropped=$($quiet.droppedTotal)"
  Add-Check 'branches.quiet.sat' (([int]$quiet.left + [int]$quiet.right) -eq [int]$expect.quiet.types -and [int]$expect.quiet.types -eq 1) "left=$($quiet.left) right=$($quiet.right) types=$($expect.quiet.types)"

  # --- 5. clicking the live satellite opens its type page ---------------------------------
  $after = $page.after
  Add-Check 'branches.click.opened' ($after.clicked -eq $true -and $after.rightOpen -eq $true -and $after.kind -eq 'type') "clicked=$($after.clicked) kind=$($after.kind)"
  Add-Check 'branches.click.title' (-not [string]::IsNullOrEmpty([string]$after.title)) "title='$($after.title)'"
  Add-Check 'branches.click.openSat' ($null -ne $after.openSat -and $after.openSat.open -eq 'true' -and $after.openSat.pressed -eq 'true') "open=$($after.openSat.open)/$($after.openSat.pressed)"

  # ---------------------------------------------------------------------------
  # report
  # ---------------------------------------------------------------------------
  $failed = @($checks | Where-Object { -not $_.pass })
  foreach ($check in $checks) {
    Write-Output ("{0}  {1}  {2}" -f ($(if ($check.pass) { 'PASS' } else { 'FAIL' })), $check.id, $check.detail)
  }
  Write-Output ''
  Write-Output ("{0}/{1} browser-measured satellite checks passed" -f ($checks.Count - $failed.Count), $checks.Count)

  $record = [ordered]@{
    asOf = (Get-Date).ToString('o')
    chrome = $Chrome
    viewport = @{ width = $Width; height = $Height }
    checks = $checks
    counts = @{ total = $checks.Count; pass = $checks.Count - $failed.Count; fail = $failed.Count }
    measured = $measured
  }
  $record | ConvertTo-Json -Depth 20 | Set-Content -Path (Join-Path $evidence 'step09-measure.json') -Encoding utf8
  if ($failed.Count -gt 0) { exit 1 }
}
finally {
  Pop-Location
}
