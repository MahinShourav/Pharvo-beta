from accounts.models import User

USERS = [
    ("qa_admin", "admin", True),
    ("qa_pharmacist", "pharmacist", False),
    ("qa_customer", "customer", False),
]

PASSWORD = "QaTest123!"

for username, role, is_staff in USERS:
    user, _ = User.objects.get_or_create(username=username)
    user.role = role
    user.is_active = True
    user.is_staff = is_staff
    user.set_password(PASSWORD)
    user.save()
    print(f"READY: {username} -> {role}")