variable "name_prefix" {
  description = "Prefix shared by every resource in one environment, such as vocali-dev. Function names, role names and log group names are all built from it."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.name_prefix))
    error_message = "name_prefix must be 3-21 characters of lowercase letters, digits and hyphens. The longest function suffix here is 30 characters and an IAM role name is capped at 64."
  }
}

variable "transcriptions_table_arn" {
  description = "ARN of the single DynamoDB table. Every data statement is scoped to exactly this resource."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:dynamodb:", var.transcriptions_table_arn))
    error_message = "transcriptions_table_arn must be a DynamoDB table ARN."
  }
}

variable "audio_bucket_arn" {
  description = "ARN of the bucket the browser uploads audio to."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:s3:::", var.audio_bucket_arn))
    error_message = "audio_bucket_arn must be an S3 bucket ARN."
  }
}

variable "transcripts_bucket_arn" {
  description = "ARN of the bucket holding finished transcripts."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:s3:::", var.transcripts_bucket_arn))
    error_message = "transcripts_bucket_arn must be an S3 bucket ARN."
  }
}

variable "audio_object_prefix" {
  description = "Key prefix every audio object lives under. Object statements are scoped to it, not to the bucket."
  type        = string

  validation {
    condition     = endswith(var.audio_object_prefix, "/")
    error_message = "audio_object_prefix must end with a slash, or the policy would also match keys that merely start with the same letters."
  }
}

variable "transcript_object_prefix" {
  description = "Key prefix every transcript object lives under."
  type        = string

  validation {
    condition     = endswith(var.transcript_object_prefix, "/")
    error_message = "transcript_object_prefix must end with a slash."
  }
}

variable "provider_api_key_parameter_name" {
  description = "Name of the SSM parameter holding the transcription provider's long-lived API key. The parameter is created outside Terraform so its value never enters the state file."
  type        = string

  validation {
    condition     = startswith(var.provider_api_key_parameter_name, "/")
    error_message = "provider_api_key_parameter_name must be a fully qualified parameter name starting with a slash."
  }
}

variable "provider_webhook_secret_parameter_name" {
  description = "Name of the SSM parameter holding the shared secret the provider echoes back on its callback. Also created outside Terraform."
  type        = string

  validation {
    condition     = startswith(var.provider_webhook_secret_parameter_name, "/")
    error_message = "provider_webhook_secret_parameter_name must be a fully qualified parameter name starting with a slash."
  }
}

variable "secrets_kms_key_arn" {
  description = "Key that encrypts those SSM parameters. Null resolves the AWS-managed alias/aws/ssm key at plan time, so the grant still names one concrete key rather than a wildcard."
  type        = string
  default     = null

  validation {
    condition     = var.secrets_kms_key_arn == null || can(regex("^arn:aws[a-z-]*:kms:", var.secrets_kms_key_arn))
    error_message = "secrets_kms_key_arn must be a KMS key ARN or null."
  }
}

variable "data_kms_key_arns" {
  description = "Any customer-managed keys encrypting the table or the buckets. Empty when both use AWS-managed keys, which need no grant of ours."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for arn in var.data_kms_key_arns : can(regex("^arn:aws[a-z-]*:kms:", arn))])
    error_message = "Every entry in data_kms_key_arns must be a KMS key ARN."
  }
}

variable "dead_letter_retention_days" {
  description = "How long a failed asynchronous invocation is kept in the dead-letter queue. Long enough to notice over a weekend and replay it on Monday."
  type        = number
  default     = 14

  validation {
    condition     = var.dead_letter_retention_days >= 1 && var.dead_letter_retention_days <= 14
    error_message = "dead_letter_retention_days must be between 1 and 14. Fourteen days is the longest SQS retains a message."
  }
}

variable "log_retention_days" {
  description = "How long function logs are kept. CloudWatch keeps them forever by default, which for logs describing clinical audio is both a cost and a liability."
  type        = number
  default     = 14

  validation {
    condition = contains(
      [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653],
      var.log_retention_days
    )
    error_message = "log_retention_days must be one of the values CloudWatch accepts. Note that zero, meaning never expire, is deliberately not among them."
  }
}
