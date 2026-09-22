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
time.sleep(2)

# Click avatar
avatar_btn = WebDriverWait(driver, 10).until(
    EC.element_to_be_clickable((By.XPATH, "//button[contains(@class, 'gap-2.5')]"))
)
avatar_btn.click()
print("Clicked avatar. Waiting for dropdown...")
time.sleep(3)  # Wait for dropdown animation to complete

# Dump ALL clickable elements now that dropdown is open
print("\n--- All clickable elements AFTER avatar click ---")
elements = driver.find_elements(By.XPATH, "//button | //a | //div[@role='menuitem'] | //li")
for i, el in enumerate(elements):
    text = el.text.strip()
    if text:
        print(f"{i}: <{el.tag_name}> '{text}'")

# Also dump any element containing common logout words
print("\n--- Elements containing 'Sign', 'Log', 'Out' ---")
for word in ["Sign", "Log", "Out"]:
    elements = driver.find_elements(By.XPATH, f"//*[contains(text(), '{word}')]")
    for el in elements:
        text = el.text.strip()
        if text and len(text) < 50:  # Short text only
            print(f"  <{el.tag_name}> '{text}'")

driver.quit()