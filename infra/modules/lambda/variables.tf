variable "name_prefix" {
  description = "Prefix shared by every resource in one environment, such as vocali-dev. Used for descriptions here; the function names themselves come from the functions module."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.name_prefix))
    error_message = "name_prefix must be 3-21 characters of lowercase letters, digits and hyphens."
  }
}

variable "bundle_dir" {
  description = "Directory infra/build/bundle-functions.sh wrote its output to. Each function is expected at <bundle_dir>/<function>/index.mjs, and a missing one fails the plan rather than deploying an empty package."
  type        = string

  validation {
    condition     = length(var.bundle_dir) > 0
    error_message = "bundle_dir must be set. There is no sensible default: the path depends on where Terraform is being run from."
  }
}

variable "function_names" {
  description = "Logical name to full function name, from the functions module. The names have to match, because the log groups were created after them."
  type        = map(string)

  validation {
    condition     = length(var.function_names) == 8
    error_message = "function_names must hold all eight functions. The application has eight entry points and every one of them is deployed."
  }
}

variable "role_arns" {
  description = "Logical name to execution role ARN, from the functions module. One role per function, each scoped to what that function touches."
  type        = map(string)

  validation {
    condition     = alltrue([for arn in values(var.role_arns) : can(regex("^arn:aws[a-z-]*:iam::[0-9]{12}:role/", arn))])
    error_message = "Every entry in role_arns must be an IAM role ARN."
  }
}

variable "log_group_names" {
  description = "Logical name to log group name, from the functions module. Each already exists with an explicit retention."
  type        = map(string)

  validation {
    condition     = alltrue([for name in values(var.log_group_names) : startswith(name, "/aws/lambda/")])
    error_message = "Every entry in log_group_names must be a Lambda log group, under /aws/lambda/."
  }
}

variable "asynchronous_function_keys" {
  description = "The functions invoked by an event rather than a request, from the functions module. Exactly these are given a failure destination, because exactly these were granted the permission to write to it."
  type        = list(string)

  validation {
    condition     = length(var.asynchronous_function_keys) > 0
    error_message = "asynchronous_function_keys must name at least one function, or the dead-letter queue catches nothing."
  }
}

variable "dead_letter_queue_arn" {
  description = "Failure destination for asynchronous invocations, from the functions module."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:sqs:", var.dead_letter_queue_arn))
    error_message = "dead_letter_queue_arn must be an SQS queue ARN."
  }
}

variable "api_id" {
  description = "The HTTP API every route attaches to, from the api module."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]{6,32}$", var.api_id))
    error_message = "api_id must be an API Gateway API id."
  }
}

variable "api_endpoint" {
  description = "Base URL of the API, with no trailing slash. PROVIDER_CALLBACK_BASE_URL is this plus the webhook path, and the provider keeps that URL for the life of a job."
  type        = string

  validation {
    condition     = can(regex("^https://[^/]+$", var.api_endpoint))
    error_message = "api_endpoint must be an https origin with no path and no trailing slash, because a path is appended to it."
  }
}

variable "api_execution_arn" {
  description = "Prefix every invoke permission is built from, from the api module."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:execute-api:", var.api_execution_arn))
    error_message = "api_execution_arn must be an execute-api ARN."
  }
}

variable "stage_name" {
  description = "The stage each invoke permission names, so the grant covers one stage rather than every stage the API might ever have."
  type        = string

  validation {
    condition     = length(var.stage_name) > 0
    error_message = "stage_name must be set."
  }
}

variable "jwt_authorizer_id" {
  description = "The Cognito JWT authorizer, from the api module. Every route but the provider webhook points at it."
  type        = string

  validation {
    condition     = length(var.jwt_authorizer_id) > 0
    error_message = "jwt_authorizer_id must be set, or every authenticated route would be created without an authorizer."
  }
}

variable "audio_bucket_name" {
  description = "AUDIO_BUCKET_NAME for the application, and the bucket the ObjectCreated notification is configured on."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.audio_bucket_name))
    error_message = "audio_bucket_name must be a valid S3 bucket name."
  }
}

