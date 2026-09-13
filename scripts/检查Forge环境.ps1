param([string]$JdkHome = $env:JAVA_HOME)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$mavenLocal = Join-Path $projectRoot '.local-tools/apache-maven-3.9.16/bin/mvn.cmd'
$missing = @()
foreach ($name in @('java', 'javac', 'mvn', 'git')) {
    $candidate = $null
    if (($name -eq 'java' -or $name -eq 'javac') -and $JdkHome) {
        $candidate = Join-Path $JdkHome ("bin/{0}.exe" -f $name)
    } elseif ($name -eq 'mvn' -and (Test-Path -LiteralPath $mavenLocal)) {
        $candidate = $mavenLocal
    }
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
        Write-Output ("FOUND {0}: {1}" -f $name, $candidate)
    } else {
        $tool = Get-Command $name -ErrorAction SilentlyContinue
        if ($tool) {
            Write-Output ("FOUND {0}: {1}" -f $name, $tool.Source)
        } else {
            Write-Output ("MISSING {0}" -f $name)
            $missing += $name
        }
    }
}
if ($missing.Count -gt 0) {
    Write-Output 'Supply -JdkHome with a JDK 17 directory, or install missing tools and add their bin directories to PATH.'
    exit 1
}
Write-Output 'Paths found; verify Java >= 17 and Maven >= 3.8.1 before building Forge.'
