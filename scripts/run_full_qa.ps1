param(
    [string]$Label = "full-qa"
)

$ErrorActionPreference = "Continue"

$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "Backend"
$Frontend = Join-Path $Root "Frontend"
$Results = Join-Path $Root "QA\results"

New-Item -ItemType Directory -Force $Results | Out-Null

$Python = Join-Path $Backend ".venv\Scripts\python.exe"

if (-not (Test-Path $Python)) {
    Write-Host "ERROR: Backend virtual environment not found."
    exit 1
}

$OverallFailures = 0
$Executed = 0
$Skipped = 0
$SummaryLines = @()

function Run-PythonTest {
    param([string]$Name, [string]$RelativePath)

    $FullPath = Join-Path $Root $RelativePath

    if (-not (Test-Path $FullPath)) {
        Write-Host ""
        Write-Host "SKIP: $Name (missing: $RelativePath)"
        $script:Skipped++
        $script:SummaryLines += "SKIP | $Name | $RelativePath"
        return
    }

    Write-Host ""
    Write-Host "======================================================"
    Write-Host "RUNNING: $Name"
    Write-Host "======================================================"

    $SafeName = $Name.ToLower().Replace(" ", "-").Replace("/", "-")
    $Log = Join-Path $Results "$Label-$SafeName.txt"

    & $Python $FullPath 2>&1 | Tee-Object $Log
    $Code = $LASTEXITCODE
    $script:Executed++

    if ($Code -eq 0) {
        Write-Host "PASS: $Name"
        $script:SummaryLines += "PASS | $Name | $RelativePath"
    } else {
        Write-Host "FAIL: $Name"
        $script:OverallFailures++
        $script:SummaryLines += "FAIL | $Name | $RelativePath"
    }
}

# --------- DJANGO SYSTEM CHECK ---------
Push-Location $Backend
& $Python manage.py check 2>&1 | Tee-Object (Join-Path $Results "$Label-django-check.txt")
if ($LASTEXITCODE -ne 0) {
    $OverallFailures++
    $SummaryLines += "FAIL | Django System Check | manage.py check"
} else {
    $SummaryLines += "PASS | Django System Check | manage.py check"
}
Pop-Location

# --------- BACKEND TEST FILES ---------
$BackendTests = @(
    @("Customers",         "Backend\customers\test_customers.py"),
    @("CRM",               "Backend\crm\test_crm.py"),
    @("Drug Interactions", "Backend\inventory\test_interactions.py"),
    @("Sensitive Medicine","Backend\inventory\test_sensitive_medicines.py"),
    @("Orders API",        "Backend\sales\test_orders_api.py"),
    @("Purchases",         "Backend\purchases\tests.py"),
    @("Suppliers",         "Backend\inventory\test_suppliers.py"),
    @("Reports",           "Backend\reports\test_reports.py"),
    @("Notifications",     "Backend\notifications\test_notifications.py"),
    @("Database Integrity","Backend\config\test_database_integrity.py"),
    @("API Smoke",         "Backend\config\test_api_smoke.py"),
    @("Negative Cases",    "Backend\config\test_negative_cases.py"),
    @("Boundary Values",   "Backend\config\test_boundaries.py"),
    @("Error Handling",    "Backend\config\test_error_handling.py"),
    @("Performance Smoke", "Backend\config\test_performance_smoke.py"),
    @("Security",          "Backend\config\test_security.py"),
    @("Integration Flow",  "Backend\config\test_integration_flow.py"),
    @("End To End Flow",   "Backend\config\test_e2e_flow.py")
)

foreach ($Test in $BackendTests) {
    Run-PythonTest -Name $Test[0] -RelativePath $Test[1]
}

# --------- FRONTEND BUILD ---------
Write-Host ""
Write-Host "======================================================"
Write-Host "RUNNING: Frontend Production Build"
Write-Host "======================================================"

Push-Location $Frontend
npm run build 2>&1 | Tee-Object (Join-Path $Results "$Label-frontend-build.txt")
if ($LASTEXITCODE -ne 0) {
    $OverallFailures++
    $SummaryLines += "FAIL | Frontend Build | npm run build"
} else {
    $SummaryLines += "PASS | Frontend Build | npm run build"
}
Pop-Location

# --------- SELENIUM ---------
Write-Host ""
Write-Host "======================================================"
Write-Host "RUNNING: Frontend Selenium Suite"
Write-Host "======================================================"

$FrontendOnline = $false
try {
    $r = Invoke-WebRequest "http://localhost:5173" -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $FrontendOnline = $true }
} catch { $FrontendOnline = $false }

if ($FrontendOnline) {
    $Runner = Join-Path $Frontend "tests\run_all_tests.py"
    if (Test-Path $Runner) {
        & $Python $Runner 2>&1 | Tee-Object (Join-Path $Results "$Label-selenium.txt")
        if ($LASTEXITCODE -ne 0) {
            $OverallFailures++
            $SummaryLines += "FAIL | Selenium Suite | Frontend/tests"
        } else {
            $SummaryLines += "PASS | Selenium Suite | Frontend/tests"
        }
    } else {
        Write-Host "SKIP: Frontend runner missing"
        $Skipped++
        $SummaryLines += "SKIP | Selenium Suite | runner missing"
    }
} else {
    Write-Host "SKIP: Frontend not running on http://localhost:5173"
    $Skipped++
    $SummaryLines += "SKIP | Selenium Suite | frontend offline"
}

# --------- FINAL SUMMARY ---------
$SummaryFile = Join-Path $Results "$Label-summary.txt"
@(
    "PHARVO FULL QA SUITE",
    "Label: $Label",
    "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "",
    "Executed backend test groups: $Executed",
    "Skipped test groups: $Skipped",
    "Failures: $OverallFailures",
    "",
    "RESULTS:"
    $SummaryLines
) | Set-Content $SummaryFile

Write-Host ""
Write-Host "======================================================"
if ($OverallFailures -eq 0) {
    Write-Host "FULL QA RESULT: PASS"
} else {
    Write-Host "FULL QA RESULT: FAIL ($OverallFailures failing groups)"
}
Write-Host "Summary: $SummaryFile"
Write-Host "======================================================"

exit $(if ($OverallFailures -eq 0) { 0 } else { 1 })