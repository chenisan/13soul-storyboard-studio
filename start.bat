@echo off
rem Storyboard Studio launcher (keep this file ASCII + CRLF; cmd misparses UTF-8 comments and LF line endings)
cd /d "%~dp0"
rem port: STUDIO_PORT in .env, default 8790
set PORT=8790
if exist .env for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="STUDIO_PORT" if not "%%b"=="" set PORT=%%b
rem already running -> just open the page
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if %errorlevel%==0 goto open
rem run.py starts serve.py and restarts it when serve.py changes; close that window to stop the service
start "Storyboard Studio (close to stop)" /min python run.py --port %PORT%
rem wait until the server answers (about 15 s max)
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){try{Invoke-WebRequest -UseBasicParsing http://127.0.0.1:%PORT%/ -TimeoutSec 1 | Out-Null; exit 0}catch{Start-Sleep -Milliseconds 250}}; exit 1"
:open
start "" http://127.0.0.1:%PORT%/
