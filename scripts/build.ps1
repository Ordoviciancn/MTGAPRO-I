$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw 'Install Node.js and pnpm, then reopen the terminal.' }
& pnpm build
exit $LASTEXITCODE