"""
Frontend Selenium test runner.
Run from the Frontend/tests folder:
    python run_all_tests.py
"""
import os
import subprocess
import sys

TESTS = [
    "test_navigation.py",
    "test_auth.py",
    "test_logout.py",
    "test_customers.py",
    "test_medicines.py",
    "test_crm.py",
    "test_pos.py",
    "test_orders.py",
    "test_dashboard.py",
    "test_reports.py",
    "test_notifications_settings.py",
    "test_responsive_ui.py",
]

HERE = os.path.dirname(os.path.abspath(__file__))
passed = 0
failed = 0

for test in TESTS:
    path = os.path.join(HERE, test)
    if not os.path.exists(path):
        print(f"SKIP: {test} (not found)")
        continue

    print(f"\n{'='*60}")
    print(f"RUNNING: {test}")
    print(f"{'='*60}")
    result = subprocess.run([sys.executable, path], cwd=HERE)
    if result.returncode == 0:
        print(f"PASS: {test}")
        passed += 1
    else:
        print(f"FAIL: {test}")
        failed += 1

print(f"\n{'='*60}")
print(f"RESULT: {passed} passed, {failed} failed")
print(f"{'='*60}")
sys.exit(1 if failed else 0)