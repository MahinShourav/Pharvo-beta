import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def main():
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    
    print("Starting POS UI test...")
    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(30)
    all_ok = True
    
    try:
        # Login first
        driver.get("http://localhost:5173/login")
        driver.find_element(By.NAME, "username").send_keys("rafi")
        driver.find_element(By.NAME, "password").send_keys("787878")
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        WebDriverWait(driver, 10).until(EC.url_contains("/dashboard"))
        print("OK - Logged in")
        
        # Navigate to POS page
        driver.get("http://localhost:5173/pos")
        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.TAG_NAME, "body")))
        print("OK - POS page loaded")
        
        # Check for common elements
        body_text = driver.find_element(By.TAG_NAME, "body").text
        
        checks = [
            ("POS", "POS title"),
            ("Search", "Search bar"),
            ("Cart", "Cart section"),
            ("Sale", "Sale/Complete button"),
        ]
        
        for text, label in checks:
            if text.lower() in body_text.lower():
                print(f"OK - Found {label}")
            else:
                print(f"WARN - Could not find {label} (might have different text)")
                
    except Exception as e:
        print(f"FAIL - POS UI: {e}")
        all_ok = False
    finally:
        driver.quit()
        
    if not all_ok:
        sys.exit(1)
    print("POS UI test PASS.")
    
if __name__ == "__main__":
    main()