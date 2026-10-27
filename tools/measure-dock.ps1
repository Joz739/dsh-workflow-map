# measure-dock.ps1 — prove IN A BROWSER that the panel fills the MAIN CONTENT AREA.
#
# Run: pwsh -File tools\measure-dock.ps1
#
# step-13 moved the panel out of the shell overlay and into the layout's centre column:
# a sidebar rail on the left, the panel occupying everything to its right. The acceptance
# criteria are geometric ("panel width == the main area's width", "no horizontal overflow",
# "nothing overlaps the conversation"), so this script renders the real bundle into a mock
# shell that has exactly the shipped [rail | main] track, has the page measure itself with
# getBoundingClientRect(), dumps the DOM with headless Chrome, and asserts the numbers.
#
# On this machine headless Chrome must be started with Start-Process (a direct
# `& chrome ...` invocation returns immediately and silently writes nothing).
param(
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
    (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe'),
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { $Chrome = $candidate; break }
  }
}
if (-not (Test-Path $Chrome)) { throw "no Chromium browser found (pass -Chrome <path>): $Chrome" }

# The measurement lives in its own page so the other previews stay screenshot-only.
$measurePage = @'
<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>workflow-map dock measure</title>
<style>__TOKENS__ __MOCK_CSS__ __WF_CSS__</style></head><body>__SHELL__<script>
window.addEventListener('load', function () {
  window.setTimeout(function () {
    function rect(selector) {
      var el = document.querySelector(selector);
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    }
    var slot = document.getElementById('wf-slot');
    var root = document.querySelector('.wf-root');
    var card = document.querySelector('.wf-card');
    var slotRect = slot ? slot.getBoundingClientRect() : null;
    var rootRect = root ? root.getBoundingClientRect() : null;
    var cardRect = card ? card.getBoundingClientRect() : null;
    var docEl = document.documentElement;

    var payload = {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      slot: rect('#wf-slot'),
      root: rect('.wf-root'),
      card: rect('.wf-card'),
      // The three things the old overlay did that a main-column panel must NOT do.
      position: root ? getComputedStyle(root).position : null,
      rootZIndex: root ? getComputedStyle(root).zIndex : null,
      cardInlineStyle: card ? (card.getAttribute('style') || '') : null,
      grips: document.querySelectorAll('.wf-grip-left,.wf-grip-bottom').length,
      role: card ? card.getAttribute('role') : null,
      // Geometry the acceptance criteria talk about.
      fillsSlotWidth: !!(slotRect && rootRect && Math.abs(rootRect.width - slotRect.width) <= 1),
      fillsSlotHeight: !!(slotRect && rootRect && Math.abs(rootRect.height - slotRect.height) <= 1),
      cardMatchesRoot: !!(cardRect && rootRect && Math.abs(cardRect.width - rootRect.width) <= 1 && cardRect.bottom <= rootRect.bottom + 1),
      // Nothing may stick out of the page (the old `right:12px` box could, on a narrow frame).
      pageOverflowX: Math.max(0, Math.round(docEl.scrollWidth - window.innerWidth)),
      pageOverflowY: Math.max(0, Math.round(docEl.scrollHeight - window.innerHeight)),
      // 会话7 · the panel is now ONE serial main flow (`wf-unit` per step, satellites on both
      // sides, a progress rail per unit), not the old two-column step/flow grid. The substance
      // the dock criterion protects is unchanged — every content family the docked panel must
      // still lay out — so re-anchor it to the markup that actually exists.
      units: document.querySelectorAll('.wf-unit').length,
      satRows: document.querySelectorAll('.wf-sat-row').length,
      rails: document.querySelectorAll('.wf-prog-row').length,
      // The left rail must stay outside the panel's own box.
      railRight: (function () {
        var rail = document.querySelector('.mock-side');
        return rail ? Math.round(rail.getBoundingClientRect().right) : null;
      })()
    };
    var pre = document.createElement('pre');
    pre.id = 'wf-dock-measure';
    pre.textContent = JSON.stringify(payload);
    document.body.appendChild(pre);
  }, 200);
});
</script></body></html>
'@

