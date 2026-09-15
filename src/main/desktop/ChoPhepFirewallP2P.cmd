@echo off
setlocal
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

netsh advfirewall firewall delete rule name="Android Remote P2P UDP" program="%~dp0AndroidRemote.exe" >nul 2>&1
netsh advfirewall firewall add rule name="Android Remote P2P UDP" dir=in action=allow protocol=UDP program="%~dp0AndroidRemote.exe" profile=any enable=yes

if "%errorlevel%"=="0" (
  echo Da cho phep AndroidRemote.exe nhan UDP qua Windows Firewall.
) else (
  echo Khong tao duoc firewall rule. Hay chup man hinh loi nay.
)
pause
