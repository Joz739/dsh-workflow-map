# measure-inject.ps1 — prove IN A BROWSER that the hot-inject entry and its dock are real geometry.
#
# Run: pwsh -File tools\measure-inject.ps1
#
# The step's acceptance criteria are geometric, and only a layout engine can decide them:
#   * the header entry is ≥ 96×30 px and carries the model's own pending badge;
#   * the right column is 460 px and the flow opens BESIDE it (never pushed by it);
#   * the persistent dock sits at the right page's FOOT — below the scroll area, full column width,
#     one real <input> and a send button wired to the same gate as the composer;
#   * the composer itself does NOT repeat the dock;
#   * a narrow container stacks the page under the flow and keeps the dock at its foot;
#   * no layout overflow anywhere.
# The arithmetic and the state machine live in tools/selftest-panel.mjs.
#
# HONEST NOTE (registered as DEV-01 in evidence/step04b-inject-prominence.md): the unit cards DO
# shift horizontally when the right page opens, because `.wf-units` is a centred max-width 560 px
# list inside the shrinking flow column. That is pre-existing behaviour of the single-page layout
# (会话4), not something this step introduced — but widening the column 380 → 460 px increases the
# shift by exactly (460−380)/2 = 40 px, so it is measured and reported rather than hidden: the
# check `cards.shiftEqualsHalfRightWidth` pins the measured number to the arithmetic.
#
# tools/preview-panel.mjs writes evidence/preview/panel-inject-measure.html: the real bundle, the
# real CSS and a host div the page re-mounts the renderer's own tree into, so every number below
# comes from a live layout engine and no wall clock is involved.
#
# On this machine headless Chrome must be started with Start-Process (a direct call returns
# immediately and silently writes nothing). Chrome is NOT installed here — only Edge (Chromium) —
# so -Chrome defaults to an auto-detected Chromium binary.
param(
  [string]$Chrome = '',
  [int]$Width = 1400,
  [int]$Height = 900
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$evidence = Join-Path $root 'evidence'

if ([string]::IsNullOrEmpty($Chrome)) {
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
if (-not (Test-Path $Chrome)) { throw "no Chromium browser found; pass -Chrome <path to chrome.exe or msedge.exe>" }

Push-Location $root
try {
  node tools\preview-panel.mjs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'preview-panel.mjs failed' }

  $source = (Resolve-Path (Join-Path $root 'evidence\preview\panel-inject-measure.html')).Path
  $profile = Join-Path $env:TEMP ('wf-inject-' + [guid]::NewGuid().ToString('N'))
  $dump = Join-Path $env:TEMP ('wf-inject-dom-' + [guid]::NewGuid().ToString('N') + '.html')
  $url = 'file:///' + ($source -replace '\\', '/')

  $chromeArgs = @(
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', "--window-size=$Width,$Height",
    '--virtual-time-budget=6000', '--dump-dom', "--user-data-dir=$profile", $url
  )
  Start-Process -FilePath $Chrome -ArgumentList $chromeArgs -Wait -NoNewWindow -RedirectStandardOutput $dump
  if (-not (Test-Path $dump)) { throw "the browser wrote no DOM: $dump" }

  # UTF-8 explicitly: the page is written as UTF-8 and the dictionary strings are Chinese, so
  # Windows PowerShell's ANSI default would mangle them into bytes that break the JSON parse.
  $html = Get-Content $dump -Raw -Encoding UTF8
  $match = [regex]::Match($html, '(?s)<pre id="wf-inject-measure">(.*?)</pre>')
  if (-not $match.Success) { throw 'the page produced no #wf-inject-measure block (script error?)' }

  $json = $match.Groups[1].Value
  $json = $json -replace '&quot;', '"' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&amp;', '&'
  $data = $json | ConvertFrom-Json

  $closed = $data.closed
  $open = $data.open
  $narrow = $data.narrow
  $composer = $data.composer

  $checks = @(
    @{ id = 'inject.page.noError'; pass = ([string]::IsNullOrEmpty([string]$data.error)); detail = "$($data.error)" },
    @{ id = 'inject.measure.shape'; pass = ($null -ne $open.toggle -and $null -ne $open.badge -and $null -ne $open.page -and $null -ne $open.right -and $null -ne $open.scroll -and $null -ne $open.dock -and $null -ne $closed.page -and $null -ne $narrow.right -and $null -ne $narrow.dock -and $null -ne $composer.right); detail = 'every measured box exists (a missing box would make the numbers below meaningless)' },

    # (1) The entry button: really bigger, on the header row with the ‒ beside it, same radius.
    @{ id = 'toggle.size.minWidth'; pass = ([double]$open.toggle.w -ge 95.4); detail = "$($open.toggle.w)px wide (contract: min-width 96px)" },
    @{ id = 'toggle.size.height'; pass = ([double]$open.toggle.h -ge 29.4); detail = "$($open.toggle.h)px tall (contract: height 30px)" },
    @{ id = 'toggle.size.biggerThanSiblings'; pass = ([double]$open.toggle.w -gt [double]$open.collapse.w -and [double]$open.toggle.h -gt [double]$open.collapse.h); detail = "$($open.toggle.w)x$($open.toggle.h) vs the ‒ at $($open.collapse.w)x$($open.collapse.h)" },
    @{ id = 'toggle.row.sameTop'; pass = ([math]::Abs([double]$open.toggle.top - [double]$open.collapse.top) -lt 0.6); detail = "top $($open.toggle.top) vs $($open.collapse.top)" },
    @{ id = 'toggle.radius.same'; pass = ($open.toggleRadius -eq $open.collapseRadius); detail = "$($open.toggleRadius) vs $($open.collapseRadius)" },
    @{ id = 'toggle.insideHeader'; pass = ([double]$open.toggle.right -le [double]$open.bodyRight + 1); detail = "toggle right $($open.toggle.right) <= body right $($open.bodyRight)" },

    # (2) The pending badge is REAL: one element, the model's own count, the model's own text.
    @{ id = 'badge.pendingCount'; pass = ([string]$open.pendingCount -eq '1'); detail = "data-pending-count=$($open.pendingCount)" },
    @{ id = 'badge.element'; pass = ([int]$open.badgeCount -eq 1); detail = "$($open.badgeCount) badge element(s)" },
    @{ id = 'badge.text'; pass = ([string]$open.badgeText -eq '1'); detail = "$($open.badgeText)" },
    @{ id = 'badge.aboveButton'; pass = ([double]$open.badge.top -lt [double]$open.toggle.top -and [double]$open.badge.top -ge 0); detail = "badge top $($open.badge.top) vs button top $($open.toggle.top) (above it, and not clipped off the panel)" },

    # (3) The right column is 460 px, beside the flow — the flow is SHRUNK, never pushed.
    @{ id = 'right.width'; pass = ([math]::Abs([double]$open.right.w - 460) -lt 1); detail = "$($open.right.w)px" },
    @{ id = 'right.insideBody'; pass = ([double]$open.right.right -le [double]$open.bodyRight + 1); detail = "right $($open.right.right) <= body $($open.bodyRight)" },
    @{ id = 'right.sideBySide'; pass = ([double]$open.right.left -ge [double]$open.page.right - 1); detail = "right left $($open.right.left) >= page right $($open.page.right)" },
    @{ id = 'right.opensByShrinking'; pass = ([math]::Abs(([double]$open.page.w + [double]$open.right.w) - [double]$closed.page.w) -lt 1.5); detail = "$($open.page.w) + $($open.right.w) = $($closed.page.w) (closed)" },
    @{ id = 'flow.notMoved'; pass = ([math]::Abs([double]$open.page.left - [double]$closed.page.left) -lt 0.6 -and [math]::Abs([double]$open.page.top - [double]$closed.page.top) -lt 0.6); detail = "page left/top $($open.page.left)/$($open.page.top) vs $($closed.page.left)/$($closed.page.top)" },
    @{ id = 'cards.notMovedVertically'; pass = (@($open.cards | Where-Object { [math]::Abs([double]$_.top - [double]$_.topClosed) -gt 0.6 }).Count -eq 0); detail = "$(@($open.cards | Where-Object { [math]::Abs([double]$_.top - [double]$_.topClosed) -gt 0.6 }).Count) card(s) moved vertically" },
    @{ id = 'cards.shiftEqualsHalfRightWidth'; pass = (@($open.cards | Where-Object { [math]::Abs([math]::Abs([double]$_.left - [double]$_.leftClosed) - [double]$open.right.w / 2) -gt 0.6 }).Count -eq 0); detail = "the centred 560 px unit list re-centres by exactly rightW/2 = $([double]$open.right.w / 2)px (DEV-01, pre-existing; 会话4 layout)" },

    # (4) The dock: at the FOOT of the right page, full width, below the scroll, gated and labelled.
    @{ id = 'dock.present'; pass = ([int]$open.dockCount -eq 1); detail = "$($open.dockCount) dock(s)" },
    @{ id = 'dock.atFoot'; pass = ([math]::Abs([double]$open.dock.bottom - [double]$open.right.bottom) -lt 1.5); detail = "dock bottom $($open.dock.bottom) vs right bottom $($open.right.bottom)" },
    @{ id = 'dock.belowScroll'; pass = ([double]$open.dock.top -ge [double]$open.scroll.bottom - 1); detail = "dock top $($open.dock.top) >= scroll bottom $($open.scroll.bottom)" },
    @{ id = 'dock.fullWidth'; pass = ([double]$open.dock.w -ge [double]$open.right.w - 2); detail = "$($open.dock.w)px in a $($open.right.w)px column" },
    @{ id = 'dock.inputIsInput'; pass = ($open.dockInputTag -eq 'input'); detail = "$($open.dockInputTag)" },
    @{ id = 'dock.sendIsButton'; pass = ($open.dockSendTag -eq 'button'); detail = "$($open.dockSendTag)" },
    @{ id = 'dock.sendGated'; pass = ([string]$open.dockSendReady -eq 'false'); detail = "data-ready=$($open.dockSendReady) for an EMPTY text (the same wfInjectCanSend the composer uses)" },
    @{ id = 'dock.newestStatus'; pass = ([string]$open.dockState -eq 'pending' -and [string]$open.dockStateText -eq '待会话拾取'); detail = "$($open.dockState) / $($open.dockStateText)" },

    # (5) The composer does NOT repeat the dock, and the full form is still intact.
    @{ id = 'composer.noDock'; pass = ([int]$composer.dockCount -eq 0); detail = "$($composer.dockCount) dock(s) while the composer is open" },
    @{ id = 'composer.present'; pass = ([int]$composer.composerCount -eq 1); detail = "$($composer.composerCount) composer(s)" },
    @{ id = 'composer.rightWidth'; pass = ([math]::Abs([double]$composer.right.w - 460) -lt 1); detail = "$($composer.right.w)px" },
    @{ id = 'composer.areaIsTextarea'; pass = ($composer.composerAreaTag -eq 'textarea'); detail = "$($composer.composerAreaTag)" },
    @{ id = 'composer.areaHasPlaceholder'; pass = (-not [string]::IsNullOrEmpty([string]$composer.composerAreaPlaceholder)); detail = "$($composer.composerAreaPlaceholder)" },
    @{ id = 'composer.sendDisabledWhenEmpty'; pass = ($composer.composerSendDisabled -eq $true); detail = "disabled=$($composer.composerSendDisabled)" },
    @{ id = 'composer.counter'; pass = ([string]$composer.composerCounter -match '/2000'); detail = "$($composer.composerCounter)" },

    # (6) Closed: no right page, no dock, no composer.
    @{ id = 'closed.noRightPage'; pass = ($null -eq $closed.right); detail = "right=$($closed.right)" },
    @{ id = 'closed.noDock'; pass = ([int]$closed.dockCount -eq 0); detail = "$($closed.dockCount)" },
    @{ id = 'closed.noComposer'; pass = ([int]$closed.composerCount -eq 0); detail = "$($closed.composerCount)" },

    # (7) Narrow container: stacked under the flow, dock still at the foot, nothing overflows.
    @{ id = 'narrow.stacked'; pass = ([double]$narrow.right.top -ge [double]$narrow.page.bottom - 1); detail = "right top $($narrow.right.top) >= page bottom $($narrow.page.bottom)" },
    @{ id = 'narrow.fullWidth'; pass = ([double]$narrow.right.w -ge [double]$narrow.bodyW - 24); detail = "$($narrow.right.w)px in a $($narrow.bodyW)px body" },
    @{ id = 'narrow.dockAtFoot'; pass = ([int]$narrow.dockCount -eq 1 -and [math]::Abs([double]$narrow.dock.bottom - [double]$narrow.right.bottom) -lt 1.5); detail = "dock bottom $($narrow.dock.bottom) vs right bottom $($narrow.right.bottom)" },
    @{ id = 'narrow.noOverflow'; pass = ([int]$narrow.pageOverflow -eq 0); detail = "$($narrow.pageOverflow)px" },
    @{ id = 'open.noOverflow'; pass = ([int]$open.pageOverflow -eq 0); detail = "$($open.pageOverflow)px" },
    @{ id = 'closed.noOverflow'; pass = ([int]$closed.pageOverflow -eq 0); detail = "$($closed.pageOverflow)px" }
  )

  $failed = @($checks | Where-Object { -not $_.pass })
  foreach ($check in $checks) {
    Write-Output ("{0}  {1}  ({2})" -f $(if ($check.pass) { 'PASS' } else { 'FAIL' }), $check.id, $check.detail)
  }

  Write-Output ''
  Write-Output ('{0}/{1} browser-measured inject checks passed' -f ($checks.Count - $failed.Count), $checks.Count)

  $record = [ordered]@{
    capturedAt = (Get-Date).ToString('o')
    browser = $Chrome
    viewport = "$Width x $Height"
    page = 'evidence/preview/panel-inject-measure.html'
    checks = $checks
    counts = @{ total = $checks.Count; pass = $checks.Count - $failed.Count; fail = $failed.Count }
    measured = $data
  }
  $record | ConvertTo-Json -Depth 12 | Set-Content -Path (Join-Path $evidence 'step04-inject-measure.json') -Encoding utf8
  Write-Output 'wrote evidence/step04-inject-measure.json'

  if ($failed.Count -gt 0) { exit 1 }
}
finally {
  Pop-Location
}
