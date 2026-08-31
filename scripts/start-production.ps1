$ErrorActionPreference = "Stop"

$ProjectPath = "C:\Users\maxim\thai-amulet-ai"
$PnpmPath = "C:\Users\maxim\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64\pnpm.CMD"

Set-Location $ProjectPath

& $PnpmPath start
