variable "front_end_origins" {
  description = "Origins the browser uploads audio from. Deliberately without a default: the front end is served from a CloudFront domain that does not exist yet, and a placeholder here would silently become the allow-list of a production bucket."
  type        = list(string)

  validation {
    condition     = length(var.front_end_origins) > 0
    error_message = "front_end_origins must list at least one origin, or no browser can upload."
  }

  validation {
    condition     = alltrue([for origin in var.front_end_origins : startswith(origin, "https://")])
    error_message = "Production origins must be https. A presigned upload policy travelling over plain HTTP is readable in transit."
  }

  validation {
    condition     = alltrue([for origin in var.front_end_origins : can(regex("^https://[^/]+$", origin))])
    error_message = "Each origin must be a scheme and host with no trailing path, such as https://app.example.com."
  }
}
