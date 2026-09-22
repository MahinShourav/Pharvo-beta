"""
Responsive UI test — mobile and desktop layouts.
Saves screenshots to QA/screenshots/.
Run from the Frontend/tests folder:
    python test_responsive_ui.py
"""
import os
import unittest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE_URL = "http://localhost:5173"

# QA/screenshots directory (two levels up from Frontend/tests)
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCREENSHOT_DIR = os.path.join(ROOT_DIR, "QA", "screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)


def make_driver():
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(30)
    return driver


def login(driver):
    driver.get(f"{BASE_URL}/login")
    driver.find_element(By.NAME, "username").send_keys("rafi")
    driver.find_element(By.NAME, "password").send_keys("787878")
    driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
    WebDriverWait(driver, 15).until(EC.url_contains("/dashboard"))


class TestResponsiveUI(unittest.TestCase):

    def setUp(self):
        self.driver = make_driver()

    def tearDown(self):
        self.driver.quit()

    def test_mobile_login_layout(self):
        self.driver.set_window_size(390, 844)
        self.driver.get(f"{BASE_URL}/login")
        # Wait for the login form to render
        WebDriverWait(self.driver, 15).until(
            EC.presence_of_element_located((By.NAME, "username"))
        )
        username = self.driver.find_element(By.NAME, "username")
        password = self.driver.find_element(By.NAME, "password")
        button = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
        self.assertTrue(username.is_displayed())
        self.assertTrue(password.is_displayed())
        self.assertTrue(button.is_displayed())
        self.driver.save_screenshot(
            os.path.join(SCREENSHOT_DIR, "mobile-login.png")
        )

    def test_mobile_dashboard_no_horizontal_overflow(self):
        self.driver.set_window_size(390, 844)
        login(self.driver)
        scroll_width = self.driver.execute_script(
            "return document.documentElement.scrollWidth"
        )
        client_width = self.driver.execute_script(
            "return document.documentElement.clientWidth"
        )
        self.driver.save_screenshot(
            os.path.join(SCREENSHOT_DIR, "mobile-dashboard.png")
        )
        self.assertLessEqual(
            scroll_width,
            client_width + 5,
            f"Horizontal overflow: scrollWidth={scroll_width}, clientWidth={client_width}",
        )

    def test_desktop_dashboard_layout(self):
        self.driver.set_window_size(1366, 768)
        login(self.driver)
        body = self.driver.find_element(By.TAG_NAME, "body").text.lower()
        self.assertIn("dashboard", body)
        self.driver.save_screenshot(
            os.path.join(SCREENSHOT_DIR, "desktop-dashboard.png")
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)