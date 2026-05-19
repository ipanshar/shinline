@echo off
setlocal

for %%I in ("%~dp0..\..") do set "REPO_ROOT=%%~fI"

if not defined FACEID_REFERENCE_DIR set "FACEID_REFERENCE_DIR=%REPO_ROOT%\storage\app\private\faceid\references"
if not defined FACEID_REFERENCE_MANIFEST_PATH set "FACEID_REFERENCE_MANIFEST_PATH=%REPO_ROOT%\storage\app\private\faceid\reference-manifest.json"
if not defined FACEID_CACHE_DIR set "FACEID_CACHE_DIR=%REPO_ROOT%\testFaceID\backend\cache"
if not defined FACEID_HOST set "FACEID_HOST=127.0.0.1"
if not defined FACEID_PORT set "FACEID_PORT=8008"

set "PYTHON_EXE=%REPO_ROOT%\testFaceID\.venv\Scripts\python.exe"
set "PYTHONUNBUFFERED=1"
set "PYTHONIOENCODING=utf-8"

if /I "%~1"=="--print-config" (
    echo REPO_ROOT=%REPO_ROOT%
    echo PYTHON_EXE=%PYTHON_EXE%
    echo FACEID_REFERENCE_DIR=%FACEID_REFERENCE_DIR%
    echo FACEID_REFERENCE_MANIFEST_PATH=%FACEID_REFERENCE_MANIFEST_PATH%
    echo FACEID_CACHE_DIR=%FACEID_CACHE_DIR%
    echo FACEID_HOST=%FACEID_HOST%
    echo FACEID_PORT=%FACEID_PORT%
    exit /b 0
)

if not exist "%PYTHON_EXE%" (
    echo Python venv executable not found: %PYTHON_EXE%
    exit /b 1
)

cd /d "%REPO_ROOT%"
"%PYTHON_EXE%" -m uvicorn backend.app:app --app-dir testFaceID --host %FACEID_HOST% --port %FACEID_PORT%
exit /b %ERRORLEVEL%