Push-Location $root
try {
  node tools\preview-panel.mjs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'preview-panel.mjs failed' }

  # Build the measuring page out of the SAME pieces the preview uses: the bundle's own CSS,
  # the same mock tokens and the same [rail | main] shell.
  $preview = Get-Content (Join-Path $root 'evidence\preview\panel-dark.html') -Raw
  $cssMatch = [regex]::Match($preview, '(?s)<style>(.*?)</style>')
  if (-not $cssMatch.Success) { throw 'preview page carries no <style> block' }
  $allCss = $cssMatch.Groups[1].Value
  # The preview's <style> = tokens + mockCss + WF_CSS; reuse it verbatim.
  $bodyMatch = [regex]::Match($preview, '(?s)<body>(.*?)<script|<body>(.*)</body>')
  if (-not $bodyMatch.Success) { throw 'preview page carries no body' }
  $body = $bodyMatch.Groups[1].Value
  if ($body -eq '') { $body = $bodyMatch.Groups[2].Value }
  # Drop the note strip so the measurement page is exactly rail + main.
  $body = [regex]::Replace($body, '(?s)<div class="mock-note">.*?</div>', '')

  $page = $measurePage -replace '__TOKENS__', '' -replace '__MOCK_CSS__', '' -replace '__WF_CSS__', ''
  $page = $page -replace '(?s)<style>.*?</style>', ('<style>' + $allCss + '</style>')
  $page = $page -replace '__SHELL__', $body
  $measurePath = Join-Path $root 'evidence\preview\panel-dock-measure.html'
  Set-Content -Path $measurePath -Value $page -Encoding utf8

  $profile = Join-Path $env:TEMP ('wf-dock-' + [guid]::NewGuid().ToString('N'))
  $dump = Join-Path $env:TEMP ('wf-dock-dom-' + [guid]::NewGuid().ToString('N') + '.html')
  $url = 'file:///' + ($measurePath -replace '\\', '/')

  $chromeArgs = @(
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', "--window-size=$Width,$Height",
    '--virtual-time-budget=4000', '--dump-dom', "--user-data-dir=$profile", $url
  )
  Start-Process -FilePath $Chrome -ArgumentList $chromeArgs -Wait -NoNewWindow -RedirectStandardOutput $dump
  if (-not (Test-Path $dump)) { throw "chrome wrote no DOM: $dump" }

  $html = Get-Content $dump -Raw
  $match = [regex]::Match($html, '(?s)<pre id="wf-dock-measure">(.*?)</pre>')
  if (-not $match.Success) { throw 'the page produced no #wf-dock-measure block (script error?)' }

  $json = $match.Groups[1].Value
  $json = $json -replace '&quot;', '"' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&amp;', '&'
  $data = $json | ConvertFrom-Json

  $checks = @(
    @{ id = 'root is not position:fixed'; pass = ($data.position -eq 'relative'); detail = "$($data.position)" },
    @{ id = 'root carries no z-index'; pass = ($data.rootZIndex -eq 'auto' -or $data.rootZIndex -eq '0'); detail = "$($data.rootZIndex)" },
    @{ id = 'card has no inline size'; pass = ($data.cardInlineStyle -eq ''); detail = "[$($data.cardInlineStyle)]" },
    @{ id = 'no resize grips'; pass = ($data.grips -eq 0); detail = "$($data.grips) grips" },
    @{ id = 'card is a region, not a dialog'; pass = ($data.role -eq 'region'); detail = "$($data.role)" },
    @{ id = 'panel width == main area width'; pass = ($data.fillsSlotWidth -eq $true); detail = "root $([math]::Round($data.root.w,1)) / slot $([math]::Round($data.slot.w,1))" },
    @{ id = 'panel height == main area height'; pass = ($data.fillsSlotHeight -eq $true); detail = "root $([math]::Round($data.root.h,1)) / slot $([math]::Round($data.slot.h,1))" },
    @{ id = 'card fills the panel and stays inside it'; pass = ($data.cardMatchesRoot -eq $true); detail = "card $([math]::Round($data.card.w,1))x$([math]::Round($data.card.h,1))" },
    @{ id = 'no horizontal page overflow'; pass = ($data.pageOverflowX -eq 0); detail = "$($data.pageOverflowX)px" },
    @{ id = 'no vertical page overflow'; pass = ($data.pageOverflowY -eq 0); detail = "$($data.pageOverflowY)px" },
    @{ id = 'step units still laid out'; pass = ($data.units -gt 0); detail = "$($data.units) units" },
    @{ id = 'the rail sits left of the panel'; pass = ($data.railRight -ne $null -and $data.root.x -ge $data.railRight - 1); detail = "rail right $($data.railRight) / panel x $([math]::Round($data.root.x,1))" },
    @{ id = 'satellite rows rendered'; pass = ($data.satRows -gt 0); detail = "$($data.satRows) satellite rows" },
    @{ id = 'progress rails rendered'; pass = ($data.rails -gt 0); detail = "$($data.rails) rails" }
  )

  $failed = @($checks | Where-Object { -not $_.pass })
  foreach ($check in $checks) {
    Write-Output ("{0}  {1}  ({2})" -f $(if ($check.pass) { 'PASS' } else { 'FAIL' }), $check.id, $check.detail)
  }

  Write-Output ''
  Write-Output ('{0}/{1} browser-measured checks passed' -f ($checks.Count - $failed.Count), $checks.Count)

  $evidence = [ordered]@{
    capturedAt = (Get-Date).ToString('o')
    chrome = $Chrome
    viewport = "$Width x $Height"
    page = 'evidence/preview/panel-dock-measure.html'
    checks = $checks
    measured = $data
  }
  $evidencePath = Join-Path $root 'evidence\step13-dock-measure.json'
  $evidence | ConvertTo-Json -Depth 8 | Set-Content -Path $evidencePath -Encoding utf8
  Write-Output ("wrote evidence/step13-dock-measure.json")

  if ($failed.Count -gt 0) { exit 1 }
}
finally {
  Pop-Location
}
