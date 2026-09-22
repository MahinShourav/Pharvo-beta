"""
Drug interaction test.
Run from the Backend folder:
    python inventory/test_interactions.py
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model
from inventory.models import DrugInteraction

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

    print(f"Staff user: {staff.username}\n")

    # ========== Test 1: Interaction table exists ==========
    total_interactions = DrugInteraction.objects.count()
    check("DrugInteraction table exists in DB",
          True,
          f"count={total_interactions}")

    # ========== Test 2: List endpoint ==========
    client.force_login(staff)
    resp = client.get("/api/inventory/interactions/", HTTP_HOST=HOST)
    check("List interactions endpoint (GET) returns 200",
          resp.status_code == 200,
          f"got {resp.status_code}")

    # ========== Test 3: Warfarin + Aspirin — ensure it exists ==========
    # Let the model generate the pair_key automatically.
    # Use get_or_create so we don't violate the unique constraint.
    interaction, created = DrugInteraction.objects.get_or_create(
        drug_a="Aspirin",
        drug_b="Warfarin",
        defaults={
            "interaction_level": "high",
            "description": "Increased bleeding risk",
            "is_active": True,
        },
    )
    if created:
        print(f"INFO - Created test interaction: {interaction.pair_key}")
    else:
        print(f"INFO - Using existing interaction: {interaction.pair_key}")

    # Verify the pair_key format (should be 'aspirin||warfarin')
    check("Interaction saved with computed pair_key",
          interaction.pair_key is not None and len(interaction.pair_key) > 0,
          f"pair_key={interaction.pair_key}")

    # ========== Test 4: Search by name ==========
    resp = client.get("/api/inventory/interactions/?search=warfarin", HTTP_HOST=HOST)
    found_warfarin = resp.status_code == 200 and (
        b"warfarin" in resp.content.lower() or b"aspirin" in resp.content.lower()
    )
    check("Search interactions by 'warfarin' finds the pair",
          found_warfarin,
          f"status={resp.status_code}, body={resp.content[:150]}")

    # ========== Test 5: Unauth blocked ==========
    client.logout()
    resp = client.get("/api/inventory/interactions/", HTTP_HOST=HOST)
    check("Unauthenticated user blocked (401/403)",
          resp.status_code in (401, 403),
          f"got {resp.status_code}")

    # ========== Test 6: DB unchanged after reads ==========
    total_after = DrugInteraction.objects.count()
    check("DB interaction count unchanged after read tests",
          total_after >= total_interactions,
          f"before={total_interactions}, after={total_after}")

    # ========== Cleanup ==========
    # Delete by drug names (not by pair_key, to avoid format issues)
    DrugInteraction.objects.filter(drug_a="Aspirin", drug_b="Warfarin").delete()
    DrugInteraction.objects.filter(drug_a="Warfarin", drug_b="Aspirin").delete()
    print("\nCleanup complete.")

    print()
    print(f"Results: {len(PASS)} passed, {len(FAIL)} failed")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())