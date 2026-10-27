# measure-timing.ps1 — prove IN A BROWSER that the rail's second line is honest and tidy.
#
# Run: pwsh -File tools\measure-timing.ps1
#
# 会话6 (2026-10-26) · the projected REMAINING time is gone by user request, so this script measures
# the ONE fact that is left: the age of the number ("3 分钟前估计"). What it proves that the offline
# tree tests cannot:
#   - a LIVE DOM really contains no ETA node and no ETA wording anywhere on the page;
#   - the surviving line neither wraps, nor overlaps the track, nor spills past the card;
#   - the narrow container still drops the whole second line.
#
# tools/preview-panel.mjs writes evidence/preview/panel-timing-measure.html: the real bundle, the real
# CSS and a host div the page re-mounts the renderer's own tree into, with FIXED stamps — so every
# number below is reproducible and no wall clock is involved.
#
# The browser is auto-detected (this machine has no Chrome; Edge is the available Chromium), and on
# this machine headless Chromium must be started with Start-Process (a direct call returns immediately
# and silently writes nothing).
param(
  [string]$Chrome = '',
  [int]$Width = 1400,
  [int]$Height = 900
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$evidence = Join-Path $root 'evidence'

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

  $source = (Resolve-Path (Join-Path $root 'evidence\preview\panel-timing-measure.html')).Path
  $profile = Join-Path $env:TEMP ('wf-timing-' + [guid]::NewGuid().ToString('N'))
  $dump = Join-Path $env:TEMP ('wf-timing-dom-' + [guid]::NewGuid().ToString('N') + '.html')
  $url = 'file:///' + ($source -replace '\\', '/')

  $chromeArgs = @(
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', "--window-size=$Width,$Height",
    '--virtual-time-budget=6000', '--dump-dom', "--user-data-dir=$profile", $url
  )
  Start-Process -FilePath $Chrome -ArgumentList $chromeArgs -Wait -NoNewWindow -RedirectStandardOutput $dump
  if (-not (Test-Path $dump)) { throw "headless browser wrote no DOM: $dump" }

  $html = Get-Content $dump -Raw
  $match = [regex]::Match($html, '(?s)<pre id="wf-timing-measure">(.*?)</pre>')
  if (-not $match.Success) { throw 'the page produced no #wf-timing-measure block (script error?)' }

  $json = $match.Groups[1].Value
  $json = $json -replace '&quot;', '"' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&amp;', '&'
  $data = $json | ConvertFrom-Json

  $rows = @($data.rows)
  $withAgo = @($rows | Where-Object { $_.agoText -ne $null })
  $stamped = @($rows | Where-Object { $_.timing -eq 'one' -and $_.agoText -ne $null })
  $none = @($rows | Where-Object { $_.timing -eq 'none' })
  $withSub = @($rows | Where-Object { $null -ne $_.subH })
  $liveRow = @($rows | Where-Object { $_.title -eq '两段并存' })
  $doneRow = @($rows | Where-Object { $_.title -eq '已完工' })

  $checks = @(
    @{ id = 'timing.page.noError'; pass = ([string]::IsNullOrEmpty([string]$data.error)); detail = "$($data.error)" },
    @{ id = 'timing.fourSteps'; pass = ($rows.Count -eq 4); detail = "$($rows.Count) steps" },

    # 会话6 · the headline: every row that carries a live number WITH a stamp shows ONE segment, and
    # the two rows that carry no stamp / are not started show NONE.
    @{ id = 'timing.agoOnStampedRows'; pass = ($stamped.Count -eq 2 -and $withAgo.Count -eq 2); detail = "$($stamped.Count) stamped rows, $($withAgo.Count) ago segments" },
    @{ id = 'timing.agoArithmetic'; pass = ($liveRow.Count -eq 1 -and $liveRow[0].agoText -eq '3 分钟前估计'); detail = $(if ($liveRow.Count -eq 1) { $liveRow[0].agoText } else { 'n/a' }) },
    @{ id = 'timing.agoTooltip'; pass = ($liveRow.Count -eq 1 -and $liveRow[0].agoTitle -eq '3 分钟前估计'); detail = $(if ($liveRow.Count -eq 1) { $liveRow[0].agoTitle } else { 'n/a' }) },
    @{ id = 'timing.doneKeepsAgo'; pass = ($doneRow.Count -eq 1 -and $doneRow[0].agoText -eq '2 分钟前估计'); detail = $(if ($doneRow.Count -eq 1) { $doneRow[0].agoText } else { 'n/a' }) },

    # …and the REMOVAL is total: no ETA segment, no separator, no ETA wording anywhere on the page.
    @{ id = 'timing.noEtaSegments'; pass = (@($rows | Where-Object { $_.etaText -ne $null -or $_.etaTitle -ne $null }).Count -eq 0 -and $data.etaNodeCount -eq 0); detail = "eta nodes $($data.etaNodeCount)" },
    @{ id = 'timing.noSeparators'; pass = (@($rows | Where-Object { $_.sepCount -ne 0 }).Count -eq 0); detail = "max sep $((@($rows | Measure-Object -Property sepCount -Maximum).Maximum))" },
    @{ id = 'timing.noEtaWording'; pass = ($data.pageTextHasEta -eq $false); detail = "page text mentions 还剩: $($data.pageTextHasEta)" },
    @{ id = 'timing.noPendingSecondLine'; pass = ($none.Count -eq 2); detail = "$($none.Count) rows with no second line" },
    @{ id = 'timing.noPlaceholderZero'; pass = (@($rows | Where-Object { $_.agoText -match '^0 ' }).Count -eq 0); detail = 'no 0-second segment anywhere' },
    @{ id = 'timing.noDashPlaceholder'; pass = (@($rows | Where-Object { $_.agoText -eq '—' }).Count -eq 0); detail = 'no — placeholder' },

    # Layout: one line, under the track, inside the card.
    @{ id = 'timing.neverWraps'; pass = (@($withSub | Where-Object { $_.subWrapped }).Count -eq 0); detail = "wrapped=$(@($withSub | Where-Object { $_.subWrapped }).Count)" },
    @{ id = 'timing.neverOverlapsTrack'; pass = (@($withSub | Where-Object { $_.subOverlapsTrack }).Count -eq 0); detail = "overlap=$(@($withSub | Where-Object { $_.subOverlapsTrack }).Count)" },
    @{ id = 'timing.staysInsideCard'; pass = (@($withSub | Where-Object { $_.subBeyondCard }).Count -eq 0); detail = "beyond=$(@($withSub | Where-Object { $_.subBeyondCard }).Count)" },
    @{ id = 'timing.sitsUnderTheRow'; pass = (@($withSub | Where-Object { -not $_.subUnderRow }).Count -eq 0); detail = "under=$(@($withSub | Where-Object { $_.subUnderRow }).Count)/$($withSub.Count)" },
    @{ id = 'timing.trackKeepsItsWidth'; pass = (@($withSub | Where-Object { $_.trackW -lt 100 }).Count -eq 0); detail = "min track $(($withSub | Measure-Object -Property trackW -Minimum).Minimum)px" },

    # Narrow container: only the first line exists.
    @{ id = 'timing.narrowDropsTheSecondLine'; pass = ($data.narrow.subLines -eq 0); detail = "$($data.narrow.subLines) sub lines" },
    @{ id = 'timing.narrowKeepsThePercent'; pass = ($data.narrow.percent -match '^~?\d+%'); detail = "$($data.narrow.percent)" },
    @{ id = 'timing.narrowDockIsOneLine'; pass = ([math]::Abs([double]$data.narrow.dockH - 6) -lt 0.01); detail = "$($data.narrow.dockH)px" }
  )

  $failed = @($checks | Where-Object { -not $_.pass })
  foreach ($check in $checks) {
    Write-Output ("{0}  {1}  ({2})" -f $(if ($check.pass) { 'PASS' } else { 'FAIL' }), $check.id, $check.detail)
  }

  Write-Output ''
  Write-Output ('{0}/{1} browser-measured timing checks passed' -f ($checks.Count - $failed.Count), $checks.Count)
  Write-Output ('rows: ' + (($rows | ForEach-Object { "$($_.title) [$($_.timing)] ago='$($_.agoText)' eta='$($_.etaText)' h=$($_.subH)" }) -join ' | '))

  $record = [ordered]@{
    capturedAt = (Get-Date).ToString('o')
    browser = $Chrome
    viewport = "$Width x $Height"
    page = 'evidence/preview/panel-timing-measure.html'
    checks = $checks
    counts = @{ total = $checks.Count; pass = $checks.Count - $failed.Count; fail = $failed.Count }
    measured = $data
  }
  $record | ConvertTo-Json -Depth 12 | Set-Content -Path (Join-Path $evidence 'step06-timing-measure.json') -Encoding utf8
  Write-Output 'wrote evidence/step06-timing-measure.json'

  if ($failed.Count -gt 0) { exit 1 }
}
finally {
  Pop-Location
}
