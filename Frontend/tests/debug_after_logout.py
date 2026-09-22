import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

options = Options()
options.add_argument("--headless=new")
options.add_argument("--disable-gpu")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")

driver = webdriver.Chrome(options=options)
driver.set_page_load_timeout(30)

# Login
driver.get("http://localhost:5173/login")
driver.find_element(By.NAME, "username").send_keys("rafi")
driver.find_element(By.NAME, "password").send_keys("787878")
driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
WebDriverWait(driver, 10).until(EC.url_contains("/dashboard"))
print("Logged in. URL:", driver.current_url)

# Click avatar
avatar_btn = WebDriverWait(driver, 10).until(
    EC.element_to_be_clickable((By.XPATH, "//button[contains(@class, 'gap-2.5')]"))
)
avatar_btn.click()
time.sleep(1.5)

# Click Sign Out via JS
sign_out_btn = WebDriverWait(driver, 10).until(
    EC.presence_of_element_located((By.XPATH, "//button[normalize-space()='Sign Out']"))
)
driver.execute_script("arguments[0].click();", sign_out_btn)
print("Clicked Sign Out. URL immediately after:", driver.current_url)

# Wait and check where we end up
time.sleep(3)
print("URL after 3 seconds:", driver.current_url)
print("Page title:", driver.title)
print("First 300 chars of page text:", driver.find_element(By.TAG_NAME, "body").text[:300])

# Check if tokens are still in localStorage (if they are, logout didn't work)
tokens = driver.execute_script("return JSON.stringify(Object.keys(localStorage));")
print("localStorage keys:", tokens)

driver.quit()