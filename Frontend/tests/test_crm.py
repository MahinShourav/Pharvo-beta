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

    print("Starting CRM UI test...")
    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(30)
    all_ok = True

    try:
        # Login
        driver.get("http://localhost:5173/login")
        driver.find_element(By.NAME, "username").send_keys("rafi")
        driver.find_element(By.NAME, "password").send_keys("787878")
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        WebDriverWait(driver, 10).until(EC.url_contains("/dashboard"))
        print("OK - Logged in")

        # Go to CRM page
        driver.get("http://localhost:5173/crm")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
        print("OK - CRM page loaded")

        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        for keyword in ["crm", "reminder", "customer"]:
            if keyword in body_text:
                print(f"OK - Found '{keyword}' on page")
            else:
                print(f"WARN - '{keyword}' text not found")

    except Exception as e:
        print(f"FAIL - CRM UI: {e}")
        all_ok = False
    finally:
        driver.quit()

    if not all_ok:
        sys.exit(1)
    print("CRM UI test PASS.")


if __name__ == "__main__":
    main()