@echo off
setlocal

set "SERVICE_NAME=shinline-faceid"
if not "%~1"=="" set "SERVICE_NAME=%~1"

set "NSSM_EXE=nssm"
if not "%~2"=="" set "NSSM_EXE=%~2"

for %%I in ("%~dp0..\..") do set "REPO_ROOT=%%~fI"
set "RUNNER_CMD=%REPO_ROOT%\testFaceID\scripts\run-faceid-backend.cmd"
set "CMD_EXE=%SystemRoot%\System32\cmd.exe"
set "LOG_DIR=%REPO_ROOT%\storage\logs\faceid"

if /I "%~1"=="--print-config" (
    echo SERVICE_NAME=shinline-faceid
    echo NSSM_EXE=%NSSM_EXE%
    echo REPO_ROOT=%REPO_ROOT%
    echo RUNNER_CMD=%RUNNER_CMD%
    echo CMD_EXE=%CMD_EXE%
    echo LOG_DIR=%LOG_DIR%
    exit /b 0
)

if not exist "%RUNNER_CMD%" (
    echo Runner script not found: %RUNNER_CMD%
    exit /b 1
)

mkdir "%LOG_DIR%" >nul 2>&1

"%NSSM_EXE%" install "%SERVICE_NAME%" "%CMD_EXE%"
if errorlevel 1 exit /b %ERRORLEVEL%

"%NSSM_EXE%" set "%SERVICE_NAME%" AppDirectory "%REPO_ROOT%"
if errorlevel 1 exit /b %ERRORLEVEL%

"%NSSM_EXE%" set "%SERVICE_NAME%" AppParameters /c ""%RUNNER_CMD%""
if errorlevel 1 exit /b %ERRORLEVEL%

"%NSSM_EXE%" set "%SERVICE_NAME%" DisplayName "Shinline Face ID Backend"
if errorlevel 1 exit /b %ERRORLEVEL%

"%NSSM_EXE%" set "%SERVICE_NAME%" Description "Persistent FastAPI Face ID backend for Shinline violations recognition"
if errorlevel 1 exit /b %ERRORLEVEL%

"%NSSM_EXE%" set "%SERVICE_NAME%" Start SERVICE_AUTO_START
if errorlevel 1 exit /b %ERRORLEVEL%

"%NSSM_EXE%" set "%SERVICE_NAME%" AppStdout "%LOG_DIR%\stdout.log"
if errorlevel 1 exit /b %ERRORLEVEL%

"%NSSM_EXE%" set "%SERVICE_NAME%" AppStderr "%LOG_DIR%\stderr.log"
if errorlevel 1 exit /b %ERRORLEVEL%

"%NSSM_EXE%" set "%SERVICE_NAME%" AppRotateFiles 1
if errorlevel 1 exit /b %ERRORLEVEL%

"%NSSM_EXE%" set "%SERVICE_NAME%" AppRotateOnline 1
if errorlevel 1 exit /b %ERRORLEVEL%

"%NSSM_EXE%" set "%SERVICE_NAME%" AppRotateBytes 10485760
if errorlevel 1 exit /b %ERRORLEVEL%

"%NSSM_EXE%" set "%SERVICE_NAME%" AppExit Default Restart
if errorlevel 1 exit /b %ERRORLEVEL%

echo Service configured successfully: %SERVICE_NAME%
echo To start it now, run: "%NSSM_EXE%" start "%SERVICE_NAME%"
exit /b 0