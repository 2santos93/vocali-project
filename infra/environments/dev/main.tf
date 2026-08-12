data "aws_caller_identity" "current" {}

locals {
  project_name = "vocali"
  environment  = "dev"
  aws_region   = "eu-west-1"

  name_prefix = "${local.project_name}-${local.environment}"

  # S3 bucket names are global, so they carry the account id. It is read at
  # plan time rather than written down, so this composition works unchanged in
  # whichever account it is pointed at.
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

  # A development pool holds test accounts, and being unable to tear it down
  # would be an obstacle rather than a protection. Production sets this to
  # true, where deleting the pool would delete every real account with it.
  deletion_protection_enabled = false
}

module "database" {
  source = "../../modules/database"

  table_name                  = "${local.project_name}-transcriptions-${local.environment}"
  deletion_protection_enabled = false
}

module "storage" {
  source = "../../modules/storage"

  audio_bucket_name       = local.audio_bucket_name
  transcripts_bucket_name = local.transcripts_bucket_name
  cors_allowed_origins    = var.front_end_origins

  # Shorter than production: development audio is test material, and a week is
  # long enough to reproduce anything that went wrong with it.
  audio_retention_days = 7

  # Development buckets can be emptied and recreated, which is the difference
  # between iterating on this configuration and hand-deleting objects.
  force_destroy = true
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

  log_retention_days = 14
}
