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
    Authorization = "Bearer $($Login.access)"
}

function Try-Create($Body) {
    try {
        $Response = Invoke-WebRequest `
            -Uri "$BaseUrl/inventory/products/" `
            -Method Post `
            -Headers $Headers `
            -ContentType "application/json" `
            -Body ($Body | ConvertTo-Json) `
            -UseBasicParsing
        return [int]$Response.StatusCode
    }
    catch {
        return [int]$_.Exception.Response.StatusCode
    }
}

$Common = @{
    name = "QA Validation Medicine"
    brand = "QA"
    unit_price = "10.00"
    cost_price = "5.00"
    stock_quantity = 10
    reorder_level = 2
    expiry_date = "2028-12-31"
    is_active = $true
    description = "Validation test"
    is_sensitive = $false
}

# --- Cleanup any leftover from previous runs ---
python Backend/manage.py shell -c "from inventory.models import Product; Product.objects.filter(barcode__startswith='QA-').delete(); print('Pre-cleanup done')" | Out-Null

# --- First, create a VALID baseline product so we can test duplicate barcode properly ---
$Baseline = $Common.Clone()
$Baseline.barcode = "QA-DUP-BASE"
$BaselineStatus = Try-Create $Baseline

# --- Negative stock ---
$NegativeStock = $Common.Clone()
$NegativeStock.barcode = "QA-NEG-STOCK"
$NegativeStock.stock_quantity = -10
$NegativeStockStatus = Try-Create $NegativeStock

# --- Negative price ---
$NegativePrice = $Common.Clone()
$NegativePrice.barcode = "QA-NEG-PRICE"
$NegativePrice.unit_price = "-10.00"
$NegativePriceStatus = Try-Create $NegativePrice

# --- Invalid date ---
$InvalidDate = $Common.Clone()
$InvalidDate.barcode = "QA-BAD-DATE"
$InvalidDate.expiry_date = "not-a-date"
$InvalidDateStatus = Try-Create $InvalidDate

# --- Duplicate barcode (this time the base record exists) ---
$DuplicateBarcode = $Common.Clone()
$DuplicateBarcode.barcode = "QA-DUP-BASE"
$DuplicateBarcode.name = "QA Duplicate Attempt"
$DuplicateBarcodeStatus = Try-Create $DuplicateBarcode

@(
    "Baseline create status   : $BaselineStatus (expected: 201)"
    "Negative stock status    : $NegativeStockStatus (professional expectation: 400)"
    "Negative price status    : $NegativePriceStatus (professional expectation: 400)"
    "Invalid date status      : $InvalidDateStatus (expected: 400)"
    "Duplicate barcode status : $DuplicateBarcodeStatus (expected: 400)"
) | Tee-Object QA/results/phase-06-inventory-validation.txt

# --- Cleanup all test records ---
python Backend/manage.py shell -c "from inventory.models import Product; Product.objects.filter(barcode__startswith='QA-').delete(); print('Post-cleanup done')" | Out-Null