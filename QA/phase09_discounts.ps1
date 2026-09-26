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
    Where-Object { $_.stock_quantity -gt 10 -and [decimal]$_.unit_price -gt 5 } |
    Select-Object -First 1

if (-not $Product) {
    throw "Suitable product not found. Create one first."
}

$Price = [decimal]$Product.unit_price

function Checkout-Discount($DiscountAmount) {
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
        discount = $DiscountAmount
        payments = @(
            @{
                method = "cash"
                amount = $Price - $DiscountAmount
            }
        )
    } | ConvertTo-Json -Depth 10

    try {
        $Response = Invoke-RestMethod `
            -Uri "$BaseUrl/pos/checkout/" `
            -Method Post `
            -Headers $Headers `
            -ContentType "application/json" `
            -Body $Body
        return @{ Status = 201; Data = $Response }
    }
    catch {
        return @{ Status = [int]$_.Exception.Response.StatusCode; Data = $null }
    }
}

# No discount
$NoDiscount = Checkout-Discount 0

# Manual discount 10%
$TenPercent = [math]::Round([double]$Price * 0.10, 2)
$ManualDiscount = Checkout-Discount $TenPercent

# Full discount (equal to total)
$FullDiscount = Checkout-Discount $Price

# Negative discount (should be 400)
$NegativeDiscount = Checkout-Discount -5

# Excessive discount (more than total, should be 400)
$ExcessiveDiscount = Checkout-Discount ($Price + 100)

@(
    "Product: $($Product.name)"
    "Unit price: $Price"
    ""
    "No discount      : $($NoDiscount.Status) (expected 201) | payable=$($NoDiscount.Data.payable_amount)"
    "Manual 10% off   : $($ManualDiscount.Status) (expected 201) | payable=$($ManualDiscount.Data.payable_amount)"
    "Full discount    : $($FullDiscount.Status) (expected 201) | payable=$($FullDiscount.Data.payable_amount)"
    "Negative discount: $($NegativeDiscount.Status) (expected 400)"
    "Excessive (>t)   : $($ExcessiveDiscount.Status) (expected 400)"
) | Tee-Object QA/results/phase-09-discount.txt

if (
    $NoDiscount.Status -eq 201 -and
    $ManualDiscount.Status -eq 201 -and
    $FullDiscount.Status -eq 201 -and
    $NegativeDiscount.Status -eq 400 -and
    $ExcessiveDiscount.Status -eq 400
) {
    "OVERALL: PASS" | Add-Content QA/results/phase-09-discount.txt
}
else {
    "OVERALL: FAIL" | Add-Content QA/results/phase-09-discount.txt
}