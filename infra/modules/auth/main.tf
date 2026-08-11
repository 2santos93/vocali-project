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

  # Stated rather than left out. Multi-factor authentication is not in the
  # scope of this platform, and a pool created with MFA off can be moved to
  # optional later without recreating it. Turning it on here without a way for
  # a user to enrol would lock the account out at first sign-in.
  mfa_configuration = "OFF"

  # Self-service sign-up. The alternative, admin-only creation, would mean no
  # user could register.
  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  account_recovery_setting {
    recovery_mechanism {
      # The only mechanism, and it is the address the user already proved they
      # control. No SMS fallback, which is the usual route into an account
      # takeover by number porting.
      name     = "verified_email"
      priority = 1
    }
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your verification code"
    email_message        = "Your verification code is {####}."
  }

  # Changing the address requires proving control of the new one first, so an
  # attacker holding a session cannot move the account to their own inbox and
  # then use the recovery flow.
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

  # Cognito's own sender, which is capped at a low daily volume and is fine
  # for this workload. A production tenant with real users would point this
  # at SES with a verified domain, which is a change of two arguments here.
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  deletion_protection = var.deletion_protection_enabled ? "ACTIVE" : "INACTIVE"

  tags = {
    Name = "${var.name_prefix}-users"
  }
}

# The client the Nuxt server talks to. It is confidential: it holds a secret,
# and it can hold one because it is only ever used server to server, from the
# BFF's Nitro routes. Nothing in this configuration is reachable from browser
# JavaScript.
resource "aws_cognito_user_pool_client" "bff" {
  name         = "${var.name_prefix}-bff"
  user_pool_id = aws_cognito_user_pool.this.id

  # Every call therefore carries a SECRET_HASH. A leaked client id on its own
  # is not enough to mount credential stuffing against the pool.
  generate_secret = true

  # USER_PASSWORD_AUTH because the credentials arrive at our own server, over
  # TLS, and are forwarded from there: SRP would buy nothing, since the
  # password is already in the BFF's memory by the time the exchange starts.
  # The admin flows are deliberately absent — they would tie authentication to
  # the function's IAM identity as well as to the client secret, and there is
  # nothing they do here that the plain flow does not.
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  # Sign-in failures come back as one indistinguishable error, so the endpoint
  # cannot be used to find out which addresses have accounts. For a medical
  # service the membership list is itself sensitive.
  prevent_user_existence_errors = "ENABLED"

  # Makes GlobalSignOut and RevokeToken actually end a session. Without it,
  # signing out only deletes the cookies while the refresh token keeps working
  # for whoever else has a copy.
  enable_token_revocation = true

  access_token_validity  = var.access_token_validity_minutes
  id_token_validity      = var.id_token_validity_minutes
  refresh_token_validity = var.refresh_token_validity_hours

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "hours"
  }

  # No hosted UI and no OAuth flows: sign-in is our own form posting to our
  # own server. That removes the callback and logout URL allow-lists, the
  # user pool domain, and the redirect handling that comes with them.
  allowed_oauth_flows_user_pool_client = false

  # The client can read whether the address is verified and can set it at
  # sign-up, and can do nothing else with the profile.
  read_attributes  = ["email", "email_verified"]
  write_attributes = ["email"]

  # How long an in-progress authentication challenge stays open, in minutes.
  auth_session_validity = 3
}
