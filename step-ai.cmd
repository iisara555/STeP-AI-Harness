@echo off
rem STeP AI command launcher for AI tools working inside this folder.
rem Usage: .\step-ai.cmd ask "<request>" --json
rem Uses the Node.js runtime installed with this bundle first, so the command
rem works even when Node.js is not on PATH.
setlocal
set "STEP_ROOT=%~dp0"
set "STEP_NODE=%STEP_ROOT%.step-ai\runtime\node\node.exe"
if exist "%STEP_NODE%" goto run
set "STEP_NODE="
for /f "delims=" %%N in ('where node 2^>nul') do if not defined STEP_NODE set "STEP_NODE=%%N"
if defined STEP_NODE goto run
echo STeP AI: Node.js runtime not found. Open Install-STeP-AI.bat or Update-STeP-AI.bat once, then retry. 1>&2
exit /b 9009
:run
"%STEP_NODE%" "%STEP_ROOT%bin\step-ai.js" %*
exit /b %ERRORLEVEL%
