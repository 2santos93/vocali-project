data "aws_caller_identity" "current" {}

locals {
  project_name = "vocali"
  environment  = "prod"
  aws_region   = "eu-west-1"

  name_prefix = "${local.project_name}-${local.environment}"

  audio_bucket_name       = "${local.name_prefix}-audio-${data.aws_caller_identity.current.account_id}"
  transcripts_bucket_name = "${local.name_prefix}-transcripts-${data.aws_caller_identity.current.account_id}"
  assets_bucket_name      = "${local.name_prefix}-web-${data.aws_caller_identity.current.account_id}"

  # Created outside Terraform with `aws ssm put-parameter --type SecureString`,
  # so no secret value ever reaches the state file. Only the names are here.
  provider_api_key_parameter_name        = "/${local.project_name}/${local.environment}/transcription-provider/api-key"
  provider_webhook_secret_parameter_name = "/${local.project_name}/${local.environment}/transcription-provider/webhook-secret"

  # The Cognito app client secret, which the renderer authenticates with. Also
  # put there by hand — Cognito generates it, so it is already in the state
  # file, and copying it into a parameter is what gives the renderer a way to
  # read it that is not an environment variable in plaintext.
  bff_client_secret_parameter_name = "/${local.project_name}/${local.environment}/bff/cognito-client-secret"

  # Written by infra/build/bundle-functions.sh and by `nuxt build`. Relative to
  # this directory, so the same paths work from a laptop and from a runner.
  function_bundle_dir = "${path.module}/../../build/dist"
  nuxt_output_dir     = "${path.module}/../../../apps/web/.output"

  # A GitHub deployment environment, not a branch. The claim is only minted
  # for a run that passed that environment's approval, so a merge to main
  # cannot deploy production on its own.
  deployment_subject_claims = ["repo:${var.github_repository}:environment:production"]
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

  # The browser posts audio straight to the bucket, so the domain the front
  # end is served from has to be on this list or every upload fails its
  # preflight. The distribution's own domain is added here; the variable
  # carries the custom domain the day there is one.
  cors_allowed_origins = concat(var.front_end_origins, [module.web.front_end_origin])

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

module "api" {
  source = "../../modules/api"

  name_prefix = local.name_prefix

  user_pool_client_id  = module.auth.user_pool_client_id
  user_pool_issuer_url = module.auth.user_pool_issuer_url

  log_retention_days = 14

  # Room for a clinic's worth of concurrent use, and still a ceiling: the
  # account default of ten thousand a second is not a limit, it is the number
  # of invocations a runaway client can bill before anyone notices.
  throttling_rate_limit  = 100
  throttling_burst_limit = 200
}

module "lambda" {
  source = "../../modules/lambda"

  name_prefix = local.name_prefix
  bundle_dir  = local.function_bundle_dir

  function_names             = module.functions.function_names
  role_arns                  = module.functions.role_arns
  log_group_names            = module.functions.log_group_names
  asynchronous_function_keys = module.functions.asynchronous_function_keys
  dead_letter_queue_arn      = module.functions.dead_letter_queue_arn

  api_id            = module.api.api_id
  api_endpoint      = module.api.api_endpoint
  api_execution_arn = module.api.api_execution_arn
  stage_name        = module.api.stage_name
  jwt_authorizer_id = module.api.jwt_authorizer_id

  audio_bucket_name       = module.storage.audio_bucket_name
  audio_bucket_arn        = module.storage.audio_bucket_arn
  audio_object_prefix     = module.storage.audio_object_prefix
  transcripts_bucket_name = module.storage.transcripts_bucket_name

  transcriptions_table_name = module.database.table_name

  provider_api_key_parameter_name        = local.provider_api_key_parameter_name
  provider_webhook_secret_parameter_name = local.provider_webhook_secret_parameter_name

  # Info, not debug. A debug line describing a clinical record is retained
  # exactly as long as any other line, and is read by exactly as many people.
  log_level = "info"
}

module "web" {
  source = "../../modules/web"

  name_prefix        = local.name_prefix
  assets_bucket_name = local.assets_bucket_name
  nuxt_output_dir    = local.nuxt_output_dir

  environment_variables = {
    API_BASE_URL                    = module.api.api_endpoint
    COGNITO_USER_POOL_ID            = module.auth.user_pool_id
    COGNITO_CLIENT_ID               = module.auth.user_pool_client_id
    COGNITO_ISSUER_URL              = module.auth.user_pool_issuer_url
    COGNITO_CLIENT_SECRET_PARAMETER = local.bff_client_secret_parameter_name
  }

  secret_parameter_names = [local.bff_client_secret_parameter_name]

  log_retention_days = 14

  # Nothing in this bucket is irreplaceable, but a bucket that empties itself
  # on a destroy is a habit rather than a setting, and this is production.
  force_destroy = false
}

module "observability" {
  source = "../../modules/observability"

  name_prefix = local.name_prefix

  function_names         = module.lambda.function_names
  dead_letter_queue_name = module.functions.dead_letter_queue_name
  api_id                 = module.api.api_id

  alarm_email_addresses = var.alarm_email_addresses
}

module "deployment" {
  source = "../../modules/deployment"

  name_prefix = local.name_prefix

  github_repository = var.github_repository
  subject_claims    = local.deployment_subject_claims

  function_arns     = module.lambda.function_arns
  ssr_function_arn  = module.web.ssr_function_arn
  assets_bucket_arn = module.web.assets_bucket_arn
  distribution_arn  = module.web.distribution_arn
}
