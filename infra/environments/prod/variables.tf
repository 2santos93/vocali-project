variable "github_repository" {
  description = "The repository allowed to assume the deployment role, written as it appears in the `sub` claim GitHub issues. No default: a wrong value is a role that somebody else's workflow can assume, and a placeholder here would be applied without anyone reading it. This account issues immutable claims, so the value carries the numeric ids: owner@1234/name@5678. Read them from the token rather than guessing; the deploy workflow prints them when it cannot assume the role."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._-]+(@[0-9]+)?/[A-Za-z0-9._-]+(@[0-9]+)?$", var.github_repository))
    error_message = "github_repository must be owner/name, optionally with the immutable ids as owner@1234/name@5678."
  }
}

variable "front_end_origins" {
  description = "Origins the browser uploads audio from beyond the distribution's own domain, which is now added automatically. It stays a variable because a custom domain is served by the same distribution under a different name, and the bucket has to be told about it separately, and because development is local against this same bucket, so http://localhost:3000 is passed here rather than written into the composition."
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for origin in var.front_end_origins :
      startswith(origin, "https://") || can(regex("^http://localhost(:[0-9]+)?$", origin))
    ])
    error_message = "Production origins must be https, or http://localhost for local development."
  }

  validation {
    condition     = alltrue([for origin in var.front_end_origins : can(regex("^https?://[^/]+$", origin))])
    error_message = "Each origin must be a scheme and host with no trailing path, such as https://app.example.com."
  }
}

variable "alarm_email_addresses" {
  description = "Addresses subscribed to the alert topic. Empty by default, because a subscription has to be confirmed by its recipient and an address committed to a repository outlives that person's involvement."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for address in var.alarm_email_addresses : can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", address))])
    error_message = "Every entry in alarm_email_addresses must be an email address."
  }
}
