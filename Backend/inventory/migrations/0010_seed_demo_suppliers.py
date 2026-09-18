# Demo supplier seed (Bangladesh pharmaceutical distributors).
#
# Uses get_or_create by name so existing supplier records are never modified
# or overwritten. All contact persons are fictional and phone numbers are in
# a reserved demo range.

from django.db import migrations


DEMO_SUPPLIERS = [
    {
        "name": "MediSource Dhaka",
        "company": "Square Pharmaceuticals Ltd.",
        "contact_person": "Arif Chowdhury",
        "phone": "01800-000101",
    },
    {
        "name": "Padma Pharma Distributors",
        "company": "Beximco Pharmaceuticals Ltd.",
        "contact_person": "Nasrin Sultana",
        "phone": "01800-000102",
    },
    {
        "name": "GreenLife Medicine Supply",
        "company": "Renata Pharmaceuticals Ltd.",
        "contact_person": "Tanvir Hasan",
        "phone": "01800-000103",
    },
    {
        "name": "Capital Drug House",
        "company": "Incepta Pharmaceuticals Ltd.",
        "contact_person": "Farhana Akter",
        "phone": "01800-000104",
    },
    {
        "name": "Jamuna Pharma Traders",
        "company": "ACI Healthcare Ltd.",
        "contact_person": "Mahmudul Karim",
        "phone": "01800-000105",
    },
    {
        "name": "Shastho Sheba Suppliers",
        "company": "Beacon Pharmaceuticals Ltd.",
        "contact_person": "Sharmin Rahman",
        "phone": "01800-000106",
    },
    {
        "name": "Evercare Medicine Corner",
        "company": "Opsonin Pharma Ltd.",
        "contact_person": "Rakib Hossain",
        "phone": "01800-000107",
    },
    {
        "name": "Northern Pharma Link",
        "company": "General Pharmaceuticals Ltd.",
        "contact_person": "Laila Farzana",
        "phone": "01800-000108",
    },
]


def seed_demo_suppliers(apps, schema_editor):
    Supplier = apps.get_model("inventory", "Supplier")
    for entry in DEMO_SUPPLIERS:
        Supplier.objects.get_or_create(
            name=entry["name"],
            defaults={
                "company": entry["company"],
                "contact_person": entry["contact_person"],
                "phone": entry["phone"],
                "is_active": True,
            },
        )


def remove_demo_suppliers(apps, schema_editor):
    Supplier = apps.get_model("inventory", "Supplier")
    Supplier.objects.filter(
        name__in=[entry["name"] for entry in DEMO_SUPPLIERS]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0009_supplier_company"),
    ]

    operations = [
        migrations.RunPython(
            seed_demo_suppliers, reverse_code=remove_demo_suppliers
        ),
    ]
