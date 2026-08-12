variable "project_name" {
  description = "Prefix for every resource name. Also used as the Project tag."
  type        = string
  default     = "vocali"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.project_name))
    error_message = "project_name must be 2-21 characters of lowercase letters, digits and hyphens, starting with a letter, because it becomes part of an S3 bucket name."
  }
}

variable "aws_region" {
  description = "Region holding the state bucket. Clinical audio and its transcripts stay in the EU, so the state that describes them does too."
  type        = string
  default     = "eu-west-1"

  validation {
    condition     = startswith(var.aws_region, "eu-")
    error_message = "aws_region must be an EU region."
  }
}

variable "state_version_retention_days" {
  description = "How long a superseded state file version is kept. Long enough to recover from a bad apply, short enough that the bucket does not grow without bound."
  type        = number
  default     = 90

  validation {
    condition     = var.state_version_retention_days >= 30 && var.state_version_retention_days <= 3650
    error_message = "state_version_retention_days must be between 30 and 3650. Below 30 there is no useful recovery window."
  }
}
