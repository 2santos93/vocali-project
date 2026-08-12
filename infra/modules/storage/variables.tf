variable "audio_bucket_name" {
  description = "Bucket receiving the browser's direct upload. S3 bucket names are global, so this has to be unique across all of AWS."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.audio_bucket_name))
    error_message = "audio_bucket_name must be 3-63 characters of lowercase letters, digits, dots and hyphens, starting and ending with a letter or digit."
  }
}

variable "transcripts_bucket_name" {
  description = "Bucket holding the finished transcripts, in both text and JSON."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.transcripts_bucket_name))
    error_message = "transcripts_bucket_name must be 3-63 characters of lowercase letters, digits, dots and hyphens, starting and ending with a letter or digit."
  }
}

variable "cors_allowed_origins" {
  description = "Origins allowed to post an upload directly to the audio bucket. One entry per front-end origin, scheme included."
  type        = list(string)

  validation {
    condition     = length(var.cors_allowed_origins) > 0
    error_message = "cors_allowed_origins must list at least one origin, otherwise the browser upload cannot work."
  }

  validation {
    condition     = alltrue([for origin in var.cors_allowed_origins : can(regex("^https?://[^/]+$", origin))])
    error_message = "Each origin must be a scheme and host with no trailing path, such as https://app.example.com."
  }

  validation {
    condition     = !contains(var.cors_allowed_origins, "*")
    error_message = "A wildcard origin would let any site on the internet drive an upload with a stolen policy. List the front-end origins explicitly."
  }
}

variable "audio_retention_days" {
  description = "How long raw uploaded audio is kept before S3 deletes it. The transcript is the product; the audio is an input that has already been consumed."
  type        = number
  default     = 30

  validation {
    condition     = var.audio_retention_days >= 1 && var.audio_retention_days <= 365
    error_message = "audio_retention_days must be between 1 and 365. Clinical audio should not be kept for a year without a documented reason."
  }
}

variable "noncurrent_version_retention_days" {
  description = "How long a superseded or deleted object version survives. Versioning is what makes a wrong delete recoverable; this bounds what that costs."
  type        = number
  default     = 30

  validation {
    condition     = var.noncurrent_version_retention_days >= 1 && var.noncurrent_version_retention_days <= 365
    error_message = "noncurrent_version_retention_days must be between 1 and 365."
  }
}

variable "kms_key_arn" {
  description = "Customer-managed key for both buckets. Null uses SSE-S3, which encrypts every object with AES-256 under a key AWS manages."
  type        = string
  default     = null

  validation {
    condition     = var.kms_key_arn == null || can(regex("^arn:aws[a-z-]*:kms:", var.kms_key_arn))
    error_message = "kms_key_arn must be a KMS key ARN or null."
  }
}

variable "force_destroy" {
  description = "Whether a bucket can be destroyed while it still holds objects. True only makes sense for a throwaway environment."
  type        = bool
  default     = false
}
