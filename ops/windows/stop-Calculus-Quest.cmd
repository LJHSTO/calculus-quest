@echo off
chcp 65001 >nul
cd /d "D:\Projects\Demo"
echo.
echo === Stopping Calculus Quest ===
echo.
powershell -ExecutionPolicy Bypass -NoProfile -File "ops\windows\Stop-LearnEcnu.ps1"
pause