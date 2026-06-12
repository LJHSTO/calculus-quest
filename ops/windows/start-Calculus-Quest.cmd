@echo off
chcp 65001 >nul
cd /d "D:\Projects\Demo"
echo.
echo === Starting Calculus Quest ===
echo.
powershell -ExecutionPolicy Bypass -NoProfile -File "ops\windows\Start-LearnEcnu.ps1"
pause