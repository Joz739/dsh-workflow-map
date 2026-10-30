# measure-detail.ps1 — the node / step details ON THE RIGHT PAGE, measured IN A BROWSER.
#
# Run: pwsh -File tools\measure-detail.ps1
#
# session7 (2026-10-27) rewrote both halves to the 会话4 single-page layout. The old pages fed
# wfRenderPanel the retired extras contract (flow / stepDetail / selectedNode) and the old run
# scored 15/54 with every node-detail check empty. Today the right page's content is DERIVED by
# wfRightPageSpec(model, prefs) from (rightOpen, rightKind, rightKey); the pages therefore only
# patch prefs. What this measures that the tree self-test cannot:
#
#   · the step page really renders the PAE report: summary, artifacts as copyable rows
#     (button + full path + basename + grey directory), exit code, honest stats, type rows;
#   · the type page really expands a call into wfRenderNodeDetail: category chip, status,
#     monospace pre-wrap args clamped to the shipped 180 px, the <details> command block whose
#     collapsed summary differs from its opened body, and the host's 200-character cap note;
#   · the error call really paints the red dot on the row (background, the shipped #e85a5a) and
#     the stored error text is visible under a stated first-line cap;
#   · a step that has not reported says so (a sentence, never a blank block);
#   · a page about a step whose detail was not sent says exactly that — it does NOT show the
#     selected step's report under another step's title;
#   · Clipboard really runs on a REAL row and the 1.5 s acknowledgement really restores;
#   · Escape and the <details> resize nudge really fire on real events;
#   · no file body ever reaches the DOM (the privacy rule).
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
  node tools\preview-detail.mjs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'preview-detail.mjs failed' }

  $expectPath = Join-Path $preview 'detail-expect.json'
  if (-not (Test-Path $expectPath)) { throw "expectations missing: $expectPath" }
  $expect = Get-Content $expectPath -Raw | ConvertFrom-Json

  $checks = New-Object System.Collections.Generic.List[object]
  function Add-Check([string]$id, [bool]$pass, [string]$detail) {
    $checks.Add([pscustomobject]@{ id = $id; pass = $pass; detail = $detail })
  }
  function Dump-Page([string]$htmlPath, [int]$budget) {
    $profile = Join-Path $env:TEMP ('wf-detail-' + [guid]::NewGuid().ToString('N'))
    $dump = Join-Path $env:TEMP ('wf-detail-dom-' + [guid]::NewGuid().ToString('N') + '.html')
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
  function Rows($node) {
    if ($null -eq $node -or $null -eq $node.copyRows) { return @() }
    return @($node.copyRows)
  }

  $measured = [ordered]@{}

  # ---------------------------------------------------------------------------
  # page 1 — the step page: the report, the artifact rows, the type rows, the copy
  # ---------------------------------------------------------------------------
  $edit = Dump-Page (Resolve-Path (Join-Path $preview 'panel-detail-edit-node.html')).Path 8000
  $measured['edit'] = $edit
  $fx = $edit.facts
  Add-Check 'detail.edit.bound' ([string]::IsNullOrEmpty([string]$edit.error)) "error=$($edit.error)"
  Add-Check 'detail.edit.rightKind' ($fx.right.kind -eq 'step') "kind=$($fx.right.kind)"

  $step = $fx.stepDetail
  Add-Check 'detail.edit.stepDetail' ($null -ne $step -and $step.report -eq 'true' -and [int]$step.stepIndex -eq 0) "report=$($step.report) index=$($step.stepIndex)"
  Add-Check 'detail.edit.summary' (HasText $step.text $expect.reportSummary) 'the PAE summary is rendered'
  Add-Check 'detail.edit.artifacts' ((@($step.artifacts).Count -eq [int]$expect.artifactCount) -and ($step.artifacts -contains $expect.artifactPaths[0]) -and ($step.artifacts -contains $expect.artifactPaths[1])) "artifacts=$(@($step.artifacts).Count)"
  $artifactRows = @($edit.facts.stepCopyRows)
  Add-Check 'detail.edit.artifactRows' (($artifactRows.Count -eq [int]$expect.artifactCount) -and ($artifactRows[0].label -eq $expect.artifactBaseA) -and ($artifactRows[0].target -eq $expect.artifactPaths[0])) "row0=$($artifactRows[0].label)"
  Add-Check 'detail.edit.exit' (HasText $step.text ([string]$expect.exitCode)) 'exit code rendered'
  Add-Check 'detail.edit.stats' ((HasText $step.stats ("{0} 工具" -f $expect.step0Tools)) -and (HasText $step.stats ("{0} 文件" -f $expect.step0Files)) -and (HasText $step.stats ("{0} 节点" -f $expect.step0Nodes))) "stats=$($step.stats)"
  Add-Check 'detail.edit.timing' ((HasText $step.text '开始') -and (HasText $step.text '结束')) 'start + end clocks'
  Add-Check 'detail.edit.typeRows' ((@($fx.stepTypeRows).Count -eq [int]$expect.unit0Types) -and (@($fx.stepTypeRows | Where-Object { [string]::IsNullOrEmpty($_.type) }).Count -eq 0)) "rows=$(@($fx.stepTypeRows).Count) expected=$($expect.unit0Types)"
  Add-Check 'detail.edit.typeRowSides' ((@($fx.stepTypeRows | Where-Object { $_.side -ne 'left' -and $_.side -ne 'right' }).Count -eq 0)) "sides=$(@($fx.stepTypeRows | ForEach-Object { $_.side } | Select-Object -Unique) -join '/')"
  Add-Check 'detail.edit.stepClose' ($fx.stepClose.present -eq $true -and [string]$fx.stepClose.index -eq '0') "present=$($fx.stepClose.present) index=$($fx.stepClose.index)"
  Add-Check 'detail.edit.privacy' ($fx.privacy.secretPresent -eq $false) "secretPresent=$($fx.privacy.secretPresent)"

  Add-Check 'detail.edit.copyRowScope' ($edit.copy.rowScope -eq 'step' -and $edit.copy.rowLabel -eq $expect.artifactBaseA) "scope=$($edit.copy.rowScope) label=$($edit.copy.rowLabel)"
  Add-Check 'detail.edit.copyClipboard' ($edit.copy.clipboardCall -eq $edit.copy.target -and $edit.copy.intermediate.ok -eq $true) "called=$($edit.copy.clipboardCall)"
  Add-Check 'detail.edit.copyAck' ($edit.copy.intermediate.state -eq 'copied' -and $edit.copy.intermediate.text -eq '已复制') "state=$($edit.copy.intermediate.state) text=$($edit.copy.intermediate.text)"
  Add-Check 'detail.edit.copyRestore' ($edit.copy.restored.state -eq 'idle') "state=$($edit.copy.restored.state)"
  Add-Check 'detail.edit.copyKeepsLabel' ($edit.copy.rowState.state -eq 'copied' -and (HasText $edit.copy.rowState.text $edit.copy.rowLabel)) 'the row keeps its own basename after the acknowledgement'
  Add-Check 'detail.edit.escape' ([int]$edit.esc.fired -eq 1) "fired=$($edit.esc.fired)"
  Add-Check 'detail.edit.nudge' ([int]$edit.nudge.resizes -ge 1) "resizes=$($edit.nudge.resizes)"

  # ---------------------------------------------------------------------------
  # page 2 — the type page with the command call expanded
  # ---------------------------------------------------------------------------
  $command = Dump-Page (Resolve-Path (Join-Path $preview 'panel-detail-command.html')).Path 8000
  $measured['command'] = $command
  $cx = $command.facts
  Add-Check 'detail.command.bound' ([string]::IsNullOrEmpty([string]$command.error)) "error=$($command.error)"
  Add-Check 'detail.command.rightKind' ($cx.right.kind -eq 'type') "kind=$($cx.right.kind)"
  $node = $cx.nodeDetail
  Add-Check 'detail.command.nodePresent' ($null -ne $node -and $node.nodeId -eq 'p1' -and $node.category -eq 'command' -and $node.role -eq 'region') "id=$($node.nodeId) cat=$($node.category) role=$($node.role)"
  Add-Check 'detail.command.closedSummary' ($cx.commandClosed.open -eq $false -and (HasText $cx.commandClosed.summary '查看完整命令')) "summary=$($cx.commandClosed.summary)"
  Add-Check 'detail.command.expanded' ($null -ne $node.details -and $node.details.open -eq $true) "open=$($node.details.open)"
  Add-Check 'detail.command.fullText' ([string]$node.details.body -ceq [string]$expect.command) "len=$($node.details.body.Length) expected=$($expect.commandLength)"
  Add-Check 'detail.command.capNote' (HasText $node.text '200 字') 'the host cap is stated'
  Add-Check 'detail.command.argsMono' ((HasText $node.args.style.fontFamily 'mono') -and (HasText $node.args.style.fontFamily 'Consolas')) "font=$($node.args.style.fontFamily)"
  Add-Check 'detail.command.argsPreWrap' ($node.args.style.whiteSpace -eq 'pre-wrap') "ws=$($node.args.style.whiteSpace)"
  Add-Check 'detail.command.argsClamp' ($node.args.style.maxHeight -eq [string]$expect.argsClamp) "maxHeight=$($node.args.style.maxHeight)"
  Add-Check 'detail.command.previewClamp' ($null -ne $node.argsPreview -and $node.argsPreview.style.maxHeight -eq [string]$expect.previewClamp) "previewMax=$($node.argsPreview.style.maxHeight)"
  Add-Check 'detail.command.copyControl' ((@(Rows $node | Where-Object { $_.target -eq $command.copy.target }).Count -ge 1)) "the opened call has a copy control"
  Add-Check 'detail.command.copyRowScope' ($command.copy.rowScope -eq 'node') "scope=$($command.copy.rowScope)"
  Add-Check 'detail.command.copyKeepsLabel' ($command.copy.rowState.state -eq 'copied' -and (HasText $command.copy.rowState.text $command.copy.rowLabel)) 'the row keeps its own label after the acknowledgement'
  Add-Check 'detail.command.privacy' ($cx.privacy.secretPresent -eq $false) "secretPresent=$($cx.privacy.secretPresent)"

  # ---------------------------------------------------------------------------
  # page 3 — the error call: red dot on the row + the stored error text
  # ---------------------------------------------------------------------------
  $errPage = Dump-Page (Resolve-Path (Join-Path $preview 'panel-detail-error.html')).Path 8000
  $measured['error'] = $errPage
  $ex = $errPage.facts
  Add-Check 'detail.error.bound' ([string]::IsNullOrEmpty([string]$errPage.error)) "error=$($errPage.error)"
  Add-Check 'detail.error.status' ($ex.nodeDetail.status -eq 'error') "status=$($ex.nodeDetail.status)"
  Add-Check 'detail.error.text' ([string]$ex.errorText -ceq [string]$expect.errorText) "text=$($ex.errorText)"
  Add-Check 'detail.error.cardRed' ($ex.errorCard.status -eq 'error' -and $ex.errorCard.background -eq [string]$expect.errorColour) "bg=$($ex.errorCard.background)"
  Add-Check 'detail.error.capNote' (HasText $ex.nodeDetail.text '首行') 'the stored-error bound is stated'
  Add-Check 'detail.error.privacy' ($ex.privacy.secretPresent -eq $false) "secretPresent=$($ex.privacy.secretPresent)"

  # ---------------------------------------------------------------------------
  # page 4 — a step that has NOT reported: a sentence, never a blank block
  # ---------------------------------------------------------------------------
  $noreport = Dump-Page (Resolve-Path (Join-Path $preview 'panel-detail-noreport.html')).Path 8000
  $measured['noreport'] = $noreport
  $nx = $noreport.facts
  Add-Check 'detail.noreport.bound' ([string]::IsNullOrEmpty([string]$noreport.error)) "error=$($noreport.error)"
  Add-Check 'detail.noreport.present' ($null -ne $nx.stepDetail -and $nx.stepDetail.report -eq 'false') "report=$($nx.stepDetail.report)"
  Add-Check 'detail.noreport.text' ($nx.honest.noReport -eq $true) 'the honest sentence is on the page'
  Add-Check 'detail.noreport.artifacts' (@($nx.stepDetail.artifacts).Count -eq 0) "artifacts=$(@($nx.stepDetail.artifacts).Count)"
  Add-Check 'detail.noreport.counts' ((HasText $nx.stepDetail.text '0 工具') -and (HasText $nx.stepDetail.text '无时间记录')) 'honest zeros'

  # ---------------------------------------------------------------------------
  # page 5 — a page about a step whose detail was not sent: it says exactly that
  # ---------------------------------------------------------------------------
  $notloaded = Dump-Page (Resolve-Path (Join-Path $preview 'panel-detail-notloaded.html')).Path 8000
  $measured['notloaded'] = $notloaded
  $lx = $notloaded.facts
  Add-Check 'detail.notloaded.bound' ([string]::IsNullOrEmpty([string]$notloaded.error)) "error=$($notloaded.error)"
  Add-Check 'detail.notloaded.noDetail' ($null -eq $lx.stepDetail) 'no step detail is invented for another step'
  Add-Check 'detail.notloaded.saysSo' ($lx.honest.notLoaded -eq $true) 'the page states the detail was not sent'
  Add-Check 'detail.notloaded.typeRows' (@($lx.stepTypeRows).Count -eq [int]$expect.unit0Types) "rows=$(@($lx.stepTypeRows).Count) expected=$($expect.unit0Types)"

  # ---------------------------------------------------------------------------
  # report
  # ---------------------------------------------------------------------------
  $failed = @($checks | Where-Object { -not $_.pass })
  foreach ($check in $checks) {
    Write-Output ("{0}  {1}  {2}" -f ($(if ($check.pass) { 'PASS' } else { 'FAIL' })), $check.id, $check.detail)
  }
  Write-Output ''
  Write-Output ("{0}/{1} browser checks passed" -f ($checks.Count - $failed.Count), $checks.Count)

  $record = [ordered]@{
    asOf = (Get-Date).ToString('o')
    chrome = $Chrome
    viewport = @{ width = $Width; height = $Height }
    checks = $checks
    counts = @{ total = $checks.Count; pass = $checks.Count - $failed.Count; fail = $failed.Count }
    measured = $measured
  }
  $record | ConvertTo-Json -Depth 20 | Set-Content -Path (Join-Path $evidence 'step11-measure.json') -Encoding utf8
  if ($failed.Count -gt 0) { exit 1 }
}
finally {
  Pop-Location
}
