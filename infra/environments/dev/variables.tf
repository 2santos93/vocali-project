variable "github_repository" {
  description = "The repository allowed to assume the deployment role, as owner/name. No default: a wrong value is a role that somebody else's workflow can assume, and a placeholder here would be applied without anyone reading it."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$", var.github_repository))
    error_message = "github_repository must be owner/name."
  }
}

variable "front_end_origins" {
  description = "Origins the browser uploads audio from, beyond the distribution's own domain, which is added automatically. Locally this is the Nuxt dev server."
  type        = list(string)
  default     = ["http://localhost:3000"]

  validation {
    condition     = length(var.front_end_origins) > 0
    error_message = "front_end_origins must list at least one origin, or no browser can upload."
  }

  validation {
    condition     = alltrue([for origin in var.front_end_origins : can(regex("^https?://[^/]+$", origin))])
    error_message = "Each origin must be a scheme and host with no trailing path, such as http://localhost:3000."
  }
}
