data "aws_region" "current" {}

resource "aws_cognito_user_pool" "this" {
  name = "${var.name_prefix}-users"

  # The email is the username. There is no separate handle to remember, and
  # no second identifier that could drift out of step with the verified
  # address.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    # Otherwise Ana@example.com and ana@example.com are two accounts.
    case_sensitive = false
  }

  password_policy {
    minimum_length                   = var.password_minimum_length
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  mfa_configuration = "OFF"

  # Self-service sign-up. The alternative, admin-only creation, would mean no
  # user could register.
  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your verification code"
    email_message        = "Your verification code is {####}."
  }

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 5
      max_length = 254
    }
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  deletion_protection = var.deletion_protection_enabled ? "ACTIVE" : "INACTIVE"

  tags = {
    Name = "${var.name_prefix}-users"
  }
}

resource "aws_cognito_user_pool_client" "bff" {
  name         = "${var.name_prefix}-bff"
  user_pool_id = aws_cognito_user_pool.this.id

  # Every call therefore carries a SECRET_HASH. A leaked client id on its own
  # is not enough to mount credential stuffing against the pool.
  generate_secret = true

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED"

  enable_token_revocation = true

  access_token_validity  = var.access_token_validity_minutes
  id_token_validity      = var.id_token_validity_minutes
  refresh_token_validity = var.refresh_token_validity_hours

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "hours"
  }

  allowed_oauth_flows_user_pool_client = false

  # The client can read whether the address is verified and can set it at
  # sign-up, and can do nothing else with the profile.
  read_attributes  = ["email", "email_verified"]
  write_attributes = ["email"]

  # How long an in-progress authentication challenge stays open, in minutes.
  auth_session_validity = 3
}
