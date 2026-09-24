from django.contrib.auth import get_user_model
from rest_framework import serializers

from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'first_name',
            'last_name',
            'email',
            'role',
            'is_staff',
        ]


class SignupSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = [
            'username',
            'password',
            'first_name',
            'last_name',
            'email',
            'role',
        ]
        extra_kwargs = {
            'username': {'required': True},
            'password': {'write_only': True},
        }

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            email=validated_data.get('email', ''),
            role=validated_data.get('role', 'staff'),
            is_active=True,
            is_staff=False,
            is_superuser=False,
        )
        return user


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        # The login form promises "Email or Username", but SimpleJWT only
        # authenticates against USERNAME_FIELD. Try the value as a username
        # first; on failure, fall back to resolving it as an email address.
        try:
            data = super().validate(attrs)
        except AuthenticationFailed as original_error:
            login = str(attrs.get('username') or '').strip()
            if '@' not in login:
                raise
            try:
                user = User.objects.get(email__iexact=login)
            except (User.DoesNotExist, User.MultipleObjectsReturned):
                raise original_error
            data = super().validate({**attrs, 'username': user.get_username()})
        data['user'] = {
            'id': self.user.id,
            'username': self.user.username,
            'first_name': self.user.first_name,
            'last_name': self.user.last_name,
            'email': self.user.email,
            'role': self.user.role,
        }
        return data