variable "audio_bucket_arn" {
  description = "ARN of the audio bucket, and the source the invoke permission granted to S3 is scoped to."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:s3:::", var.audio_bucket_arn))
    error_message = "audio_bucket_arn must be an S3 bucket ARN."
  }
}

variable "audio_object_prefix" {
  description = "Key prefix the notification filters on. Without it, an object the platform writes back into this bucket would start a transcription job of its own."
  type        = string

  validation {
    condition     = endswith(var.audio_object_prefix, "/")
    error_message = "audio_object_prefix must end with a slash, or the filter would also match keys that merely start with the same letters."
  }
}

variable "transcripts_bucket_name" {
  description = "TRANSCRIPTS_BUCKET_NAME. Set on every function although the application's configuration schema does not read it yet; see README.md."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.transcripts_bucket_name))
    error_message = "transcripts_bucket_name must be a valid S3 bucket name."
  }
}

variable "transcriptions_table_name" {
  description = "TRANSCRIPTIONS_TABLE_NAME for every function."
  type        = string

  validation {
    condition     = length(var.transcriptions_table_name) > 0
    error_message = "transcriptions_table_name must be set, or no function can start."
  }
}

variable "provider_api_key_parameter_name" {
  description = "SSM path of the transcription provider's API key. The path, never the key: the parameter is created outside Terraform so its value never enters the state file."
  type        = string

  validation {
    condition     = startswith(var.provider_api_key_parameter_name, "/")
    error_message = "provider_api_key_parameter_name must be a fully qualified parameter name starting with a slash."
  }
}

variable "provider_webhook_secret_parameter_name" {
  description = "SSM path of the shared secret the provider echoes back on its callback. Also a path, also created outside Terraform."
  type        = string

  validation {
    condition     = startswith(var.provider_webhook_secret_parameter_name, "/")
    error_message = "provider_webhook_secret_parameter_name must be a fully qualified parameter name starting with a slash."
  }
}

variable "provider_request_timeout_ms" {
  description = "How long a single call to the transcription provider may take. Stated rather than left to the application's default, because it and the function timeouts are one budget."
  type        = number
  default     = 10000

  validation {
    condition     = var.provider_request_timeout_ms >= 1000 && var.provider_request_timeout_ms <= 20000
    error_message = "provider_request_timeout_ms must be between 1000 and 20000. Below a second every call fails; above twenty seconds three attempts cannot finish inside the timeout of the function making them."
  }
}

variable "provider_max_attempts" {
  description = "How many times a retryable provider failure is attempted in total, the first try included."
  type        = number
  default     = 3

  validation {
    condition     = var.provider_max_attempts >= 1 && var.provider_max_attempts <= 5
    error_message = "provider_max_attempts must be between 1 and 5. More than five attempts of ten seconds each outlives the function making them."
  }
}

variable "log_level" {
  description = "Level below which the application writes nothing. Development runs at debug; production does not, because a debug line describing a clinical record is retained just as long as any other."
  type        = string
  default     = "info"

  validation {
    condition     = contains(["fatal", "error", "warn", "info", "debug", "trace"], var.log_level)
    error_message = "log_level must be one of the levels the application's logger accepts: fatal, error, warn, info, debug, trace."
  }
}

variable "max_memory_size_mb" {
  description = "Upper bound applied to every function's chosen memory. Exists because a new AWS account is capped at 512 MB per function until the quota is raised, and the per-function sizing above is the intent worth keeping: capping it here records that the smaller value is an account limit rather than a decision, and raising the quota restores it by deleting one line."
  type        = number
  default     = null

  validation {
    condition     = var.max_memory_size_mb == null || (var.max_memory_size_mb >= 128 && var.max_memory_size_mb <= 10240)
    error_message = "max_memory_size_mb must be between 128 and 10240, or null for no cap."
  }
}
