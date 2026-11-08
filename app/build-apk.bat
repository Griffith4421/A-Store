@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Build A-Store APK

echo.
echo  ======================================
echo        A-STORE ANDROID APK BUILDER
echo  ======================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js 22.9 or later, then reopen Command Prompt.
  goto :fail
)

node -e "const [a,b]=process.versions.node.split('.').map(Number);const ok=(a>22||(a===22&&b>=9)||(a===20&&b>=17));if(!ok){console.error('Cordova Android 15 requires Node >=20.17 or >=22.9. Found '+process.versions.node);process.exit(1)}"
if errorlevel 1 goto :fail

if not defined JAVA_HOME (
  echo [ERROR] JAVA_HOME is not set. Install JDK 17 and set JAVA_HOME to its folder.
  goto :fail
)
if not exist "%JAVA_HOME%\bin\javac.exe" (
  echo [ERROR] JDK not found under JAVA_HOME: %JAVA_HOME%
  goto :fail
)

if not defined ANDROID_HOME if defined ANDROID_SDK_ROOT set "ANDROID_HOME=%ANDROID_SDK_ROOT%"
if not defined ANDROID_HOME if defined LOCALAPPDATA if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not defined ANDROID_HOME (
  echo [ERROR] ANDROID_HOME is not set. Install Android Studio and the Android SDK.
  goto :fail
)
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\cmdline-tools\latest\bin;%PATH%"
if not exist "%ANDROID_HOME%\platform-tools\adb.exe" (
  echo [ERROR] Android SDK platform-tools not found under: %ANDROID_HOME%
  echo Install Android SDK Platform-Tools in Android Studio SDK Manager.
  goto :fail
)

if not exist "node_modules\cordova\bin\cordova" (
  echo [1/5] Installing project build tools...
  call npm install
  if errorlevel 1 goto :fail
) else (
  echo [1/5] Project build tools already installed.
)

set "CORDOVA=%CD%\node_modules\.bin\cordova.cmd"
if not exist "%CORDOVA%" (
  echo [ERROR] Cordova CLI was not installed correctly.
  goto :fail
)

if not exist "platforms\android\build.gradle" (
  echo [2/5] Installing Cordova Android 15...
  call "%CORDOVA%" platform add android@15.0.0
  if errorlevel 1 goto :fail
) else (
  echo [2/5] Android platform already present.
)

if not exist "plugins\cordova-plugin-inappbrowser" (
  echo [3/5] Installing InAppBrowser plugin...
  call "%CORDOVA%" plugin add cordova-plugin-inappbrowser@6.0.0
  if errorlevel 1 goto :fail
) else (
  echo [3/5] InAppBrowser plugin already present.
)

echo [4/5] Checking Android build requirements...
call "%CORDOVA%" requirements android
if errorlevel 1 (
  echo.
  echo [ERROR] Android requirements are incomplete. Review the messages above.
  goto :fail
)

echo [5/5] Building A-Store debug APK...
call "%CORDOVA%" build android --debug
if errorlevel 1 goto :fail

set "APK=%CD%\platforms\android\app\build\outputs\apk\debug\app-debug.apk"
if not exist "%APK%" (
  echo [ERROR] Build finished but the APK was not found at the expected location.
  goto :fail
)

for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
if not exist "%PROJECT_ROOT%\dist" mkdir "%PROJECT_ROOT%\dist"
copy /Y "%APK%" "%PROJECT_ROOT%\dist\A-Store-debug.apk" >nul
if errorlevel 1 goto :fail

echo.
echo  ======================================
echo        BUILD COMPLETED SUCCESSFULLY
echo  ======================================
echo.
echo APK: %PROJECT_ROOT%\dist\A-Store-debug.apk
echo.
echo This is a debug-signed APK for testing. Sign a release build with your own keystore before public distribution.
echo.
pause
exit /b 0

:fail
echo.
echo Build stopped. Fix the prerequisite or error shown above and run build-apk.bat again.
echo.
pause
exit /b 1
