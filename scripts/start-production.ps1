
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

# STEP 92 — retention: keep only the newest 10 complete stdout/stderr pairs, deleting older
# complete pairs. Runs BEFORE $Timestamp below is generated, so this invocation's own about-to-be-
# created pair does not exist yet and can never be matched/deleted here. A "pair" is grouped by the
# timestamp embedded in the filename (yyyyMMdd-HHmmss, lexicographic sort == chronological sort, no
# date parsing needed) — stdout and stderr for the same run are always kept or removed together.
# Anything that doesn't match the expected naming pattern, or has no matching sibling (an orphaned
# stdout with no stderr or vice versa), is left untouched — never guessed at, never deleted. Plain
# string parsing (StartsWith/Substring/IsDigit) is used instead of a regex, so no filename fragment
# here is ever mistaken for a filesystem path. Each deletion is individually try/catched so one
# locked/in-use file can only skip itself, never abort startup.
$RetainPairCount = 10
$StdOutPrefix = "production-stdout-"
$StdErrPrefix = "production-stderr-"

function Get-ProductionLogTimestamp {
    param([string]$FileName)

    if (-not $FileName.EndsWith(".log")) { return $null }
    $core = $FileName.Substring(0, $FileName.Length - 4)

    if ($core.StartsWith($StdOutPrefix)) {
        $stream = "stdout"
        $ts = $core.Substring($StdOutPrefix.Length)
    } elseif ($core.StartsWith($StdErrPrefix)) {
        $stream = "stderr"
        $ts = $core.Substring($StdErrPrefix.Length)
    } else {
        return $null
    }

    # Expected shape: 8 digits, "-", 6 digits (yyyyMMdd-HHmmss) — validated character-by-character,
    # never guessed at with a wildcard/regex.
    if ($ts.Length -ne 15 -or $ts.Substring(8, 1) -ne "-") { return $null }

    $digitsOnly = $ts.Substring(0, 8) + $ts.Substring(9, 6)
    foreach ($ch in $digitsOnly.ToCharArray()) {
        if (-not [char]::IsDigit($ch)) { return $null }
    }

    return @{ Stream = $stream; Timestamp = $ts }
}

$pairsByTimestamp = @{}
Get-ChildItem -Path $LogDir -Filter "production-*.log" -File -ErrorAction SilentlyContinue |
    ForEach-Object {
        $parsed = Get-ProductionLogTimestamp -FileName $_.Name
        if ($null -ne $parsed) {
            $ts = $parsed.Timestamp
            if (-not $pairsByTimestamp.ContainsKey($ts)) {
                $pairsByTimestamp[$ts] = @{}
            }
            $pairsByTimestamp[$ts][$parsed.Stream] = $_.FullName
        }
    }

$completePairs = $pairsByTimestamp.GetEnumerator() |
    Where-Object { $_.Value.ContainsKey("stdout") -and $_.Value.ContainsKey("stderr") } |
    Sort-Object { $_.Key } -Descending

if ($completePairs.Count -gt $RetainPairCount) {
    $completePairs | Select-Object -Skip $RetainPairCount | ForEach-Object {
        foreach ($pathToRemove in $_.Value.Values) {
            try {
                Remove-Item -LiteralPath $pathToRemove -Force -ErrorAction Stop
            } catch {
                Write-Warning "Log retention: could not remove $pathToRemove : $($_.Exception.Message)"
            }
        }
    }
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

