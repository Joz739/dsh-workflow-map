# measure-effects.ps1 — the living layer of the SINGLE PAGE, measured IN A BROWSER.
#
# Run: pwsh -File tools\measure-effects.ps1
#
# session7 (2026-10-27) rewrote both halves to the 会话4 single-page layout. The old
# script measured the step↔node curve of the two-column layout (wfFxCurve endpoints,
# resize/scroll retargeting) — that UI is gone from the mount tree, so the old run crashed
# on a Null (no curve was ever rendered). What the living layer means on TODAY's page,
# and what only a real browser can prove:
#
#   · the running unit's ring breathes (wf-ring 1.6 s) and its card is wrapped in the
#     flowing brand gradient (wf-fx-wrap 2.6 s, a rainbow/brand multi-stop background);
#   · the running row's rail keeps the live progress bar flowing (wf-prog-flow 1.5 s);
#   · the running chip's three dots breathe (wf-live-dots 1.2 s) and the single live dot
#     breathes on its own (wf-live-dot 1.2 s);
#   · document.getAnimations() really returns those CSS animations (they RUN, not just exist
#     in a stylesheet string), all with playState 'running';
#   · 「减少动效」 (data-motion='static') → EVERY animation under the root becomes none:
#     0 animation objects, computedStyle animationName none on all five measured elements;
#   · session idle (data-idle='1') → every animation PAUSES (playState 'paused'), none removed;
#   · the running card's connector (data-live) keeps its gradient while a done one has none.
#
# The browser is auto-detected (this machine has no Chrome; Edge is the Chromium), and on
# this machine headless Chromium must be started with Start-Process (a direct call returns
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
  node tools\preview-effects.mjs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'preview-effects.mjs failed' }

  $expectPath = Join-Path $preview 'fx-expect.json'
  if (-not (Test-Path $expectPath)) { throw "expectations missing: $expectPath" }
  $expect = Get-Content $expectPath -Raw | ConvertFrom-Json

  $checks = New-Object System.Collections.Generic.List[object]
  function Add-Check([string]$id, [bool]$pass, [string]$detail) {
    $checks.Add([pscustomobject]@{ id = $id; pass = $pass; detail = $detail })
  }
  function Dump-Page([string]$htmlPath, [int]$budget) {
    $profile = Join-Path $env:TEMP ('wf-fx-' + [guid]::NewGuid().ToString('N'))
    $dump = Join-Path $env:TEMP ('wf-fx-dom-' + [guid]::NewGuid().ToString('N') + '.html')
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
    $json = $json -replace '"', '"' -replace '<', '<' -replace '>', '>' -replace '&', '&'
    return ($json | ConvertFrom-Json)
  }

  $measured = [ordered]@{}

  # ---------------------------------------------------------------------------
  # page 1 — running: the five animations exist, run, and are the shipped keyframes
  # ---------------------------------------------------------------------------
  $running = Dump-Page (Resolve-Path (Join-Path $preview 'panel-fx-running.html')).Path 7000
  $measured['running'] = $running
  $fx = $running.facts
  Add-Check 'fx.bound' ([string]::IsNullOrEmpty([string]$running.error)) "error=$($running.error)"
  Add-Check 'fx.running.unitPresent' ($fx.runningPresent -eq $true) "running=$($fx.runningPresent)"
  Add-Check 'fx.root.live' ($fx.root.motion -eq 'css' -and $fx.root.idle -eq '0') "motion=$($fx.root.motion) idle=$($fx.root.idle)"

  Add-Check 'fx.ring.breathes' ($fx.ring.animationName -eq 'wf-ring' -and $fx.ring.animationDuration -eq $expect.ringDuration) "$($fx.ring.animationName) $($fx.ring.animationDuration)"
  Add-Check 'fx.card.wrap' ($fx.cardFrame.animationName -eq 'wf-fx-wrap' -and $fx.cardFrame.animationDuration -eq $expect.wrapDuration) "$($fx.cardFrame.animationName) $($fx.cardFrame.animationDuration)"
  Add-Check 'fx.card.rainbow' (@($fx.cardFrame.backgroundImage -split ', ').Count -ge 5) "$(@($fx.cardFrame.backgroundImage -split ', ').Count) colour stops"
  Add-Check 'fx.fill.flows' ($fx.liveFill.animationName -eq 'wf-prog-flow' -and $fx.liveFill.animationPlayState -eq 'running') "$($fx.liveFill.animationName) $($($fx.liveFill.animationPlayState))"
  Add-Check 'fx.liveDots.count' ($fx.liveDots.count -eq [int]$expect.liveDots) "count=$($fx.liveDots.count) expected=$($expect.liveDots)"
  Add-Check 'fx.liveDots.breathe' ($fx.liveDots.animation.animationName -eq 'wf-live-dots' -and $fx.liveDots.animation.animationDuration -eq $expect.livePeriod) "$($fx.liveDots.animation.animationName) $($fx.liveDots.animation.animationDuration)"
  Add-Check 'fx.liveDot.breathes' ($fx.liveDot.animationName -eq 'wf-live-dot' -and $fx.liveDot.animationDuration -eq $expect.livePeriod) "$($fx.liveDot.animationName) $($fx.liveDot.animationDuration)"
  Add-Check 'fx.link.liveGradient' ($fx.liveLink.backgroundImage -ne 'none' -and $fx.doneLink.backgroundImage -eq 'none') "live=$([bool]($fx.liveLink.backgroundImage -ne 'none')) done=$($fx.doneLink.backgroundImage -eq 'none')"

  $names = @($fx.animNames)
  Add-Check 'fx.anims.real' ($fx.animCount -ge 5) "getAnimations()=$($fx.animCount)"
  Add-Check 'fx.anims.names' (($names -contains 'wf-ring') -and ($names -contains 'wf-fx-wrap') -and ($names -contains 'wf-prog-flow') -and ($names -contains 'wf-live-dots') -and ($names -contains 'wf-live-dot')) ($names -join ', ')
  Add-Check 'fx.anims.allRunning' ((@($fx.animPlayStates | Where-Object { $_ -ne 'running' }).Count -eq 0) -and @($fx.animPlayStates).Count -gt 0) "states=$(@($fx.animPlayStates | Select-Object -Unique) -join '/')"

  # ---------------------------------------------------------------------------
  # page 2 — 「减少动效」: data-motion=static → every animation is gone
  # ---------------------------------------------------------------------------
  $static = Dump-Page (Resolve-Path (Join-Path $preview 'panel-fx-static.html')).Path 7000
  $measured['static'] = $static
  $sx = $static.facts
  Add-Check 'fx.static.bound' ([string]::IsNullOrEmpty([string]$static.error)) "error=$($static.error)"
  Add-Check 'fx.static.root' ($sx.root.motion -eq 'static') "motion=$($sx.root.motion)"
  Add-Check 'fx.static.zeroAnims' ($sx.animCount -eq 0) "getAnimations()=$($sx.animCount)"
  Add-Check 'fx.static.ring' ($sx.ring.animationName -eq 'none') "ring=$($sx.ring.animationName)"
  Add-Check 'fx.static.card' ($sx.cardFrame.animationName -eq 'none') "card=$($sx.cardFrame.animationName)"
  Add-Check 'fx.static.fill' ($sx.liveFill.animationName -eq 'none') "fill=$($sx.liveFill.animationName)"
  Add-Check 'fx.static.dots' ($sx.liveDots.animation.animationName -eq 'none') "dots=$($sx.liveDots.animation.animationName)"
  Add-Check 'fx.static.dot' ($sx.liveDot.animationName -eq 'none') "dot=$($sx.liveDot.animationName)"

  # ---------------------------------------------------------------------------
  # page 3 — idle: every animation PAUSES, none is removed
  # ---------------------------------------------------------------------------
  $idle = Dump-Page (Resolve-Path (Join-Path $preview 'panel-fx-idle.html')).Path 7000
  $measured['idle'] = $idle
  $ix = $idle.facts
  Add-Check 'fx.idle.bound' ([string]::IsNullOrEmpty([string]$idle.error)) "error=$($idle.error)"
  Add-Check 'fx.idle.root' ($ix.root.idle -eq '1' -and $ix.root.motion -eq 'css') "idle=$($ix.root.idle) motion=$($ix.root.motion)"
  Add-Check 'fx.idle.animsKept' ($ix.animCount -ge 5) "getAnimations()=$($ix.animCount)"
  Add-Check 'fx.idle.allPaused' ((@($ix.animPlayStates | Where-Object { $_ -ne 'paused' }).Count -eq 0) -and @($ix.animPlayStates).Count -gt 0) "states=$(@($ix.animPlayStates | Select-Object -Unique) -join '/')"
  Add-Check 'fx.idle.fillPaused' ($ix.liveFill.animationPlayState -eq 'paused') "fill=$($ix.liveFill.animationPlayState)"
  Add-Check 'fx.idle.ringPaused' ($ix.ring.animationPlayState -eq 'paused') "ring=$($ix.ring.animationPlayState)"

  # ---------------------------------------------------------------------------
  # report
  # ---------------------------------------------------------------------------
  $failed = @($checks | Where-Object { -not $_.pass })
  foreach ($check in $checks) {
    Write-Output ("{0}  {1}  {2}" -f ($(if ($check.pass) { 'PASS' } else { 'FAIL' })), $check.id, $check.detail)
  }
  Write-Output ''
  Write-Output ("{0}/{1} browser-measured effects checks passed" -f ($checks.Count - $failed.Count), $checks.Count)

  $record = [ordered]@{
    asOf = (Get-Date).ToString('o')
    chrome = $Chrome
    viewport = @{ width = $Width; height = $Height }
    checks = $checks
    counts = @{ total = $checks.Count; pass = $checks.Count - $failed.Count; fail = $failed.Count }
    measured = $measured
  }
  $record | ConvertTo-Json -Depth 16 | Set-Content -Path (Join-Path $evidence 'fx-measure.json') -Encoding utf8
  if ($failed.Count -gt 0) { exit 1 }
}
finally {
  Pop-Location
}
