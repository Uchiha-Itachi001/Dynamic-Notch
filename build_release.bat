@echo off
echo ===================================================
echo   Building Notch Production Release (v0.1.0)
echo ===================================================

call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" 2>nul
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat" 2>nul
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%USERPROFILE%\.cargo\bin;%PATH%"

echo [1/3] Building frontend distribution...
call npm run build
if %errorlevel% neq 0 (
    echo Error: Frontend build failed.
    exit /b %errorlevel%
)

echo [2/3] Compiling Tauri release binary...
call npx tauri build
if %errorlevel% neq 0 (
    echo Fallback: building cargo release binary...
    call "%USERPROFILE%\.cargo\bin\cargo.exe" build --release --manifest-path src-tauri\Cargo.toml
)

echo [3/3] Copying release executables to release\ folder...
if not exist "release" mkdir release

if exist "src-tauri\target\release\notch.exe" (
    copy /Y "src-tauri\target\release\notch.exe" "release\notch.exe"
    copy /Y "src-tauri\target\release\notch.exe" "release\Notch-v0.1.0.exe"
    echo Success: Copied notch.exe and Notch-v0.1.0.exe to release\
)

if exist "src-tauri\target\release\bundle\nsis\*.exe" (
    copy /Y "src-tauri\target\release\bundle\nsis\*.exe" "release\"
    echo Success: Copied NSIS installer to release\
)

if exist "src-tauri\target\release\bundle\msi\*.msi" (
    copy /Y "src-tauri\target\release\bundle\msi\*.msi" "release\"
    echo Success: Copied MSI package to release\
)

echo ===================================================
echo   Release build completed!
echo   Files are located in: D:\coding\Project\notch\release\
echo ===================================================
dir release
