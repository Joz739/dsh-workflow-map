# measure-panel.ps1 — measure the step-card geometry IN A BROWSER, not on paper.
#
# Run: pwsh -File tools\measure-panel.ps1
#
# The step-07 acceptance criteria are geometric ("8 px of air between the card
# frame and its progress rail", "the rail does not overlap the next connector").
# CSS assertions cannot prove those: only a layout engine can. This script
# renders the real bundle into evidence/preview/panel-measure.html, has that page
# measure itself with getBoundingClientRect(), dumps the DOM with headless Chrome
# and checks the numbers - the same "screenshot measurement" the plan asks for,
# but exact instead of eyeballed.
#
# On this machine headless Chrome must be started with Start-Process (a direct
# `& chrome ...` invocation returns immediately and silently writes nothing).
param(
  # Empty by default: the browser is auto-detected below (this machine has no Chrome; Edge is the
  # Chromium on it). Pass -Chrome <path> to force one.
  [string]$Chrome = '',
  [int]$Width = 1400,
  [int]$Height = 900
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($Chrome)) {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
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
  node tools\preview-panel.mjs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'preview-panel.mjs failed' }

  $source = (Resolve-Path (Join-Path $root 'evidence\preview\panel-measure.html')).Path
  $profile = Join-Path $env:TEMP ('wf-measure-' + [guid]::NewGuid().ToString('N'))
  $dump = Join-Path $env:TEMP ('wf-measure-dom-' + [guid]::NewGuid().ToString('N') + '.html')
  $url = 'file:///' + ($source -replace '\\', '/')

  $chromeArgs = @(
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', "--window-size=$Width,$Height",
    '--virtual-time-budget=4000', '--dump-dom', "--user-data-dir=$profile", $url
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
  if (-not $match.Success) { throw 'the page produced no #wf-measure block (script error?)' }

  $json = $match.Groups[1].Value
  $json = $json -replace '&quot;', '"' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&amp;', '&'
  $data = $json | ConvertFrom-Json

  $expected = @($data.rows).Count
  $checks = @(
    @{ id = 'cards == rows'; pass = ($data.cards -eq $expected); detail = "$($data.cards) cards" },
    @{ id = 'one rail per card'; pass = ($data.docks -eq $data.cards); detail = "$($data.docks) rails" },
    @{ id = 'connectors == cards - 1'; pass = ($data.connectors -eq ($data.cards - 1)); detail = "$($data.connectors) connectors" },
    @{ id = 'rail height 6px'; pass = ([math]::Abs($data.railTrackHeight - 6) -lt 0.01); detail = "track $($data.railTrackHeight)px / dock $($data.railHeight)px" },
    @{ id = 'card -> rail gap 8px (every card)'; pass = (@($data.gapValues | Where-Object { [math]::Abs($_ - 8) -gt 0.01 }).Count -eq 0); detail = ($data.gapValues -join ',') },
    # 会话6 · measured: the connector now starts exactly at the dock's bottom (min gap 0 px). That is the
    # current design — 会话4's chain gap owns the air between UNITS — so the honest assertion is the one
    # that still protects the user: the rail must never OVERLAP the connector it feeds.
    @{ id = 'rail never overlaps the next connector'; pass = ($data.minDockToLinkPx -ge 0 -and -not $data.overlapped); detail = "min gap $($data.minDockToLinkPx)px" },
    @{ id = 'many steps scroll inside the column'; pass = ($data.scrollable -eq $true); detail = "scrollable=$($data.scrollable)" },
    @{ id = 'column header stays while scrolling'; pass = ($data.stickyKept -eq $true); detail = "top $($data.headerTopBefore) -> $($data.headerTopAfter)" },
    @{ id = 'card titles carry the full text'; pass = ($data.titlesPresent -eq $true); detail = "titles=$($data.titlesPresent)" },
    @{ id = 'ordinals padded first/last'; pass = ($data.seqFirst -match '^\d{2}/\d{2}$' -and $data.seqLast -eq ('{0:D2}/{0:D2}' -f [int]$data.cards)); detail = "$($data.seqFirst) .. $($data.seqLast)" },
    # step-03: the second line (ago · eta). The acceptance criteria are geometric and textual:
    # it must render where a number exists, never wrap onto a third line, never overlap the
    # track or spill past the card, and carry a tooltip that says what the number means.
    # 会话6 · this page is a REAL recorded session and its rows carry no `lastEstimateAt` stamp, so
    # it cannot show a second line — the presence side is measured on the purpose-built fixture by
    # tools/measure-timing.ps1 (20 checks). What this page proves is the CONSISTENCY side: a sub
    # line may only exist where an age segment exists, and never an eta segment.
    @{ id = 'sub line only where an age exists'; pass = ($data.subLines -eq $data.agoSegments); detail = "$($data.subLines) sub lines / $($data.agoSegments) ago" },
    # 会话6 · the projected remainder is gone: the page must not contain ONE eta segment either.
    @{ id = 'no eta segment anywhere'; pass = ($data.etaSegments -eq 0); detail = "$($data.etaSegments) eta nodes" },
    @{ id = 'one ago segment per aged row'; pass = (@($data.rows | Where-Object { $_.agoText -ne $null }).Count -eq $data.agoSegments); detail = "ago $($data.agoSegments)" },
    @{ id = 'second line never wraps'; pass = ($data.subWrappedAny -eq $false); detail = "wrapped=$($data.subWrappedAny)" },
    @{ id = 'second line never overlaps the track'; pass = ($data.subOverlapsTrackAny -eq $false); detail = "overlap=$($data.subOverlapsTrackAny)" },
    @{ id = 'second line stays inside the card'; pass = ($data.subBeyondCard -eq $false); detail = "beyond=$($data.subBeyondCard)" },
    @{ id = 'second line sits under the rail row'; pass = (@($data.rows | Where-Object { $_.subTop -ne $null -and $_.rowBottom -ne $null -and $_.subTop -lt ($_.rowBottom - 0.5) }).Count -eq 0); detail = 'no sub line above the row' },
    @{ id = 'the age segment carries a tooltip'; pass = (@($data.rows | Where-Object { $_.agoText -ne $null -and [string]::IsNullOrEmpty([string]$_.agoTitle) }).Count -eq 0 -and @($data.rows | Where-Object { $_.etaText -ne $null }).Count -eq 0); detail = 'the one surviving half has its title' },
    @{ id = 'ago text names the duration'; pass = (@($data.rows | Where-Object { $_.agoText -ne $null -and $_.agoText -notmatch '(秒|分钟|小时)前估计' }).Count -eq 0); detail = (@($data.rows | Where-Object { $_.agoText -ne $null } | Select-Object -First 1).agoText) },
    @{ id = 'the age text names the duration'; pass = (@($data.rows | Where-Object { $_.agoText -ne $null -and $_.agoText -notmatch '(秒|分钟|小时)前估计' }).Count -eq 0); detail = (@($data.rows | Where-Object { $_.agoText -ne $null } | Select-Object -First 1).agoText) }
    # 会话6 · the removed half must leave no trace in the measured rows: no eta text at all.
    @{ id = 'no eta wording in any row'; pass = (@($data.rows | Where-Object { $_.etaText -ne $null }).Count -eq 0); detail = 'no row carries an eta segment' }
  )

  $failed = @($checks | Where-Object { -not $_.pass })
  foreach ($check in $checks) {
    Write-Output ("{0}  {1}  ({2})" -f $(if ($check.pass) { 'PASS' } else { 'FAIL' }), $check.id, $check.detail)
  }

  Write-Output ''
  Write-Output ('{0}/{1} browser-measured checks passed' -f ($checks.Count - $failed.Count), $checks.Count)
  Write-Output ('rows: ' + (($data.rows | ForEach-Object { "#$($_.index) $($_.status) rail=$($_.label) fill=$($_.fillPct)% ago=$($_.agoText) eta=$($_.etaText)" }) -join ' | '))
  $evidence = [ordered]@{
    capturedAt = (Get-Date).ToString('o')
    chrome = $Chrome
    viewport = "$Width x $Height"
    page = 'evidence/preview/panel-measure.html'
    checks = $checks
    measured = $data
  }
  $evidencePath = Join-Path $root 'evidence\step07-measure.json'
  $evidence | ConvertTo-Json -Depth 8 | Set-Content -Path $evidencePath -Encoding utf8
  Write-Output ("wrote evidence/step07-measure.json")

  if ($failed.Count -gt 0) { exit 1 }
}
finally {
  Pop-Location
}
