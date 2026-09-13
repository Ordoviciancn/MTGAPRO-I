@echo off
setlocal
set "PROJECT_ROOT=%~dp0.."
set "NODE_BIN=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
set "TOOL_BIN=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin"
set "PNPM=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd"
set "PATH=%NODE_BIN%;%TOOL_BIN%;%PATH%"
cd /d "%PROJECT_ROOT%"
"%PNPM%" dev
