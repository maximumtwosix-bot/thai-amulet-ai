
# IMPORTANT: Do not stop production by matching the literal "next start" command line.
# A broad process-command-line match can match the PowerShell/launcher process running
# the deployment command itself and terminate the deployment shell.
# If a production stop is ever required, identify the actual listener PID on port 3000
# (for example via Get-NetTCPConnection) and stop only that confirmed process.

$ErrorActionPreference = "Stop"

$ProjectPath = "C:\Users\maxim\thai-amulet-ai"
$PnpmPath = "C:\Users\maxim\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64\pnpm.CMD"

Set-Location $ProjectPath

# STEP PROD-LOG-2 — persistent stdout/stderr logging (Option B from the PROD-LOG-1 audit).
# One timestamped file pair per script invocation (rotation-by-restart, no dependency added).
$LogDir = Join-Path $ProjectPath "logs"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$StdOutLog = Join-Path $LogDir "production-stdout-$Timestamp.log"
$StdErrLog = Join-Path $LogDir "production-stderr-$Timestamp.log"

# Start-Process -Wait keeps this blocking/foreground, matching the prior `& $PnpmPath start`
# behavior exactly (no detachment). -RedirectStandardOutput/-Error capture the child process's raw
# output streams at the OS level rather than through PowerShell's console encoding pipeline, which
# avoids both the Windows PowerShell 5.1 NativeCommandError stderr-wrapping quirk and the ANSI-
# codepage mojibake risk that the simpler `*>>` operator would carry for this app's Thai-text output.
Start-Process -FilePath $PnpmPath -ArgumentList "start" -NoNewWindow -Wait `
    -RedirectStandardOutput $StdOutLog -RedirectStandardError $StdErrLog

