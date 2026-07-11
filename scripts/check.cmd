@echo off
cd /d "%~dp0.."
python -B -m unittest discover -s tests -v
if errorlevel 1 exit /b %errorlevel%
node --check static\app.js
if errorlevel 1 exit /b %errorlevel%
echo Paperfield checks passed.
