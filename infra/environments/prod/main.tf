data "aws_caller_identity" "current" {}

locals {
  project_name = "vocali"
  environment  = "prod"
  aws_region   = "eu-west-1"

  name_prefix = "${local.project_name}-${local.environment}"

  audio_bucket_name       = "${local.name_prefix}-audio-${data.aws_caller_identity.current.account_id}"
  transcripts_bucket_name = "${local.name_prefix}-transcripts-${data.aws_caller_identity.current.account_id}"

  # Created outside Terraform with `aws ssm put-parameter --type SecureString`,
  # so no secret value ever reaches the state file. Only the names are here.
  provider_api_key_parameter_name        = "/${local.project_name}/${local.environment}/transcription-provider/api-key"
  provider_webhook_secret_parameter_name = "/${local.project_name}/${local.environment}/transcription-provider/webhook-secret"
}

module "auth" {
  source = "../../modules/auth"

  name_prefix = local.name_prefix

  # Deleting a user pool deletes every account in it, and those accounts are
  # not in the state file and cannot be recreated from it.
  deletion_protection_enabled = true
}

module "database" {
  source = "../../modules/database"

  table_name                  = "${local.project_name}-transcriptions-${local.environment}"
  deletion_protection_enabled = true
}

module "storage" {
  source = "../../modules/storage"

  audio_bucket_name       = local.audio_bucket_name
  transcripts_bucket_name = local.transcripts_bucket_name
  cors_allowed_origins    = var.front_end_origins

  audio_retention_days = 30

  # A bucket holding clinical recordings does not disappear because a plan was
  # applied from the wrong directory.
  force_destroy = false
}

module "functions" {
  source = "../../modules/functions"

  name_prefix = local.name_prefix

  transcriptions_table_arn = module.database.table_arn
  audio_bucket_arn         = module.storage.audio_bucket_arn
  transcripts_bucket_arn   = module.storage.transcripts_bucket_arn
  audio_object_prefix      = module.storage.audio_object_prefix
  transcript_object_prefix = module.storage.transcript_object_prefix

  provider_api_key_parameter_name        = local.provider_api_key_parameter_name
  provider_webhook_secret_parameter_name = local.provider_webhook_secret_parameter_name

  # The same fourteen days as development. Log retention is a privacy decision
  # rather than an environment convenience, and these lines describe clinical
  # recordings: file names, user identifiers and provider correlation ids.
  log_retention_days = 14
}
