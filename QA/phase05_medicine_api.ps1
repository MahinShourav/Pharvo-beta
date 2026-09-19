$BaseUrl = "http://localhost:8000/api"

# Login
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

# Remove previous QA product if a previous run stopped early
python Backend/manage.py shell -c "from inventory.models import Product; Product.objects.filter(barcode='QA-MED-001').delete()" | Out-Null

# CREATE
$ProductBody = @{
    name = "QA Test Medicine"
    brand = "QA Pharma"
    barcode = "QA-MED-001"
    unit_price = "10.00"
    cost_price = "6.00"
    stock_quantity = 100
    reorder_level = 10
    expiry_date = "2028-12-31"
    is_active = $true
    description = "Temporary QA medicine"
    is_sensitive = $false
    box_price = "100.00"
    strip_price = "50.00"
    pcs_per_box = 10
    pcs_per_strip = 5
    strips_per_box = 2
} | ConvertTo-Json

$Created = Invoke-RestMethod `
    -Uri "$BaseUrl/inventory/products/" `
    -Method Post `
    -Headers $Headers `
    -ContentType "application/json" `
    -Body $ProductBody

"CREATE ID: $($Created.id)" |
    Tee-Object QA/results/phase-05-medicine-api.txt

# SEARCH / READ
$Found = Invoke-RestMethod `
    -Uri "$BaseUrl/inventory/products/?search=QA%20Test%20Medicine" `
    -Headers $Headers

"SEARCH COUNT: $($Found.Count)" |
    Add-Content QA/results/phase-05-medicine-api.txt

# UPDATE
$UpdateBody = @{
    name = "QA Test Medicine Updated"
    unit_price = "12.00"
} | ConvertTo-Json

$Updated = Invoke-RestMethod `
    -Uri "$BaseUrl/inventory/products/$($Created.id)/" `
    -Method Patch `
    -Headers $Headers `
    -ContentType "application/json" `
    -Body $UpdateBody

"UPDATED NAME: $($Updated.name)" |
    Add-Content QA/results/phase-05-medicine-api.txt

"UPDATED PRICE: $($Updated.unit_price)" |
    Add-Content QA/results/phase-05-medicine-api.txt

# DELETE behaviour
try {
    $Delete = Invoke-WebRequest `
        -Uri "$BaseUrl/inventory/products/$($Created.id)/" `
        -Method Delete `
        -Headers $Headers `
        -UseBasicParsing
    $DeleteStatus = $Delete.StatusCode
}
catch {
    $DeleteStatus = [int]$_.Exception.Response.StatusCode
}

"DELETE STATUS: $DeleteStatus (expected 204 because DELETE is not implemented)" |
    Add-Content QA/results/phase-05-medicine-api.txt

# Clean temporary product
python Backend/manage.py shell -c "from inventory.models import Product; Product.objects.filter(barcode='QA-MED-001').delete()" | Out-Null

if (
    $Created.id -and
    $Found.Count -gt 0 -and
    $Updated.name -eq "QA Test Medicine Updated" -and
    $DeleteStatus -eq 204
) {
    "OVERALL: PASS" |
        Add-Content QA/results/phase-05-medicine-api.txt
}
else {
    "OVERALL: FAIL" |
        Add-Content QA/results/phase-05-medicine-api.txt
}