from datetime import date

from rest_framework import serializers

from .models import Customer, DiabetesRecord, BloodPressureRecord


def _inactive_after_days():
    return 90


class DiabetesRecordSerializer(serializers.ModelSerializer):
    """Serializer for a single diabetes record."""

    class Meta:
        model = DiabetesRecord
        fields = [
            "id",
            "diabetes_status",
            "diabetes_type",
            "recorded_date",
            "notes",
            "created_at",
        ]


class BloodPressureRecordSerializer(serializers.ModelSerializer):
    """Serializer for a single blood pressure record."""

    class Meta:
        model = BloodPressureRecord
        fields = [
            "id",
            "systolic",
            "diastolic",
            "recorded_date",
            "notes",
            "created_at",
        ]


class CustomerSerializer(serializers.ModelSerializer):
    is_member = serializers.SerializerMethodField()
    total_purchases = serializers.IntegerField(read_only=True, default=0)
    last_purchase = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id",
            "name",
            "phone",
            "email",
            "address",
            "date_of_birth",
            "notes",
            "membership_tier",
            "member_since",
            "is_member",
            "loyalty_points",
            "user",
            "diabetes_status",
            "diabetes_type",
            "diabetes_recorded_date",
            "bp_systolic",
            "bp_diastolic",
            "bp_recorded_date",
            "health_notes",
            "total_purchases",
            "last_purchase",
            "status",
            "created_at",
        ]
        read_only_fields = ["created_at", "total_purchases", "last_purchase", "status"]

    def get_is_member(self, obj):
        return obj.is_member

    def get_last_purchase(self, obj):
        last = getattr(obj, "last_purchase_date", None)
        return last.isoformat() if last else None

    def get_diabetes_records(self, obj):
        records = obj.diabetes_records.all()[:5]
        return DiabetesRecordSerializer(records, many=True).data

    def get_blood_pressure_records(self, obj):
        records = obj.blood_pressure_records.all()[:5]
        return BloodPressureRecordSerializer(records, many=True).data

    def get_status(self, obj):
        total = getattr(obj, "total_purchases", 0) or 0
        last = getattr(obj, "last_purchase_date", None)
        if total == 0 or last is None:
            return "New"
        days = (date.today() - last).days
        return "Active" if days <= _inactive_after_days() else "Inactive"

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Customer name cannot be blank.")
        return name

    def validate_phone(self, value):
        phone = value.strip()
        if not phone:
            raise serializers.ValidationError("Phone number cannot be blank.")
        if len(phone) > 20:
            raise serializers.ValidationError("Phone number cannot exceed 20 characters.")
        return phone

    def validate_email(self, value):
        email = value.strip()
        if not email:
            raise serializers.ValidationError("Email cannot be blank.")
        return email

    def validate_address(self, value):
        address = value.strip()
        if not address:
            raise serializers.ValidationError("Address cannot be blank.")
        return address

    def validate_loyalty_points(self, value):
        if value < 0:
            raise serializers.ValidationError("Loyalty points cannot be negative.")
        return value

    def validate_membership_tier(self, value):
        valid_tiers = {tier for tier, _ in Customer.MembershipTier.choices}
        if value not in valid_tiers:
            raise serializers.ValidationError(
                f"Membership tier must be one of: {', '.join(sorted(valid_tiers)) or 'non-member'}."
            )
        return value

    def validate_date_of_birth(self, value):
        if value is not None and value > date.today():
            raise serializers.ValidationError("Date of birth cannot be in the future.")
        return value

    def validate_bp_recorded_date(self, value):
        if value is not None and value > date.today():
            raise serializers.ValidationError(
                "Blood pressure recorded date cannot be in the future."
            )
        return value

    def validate_diabetes_recorded_date(self, value):
        if value is not None and value > date.today():
            raise serializers.ValidationError(
                "Diabetes recorded date cannot be in the future."
            )
        return value

    def validate(self, attrs):
        # Blood pressure is stored as two integer fields. Accept both or
        # neither; reject physiologically impossible readings. Partial updates
        # only validate the fields actually supplied.
        systolic = attrs.get("bp_systolic", None)
        diastolic = attrs.get("bp_diastolic", None)
        if self.instance is not None:
            if systolic is None and "bp_systolic" not in attrs:
                systolic = self.instance.bp_systolic
            if diastolic is None and "bp_diastolic" not in attrs:
                diastolic = self.instance.bp_diastolic
        if (systolic is None) != (diastolic is None):
            raise serializers.ValidationError(
                {
                    "bp_systolic": (
                        "Both systolic and diastolic readings are required together. "
                        "Clear both fields to remove the reading."
                    )
                }
            )
        if systolic is not None and diastolic is not None:
            if not 50 <= systolic <= 300:
                raise serializers.ValidationError(
                    {"bp_systolic": "Systolic reading must be between 50 and 300."}
                )
            if not 30 <= diastolic <= 250:
                raise serializers.ValidationError(
                    {"bp_diastolic": "Diastolic reading must be between 30 and 250."}
                )
            if systolic <= diastolic:
                raise serializers.ValidationError(
                    {
                        "bp_systolic": (
                            "Systolic reading must be greater than the diastolic reading."
                        )
                    }
                )
        return attrs


class MyCustomerSerializer(serializers.ModelSerializer):
    """Limited read-only view of a customer's own profile for the portal.

    Exposes only the customer's own contact details and staff-recorded
    health details — never loyalty points or other customers' data.
    """

    diabetes_records = DiabetesRecordSerializer(many=True, read_only=True)
    blood_pressure_records = BloodPressureRecordSerializer(many=True, read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id",
            "name",
            "phone",
            "email",
            "address",
            "date_of_birth",
            "member_since",
            "diabetes_status",
            "diabetes_type",
            "diabetes_recorded_date",
            "bp_systolic",
            "bp_diastolic",
            "bp_recorded_date",
            "health_notes",
            "diabetes_records",
            "blood_pressure_records",
        ]
        read_only_fields = fields
