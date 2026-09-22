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

# Handle both paginated and non-paginated responses
$Products = if ($ProductsResponse.results) { $ProductsResponse.results } else { $ProductsResponse }

$Product = $Products |
    Where-Object {
        $_.stock_quantity -gt 5 -and
        [decimal]$_.unit_price -gt 0
    } |
    Select-Object -First 1

if (-not $Product) {
    throw "No product with usable stock found. Please add a product via the admin panel first."
}

$BeforeStock = [int]$Product.stock_quantity
$Price = [decimal]$Product.unit_price

$CheckoutBody = @{
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
    payments = @(
        @{
            method = "cash"
            amount = $Price
        }
    )
} | ConvertTo-Json -Depth 10

$Sale = Invoke-RestMethod `
    -Uri "$BaseUrl/pos/checkout/" `
    -Method Post `
    -Headers $Headers `
    -ContentType "application/json" `
    -Body $CheckoutBody

$AfterProduct = Invoke-RestMethod `
    -Uri "$BaseUrl/inventory/products/$($Product.id)/" `
    -Headers $Headers

$AfterStock = [int]$AfterProduct.stock_quantity
$ExpectedStock = $BeforeStock - 1

@(
    "PRODUCT: $($Product.name)"
    "PRODUCT ID: $($Product.id)"
    "STOCK BEFORE: $BeforeStock"
    "STOCK AFTER: $AfterStock"
    "EXPECTED STOCK: $ExpectedStock"
    "SALE ID: $($Sale.id)"
    "INVOICE: $($Sale.invoice_number)"
    "TOTAL: $($Sale.total_amount)"
    "PAYABLE: $($Sale.payable_amount)"
) | Tee-Object QA/results/phase-07-pos-checkout.txt

if ($AfterStock -eq $ExpectedStock) {
    "OVERALL: PASS - Sale created and stock deducted correctly" |
        Add-Content QA/results/phase-07-pos-checkout.txt
}
else {
    "OVERALL: FAIL - Stock deduction incorrect" |
        Add-Content QA/results/phase-07-pos-checkout.txt
}