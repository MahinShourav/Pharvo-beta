"""
Standalone CRM test.
Run from the Backend folder:
    python crm/test_crm.py
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model

User = get_user_model()

HOST = "localhost"

PASS = []
FAIL = []


def check(name, condition, detail=""):
    if condition:
        PASS.append(name)
        print(f"OK   - {name}")
    else:
        FAIL.append(name)
        print(f"FAIL - {name} {detail}")


def main():
    client = Client(SERVER_NAME=HOST)

    staff = User.objects.filter(is_staff=True).first()
    if not staff:
        print("No staff user found.")
        return 1
    client.force_login(staff)
    print(f"Logged in as: {staff.username}\n")

    # 1. List reminders
    resp = client.get("/api/crm/reminders/", HTTP_HOST=HOST)
    check("List reminders endpoint (GET)", resp.status_code == 200,
          f"got {resp.status_code}")

    # 2. Create reminder with missing required fields
    resp = client.post("/api/crm/reminders/",
                       data={"title": "Incomplete"},
                       content_type="application/json",
                       HTTP_HOST=HOST)
    check("Reject reminder without required fields",
          resp.status_code == 400,
          f"got {resp.status_code}")

    # 3. Create reminder with invalid customer ID
    resp = client.post("/api/crm/reminders/",
                       data={
                           "title": "Invalid customer",
                           "customer": 999999,
                           "message": "Should fail",
                           "remind_at": "2030-01-01T10:00:00Z",
                       },
                       content_type="application/json",
                       HTTP_HOST=HOST)
    check("Reject reminder with invalid customer",
          resp.status_code == 400,
          f"got {resp.status_code}")

    print()
    print(f"Results: {len(PASS)} passed, {len(FAIL)} failed")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())