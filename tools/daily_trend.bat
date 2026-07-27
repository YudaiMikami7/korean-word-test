@echo off
rem k-tango DAILY TREND (runs at 05:10, just after the app's day rolls over at 05:00).
rem Claude looks up today's K-POP trends on X, picks 5 Korean words, appends them to
rem trend-words.js via tools/gen_trend.js, runs the smoke test, pushes and deploys.
setlocal
set "PATH=%PATH%;C:\Users\myuda\AppData\Roaming\npm"
set "CLAUDE=C:\Users\myuda\AppData\Roaming\npm\claude.cmd"
set "BASE=C:\Users\myuda\original-app-all\korean-word-test"
cd /d "%BASE%"

echo ==== daily trend %DATE% %TIME% ====

type "%BASE%\tools\trend_prompt.txt" | "%CLAUDE%" -p --permission-mode bypassPermissions --allowedTools "Read,Edit,Write,Bash,Grep,Glob,WebSearch,WebFetch,Skill,PowerShell"
if errorlevel 1 (
  echo TREND_FAILED - claude run returned an error
  exit /b 1
)

echo TREND_OK
exit /b 0
