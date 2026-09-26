$BaseUrl = "http://localhost:8000/api"

function Login-User($Username) {
    $Body = @{
        username = $Username
        password = "QaTest123!"
    } | ConvertTo-Json

    return Invoke-RestMethod `
        -Uri "$BaseUrl/auth/login/" `
        -Method Post `
        -ContentType "application/json" `
        -Body $Body
}

function Post-Status($Url, $Token, $Body) {
    try {
        $Response = Invoke-WebRequest `
            -Uri $Url `
            -Method Post `
            -Headers @{Authorization="Bearer $Token"} `
            -ContentType "application/json" `
            -Body $Body `
            -UseBasicParsing
        return [int]$Response.StatusCode
    }
    catch {
        return [int]$_.Exception.Response.StatusCode
    }
}

$Admin = Login-User "qa_admin"
$Pharmacist = Login-User "qa_pharmacist"
$Customer = Login-User "qa_customer"

$EmptyBody = '{}'

$AdminStatus = Post-Status "$BaseUrl/pos/checkout/" $Admin.access $EmptyBody
$PharmacistStatus = Post-Status "$BaseUrl/pos/checkout/" $Pharmacist.access $EmptyBody
$CustomerStatus = Post-Status "$BaseUrl/pos/checkout/" $Customer.access $EmptyBody

$Lines = @(
    "Admin POS access       : $AdminStatus (expected NOT 403)"
    "Pharmacist POS access  : $PharmacistStatus (expected NOT 403)"
    "Customer POS access    : $CustomerStatus (expected 403)"
)

$Lines | Tee-Object "QA/results/phase-04-role-access.txt"

if (
    $AdminStatus -ne 403 -and
    $PharmacistStatus -ne 403 -and
    $CustomerStatus -eq 403
) {
    "OVERALL: PASS" | Add-Content "QA/results/phase-04-role-access.txt"
    exit 0
}

"OVERALL: FAIL" | Add-Content "QA/results/phase-04-role-access.txt"
exit 1