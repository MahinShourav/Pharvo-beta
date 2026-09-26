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
        
        # Click avatar
        avatar_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//button[contains(@class, 'gap-2.5')]"))
        )
        avatar_btn.click()
        print("OK - Clicked user avatar")
        
        time.sleep(1.5)
        
        # Click Sign Out via JS
        sign_out_btn = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.XPATH, "//button[normalize-space()='Sign Out']"))
        )
        driver.execute_script("arguments[0].click();", sign_out_btn)
        print("OK - Clicked Sign Out")
        
        # Verify logout worked by checking:
        # 1. Redirected away from dashboard
        # 2. Login form is visible
        # 3. localStorage tokens are cleared
        time.sleep(2)
        
        if "/dashboard" in driver.current_url:
            raise Exception("Still on dashboard after Sign Out")
        print("OK - Redirected away from dashboard, URL:", driver.current_url)
        
        # Check that login form is showing
        WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.NAME, "username"))
        )
        print("OK - Login form is visible")
        
        # Check localStorage is empty
        tokens = driver.execute_script("return JSON.stringify(Object.keys(localStorage));")
        if tokens != "[]":
            raise Exception(f"Tokens not cleared. localStorage: {tokens}")
        print("OK - Tokens cleared from localStorage")
        
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