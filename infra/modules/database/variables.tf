variable "table_name" {
  description = "Name of the single table, such as vocali-transcriptions-dev."
  type        = string

  validation {
    condition     = can(regex("^[a-zA-Z0-9_.-]{3,255}$", var.table_name))
    error_message = "table_name must be 3-255 characters of letters, digits, underscores, dots and hyphens."
  }
}

variable "kms_key_arn" {
  description = "Customer-managed key encrypting the table. Null uses the AWS-managed key for DynamoDB, which still encrypts every item at rest but is not governed by a key policy of ours."
  type        = string
  default     = null

  validation {
    condition     = var.kms_key_arn == null || can(regex("^arn:aws[a-z-]*:kms:", var.kms_key_arn))
    error_message = "kms_key_arn must be a KMS key ARN or null."
  }
}

variable "deletion_protection_enabled" {
  description = "Whether the table refuses to be deleted. The transcripts are in S3 but the history that points at them is only here."
  type        = bool
  default     = true
}
