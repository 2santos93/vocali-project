variable "name_prefix" {
  description = "Prefix shared by every resource in one environment, such as vocali-dev."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.name_prefix))
    error_message = "name_prefix must be 3-21 characters of lowercase letters, digits and hyphens."
  }
}

variable "function_names" {
  description = "Logical name to deployed function name. Each becomes one metric inside the error and throttle alarms, so a function absent from this map is a function nothing watches."
  type        = map(string)

  validation {
    condition     = length(var.function_names) > 0
    error_message = "function_names must name at least one function."
  }

  validation {
    # A CloudWatch metric-math alarm takes at most ten elements, and each of
    # these alarms spends one on the expression that sums the rest.
    condition     = length(var.function_names) <= 9
    error_message = "function_names must hold at most nine functions. A metric-math alarm accepts ten elements and one of them is the sum."
  }
}

variable "dead_letter_queue_name" {
  description = "Queue holding asynchronous invocations Lambda gave up on. Its depth is the alarm that matters most here, because nothing else makes an undelivered upload event visible."
  type        = string

  validation {
    condition     = length(var.dead_letter_queue_name) > 0
    error_message = "dead_letter_queue_name must be set."
  }
}

variable "api_id" {
  description = "The HTTP API whose 5xx rate is watched. It is the dimension of the metric, so a wrong value produces an alarm that never fires."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]{6,32}$", var.api_id))
    error_message = "api_id must be an API Gateway API id."
  }
}

variable "alarm_email_addresses" {
  description = "Addresses subscribed to the alert topic. Empty by default: a subscription has to be confirmed by the recipient, and an address committed to a repository outlives the person's involvement with the project."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for address in var.alarm_email_addresses : can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", address))])
    error_message = "Every entry in alarm_email_addresses must be an email address."
  }
}

variable "period_seconds" {
  description = "Window each alarm evaluates. Five minutes is short enough to notice within a working session and long enough that a single slow minute does not fire anything."
  type        = number
  default     = 300

  validation {
    condition     = contains([60, 300, 900, 3600], var.period_seconds)
    error_message = "period_seconds must be 60, 300, 900 or 3600. Other values are accepted by CloudWatch at a higher price and buy nothing here."
  }
}

variable "error_threshold" {
  description = "How many errors in one window are worth raising. One, by default: every expected failure in this application is a returned result and a 4xx, so an error metric means an exception escaped."
  type        = number
  default     = 1

  validation {
    condition     = var.error_threshold >= 1
    error_message = "error_threshold must be at least 1. Zero would make the alarm fire on a period with no errors at all."
  }
}

variable "throttle_threshold" {
  description = "How many throttled invocations in one window are worth raising."
  type        = number
  default     = 1

  validation {
    condition     = var.throttle_threshold >= 1
    error_message = "throttle_threshold must be at least 1."
  }
}
