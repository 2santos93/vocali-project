variable "name_prefix" {
  description = "Prefix shared by every resource in one environment, such as vocali-dev."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.name_prefix))
    error_message = "name_prefix must be 3-21 characters of lowercase letters, digits and hyphens."
  }
}

variable "stage_name" {
  description = "The single stage. A websocket API has no $default stage, so this name is part of every URL the browser dials and every ARN a ManageConnections grant names."
  type        = string
  default     = "live"

  validation {
    condition     = can(regex("^[a-zA-Z0-9_-]{1,128}$", var.stage_name))
    error_message = "stage_name must be 1-128 characters of letters, digits, underscores and hyphens."
  }
}

variable "log_retention_days" {
  description = "How long the access log is kept. It records connections opened against clinical records, so it expires rather than accumulating."
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
  description = "Steady-state connects and messages per second the stage accepts. A ceiling on what a client reconnecting in a loop can bill, not a capacity plan."
  type        = number
  default     = 50

  validation {
    condition     = var.throttling_rate_limit > 0 && var.throttling_rate_limit <= 10000
    error_message = "throttling_rate_limit must be between 1 and 10000."
  }
}

variable "throttling_burst_limit" {
  description = "How many connects the stage lets through in a spike above the rate limit. A tab restored on browser startup reconnects alongside every other restored tab."
  type        = number
  default     = 100

  validation {
    condition     = var.throttling_burst_limit > 0 && var.throttling_burst_limit <= 5000
    error_message = "throttling_burst_limit must be between 1 and 5000."
  }
}
