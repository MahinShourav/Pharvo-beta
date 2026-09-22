"""
Notifications API test.
Run from the Backend folder:
    python notifications/test_notifications.py
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model
from notifications.models import Notification

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
        print("FAIL: No staff user found")
        return 1
    client.force_login(staff)
    print(f"Logged in as: {staff.username}\n")

    # ========== 1. List notifications ==========
    resp = client.get("/api/notifications/", HTTP_HOST=HOST)
    check("List notifications endpoint (GET) returns 200",
          resp.status_code == 200,
          f"got {resp.status_code}")

    items = []
    if resp.status_code == 200:
        data = resp.json()
        items = data["results"] if isinstance(data, dict) and "results" in data else data
        print(f"INFO - Notification count: {len(items)}")

    # ========== 2. Unread count ==========
    resp = client.get("/api/notifications/unread-count/", HTTP_HOST=HOST)
    check("Unread count endpoint returns 200",
          resp.status_code == 200,
          f"got {resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        check("Unread count response has 'unread_count'",
              "unread_count" in data,
              f"keys={list(data.keys())}")

        # Compare to DB
        db_unread = Notification.objects.filter(is_read=False).count()
        api_unread = data.get("unread_count")
        check(f"Unread count matches DB ({db_unread})",
              api_unread == db_unread,
              f"api={api_unread}, db={db_unread}")

    # ========== 3. Retrieve a single notification (if any exist) ==========
    if items:
        first_id = items[0].get("id")
        resp = client.get(f"/api/notifications/{first_id}/", HTTP_HOST=HOST)
        check("Retrieve single notification (GET)",
              resp.status_code == 200,
              f"got {resp.status_code}")

        # ========== 4. Mark as read (custom action) ==========
        was_read = items[0].get("is_read", False)

        resp = client.patch(f"/api/notifications/{first_id}/read/",
                            content_type="application/json",
                            HTTP_HOST=HOST)
        check("Mark-as-read action (PATCH .../read/) returns 200",
              resp.status_code == 200,
              f"got {resp.status_code}")

        if resp.status_code == 200:
            data = resp.json()
            check("Marked notification is_read = True",
                  data.get("is_read") is True,
                  f"is_read={data.get('is_read')}")

            # Verify DB
            n = Notification.objects.get(id=first_id)
            check("DB reflects notification as read",
                  n.is_read is True,
                  f"is_read={n.is_read}")

            # Restore previous state
            if not was_read:
                n.is_read = False
                n.save(update_fields=["is_read"])
    else:
        print("WARN - No notifications in DB; skipping single/read tests")

    # ========== 5. Mark all as read ==========
    resp = client.post("/api/notifications/mark-all-read/",
                       content_type="application/json",
                       HTTP_HOST=HOST)
    check("Mark-all-read action returns 200",
          resp.status_code == 200,
          f"got {resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        check("Response contains 'marked_read'",
              "marked_read" in data,
              f"keys={list(data.keys())}")

        remaining = Notification.objects.filter(is_read=False).count()
        check("No unread notifications remain after mark-all-read",
              remaining == 0,
              f"remaining unread={remaining}")

    # ========== 6. Permissions ==========
    client.logout()
    resp = client.get("/api/notifications/", HTTP_HOST=HOST)
    check("Unauthenticated request blocked (401/403)",
          resp.status_code in (401, 403),
          f"got {resp.status_code}")

    # ========== 7. Invalid notification ID ==========
    client.force_login(staff)
    resp = client.get("/api/notifications/99999999/", HTTP_HOST=HOST)
    check("Invalid notification ID returns 404",
          resp.status_code == 404,
          f"got {resp.status_code}")

    print()
    print(f"Results: {len(PASS)} passed, {len(FAIL)} failed")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())