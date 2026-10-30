// One-shot patcher: make the browser measure scripts read the DOM over CDP
// (tools/cdp-dump.mjs) instead of `msedge --dump-dom`, which now returns nothing
// because the Edge launcher detaches from the real browser process.
//
// The replacement is derived from the script's own $chromeArgs, so per-script
// naming of the width/height/budget variables does not matter.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const tools = process.argv[2];
if (!tools) {
  console.error("usage: patch-measure-cdp.mjs <toolsDir>");
  process.exit(2);
}

const OLD = "    Start-Process -FilePath $Chrome -ArgumentList $chromeArgs -Wait -NoNewWindow -RedirectStandardOutput $dump";
const NEW = [
  "    # Read the DOM over CDP: the Edge launcher detaches from the real browser process,",
  "    # so `--dump-dom` writes into a stdout nobody holds and the dump file stays empty.",
  "    $nodeExe = if (Get-Command node -ErrorAction SilentlyContinue) { (Get-Command node).Source } else { 'D:\\nodejs\\node.exe' }",
  "    $sizeArg = ($chromeArgs | Where-Object { $_ -like '--window-size=*' } | Select-Object -First 1)",
  "    $budgetArg = ($chromeArgs | Where-Object { $_ -like '--virtual-time-budget=*' } | Select-Object -First 1)",
  "    $dumpWidth = if ($sizeArg) { ($sizeArg -split '=')[1].Split(',')[0] } else { '1400' }",
  "    $dumpHeight = if ($sizeArg) { ($sizeArg -split '=')[1].Split(',')[1] } else { '900' }",
  "    $dumpBudget = if ($budgetArg) { ($budgetArg -split '=')[1] } else { '6000' }",
  "    & $nodeExe (Join-Path $PSScriptRoot 'cdp-dump.mjs') $dump $url $dumpWidth $dumpHeight $dumpBudget $Chrome",
  "    if ($LASTEXITCODE -ne 0) { throw \"cdp-dump failed ($LASTEXITCODE) for $url\" }",
].join("\n");

const reports = [];
for (const name of readdirSync(tools).filter((file) => /^measure-.+\.ps1$/.test(file)).sort()) {
  const full = path.join(tools, name);
  const before = readFileSync(full, "utf8");
  if (before.includes("cdp-dump.mjs")) {
    reports.push(`${name}: already patched`);
    continue;
  }
  const hits = before.split(OLD).length - 1;
  if (hits !== 1) {
    reports.push(`${name}: SKIPPED (launch line found ${hits} times)`);
    continue;
  }
  writeFileSync(full, before.replace(OLD, NEW), "utf8");
  reports.push(`${name}: patched`);
}
console.log(reports.join("\n"));