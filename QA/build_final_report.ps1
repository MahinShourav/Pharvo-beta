$Root = Split-Path -Parent $PSScriptRoot

$SummaryFile = Join-Path $Root "QA\TEST_SUMMARY.md"
$BugFile = Join-Path $Root "QA\bugs.csv"
$Output = Join-Path $Root "QA\FINAL_QA_REPORT.md"

$Branch = git -C $Root branch --show-current
$Commit = git -C $Root rev-parse --short HEAD

$Summary = ""
if (Test-Path $SummaryFile) {
    $Summary = Get-Content $SummaryFile -Raw
}

$FailCount = (
    [regex]::Matches($Summary, '\|\s*\d+\s*\|\s*FAIL\s*\|', 'IgnoreCase')
).Count

$UnknownCount = (
    [regex]::Matches($Summary, '\|\s*\d+\s*\|\s*UNKNOWN\s*\|', 'IgnoreCase')
).Count

$BugCount = 0
$CriticalCount = 0
$HighCount = 0
$MediumCount = 0
$LowCount = 0

if (Test-Path $BugFile) {
    $Bugs = Import-Csv $BugFile
    $BugCount = @($Bugs).Count
    $CriticalCount = @($Bugs | Where-Object Severity -eq "Critical").Count
    $HighCount = @($Bugs | Where-Object Severity -eq "High").Count
    $MediumCount = @($Bugs | Where-Object Severity -eq "Medium").Count
    $LowCount = @($Bugs | Where-Object Severity -eq "Low").Count
}

if ($CriticalCount -gt 0 -or $HighCount -gt 0 -or $FailCount -gt 0) {
    $ReleaseStatus = "NOT READY FOR RELEASE - fixes/retesting required"
}
elseif ($UnknownCount -gt 0) {
    $ReleaseStatus = "TESTING INCOMPLETE"
}
else {
    $ReleaseStatus = "ALL RECORDED TESTS PASSED"
}

$Report = @"
# PHARVO Final QA Report

## Project

PHARVO Pharmacy Management System

## Testing Branch

$Branch

## Latest Commit

$Commit

## Generated

$(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

---

## Testing Scope

The QA cycle covered:

- Environment and smoke testing
- Authentication
- Role-based access
- Medicine management
- Inventory
- POS and sales
- Payments
- Discounts
- Customers
- CRM
- Sensitive medicines
- Drug interactions
- Orders
- Purchases
- Supplier orders
- Dashboard
- Reports
- Notifications
- Audit logging
- Database integrity
- API testing
- Negative testing
- Boundary testing
- UI/responsive testing
- Performance smoke testing
- Security authorization
- Error handling
- Automated full suite
- Integration testing
- End-to-end testing
- Regression testing
- Bug classification and reporting

---

## Bug Statistics

Total recorded bugs: $BugCount

- Critical: $CriticalCount
- High: $HighCount
- Medium: $MediumCount
- Low: $LowCount

---

## Release Assessment

**$ReleaseStatus**

---

## Important Note

This QA report reflects the tests executed in this repository and
does not claim that the software is completely defect-free.

Critical and High severity defects should be fixed and regression-tested
before production release.

---

## Detailed Test Summary

$Summary
"@

$Report | Set-Content $Output

Write-Host ""
Write-Host "FINAL REPORT CREATED:"
Write-Host $Output
Write-Host ""
Write-Host "Release assessment:"
Write-Host $ReleaseStatus
