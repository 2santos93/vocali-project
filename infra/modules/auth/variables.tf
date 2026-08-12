variable "name_prefix" {
  description = "Prefix shared by every resource in one environment, such as vocali-dev."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.name_prefix))
    error_message = "name_prefix must be 3-31 characters of lowercase letters, digits and hyphens, starting with a letter."
  }
}

variable "password_minimum_length" {
  description = "Minimum password length. Length is the only password rule that reliably buys entropy, so it is set well above the Cognito default of 8."
  type        = number
  default     = 12

  validation {
    condition     = var.password_minimum_length >= 12 && var.password_minimum_length <= 99
    error_message = "password_minimum_length must be between 12 and 99. Cognito accepts 6, but a clinical platform should not."
  }
}

variable "access_token_validity_minutes" {
  description = "Lifetime of the access token the API authorizer accepts. Short, because there is no way to revoke one before it expires."
  type        = number
  default     = 15

  validation {
    condition     = var.access_token_validity_minutes >= 5 && var.access_token_validity_minutes <= 60
    error_message = "access_token_validity_minutes must be between 5 (the Cognito minimum) and 60. Anything longer outlives its own revocation."
  }
}

variable "id_token_validity_minutes" {
  description = "Lifetime of the identity token. Matched to the access token so a session has one expiry rather than two."
  type        = number
  default     = 15

  validation {
    condition     = var.id_token_validity_minutes >= 5 && var.id_token_validity_minutes <= 60
    error_message = "id_token_validity_minutes must be between 5 and 60."
  }
}

variable "refresh_token_validity_hours" {
  description = "Lifetime of the refresh token, which is what decides how long a session survives without signing in again."
  type        = number
  default     = 8

  validation {
    condition     = var.refresh_token_validity_hours >= 1 && var.refresh_token_validity_hours <= 168
    error_message = "refresh_token_validity_hours must be between 1 and 168 (one week). Cognito allows ten years; a stolen session cookie should not be worth that."
  }
}

variable "deletion_protection_enabled" {
  description = "Whether the user pool refuses to be deleted. Deleting a pool deletes every account in it, and the accounts are not in the state file."
  type        = bool
  default     = true
}
