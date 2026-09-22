import sys
import time
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
    
    print("Starting logout UI test...")
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
        print("OK - Logged in, URL:", driver.current_url)
        
        # Step 1: Click the user avatar button
        avatar_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//button[contains(@class, 'gap-2.5')]"))
        )
        avatar_btn.click()
        print("OK - Clicked user avatar")
        
        # Small wait for dropdown animation
        time.sleep(1)
        
        # Step 2: Click the "Sign Out" button (exact match on button element)
        sign_out_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//button[normalize-space()='Sign Out']"))
        )
        sign_out_btn.click()
        print("OK - Clicked Sign Out")
        
        # Step 3: Verify we are back on the login page
        WebDriverWait(driver, 10).until(EC.url_contains("/login"))
        print("OK - Redirected to login page")
        
    except Exception as e:
        print(f"FAIL - Logout: {e}")
        all_ok = False
    finally:
        driver.quit()
        
    if not all_ok:
        sys.exit(1)
    print("Logout UI test PASS.")
    
if __name__ == "__main__":
    main()