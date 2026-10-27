# preview-shot.ps1 — render the panel previews and screenshot them with headless Chrome.
#
# Run: pwsh -File tools\preview-shot.ps1
#
# On this machine headless Chrome must be started with Start-Process (a direct
# `& chrome ...` invocation returns immediately and silently writes no PNG), so
# this script does the loop explicitly and verifies each file exists afterwards.
param(
  [string]$Chrome = 'C:\Users\Administrator\AppData\Local\Google\Chrome\Application\chrome.exe',
  [int]$Width = 1400,
  [int]$Height = 900
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$evidence = Join-Path $root 'evidence'
$preview = Join-Path $evidence 'preview'

if (-not (Test-Path $Chrome)) { throw "chrome not found: $Chrome" }

Push-Location $root
try {
  node tools\preview-panel.mjs
  if ($LASTEXITCODE -ne 0) { throw 'preview-panel.mjs failed' }
  Add-Type -AssemblyName System.Drawing
  # step-10's pages come from preview-effects.mjs (the living layer needs its own view: a running
  # step + an active node + a scrollable pair of lists).
  node tools\preview-effects.mjs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'preview-effects.mjs failed' }
  # step-11's pages come from preview-detail.mjs (node / step details need their own selected
  # node + a step report, and the clipboard acknowledgement is painted by the page script).
  node tools\preview-detail.mjs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'preview-detail.mjs failed' }
  $pages = @(
    @{ html = 'panel-dark.html'; png = 'panel-dark.png'; crop = 'panel-dark-crop.png'; cropW = 740; budget = 1200 },
    @{ html = 'panel-light.html'; png = 'panel-light.png'; crop = 'panel-light-crop.png'; cropW = 740; budget = 1200 },
    @{ html = 'capsule-dark.html'; png = 'capsule-dark.png'; crop = $null; cropW = 740; budget = 1200 },
    @{ html = 'planning-dark.html'; png = 'planning-dark.png'; crop = $null; cropW = 740; budget = 1200 },
    @{ html = 'panel-flow.html'; png = 'panel-flow-dark.png'; crop = 'panel-flow-dark-crop.png'; cropW = 740; budget = 1200 },
    @{ html = 'panel-flow-groups.html'; png = 'panel-flow-groups-dark.png'; crop = 'panel-flow-groups-dark-crop.png'; cropW = 740; budget = 1200 },
    @{ html = 'panel-branch.html'; png = 'panel-branch-dark.png'; crop = 'panel-branch-dark-crop.png'; cropW = 740; budget = 1200 },
    # 3000 ms of virtual time lets the page finish its scroll/resize/retarget sequence, so the
    # screenshot shows the real running state instead of a mid-sequence frame.
    @{ html = 'panel-fx-running.html'; png = 'panel-fx-dark.png'; crop = 'panel-fx-dark-crop.png'; cropW = 840; budget = 3000 },
    @{ html = 'panel-fx-idle.html'; png = 'panel-fx-idle-dark.png'; crop = 'panel-fx-idle-dark-crop.png'; cropW = 840; budget = 3000 },
    @{ html = 'panel-fx-static.html'; png = 'panel-fx-static-dark.png'; crop = 'panel-fx-static-dark-crop.png'; cropW = 840; budget = 3000 },
    @{ html = 'panel-fx-narrow.html'; png = 'panel-fx-narrow-dark.png'; crop = 'panel-fx-narrow-dark-crop.png'; cropW = 660; budget = 3000 },
    @{ html = 'panel-detail-edit-node.html'; png = 'panel-detail-dark.png'; crop = 'panel-detail-dark-crop.png'; cropW = 840; budget = 4000 },
    @{ html = 'panel-detail-command.html'; png = 'panel-detail-command-dark.png'; crop = 'panel-detail-command-dark-crop.png'; cropW = 840; budget = 4000 },
    @{ html = 'panel-detail-error.html'; png = 'panel-detail-error-dark.png'; crop = 'panel-detail-error-dark-crop.png'; cropW = 840; budget = 4000 },
    @{ html = 'panel-detail-noreport.html'; png = 'panel-detail-noreport-dark.png'; crop = 'panel-detail-noreport-dark-crop.png'; cropW = 840; budget = 4000 }
  )

  foreach ($page in $pages) {
    $source = (Resolve-Path (Join-Path $preview $page.html)).Path
    $target = Join-Path $evidence $page.png
    if (Test-Path $target) { Remove-Item $target -Force }
    $profile = Join-Path $env:TEMP ('wf-preview-' + [guid]::NewGuid().ToString('N'))
    $url = 'file:///' + ($source -replace '\\', '/')
    $chromeArgs = @(
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', "--window-size=$Width,$Height",
      "--virtual-time-budget=$($page.budget)", "--screenshot=$target", "--user-data-dir=$profile", $url
    )
    Start-Process -FilePath $Chrome -ArgumentList $chromeArgs -Wait -NoNewWindow
    if (-not (Test-Path $target)) { throw "screenshot missing: $target" }

    # The panel always sits in the top-right corner, so a crop removes both the mock chat noise
    # and the headless capture artifact that repeats the page's first rows along the bottom edge.
    if ($page.crop) {
      $image = [System.Drawing.Bitmap]::new($target)
      $boxW = [int]$page.cropW
      $rect = [System.Drawing.Rectangle]::new($Width - $boxW, 0, $boxW, 780)
      $crop = $image.Clone($rect, $image.PixelFormat)
      $cropPath = Join-Path $evidence $page.crop
      $crop.Save($cropPath, [System.Drawing.Imaging.ImageFormat]::Png)
      $crop.Dispose()
      $image.Dispose()
    }

    $size = (Get-Item $target).Length
    Write-Output ("ok {0} ({1} bytes)" -f $page.png, $size)
  }
}
finally {
  Pop-Location
}


