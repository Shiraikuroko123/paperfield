@echo off
cd /d "%~dp0.."
python -B -m unittest discover -s tests -v
if errorlevel 1 exit /b %errorlevel%
node --check src\paperfield\static\app.js
if errorlevel 1 exit /b %errorlevel%
node --check src\research_atlas\static\app.js
if errorlevel 1 exit /b %errorlevel%
python -m py_compile src\paperfield\app.py src\research_atlas\app.py src\research_atlas\worker.py src\research_atlas\scanner.py src\research_atlas\schema_validation.py src\research_atlas\curriculum.py
if errorlevel 1 exit /b %errorlevel%
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-platform.ps1 -TestFlowloom
if errorlevel 1 exit /b %errorlevel%
echo Paperfield unified platform checks passed.
