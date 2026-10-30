# measure-flow.ps1 — the type page (the retired "flow column"'s successor), measured IN A BROWSER.
#
# Run: pwsh -File tools\measure-flow.ps1
#
# session7 (2026-10-27) rewrote both halves to the 会话4 single-page layout. The old script measured
# the retired two-column flow column (a 60-node window, fold rows, a 展开全部 strip) and scored
# 7/27 — every one of those elements is gone from the mount tree. What a step's "flow" IS today:
# the right page's per-type call list. This script measures that, and the four honesty rules around
# it, none of which a tree assertion can prove:
#
#   · the selected step's type page lists exactly the calls of that bucket, in wire order, each row
#     a button with the node id, a status dot, a verb · target label and aria-expanded;
#   · THE CAP, HONESTLY STATED: the bucket counts FILE occurrences while its node list counts calls
#     — three .md files on one call render ONE row plus 「另有 2 处调用未随视图发送」, never two
#     invented rows (the successor of the old fold/banner claims);
#   · the session-scope page merges every step's bucket but can dereference no calls, so it says
#     「这一类还没有可列出的调用」 instead of listing ids it cannot resolve;
#   · a (kind, key) pair that no longer resolves CLOSES the page instead of showing somebody else's
#     record under a title;
#   · clicking a call mounts wfRenderNodeDetail under it (aria-expanded flips both ways) and Escape
#     runs the panel's own binding.
#
# NOTE (OPEN-2, recorded in evidence/session7-rerun.md): the page's subtitle still prints the raw
# `{count}` placeholder — RightPage.js passes only `{step}` to `panel.page.typeSub`, whose zh string
# also contains `{count}`. The scope half IS asserted below; the leak is documented rather than
# asserted as correct, and the fix is a one-line dictionary/parameter change.
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
  node tools\preview-typeflow.mjs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'preview-typeflow.mjs failed' }

  $expectPath = Join-Path $preview 'typeflow-expect.json'
  if (-not (Test-Path $expectPath)) { throw "expectations missing: $expectPath" }
  $expect = Get-Content $expectPath -Raw | ConvertFrom-Json

  $checks = New-Object System.Collections.Generic.List[object]
  function Add-Check([string]$id, [bool]$pass, [string]$detail) {
    $checks.Add([pscustomobject]@{ id = $id; pass = $pass; detail = $detail })
  }
  function Dump-Page([string]$htmlPath, [int]$budget) {
    $profile = Join-Path $env:TEMP ('wf-flow-' + [guid]::NewGuid().ToString('N'))
    $dump = Join-Path $env:TEMP ('wf-flow-dom-' + [guid]::NewGuid().ToString('N') + '.html')
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
  function Step($page, [string]$label) {
    return @($page.steps | Where-Object { $_.label -eq $label })[0]
  }

  $measured = [ordered]@{}

  $page = Dump-Page (Resolve-Path (Join-Path $preview 'panel-typeflow-live.html')).Path 9000
  $measured['page'] = $page
  Add-Check 'flow.page.bound' ([string]::IsNullOrEmpty([string]$page.error)) "error=$($page.error)"

  # --- 1. the selected step's type page -------------------------------------------------
  $live = Step $page 'selectedStepTypePage'
  Add-Check 'flow.page.open' ($live.rightOpen -eq $true -and $live.kind -eq 'type') "open=$($live.rightOpen) kind=$($live.kind)"
  Add-Check 'flow.page.title' ((HasText $live.title '第 1 步') -and (HasText $live.title 'md')) "title=$($live.title)"
  # OPEN-2 fixed: the subtitle carries the bucket's own count; a raw {count} token must never
  # survive into the rendered page. The expected count is derived from the preview model.
  Add-Check 'flow.page.subScope' ((HasText $live.sub '第 1 步') -and $live.sub -notmatch '\{\w+\}' -and (HasText $live.sub ([string]$expect.bucketCount))) "sub=$($live.sub) count=$($expect.bucketCount)"
  Add-Check 'flow.page.bodyRight' ($live.bodyRight -eq 'true') "data-right=$($live.bodyRight)"
  Add-Check 'flow.calls.count' (@($live.calls).Count -eq [int]$expect.listedCalls) "calls=$(@($live.calls).Count) expected=$($expect.listedCalls)"
  $row = @($live.calls)[0]
  Add-Check 'flow.calls.rowAttrs' ($row.id -eq 'a1' -and $row.status -eq 'done' -and $row.open -eq 'false' -and $row.expanded -eq 'false') "id=$($row.id) status=$($row.status) open=$($row.open) expanded=$($row.expanded)"
  Add-Check 'flow.calls.label' ((HasText $row.text '读') -and (HasText $row.text 'n1.md')) "label=$($row.text)"

  # --- 2. the cap, honestly stated ------------------------------------------------------
  Add-Check 'flow.cap.oneRowPerCall' ([int]$expect.bucketCount -eq 3 -and [int]$expect.listedCalls -eq 1) "bucket=$($expect.bucketCount) rows=$($expect.listedCalls)"
  Add-Check 'flow.cap.note' ($live.truncNote -eq [string]$expect.truncatedText) "note=$($live.truncNote)"
  Add-Check 'flow.cap.noInventedRows' ((@($live.calls).Count -eq [int]$expect.listedCalls) -and -not (HasText $live.truncNote 'undefined')) "rows=$(@($live.calls).Count)"

  # --- 3. the satellite that owns the open page is marked --------------------------------
  $openSat = @($live.sats | Where-Object { $_.type -eq $expect.mdKey })[0]
  Add-Check 'flow.sat.open' ($null -ne $openSat -and $openSat.open -eq 'true' -and $openSat.pressed -eq 'true') "sat=$($openSat.open)/$($openSat.pressed)"

  # --- 4. the call expands and collapses through the real handler -------------------------
  $expanded = Step $page 'afterCallClick'
  $collapsed = Step $page 'afterSecondClick'
  Add-Check 'flow.call.expand' ((@($expanded.calls)[0].open -eq 'true') -and (@($expanded.calls)[0].expanded -eq 'true') -and [int]$expanded.nodeDetail -eq 1) "open=$(@($expanded.calls)[0].open) detail=$($expanded.nodeDetail)"
  Add-Check 'flow.call.collapse' ((@($collapsed.calls)[0].open -eq 'false') -and (@($collapsed.calls)[0].expanded -eq 'false') -and [int]$collapsed.nodeDetail -eq 0) "open=$(@($collapsed.calls)[0].open) detail=$($collapsed.nodeDetail)"
  Add-Check 'flow.cap.noteStays' ($expanded.truncNote -eq [string]$expect.truncatedText) "note=$($expanded.truncNote)"

  # --- 5. the session-scope page: merged, but it cannot dereference the calls -------------
  $session = Step $page 'sessionScope'
  Add-Check 'flow.session.open' ($session.rightOpen -eq $true -and $session.kind -eq 'type') "open=$($session.rightOpen) kind=$($session.kind)"
  Add-Check 'flow.session.scope' ((HasText $session.title '全会话') -and (HasText $session.sub '全会话')) "title=$($session.title)"
  Add-Check 'flow.session.honest' ((@($session.calls).Count -eq 0) -and ($session.emptyText -eq [string]$expect.typeEmptyText)) "calls=$(@($session.calls).Count) empty=$($session.emptyText)"

  # --- 6. a stale key closes the page instead of inventing a record -----------------------
  $stale = Step $page 'staleKey'
  Add-Check 'flow.stale.closed' ($stale.rightOpen -eq $false -and $stale.bodyRight -eq 'false' -and [string]::IsNullOrEmpty([string]$stale.title)) "open=$($stale.rightOpen) title='$($stale.title)'"

  # --- 7. Escape closes the open page ----------------------------------------------------
  Add-Check 'flow.escape.closes' ($page.facts.escape.opened -eq $true -and [int]$page.facts.escape.closes -eq 1 -and $page.facts.escape.rightOpen -eq $false) "opened=$($page.facts.escape.opened) closes=$($page.facts.escape.closes)"

  # ---------------------------------------------------------------------------
  # report
  # ---------------------------------------------------------------------------
  $failed = @($checks | Where-Object { -not $_.pass })
  foreach ($check in $checks) {
    Write-Output ("{0}  {1}  {2}" -f ($(if ($check.pass) { 'PASS' } else { 'FAIL' })), $check.id, $check.detail)
  }
  Write-Output ''
  Write-Output ("{0}/{1} browser-measured type-page checks passed" -f ($checks.Count - $failed.Count), $checks.Count)

  $record = [ordered]@{
    asOf = (Get-Date).ToString('o')
    chrome = $Chrome
    viewport = @{ width = $Width; height = $Height }
    checks = $checks
    counts = @{ total = $checks.Count; pass = $checks.Count - $failed.Count; fail = $failed.Count }
    measured = $measured
  }
  $record | ConvertTo-Json -Depth 20 | Set-Content -Path (Join-Path $evidence 'step08-measure.json') -Encoding utf8
  if ($failed.Count -gt 0) { exit 1 }
}
finally {
  Pop-Location
}
