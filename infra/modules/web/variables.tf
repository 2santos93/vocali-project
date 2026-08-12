variable "name_prefix" {
  description = "Prefix shared by every resource in one environment, such as vocali-dev."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.name_prefix))
    error_message = "name_prefix must be 3-21 characters of lowercase letters, digits and hyphens."
  }
}

variable "assets_bucket_name" {
  description = "Bucket holding the built front-end assets. Globally unique, so it carries the account id like the other buckets here."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.assets_bucket_name))
    error_message = "assets_bucket_name must be a valid S3 bucket name."
  }
}

variable "nuxt_output_dir" {
  description = "The Nuxt build output, normally apps/web/.output. The server bundle beneath it is what the renderer is deployed from, and its absence fails the plan rather than deploying an empty function."
  type        = string

  validation {
    condition     = length(var.nuxt_output_dir) > 0
    error_message = "nuxt_output_dir must be set."
  }
}

variable "environment_variables" {
  description = "Configuration for the renderer. Values only: anything the renderer must keep secret is a Parameter Store path here and a SecureString there."
  type        = map(string)
  default     = {}

  validation {
    # A guard rather than a convention. An environment variable is stored in
    # plaintext and is legible to anyone holding
    # lambda:GetFunctionConfiguration, so a secret placed here is disclosed by
    # a read-only permission. Names ending in _PARAMETER are allowed through
    # because they are the path, not the value.
    condition = alltrue([
      for name in keys(var.environment_variables) :
      !can(regex("(SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY|API_KEY|_TOKEN)$", name))
    ])
    error_message = "An environment variable named for a secret must not carry one: a Lambda environment variable is plaintext and is readable with lambda:GetFunctionConfiguration alone. Put the value in Parameter Store as a SecureString and pass its path, naming the variable with a _PARAMETER suffix."
  }
}

variable "secret_parameter_names" {
  description = "SSM parameters the renderer may read, such as the path holding the Cognito app client secret. Each becomes one concrete ARN in its role, and an empty list grants nothing."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for name in var.secret_parameter_names : startswith(name, "/")])
    error_message = "Every entry in secret_parameter_names must be a fully qualified parameter name starting with a slash."
  }
}

variable "secrets_kms_key_arn" {
  description = "Key encrypting those parameters. Null resolves alias/aws/ssm at plan time, so the grant still names one concrete key."
  type        = string
  default     = null

  validation {
    condition     = var.secrets_kms_key_arn == null || can(regex("^arn:aws[a-z-]*:kms:", var.secrets_kms_key_arn))
    error_message = "secrets_kms_key_arn must be a KMS key ARN or null."
  }
}

variable "ssr_memory_size" {
  description = "Memory, and therefore CPU, for the renderer. A Vue render pass is single-threaded work, so this is the one lever on how fast a page is produced."
  type        = number
  default     = 1024

  validation {
    condition     = var.ssr_memory_size >= 512 && var.ssr_memory_size <= 3008
    error_message = "ssr_memory_size must be between 512 and 3008 MB. Below 512 a cold render costs more in billed time than the memory saves."
  }
}

variable "ssr_timeout" {
  description = "How long a render may take before it is abandoned. A page nobody has been served by then is one the reader has already given up on."
  type        = number
  default     = 15

  validation {
    condition     = var.ssr_timeout >= 3 && var.ssr_timeout <= 30
    error_message = "ssr_timeout must be between 3 and 30 seconds."
  }
}

variable "log_retention_days" {
  description = "How long the renderer's logs are kept. Its lines describe pages rendered for named users."
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

variable "price_class" {
  description = "Which CloudFront edge locations serve the distribution. PriceClass_100 is North America and Europe, which is where this service is used."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be PriceClass_100, PriceClass_200 or PriceClass_All."
  }
}

variable "force_destroy" {
  description = "Whether the asset bucket can be deleted with objects still in it. Safe to allow: everything in it is build output reproducible from a commit."
  type        = bool
  default     = false
}
