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

  # Development deploys from main. Production requires a GitHub deployment
  # environment, whose claim is only minted for a run that passed its
  # approval.
  deployment_subject_claims = ["repo:${var.github_repository}:ref:refs/heads/main"]
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

  # The Nuxt dev server plus wherever the front end is actually served from.
  # The browser posts audio straight to the bucket, so the distribution's own
  # domain has to be on this list or every upload fails its preflight.
  cors_allowed_origins = concat(var.front_end_origins, [module.web.front_end_origin])

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

  # The websocket API this platform pushes finished transcriptions over. Its
  # execution ARN is what the ManageConnections grant is scoped beneath, so a
  # function can post to a connection of this API and of no other.
  websocket_api_execution_arn = module.websocket.api_execution_arn
  websocket_stage_name        = module.websocket.stage_name
}

module "api" {
  source = "../../modules/api"

  name_prefix = local.name_prefix

  user_pool_client_id  = module.auth.user_pool_client_id
  user_pool_issuer_url = module.auth.user_pool_issuer_url

  log_retention_days = 14

  # Lower than production. A development environment is a handful of people
  # and a test script, and the ceiling exists to bound what a loop in that
  # script can bill.
  throttling_rate_limit  = 20
  throttling_burst_limit = 40
}

module "websocket" {
  source = "../../modules/websocket"

  name_prefix = local.name_prefix

  log_retention_days = 14

  # The same ceiling as the HTTP API in this environment, and for the same
  # reason: a client reconnecting in a loop bills an invocation per attempt.
  throttling_rate_limit  = 20
  throttling_burst_limit = 40
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

  # Debug here and not in production. A debug line describing a clinical
  # record is retained exactly as long as any other line.
  log_level = "debug"

  websocket_api_id              = module.websocket.api_id
  websocket_api_execution_arn   = module.websocket.api_execution_arn
  websocket_stage_name          = module.websocket.stage_name
  websocket_browser_url         = module.websocket.browser_url
  websocket_management_endpoint = module.websocket.management_endpoint
}

module "web" {
  source = "../../modules/web"

  name_prefix        = local.name_prefix
  assets_bucket_name = local.assets_bucket_name
  nuxt_output_dir    = local.nuxt_output_dir

  # Configuration, never a credential: the module refuses a variable named for
  # a secret, so the client secret travels as the path of the SecureString
  # holding it.
  environment_variables = {
    API_BASE_URL                    = module.api.api_endpoint
    COGNITO_USER_POOL_ID            = module.auth.user_pool_id
    COGNITO_CLIENT_ID               = module.auth.user_pool_client_id
    COGNITO_ISSUER_URL              = module.auth.user_pool_issuer_url
    COGNITO_CLIENT_SECRET_PARAMETER = local.bff_client_secret_parameter_name
  }

  secret_parameter_names = [local.bff_client_secret_parameter_name]

  log_retention_days = 14

  # Build output. It can be emptied and rebuilt from any commit.
  force_destroy = true
}

module "observability" {
  source = "../../modules/observability"

  name_prefix = local.name_prefix

  function_names         = module.lambda.function_names
  dead_letter_queue_name = module.functions.dead_letter_queue_name
  api_id                 = module.api.api_id
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
