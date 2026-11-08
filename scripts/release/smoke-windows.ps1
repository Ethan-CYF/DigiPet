$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'CI runner only: never run on a user desktop' }
$installer = (Resolve-Path 'work/downloaded/DigiPet-Setup-windows-x64.exe').Path
if ((Get-AuthenticodeSignature $installer).Status -ne 'NotSigned') { throw 'Expected an UNSIGNED installer' }
$installDir = Join-Path $env:RUNNER_TEMP 'digipet-m6-install'
$evidence = 'work/smoke-windows.txt'
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
try {
  $install = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru
  if ($install.ExitCode -ne 0) { throw "Installer exit: $($install.ExitCode)" }
  $exe = Join-Path $installDir 'digipet.exe'
  if (!(Test-Path $exe)) { throw 'Installed application missing' }
  if ((Get-AuthenticodeSignature $exe).Status -ne 'NotSigned') { throw 'Expected an UNSIGNED application' }
  $app = Start-Process -FilePath $exe -PassThru
  Start-Sleep -Seconds 10
  $app.Refresh()
  if ($app.HasExited) { throw "Application exited early: $($app.ExitCode)" }
  # A real top-level HWND is stronger evidence than a sleeping process alone.
  if ($app.MainWindowHandle -eq 0) { throw 'No application window found' }
  'PASS: unsigned per-user silent install and native window launch' | Set-Content $evidence
} finally {
  if ($app -and !$app.HasExited) { Stop-Process -Id $app.Id -Force }
  $uninstaller = Join-Path $installDir 'uninstall.exe'
  if (Test-Path $uninstaller) {
    # _?= disables the NSIS self-copy so -Wait observes completion; it must be last.
    $remove = Start-Process -FilePath $uninstaller -ArgumentList @('/S', "_?=$installDir") -Wait -PassThru
    if ($remove.ExitCode -ne 0) { throw "Uninstaller exit: $($remove.ExitCode)" }
    if (Test-Path (Join-Path $installDir 'digipet.exe')) { throw 'Uninstall left the application executable' }
    foreach ($file in $sentinels) {
      if (!(Test-Path $file) -or (Get-Content $file) -ne 'M6 disposable CI fixture') { throw 'Uninstall changed CI user data' }
    }
    'PASS: silent uninstall preserves CI data/packs/history sentinels' | Add-Content $evidence
  }
}
'NOT TESTED: interactive installer/uninstaller UI, explicit delete-data opt-in, SmartScreen, missing/offline WebView2, full webview interaction, real desktops' | Add-Content $evidence
Get-Content $evidence
