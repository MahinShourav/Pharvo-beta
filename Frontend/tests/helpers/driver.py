"""Shared Selenium web driver setup.

Uses Brave when the configured Brave executable exists.
Otherwise Selenium falls back to the installed Google Chrome browser.
"""
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options

from helpers import config


def create_driver():
    options = Options()

    brave_path = Path(config.BRAVE_BINARY)

    if brave_path.exists():
        options.binary_location = str(brave_path)

    if config.HEADLESS:
        options.add_argument("--headless=new")
        options.add_argument("--window-size=1920,1080")

    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(config.PAGE_LOAD_TIMEOUT)
    driver.implicitly_wait(config.IMPLICIT_WAIT)

    return driver