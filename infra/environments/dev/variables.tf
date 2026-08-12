variable "front_end_origins" {
  description = "Origins the browser uploads audio from. Locally this is the Nuxt dev server; it becomes the CloudFront domain as well once the front end is deployed."
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
