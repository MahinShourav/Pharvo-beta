$BaseUrl = "http://localhost:8000/api"

$Login = Invoke-RestMethod `
    -Uri "$BaseUrl/auth/login/" `
    -Method Post `
    -ContentType "application/json" `
    -Body (@{
        username="rafi"
        password="787878"
    } | ConvertTo-Json)

$Headers = @{
    Authorization="Bearer $($Login.access)"
}

$ProductsResponse = Invoke-RestMethod `
    -Uri "$BaseUrl/inventory/products/" `
    -Headers $Headers

$Products = if ($ProductsResponse.results) { $ProductsResponse.results } else { $ProductsResponse }

$Product = $Products |
    Where-Object {
        $_.stock_quantity -gt 10 -and
        [decimal]$_.unit_price -gt 1
    } |
    Select-Object -First 1

if (-not $Product) {
    throw "Suitable product not found. Run the Phase 7 product creation first."
}

$Price = [decimal]$Product.unit_price

function Checkout-Status($Payments) {
    $Body = @{
        customer = $null
        items = @(
            @{
                product = $Product.id
                quantity = 1
                unit = "pc"
                unit_price = $Price
            }
        )
        discount = 0
        payments = $Payments
    } | ConvertTo-Json -Depth 10

    try {
        $Response = Invoke-WebRequest `
            -Uri "$BaseUrl/pos/checkout/" `
            -Method Post `
            -Headers $Headers `
            -ContentType "application/json" `
            -Body $Body `
            -UseBasicParsing
        return [int]$Response.StatusCode
    }
    catch {
        return [int]$_.Exception.Response.StatusCode
    }
}

# Cash
$Cash = Checkout-Status @(
    @{
        method="cash"
        amount=$Price
    }
)

# bKash
$Bkash = Checkout-Status @(
    @{
        method="bkash"
        amount=$Price
    }
)

# Split
$CashAmount = [math]::Round([double]$Price * 0.40, 2)
$BkashAmount = [decimal]$Price - [decimal]$CashAmount

$Split = Checkout-Status @(
    @{
        method="cash"
        amount=$CashAmount
    },
    @{
        method="bkash"
        amount=$BkashAmount
    }
)

# Underpayment
$UnderAmount = $Price - 1

$Underpayment = Checkout-Status @(
    @{
        method="cash"
        amount=$UnderAmount
    }
)

# Zero payment
$ZeroPayment = Checkout-Status @(
    @{
        method="cash"
        amount=0
    }
)

@(
    "Product: $($Product.name)"
    "Unit price: $Price"
    ""
    "Cash          : $Cash (expected 201)"
    "bKash         : $Bkash (expected 201)"
    "Split         : $Split (expected 201)"
    "Underpayment  : $Underpayment (expected 400)"
    "Zero payment  : $ZeroPayment (expected 400)"
) | Tee-Object QA/results/phase-08-payments.txt

if (
    $Cash -eq 201 -and
    $Bkash -eq 201 -and
    $Split -eq 201 -and
    $Underpayment -eq 400 -and
    $ZeroPayment -eq 400
) {
    "OVERALL: PASS" |
        Add-Content QA/results/phase-08-payments.txt
}
else {
    "OVERALL: FAIL" |
        Add-Content QA/results/phase-08-payments.txt
}