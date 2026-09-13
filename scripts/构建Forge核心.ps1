param(
    [string]$JdkHome = $env:JAVA_HOME,
    [string]$MavenPath,
    [string]$ForgePath
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (!$JdkHome -or !(Test-Path -LiteralPath (Join-Path $JdkHome 'bin/javac.exe'))) {
    throw 'Supply -JdkHome pointing to a JDK 17 installation.'
}
if (!$MavenPath) { $MavenPath = Join-Path $projectRoot '.local-tools/apache-maven-3.9.16/bin/mvn.cmd' }
if (!$ForgePath) { $ForgePath = Join-Path $projectRoot '.local-tools/forge' }
if (!(Test-Path -LiteralPath $MavenPath)) { throw 'Maven executable not found.' }
$pin = Get-Content -Raw (Join-Path $projectRoot 'config/forge-source.json') | ConvertFrom-Json
$revision = & git -C $ForgePath rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $revision -ne $pin.commit) { throw 'Forge revision does not match config/forge-source.json.' }
$repository = Join-Path $projectRoot '.local-tools/m2'
$previousJavaHome = $env:JAVA_HOME
try {
    $env:JAVA_HOME = $JdkHome
    Push-Location $ForgePath
    try {
        & $MavenPath '-B' '-ntp' "-Dmaven.repo.local=$repository" '-pl' 'forge-gui' '-am' 'package' 'dependency:build-classpath' '-Dmdep.outputFile=target/runtime-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'Forge reactor build failed.' }
    } finally { Pop-Location }
} finally { $env:JAVA_HOME = $previousJavaHome }
