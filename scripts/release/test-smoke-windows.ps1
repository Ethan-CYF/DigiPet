$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'CI runner only: never run on a user desktop' }
# Run the production script in a separate PowerShell process. Only process/signature
# operations are simulated; real fixture files exercise Test-Path and the finally block.
$root = Join-Path $env:RUNNER_TEMP ('digipet-m7-negative-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $root | Out-Null
$child = Join-Path $root 'missing-uninstaller.ps1'
$smoke = (Resolve-Path 'scripts/release/smoke-windows.ps1').Path
@'
param($Smoke, $FixtureRoot)
$env:RUNNER_TEMP = $FixtureRoot
function Get-AuthenticodeSignature { param($FilePath) @{ Status = 'NotSigned' } }
function Start-Sleep { param($Seconds, $Milliseconds) }
function Stop-Process { param($Id, [switch]$Force) }
function Start-Process {
  param($FilePath, $ArgumentList, [switch]$Wait, [switch]$PassThru)
  if ($FilePath.EndsWith('DigiPet-Setup-windows-x64.exe')) {
    $directory = Join-Path $env:RUNNER_TEMP 'digipet-m6-install'
    New-Item -ItemType Directory -Path $directory | Out-Null
    Set-Content (Join-Path $directory 'digipet.exe') 'disposable executable fixture'
    # Installer returns success but deliberately never creates uninstall.exe.
    return [pscustomobject]@{ ExitCode = 0 }
  }
  if ($FilePath.EndsWith('digipet.exe')) {
    $process = [pscustomobject]@{ Id = 123; HasExited = $false; MainWindowHandle = 1 }
    $process | Add-Member -MemberType ScriptMethod -Name Refresh -Value {}
    return $process
  }
  throw 'Unexpected process in negative fixture'
}
. $Smoke
'@ | Set-Content $child
try {
  $PSNativeCommandUseErrorActionPreference = $false
  $output = & (Join-Path $PSHOME 'pwsh.exe') -NoProfile -File $child $smoke $root 2>&1
  $status = $LASTEXITCODE
  $output | Set-Content 'work/smoke-windows-negative.txt'
  if ($status -eq 0) { throw 'Regression: smoke succeeded without uninstall.exe' }
  if (($output | Out-String) -notmatch 'Successful install is missing uninstall.exe') {
    throw 'Negative fixture failed for an unrelated reason; inspect evidence'
  }
  if ((Get-Content 'work/smoke-windows.txt' -Raw) -notmatch 'PASS: unsigned per-user silent install and native window launch') {
    throw 'Negative fixture did not reach successful install and launch'
  }
  "PASS: production smoke rejected missing uninstall.exe with exit $status (P2)" | Add-Content 'work/smoke-windows-negative.txt'
  Get-Content 'work/smoke-windows-negative.txt'
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force
}
