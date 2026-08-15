@echo off
cd /d "%~dp0.."
python src\research_atlas\worker.py %*
