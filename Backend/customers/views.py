from django.contrib.auth import get_user_model
from django.db.models import Count, OuterRef, Q, Subquery, Sum
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsCustomer, IsPharmacyStaff
from crm.serializers import PurchaseHistorySerializer, ReminderSerializer
from sales.models import Sale

from .models import BloodPressureRecord, Customer, DiabetesRecord
from .serializers import (
    BloodPressureRecordSerializer,
    CustomerSerializer,
    DiabetesRecordSerializer,
    MyCustomerSerializer,
)


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    # Pharmacy staff (admin, pharmacist and legacy staff) may read and keep
    # customer information up to date. Delete and membership/tier changes
    # require administrator privileges (enforced below).
    permission_classes = [IsPharmacyStaff]

    @staticmethod
    def _is_membership_manager(user):
        return bool(
            user
            and (user.is_staff or getattr(user, "role", None) == get_user_model().Role.ADMIN)
        )

    def _assert_tier_allowed(self, serializer):
        data = getattr(serializer, "validated_data", serializer.initial_data)
        new_tier = (data.get("membership_tier") or "").strip()
        if not new_tier:
            # Not provided or explicitly a non-member: no tier assignment.
            return
        if CustomerViewSet._is_membership_manager(self.request.user):
            return
        instance = serializer.instance
        if instance and instance.membership_tier == new_tier:
            # Editing a customer while keeping their existing tier.
            return
        raise ValidationError(
            {
                "membership_tier": (
                    "Only administrators may change a customer's membership tier."
                )
            }
        )

    def perform_create(self, serializer):
        self._assert_tier_allowed(serializer)
        serializer.save()

    def perform_update(self, serializer):
        self._assert_tier_allowed(serializer)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        if not CustomerViewSet._is_membership_manager(request.user):
            return Response(
                {
                    "detail": (
                        "Pharmacists cannot delete customers. Contact an "
                        "administrator."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    def get_queryset(self):
        last_purchase_date = (
            Sale.objects.filter(customer_id=OuterRef("pk"))
            .order_by("-sale_date", "-created_at")
            .values("sale_date")[:1]
        )
        queryset = Customer.objects.annotate(
            total_purchases=Count("sales"),
            last_purchase_date=Subquery(last_purchase_date),
        )
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(phone__icontains=search) | Q(email__icontains=search)
            )
        return queryset


class MyCustomerView(APIView):
    """Return the logged-in customer's own profile (portal, read-only).

    The profile is resolved through the `Customer.user` link — never by a
    client-supplied ID or name, so one customer cannot read another's record
    by changing a URL or request parameter. When no link exists yet but
    exactly one unlinked customer row matches the login email, that row is
    claimed (linked) so the portal works without a manual database edit.
    """

    permission_classes = [IsAuthenticated, IsCustomer]

    @staticmethod
    def _resolve_customer(user):
        linked = Customer.objects.filter(user=user).first()
        if linked is not None:
            return linked
        email = (user.email or "").strip()
        if not email:
            return None
        candidates = list(
            Customer.objects.filter(email__iexact=email, user__isnull=True).values_list(
                "pk", flat=True
            )[:2]
        )
        if len(candidates) != 1:
            return None
        customer = Customer.objects.get(pk=candidates[0])
        customer.user = user
        customer.save(update_fields=["user"])
        return customer

    def get(self, request):
        customer = self._resolve_customer(request.user)
        if customer is None:
            return Response(
                {
                    "detail": (
                        "No customer profile is linked to this account yet. "
                        "Please ask the pharmacy to link your profile."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(MyCustomerSerializer(customer).data)


class MyCustomerSummaryView(APIView):
    """Customer's own membership tier and purchase totals (portal, read-only).

    Resolved server-side from the account link — the client supplies no ID,
    so a customer can only ever see their own totals.
    GET /api/customers/me/summary/
    """

    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request):
        customer = MyCustomerView._resolve_customer(request.user)
        if customer is None:
            return Response(
                {"detail": "No customer profile is linked to this account yet."},
                status=status.HTTP_404_NOT_FOUND,
            )
        total_purchases = customer.sales.count()
        total_spending = (
            customer.sales.aggregate(total=Sum("payable_amount"))["total"] or 0
        )
        try:
            tier_display = Customer.MembershipTier(customer.membership_tier).label
        except ValueError:
            tier_display = "Non-member"
        return Response(
            {
                "membership_tier": customer.membership_tier,
                "membership_tier_display": tier_display,
                "is_member": customer.is_member,
                "member_since": customer.member_since,
                "total_purchases": total_purchases,
                "total_spending": f"{total_spending:.2f}",
            }
        )


class MyCustomerPurchasesView(APIView):
    """Customer's own purchase history (portal, read-only).

    Resolved server-side from the account link — the client supplies no ID.
    GET /api/customers/me/purchases/
    """

    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request):
        customer = MyCustomerView._resolve_customer(request.user)
        if customer is None:
            return Response(
                {"detail": "No customer profile is linked to this account yet."},
                status=status.HTTP_404_NOT_FOUND,
            )
        sales = (
            customer.sales.select_related("user")
            .prefetch_related("items__product", "payments")
            .order_by("-created_at")[:20]
        )
        return Response(PurchaseHistorySerializer(sales, many=True).data)


class MyCustomerRemindersView(APIView):
    """Customer's own medicine reminders (portal, read-only).

    Resolved server-side from the account link — the client supplies no ID.
    GET /api/customers/me/reminders/
    """

    permission_classes = [IsAuthenticated, IsCustomer]

    def get(self, request):
        customer = MyCustomerView._resolve_customer(request.user)
        if customer is None:
            return Response(
                {"detail": "No customer profile is linked to this account yet."},
                status=status.HTTP_404_NOT_FOUND,
            )
        reminders = customer.reminders.select_related("product").order_by(
            "-is_active", "reminder_time"
        )[:20]
        return Response(ReminderSerializer(reminders, many=True).data)


class StaffCustomerLinkSearchView(APIView):
    """Staff search for customer profiles by email.

    GET /api/customers/link-search/?email=<address>
    Permission: pharmacy staff only.

    Returns every Customer row whose email matches (case-insensitive),
    with identifying details (phone/address) plus current link state, so
    staff can confirm the right profile. Matching is by email only —
    never by name alone.
    """

    permission_classes = [IsPharmacyStaff]

    def get(self, request):
        email = (request.query_params.get("email") or "").strip()
        if not email:
            return Response(
                {"detail": "Query parameter 'email' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        matches = (
            Customer.objects.filter(email__iexact=email)
            .select_related("user")
            .order_by("id")
        )
        results = []
        for customer in matches:
            linked_user = customer.user
            results.append(
                {
                    "id": customer.id,
                    "name": customer.name,
                    "email": customer.email,
                    "phone": customer.phone,
                    "address": customer.address,
                    "is_linked": linked_user is not None,
                    "linked_username": linked_user.username if linked_user else None,
                    "linked_user_email": linked_user.email if linked_user else None,
                    "linked_user_role": (
                        getattr(linked_user, "role", None) if linked_user else None
                    ),
                }
            )
        return Response({"count": len(results), "matches": results})


class StaffCustomerLinkView(APIView):
    """Staff-initiated link of a customer profile to a portal user account.

    POST /api/customers/link/
    Body: {"customer_id": <int>, "target_username": <str> (or "target_email"),
           "confirm": <bool, optional>}
    Permission: pharmacy staff only.

    Safety rules (enforced on the server):
    - The target of the link is an explicitly identified portal user
      account (by username or email). The link is NEVER assigned to
      ``request.user`` (the logged-in staff account).
    - The target account must have the ``customer`` role. Staff/admin
      accounts are rejected, which also blocks self-linking the staff
      session account.
    - One portal account maps to at most one customer profile: if the
      target account is already linked elsewhere, the request is
      rejected (no silent overwrite, no duplicates).
    - An existing link on the customer is never overwritten silently:
      re-linking a profile that already points at a different account
      requires ``"confirm": true`` and returns 409 otherwise.
    """

    permission_classes = [IsPharmacyStaff]

    @staticmethod
    def _resolve_target_user(target_username, target_email):
        UserModel = get_user_model()
        by_username = None
        by_email = None
        if target_username:
            by_username = UserModel.objects.filter(
                username=target_username
            ).first()
            if by_username is None:
                return None, Response(
                    {"detail": "Target portal account not found (username)."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        if target_email:
            email_matches = list(
                UserModel.objects.filter(email__iexact=target_email)
            )
            if not email_matches:
                return None, Response(
                    {"detail": "Target portal account not found (email)."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if len(email_matches) > 1:
                return None, Response(
                    {
                        "detail": (
                            "Multiple portal accounts share that email. "
                            "Identify the account by username instead."
                        )
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            by_email = email_matches[0]
        if by_username is not None and by_email is not None:
            if by_username.pk != by_email.pk:
                return None, Response(
                    {
                        "detail": (
                            "target_username and target_email refer to "
                            "different accounts. Identify one account."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return by_username, None
        target = by_username if by_username is not None else by_email
        if target is None:
            return None, Response(
                {
                    "detail": (
                        "Provide target_username or target_email to identify "
                        "the customer portal account."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return target, None

    def post(self, request):
        customer_id = request.data.get("customer_id")
        target_username = (request.data.get("target_username") or "").strip() or None
        target_email = (request.data.get("target_email") or "").strip() or None
        confirm = request.data.get("confirm", False)

        if customer_id is None:
            return Response(
                {"detail": "customer_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            customer = Customer.objects.select_related("user").get(pk=customer_id)
        except (Customer.DoesNotExist, ValueError, TypeError):
            return Response(
                {"detail": "Customer profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        target, error = self._resolve_target_user(target_username, target_email)
        if error is not None:
            return error

        UserModel = get_user_model()
        # The portal account must belong to a customer. This rejects
        # admin/pharmacist accounts — including the staff member's own
        # session account — so staff can never link a profile to themselves.
        if getattr(target, "role", None) != UserModel.Role.CUSTOMER:
            return Response(
                {
                    "detail": (
                        "Target account is not a customer portal account "
                        "(role must be 'customer')."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target.pk == request.user.pk:
            return Response(
                {
                    "detail": (
                        "Refusing to link a customer profile to the staff "
                        "session account. Identify the customer's own portal "
                        "account instead."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Duplicate prevention: one portal account -> at most one profile.
        other = (
            Customer.objects.filter(user=target).exclude(pk=customer.pk).first()
        )
        if other is not None:
            return Response(
                {
                    "detail": (
                        f"Portal account '{target.username}' is already linked "
                        f"to customer profile #{other.pk} ('{other.name}'). "
                        "Unlink it there first; links are never duplicated."
                    ),
                    "linked_customer_id": other.pk,
                },
                status=status.HTTP_409_CONFLICT,
            )

        current = customer.user
        if current is not None and current.pk == target.pk:
            return Response(
                {
                    "detail": "Customer profile is already linked to that portal account.",
                    "customer_id": customer.pk,
                    "linked_username": target.username,
                    "already_linked": True,
                },
                status=status.HTTP_200_OK,
            )
        if current is not None and not confirm:
            return Response(
                {
                    "detail": (
                        f"Customer profile #{customer.pk} ('{customer.name}') is "
                        f"already linked to portal account '{current.username}'. "
                        "Re-run with \"confirm\": true to overwrite the link."
                    ),
                    "customer_id": customer.pk,
                    "current_linked_username": current.username,
                    "requires_confirmation": True,
                },
                status=status.HTTP_409_CONFLICT,
            )

        customer.user = target
        customer.save(update_fields=["user"])
        return Response(
            {
                "detail": (
                    f"Customer profile #{customer.pk} ('{customer.name}') linked "
                    f"to portal account '{target.username}'."
                ),
                "customer_id": customer.pk,
                "linked_username": target.username,
                "was_relinked": current is not None,
            },
            status=status.HTTP_200_OK,
        )


class DiabetesRecordListCreateView(APIView):
    """List or create diabetes records for a customer.
    GET /api/customers/me/diabetes-records/
    POST /api/customers/me/diabetes-records/
    Permission: IsPharmacyStaff for write, IsCustomer|IsAuthenticated for read.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Anyone authenticated can see the list, but only staff can add
        customer = MyCustomerView._resolve_customer(request.user)
        if customer is None:
            return Response(
                {"detail": "No customer profile linked."},
                status=status.HTTP_404_NOT_FOUND,
            )
        records = customer.diabetes_records.all()[:10]
        serializer = DiabetesRecordSerializer(records, many=True)
        return Response(serializer.data)

    def post(self, request):
        # Only pharmacy staff can create records
        if not IsPharmacyStaff().has_permission(request, self):
            return Response(
                {"detail": "Pharmacy staff access required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        customer = MyCustomerView._resolve_customer(request.user)
        if customer is None:
            return Response(
                {"detail": "No customer profile linked."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = DiabetesRecordSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(customer=customer)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DiabetesRecordUpdateDeleteView(APIView):
    """Update or delete a specific diabetes record.
    PUT/PATCH /api/customers/me/diabetes-records/{id}/
    DELETE /api/customers/me/diabetes-records/{id}/
    Permission: IsPharmacyStaff for write.
    """

    permission_classes = [IsAuthenticated]

    def _get_record(self, record_id):
        try:
            return DiabetesRecord.objects.get(id=record_id)
        except DiabetesRecord.DoesNotExist:
            raise ValidationError({"detail": "Diabetes record not found."})

    def put(self, request, record_id):
        if not IsPharmacyStaff().has_permission(request, self):
            return Response(
                {"detail": "Pharmacy staff access required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        record = self._get_record(record_id)
        serializer = DiabetesRecordSerializer(record, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, record_id):
        if not IsPharmacyStaff().has_permission(request, self):
            return Response(
                {"detail": "Pharmacy staff access required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        record = self._get_record(record_id)
        serializer = DiabetesRecordSerializer(record, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, record_id):
        if not IsPharmacyStaff().has_permission(request, self):
            return Response(
                {"detail": "Pharmacy staff access required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        record = self._get_record(record_id)
        record.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class BloodPressureRecordListCreateView(APIView):
    """List or create blood pressure records for a customer.
    GET /api/customers/me/blood-pressure-records/
    POST /api/customers/me/blood-pressure-records/
    Permission: IsPharmacyStaff for write, IsCustomer|IsAuthenticated for read.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        customer = MyCustomerView._resolve_customer(request.user)
        if customer is None:
            return Response(
                {"detail": "No customer profile linked."},
                status=status.HTTP_404_NOT_FOUND,
            )
        records = customer.blood_pressure_records.all()[:10]
        serializer = BloodPressureRecordSerializer(records, many=True)
        return Response(serializer.data)

    def post(self, request):
        if not IsPharmacyStaff().has_permission(request, self):
            return Response(
                {"detail": "Pharmacy staff access required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        customer = MyCustomerView._resolve_customer(request.user)
        if customer is None:
            return Response(
                {"detail": "No customer profile linked."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = BloodPressureRecordSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(customer=customer)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class BloodPressureRecordUpdateDeleteView(APIView):
    """Update or delete a specific blood pressure record.
    PUT/PATCH /api/customers/me/blood-pressure-records/{id}/
    DELETE /api/customers/me/blood-pressure-records/{id}/
    Permission: IsPharmacyStaff for write.
    """

    permission_classes = [IsAuthenticated]

    def _get_record(self, record_id):
        try:
            return BloodPressureRecord.objects.get(id=record_id)
        except BloodPressureRecord.DoesNotExist:
            raise ValidationError({"detail": "Blood pressure record not found."})

    def put(self, request, record_id):
        if not IsPharmacyStaff().has_permission(request, self):
            return Response(
                {"detail": "Pharmacy staff access required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        record = self._get_record(record_id)
        serializer = BloodPressureRecordSerializer(record, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, record_id):
        if not IsPharmacyStaff().has_permission(request, self):
            return Response(
                {"detail": "Pharmacy staff access required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        record = self._get_record(record_id)
        serializer = BloodPressureRecordSerializer(record, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, record_id):
        if not IsPharmacyStaff().has_permission(request, self):
            return Response(
                {"detail": "Pharmacy staff access required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        record = self._get_record(record_id)
        record.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)