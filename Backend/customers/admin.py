from django.contrib import admin

from .models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "phone",
        "email",
        "loyalty_points",
        "diabetes_status",
        "bp_systolic",
        "bp_diastolic",
    )
    search_fields = ("name", "phone", "email")
