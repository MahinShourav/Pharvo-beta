import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE_URL = "http://localhost:5173"
pages = [
    "/", "/login", "/signup", "/dashboard", 
    "/pos", "/medicines", "/customers", 
    "/crm", "/orders", "/reports", 
    "/notifications", "/settings"
]

def main():
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    
    print("Starting smoke test...")
    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(30)
    all_ok = True
    
    try:
        for page in pages:
            url = BASE_URL + page
            try:
                driver.get(url)
                WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.TAG_NAME, "body"))
                )
                print(f"OK - {page}")
            except Exception as e:
                print(f"FAIL - {page}: {e}")
                all_ok = False
    finally:
        driver.quit()
        
    if not all_ok:
        print("Smoke test failed. Some pages did not load.")
        sys.exit(1)
    else:
        print("All pages loaded successfully. PASS.")

if __name__ == "__main__":
    main()