@echo off
setlocal
call "%~dp0app\build-apk.bat"
exit /b %errorlevel%
