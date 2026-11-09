$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'CI runner only: never run on a user desktop' }
$installer = (Resolve-Path 'work/downloaded/DigiPet-Setup-windows-x64.exe').Path
if ((Get-AuthenticodeSignature $installer).Status -ne 'NotSigned') { throw 'Expected an UNSIGNED installer' }
$installDir = Join-Path $env:RUNNER_TEMP 'digipet-m6-install'
$evidence = 'work/smoke-windows.txt'
'CI-only Windows installer smoke started' | Set-Content $evidence
# These known folders belong exclusively to the disposable GitHub runner account.
$dataDirs = @(
  (Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'io.github.ethan-cyf.digipet'),
  (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'io.github.ethan-cyf.digipet')
)
$sentinels = @()
foreach ($directory in $dataDirs) {
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  foreach ($name in @('ci-history-sentinel.txt', 'ci-packs-sentinel.txt', 'ci-data-sentinel.txt')) {
    $file = Join-Path $directory $name
    Set-Content -LiteralPath $file -Value 'M6 disposable CI fixture'
    $sentinels += $file
  }
}
$app = $null
$installed = $false
try {
  $install = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru
  if ($install.ExitCode -ne 0) { throw "Installer exit: $($install.ExitCode)" }
  $installed = $true
  $exe = Join-Path $installDir 'digipet.exe'
  if (!(Test-Path $exe)) { throw 'Installed application missing' }
  if ((Get-AuthenticodeSignature $exe).Status -ne 'NotSigned') { throw 'Expected an UNSIGNED application' }
  $app = Start-Process -FilePath $exe -PassThru
  Start-Sleep -Seconds 10
  $app.Refresh()
  if ($app.HasExited) { throw "Application exited early: $($app.ExitCode)" }
  # A real top-level HWND is stronger evidence than a sleeping process alone.
  if ($app.MainWindowHandle -eq 0) { throw 'No application window found' }
  'PASS: unsigned per-user silent install and native window launch' | Add-Content $evidence
  if (!(Test-Path (Join-Path $installDir 'uninstall.exe'))) { throw 'Successful install is missing uninstall.exe' }
  # Inspect native windows directly; first launch must have no tool-access dialog.
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class DigiPetNativeSmoke {
  public sealed class WindowInfo { public IntPtr Handle; public string Title; }
  private delegate bool EnumProc(IntPtr handle, IntPtr parameter);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr handle, StringBuilder title, int size);
  private static string Title(IntPtr handle) { var text = new StringBuilder(1024); GetWindowText(handle, text, text.Capacity); return text.ToString(); }
  public static WindowInfo[] ForProcess(int processId) {
    var result = new List<WindowInfo>();
    EnumWindows((handle, parameter) => {
      uint owner; GetWindowThreadProcessId(handle, out owner);
      if (owner == processId) result.Add(new WindowInfo { Handle = handle, Title = Title(handle) });
      return true;
    }, IntPtr.Zero);
    return result.ToArray();
  }

}
'@
  function Assert-LocalDefaults {
    foreach ($window in [DigiPetNativeSmoke]::ForProcess($app.Id)) {
      if ($window.Title -like '*DigiPet M6*') { throw 'Stale M6 window title' }
      if ($window.Title -like '*Local tool access*') { throw 'Unexpected native tool-access dialog' }
    }
    $grantsFile = Join-Path $dataDirs[1] 'tools/tools-v1.json'
    if (!(Test-Path $grantsFile)) { throw 'Local tool defaults were not initialized' }
    $toolsData = Get-Content -Raw $grantsFile | ConvertFrom-Json
    if (!$toolsData.local_defaults_applied) { throw 'Default migration was not persisted' }
    if ('calendar' -notin $toolsData.grants.tools -or 'journal' -notin $toolsData.grants.tools) { throw 'Calendar/Journal should default on without a prompt' }
    foreach ($tool in @('report', 'coding', 'file_search')) {
      if ($tool -in $toolsData.grants.tools) { throw 'File tool enabled without choosing a folder' }
    }
    return $toolsData
  }
  $fresh = Assert-LocalDefaults
  'PASS: fresh launch has no access dialog; Calendar/Journal default on and file tools stay denied' | Add-Content $evidence
  # Model an existing installation, including a previous Not now marker; migration
  # must not depend on that removed prompt or lose existing local records.
  Stop-Process -Id $app.Id -Force
  $app.WaitForExit()
  $legacy = @{ grants = @{ tools = @(); folders = @{} }; calendar = @(@{ id = 'ci-kept'; title = 'CI upgrade record'; text = 'keep'; date = '20261109T090000Z' }); journal = @() }
  $grantsFile = Join-Path $dataDirs[1] 'tools/tools-v1.json'
  $legacy | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 $grantsFile
  Set-Content (Join-Path $dataDirs[0] 'local-tool-access-v1.txt') 'deferred'
  $app = Start-Process -FilePath $exe -PassThru
  Start-Sleep -Seconds 8
  $app.Refresh()
  if ($app.HasExited) { throw 'Upgrade launch exited early' }
  $upgraded = Assert-LocalDefaults
  if ($upgraded.calendar[0].title -ne 'CI upgrade record') { throw 'Upgrade lost a local record' }
  'PASS: upgrade enables local defaults without prompting and preserves existing records' | Add-Content $evidence

} catch {
  "FAIL: $($_.Exception.Message)" | Add-Content $evidence
  throw
} finally {
  if ($app -and !$app.HasExited) { Stop-Process -Id $app.Id -Force }
  $uninstaller = Join-Path $installDir 'uninstall.exe'
  if ($installed -and !(Test-Path $uninstaller)) {
    'FAIL: Successful install is missing uninstall.exe' | Add-Content $evidence
    throw 'Successful install is missing uninstall.exe'
  }
  if (Test-Path $uninstaller) {
    $remove = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
    if ($remove.ExitCode -ne 0) { throw "Uninstaller exit: $($remove.ExitCode)" }
    # NSIS self-copies and can return before its child finishes. Wait for actual removal.
    $deadline = (Get-Date).AddSeconds(30)
    while (((Test-Path (Join-Path $installDir 'digipet.exe')) -or (Test-Path $uninstaller)) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
    if ((Test-Path (Join-Path $installDir 'digipet.exe')) -or (Test-Path $uninstaller)) { throw 'Uninstall did not remove installed executables' }
    $entries = @(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'DigiPet' })
    if ($entries.Count -ne 0) { throw 'Uninstall left a per-user installed-app entry' }
    foreach ($file in $sentinels) {
      if (!(Test-Path $file) -or (Get-Content $file) -ne 'M6 disposable CI fixture') { throw 'Uninstall changed CI user data' }
    }
    'PASS: silent uninstall preserves CI data/packs/history sentinels' | Add-Content $evidence
  }
}
'NOT TESTED: interactive installer/uninstaller UI, explicit delete-data opt-in, SmartScreen, missing/offline WebView2, full webview interaction, real desktops' | Add-Content $evidence
Get-Content $evidence
