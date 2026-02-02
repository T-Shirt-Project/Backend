@echo off
echo ========================================
echo Starting T-Shirt Platform Backend
echo ========================================
echo.

echo Checking MongoDB status...
sc query MongoDB | find "RUNNING" >nul
if %errorlevel% equ 0 (
    echo ✅ MongoDB is running
) else (
    echo ❌ MongoDB is NOT running
    echo.
    echo Starting MongoDB service...
    net start MongoDB
    if %errorlevel% equ 0 (
        echo ✅ MongoDB started successfully
    ) else (
        echo ❌ Failed to start MongoDB
        echo.
        echo Please start MongoDB manually:
        echo   1. Run 'net start MongoDB' as Administrator
        echo   2. OR start MongoDB Compass
        echo   3. OR run mongod.exe manually
        echo.
        pause
        exit /b 1
    )
)

echo.
echo Starting backend server...
npm start
