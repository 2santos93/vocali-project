variable "name_prefix" {
  description = "Prefix shared by every resource in one environment, such as vocali-dev."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.name_prefix))
    error_message = "name_prefix must be 3-21 characters of lowercase letters, digits and hyphens."
  }
}

variable "user_pool_client_id" {
  description = "Cognito app client id. The authorizer accepts a token only if this is its audience, so a token minted for another client of the same pool is rejected."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]{16,64}$", var.user_pool_client_id))
    error_message = "user_pool_client_id must be a Cognito app client id: lowercase letters and digits."
  }
}

variable "user_pool_issuer_url" {
  description = "Issuer of every token the pool mints. The authorizer fetches the signing keys from this URL's discovery document."
  type        = string

  validation {
    condition     = can(regex("^https://cognito-idp\\.[a-z0-9-]+\\.amazonaws\\.com/[a-z0-9-]+_[A-Za-z0-9]+$", var.user_pool_issuer_url))
    error_message = "user_pool_issuer_url must be a Cognito issuer URL, such as https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_abc123. An issuer that is merely a valid URL would make the authorizer trust whoever serves it."
  }
}

variable "log_retention_days" {
  description = "How long the access log is kept. It records requests made against clinical records, so it expires rather than accumulating."
  type        = number
  default     = 14

  validation {
    condition = contains(
      [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653],
      var.log_retention_days
    )
    error_message = "log_retention_days must be one of the values CloudWatch accepts. Zero, meaning never expire, is deliberately not among them."
  }
}

variable "throttling_rate_limit" {
  description = "Steady-state requests per second the stage accepts before returning 429. A ceiling on what a runaway or hostile client can bill, not a capacity plan."
  type        = number
  default     = 50

  validation {
    condition     = var.throttling_rate_limit > 0 && var.throttling_rate_limit <= 10000
    error_message = "throttling_rate_limit must be between 1 and 10000. Zero would refuse every request, and above 10000 is the account default, which is no ceiling at all."
  }
}

variable "throttling_burst_limit" {
  description = "How many requests the stage lets through in a spike above the rate limit. A single page load makes several calls at once, so a burst below the rate would throttle ordinary use."
  type        = number
  default     = 100

  validation {
    condition     = var.throttling_burst_limit > 0 && var.throttling_burst_limit <= 5000
    error_message = "throttling_burst_limit must be between 1 and 5000."
  }
}
