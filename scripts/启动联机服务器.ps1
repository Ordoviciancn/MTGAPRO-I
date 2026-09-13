param(
  [Parameter(Mandatory=$true)][string]$JdkHome,
  [int]$Port=8787
)
$ErrorActionPreference='Stop'
if($Port -lt 1 -or $Port -gt 65535){throw 'Port must be between 1 and 65535.'}
$projectRoot=Split-Path -Parent $PSScriptRoot
$serverExe=Join-Path $projectRoot ('release/MTGAPRO'+[char]0x2160+'-win32-x64/MTGAPRO'+[char]0x2160+'.exe')
if(!(Test-Path -LiteralPath $serverExe)){throw 'Build the desktop release first: pnpm desktop:build'}
if(!(Test-Path -LiteralPath (Join-Path $JdkHome 'bin/java.exe'))){throw 'JDK directory is invalid.'}
$env:JAVA_HOME=$JdkHome
$env:FORGE_WORKSPACE_ROOT=$projectRoot
$env:MTG_HEADLESS_HOST='1'
$env:MTG_SERVER_PORT=[string]$Port
$serverProcess=Start-Process -FilePath $serverExe -WindowStyle Hidden -PassThru
Write-Output "Server process requested: $($serverProcess.Id). Port: $Port"
Write-Output "Check http://127.0.0.1:$Port/health before sharing the address."
