$Root = Split-Path -Parent $PSScriptRoot
$Results = Join-Path $Root "QA\results"
$Output = Join-Path $Root "QA\TEST_SUMMARY.md"

$Files = Get-ChildItem $Results -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^phase-(\d+)-summary\.(txt|md)$' }

$Rows = @()

foreach ($File in $Files) {
    if ($File.Name -match '^phase-(\d+)-summary') {
        $Phase = [int]$Matches[1]
    } else {
        continue
    }

    $Content = Get-Content $File.FullName -Raw
    $Status = "UNKNOWN"

    if ($Content -match '(?i)Status:\s*N/A') {
    $Status = "N/A"
} elseif ($Content -match '(?i)\bFAIL\b') {
    $Status = "FAIL"
} elseif ($Content -match '(?i)\bPASS\b' -or $Content -match '(?i)\bCOMPLETED\b') {
    $Status = "PASS"
}

   

    $Rows += [PSCustomObject]@{
        Phase = $Phase
        Status = $Status
        Evidence = "QA/results/$($File.Name)"
    }
}

$Rows = $Rows | Sort-Object Phase

$Pass = @($Rows | Where-Object Status -eq "PASS").Count
$Fail = @($Rows | Where-Object Status -eq "FAIL").Count
$Na = @($Rows | Where-Object Status -eq "N/A").Count
$Unknown = @($Rows | Where-Object Status -eq "UNKNOWN").Count

$Lines = @()
$Lines += "# PHARVO Testing Summary"
$Lines += ""
$Lines += "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$Lines += ""
$Lines += "## Overall"
$Lines += ""
$Lines += "- Recorded phases: $($Rows.Count)"
$Lines += "- Passed: $Pass"
$Lines += "- Failed: $Fail"
$Lines += "- Not Applicable: $Na"
$Lines += "- Unknown/Incomplete: $Unknown"

$Lines += ""
$Lines += "## Phase Results"
$Lines += ""
$Lines += "| Phase | Status | Evidence |"
$Lines += "|---:|---|---|"

foreach ($Row in $Rows) {
    $Lines += ("| {0} | {1} | `{2}` |" -f $Row.Phase, $Row.Status, $Row.Evidence)
}

$Lines += ""
$Lines += "## Overall QA Status"
$Lines += ""

if ($Fail -gt 0) {
    $Lines += "**FAILURES REMAIN - review and fix failed phases before release.**"
} elseif ($Unknown -gt 0) {
    $Lines += "**TESTING INCOMPLETE - some phase results are missing or unknown.**"
} else {
    $Lines += "**ALL RECORDED TEST PHASES PASSED.**"
    if ($Na -gt 0) {
        $Lines += ""
        $Lines += "_(Phases marked N/A had no testable artifacts in this codebase.)_"
    }
}

$Lines | Set-Content $Output

Write-Host ""
Write-Host "Testing summary created:"
Write-Host $Output
Write-Host ""
Write-Host "Passed : $Pass"
Write-Host "Failed : $Fail"
Write-Host "N/A    : $Na"
Write-Host "Unknown: $Unknown"

if ($Fail -gt 0) { exit 1 }
exit 0
