# measure-tri.ps1 — prove IN A BROWSER that the disclosure triangle is a real clickable button.
#
# Run: pwsh -File tools\measure-tri.ps1
#
# The acceptance criteria for step-02 are geometric and interactive:
#   「三角是 <button>（非伪元素），点击带 ≥16 px 宽、卡片全高」
#   「键盘 Tab 能聚焦、回车能切换」
#   「点击三角能展开/收起分步详情与流程分组，状态与点卡片本体一致」
#   「无头 Chrome 实测：三角命中区域矩形 ≥16×卡片高，点击一次 aria-expanded 取反」
# A tree assertion proves the shape; only a layout engine proves the BAND, and only a live
# DOM proves that a click really flips the state (a static dump has no handlers).
#
# tools/preview-panel.mjs writes evidence/preview/panel-tri-measure.html: the real bundle,
# the real CSS and a host div the page re-mounts the renderer's own tree into — handlers
# included. This script dumps that page with headless Chrome and asserts the numbers.
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
$evidence = Join-Path $root 'evidence'

# 2026-10-27 (session7): auto-detect the browser (this machine has no Chrome; Edge is the
# available Chromium). The old hardcoded Chrome path made the script throw before measuring.
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
  node tools\preview-panel.mjs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'preview-panel.mjs failed' }

  $source = (Resolve-Path (Join-Path $root 'evidence\preview\panel-tri-measure.html')).Path
  $profile = Join-Path $env:TEMP ('wf-tri-' + [guid]::NewGuid().ToString('N'))
  $dump = Join-Path $env:TEMP ('wf-tri-dom-' + [guid]::NewGuid().ToString('N') + '.html')
  $url = 'file:///' + ($source -replace '\\', '/')

  $chromeArgs = @(
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', "--window-size=$Width,$Height",
    '--virtual-time-budget=6000', '--dump-dom', "--user-data-dir=$profile", $url
  )
  Start-Process -FilePath $Chrome -ArgumentList $chromeArgs -Wait -NoNewWindow -RedirectStandardOutput $dump
  if (-not (Test-Path $dump)) { throw "chrome wrote no DOM: $dump" }

  $html = Get-Content $dump -Raw
  $match = [regex]::Match($html, '(?s)<pre id="wf-tri-measure">(.*?)</pre>')
  if (-not $match.Success) { throw 'the page produced no #wf-tri-measure block (script error?)' }

  $json = $match.Groups[1].Value
  $json = $json -replace '&quot;', '"' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&amp;', '&'
  $data = $json | ConvertFrom-Json

  $tris = @($data.triangles)
  $first = $tris[0]
  $second = $tris[1]

  $checks = @(
    @{ id = 'tri.page.noError'; pass = ([string]::IsNullOrEmpty([string]$data.error)); detail = "$($data.error)" },
    @{ id = 'tri.count == cards'; pass = ($tris.Count -eq 2 -and -not $first.missing -and -not $second.missing); detail = "$($tris.Count) triangles" },
    @{ id = 'tri.is a <button>'; pass = ($first.tag -eq 'button' -and $second.tag -eq 'button'); detail = "$($first.tag)/$($second.tag)" },
    @{ id = 'tri band width >= 16px'; pass = ($first.width -ge 16 -and $second.width -ge 16); detail = "$($first.width)px" },
    @{ id = 'tri band spans the card height'; pass = ($first.height -ge ($first.cardHeight - 1) -and $second.height -ge ($second.cardHeight - 1)); detail = "$($first.height) / card $($first.cardHeight)" },
    @{ id = 'tri band aligned with the card'; pass = ($first.sameTop -eq $true -and $first.sameBottom -eq $true); detail = "top=$($first.sameTop) bottom=$($first.sameBottom)" },
    @{ id = 'tri does not cover the title'; pass = ($first.triRight -le ($first.titleLeft + 0.5)); detail = "tri right $($first.triRight) / title left $($first.titleLeft)" },
    @{ id = 'tri is keyboard focusable'; pass = ($first.focusable -eq $true); detail = "$($first.focusable)" },
    @{ id = 'tri carries aria-expanded/controls'; pass = ($first.controls -eq 'wf-step-detail-0' -and $second.controls -eq 'wf-step-detail-1' -and $null -ne $first.expanded); detail = "$($first.controls) / $($second.controls)" },
    @{ id = 'tri has a label'; pass = (-not [string]::IsNullOrEmpty([string]$first.label)); detail = "$($first.label)" },
    @{ id = 'tri open state shows the detail'; pass = ($first.expanded -eq 'true' -and $data.click.beforeDetail -eq 1); detail = "expanded=$($first.expanded) detail=$($data.click.beforeDetail)" },
    @{ id = 'tri click flips aria-expanded'; pass = ($data.click.before -eq 'true' -and $data.click.after -eq 'false'); detail = "$($data.click.before) -> $($data.click.after)" },
    @{ id = 'tri click closes the detail'; pass = ($data.click.afterDetail -eq 0); detail = "$($data.click.beforeDetail) -> $($data.click.afterDetail)" },
    @{ id = 'tri glyph follows the state'; pass = ($data.click.text -eq '▸'); detail = "$($data.click.text)" },
    @{ id = 'tri click is a toggle'; pass = ($data.click.back -eq 'true'); detail = "$($data.click.back)" },
    @{ id = 'tri on another card selects it'; pass = ($data.crossStep.selected -eq 'true' -and $data.crossStep.expanded -eq 'true' -and [string]$data.crossStep.detailIndex -eq '1'); detail = "selected=$($data.crossStep.selected) detail=$($data.crossStep.detailIndex)" },
    # The folded run uses the SAME renderer (wfTri), so it must pass the same band tests.
    @{ id = 'group tri is a <button>'; pass = ($data.group.tag -eq 'button'); detail = "$($data.group.tag)" },
    @{ id = 'group tri band width >= 16px'; pass = ($data.group.width -ge 16); detail = "$($data.group.width)px" },
    @{ id = 'group tri band spans the row height'; pass = ($data.group.height -ge ($data.group.rowHeight - 1)); detail = "$($data.group.height) / row $($data.group.rowHeight)" },
    @{ id = 'group tri aligned with the row'; pass = ($data.group.sameTop -eq $true -and $data.group.sameBottom -eq $true); detail = "top=$($data.group.sameTop) bottom=$($data.group.sameBottom)" },
    @{ id = 'group tri starts collapsed'; pass = ($data.group.before -eq 'false' -and $data.group.text -eq '▸' -and $data.group.membersBefore -eq 0); detail = "$($data.group.before) $($data.group.text) members=$($data.group.membersBefore)" },
    @{ id = 'group tri click expands it'; pass = ($data.group.after -eq 'true' -and $data.group.afterText -eq '▾' -and $data.group.membersAfter -eq 3); detail = "$($data.group.after) $($data.group.afterText) members=$($data.group.membersAfter)" },
    @{ id = 'group tri aria-controls resolves'; pass = (-not [string]::IsNullOrEmpty([string]$data.group.controls) -and [string]$data.group.controls -eq [string]$data.group.bodyId); detail = "$($data.group.controls) / body $($data.group.bodyId)" }
  )

  $failed = @($checks | Where-Object { -not $_.pass })
  foreach ($check in $checks) {
    Write-Output ("{0}  {1}  ({2})" -f $(if ($check.pass) { 'PASS' } else { 'FAIL' }), $check.id, $check.detail)
  }

  Write-Output ''
  Write-Output ('{0}/{1} browser-measured triangle checks passed' -f ($checks.Count - $failed.Count), $checks.Count)

  $record = [ordered]@{
    capturedAt = (Get-Date).ToString('o')
    chrome = $Chrome
    viewport = "$Width x $Height"
    page = 'evidence/preview/panel-tri-measure.html'
    checks = $checks
    counts = @{ total = $checks.Count; pass = $checks.Count - $failed.Count; fail = $failed.Count }
    measured = $data
  }
  $record | ConvertTo-Json -Depth 12 | Set-Content -Path (Join-Path $evidence 'step02-tri-measure.json') -Encoding utf8
  Write-Output 'wrote evidence/step02-tri-measure.json'

  if ($failed.Count -gt 0) { exit 1 }
}
finally {
  Pop-Location
}
