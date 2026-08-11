data "aws_partition" "current" {}

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

# Only consulted when no customer-managed key was given. Resolving the alias
# means the grant below names one concrete key instead of a wildcard, which is
# the whole point. The alias exists as soon as the account holds its first
# SecureString parameter, and those parameters are created before this module
# is applied — see README.md.
data "aws_kms_alias" "ssm" {
  count = var.secrets_kms_key_arn == null ? 1 : 0

  name = "alias/aws/ssm"
}

locals {
  secrets_kms_key_arn = coalesce(var.secrets_kms_key_arn, one(data.aws_kms_alias.ssm[*].target_key_arn))

  parameter_arn_prefix = "arn:${data.aws_partition.current.partition}:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter"

  provider_api_key_parameter_arn        = "${local.parameter_arn_prefix}${var.provider_api_key_parameter_name}"
  provider_webhook_secret_parameter_arn = "${local.parameter_arn_prefix}${var.provider_webhook_secret_parameter_name}"

  audio_objects_arn      = "${var.audio_bucket_arn}/${var.audio_object_prefix}*"
  transcript_objects_arn = "${var.transcripts_bucket_arn}/${var.transcript_object_prefix}*"

  # The statements each function can be composed from. Written once here so a
  # permission means the same thing everywhere it appears, and so the table
  # below reads as a list of capabilities rather than as JSON.
  #
  # Two rules hold throughout: every resource is a concrete ARN, and no action
  # is a wildcard. `dynamodb:*` on the right table would still allow deleting
  # every record in it.
  statements = {
    read_record = {
      Sid      = "ReadTranscriptionRecord"
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem"]
      Resource = [var.transcriptions_table_arn]
    }

    write_record = {
      Sid    = "WriteTranscriptionRecord"
      Effect = "Allow"
      # The repository saves the whole item rather than patching attributes,
      # so PutItem is the write. UpdateItem and DeleteItem are absent because
      # nothing in the application calls them; nothing ever deletes a record.
      Action   = ["dynamodb:PutItem"]
      Resource = [var.transcriptions_table_arn]
    }

    query_history = {
      Sid    = "QueryOwnHistory"
      Effect = "Allow"
      # Query, never Scan. There is no Scan in the codebase, and a role that
      # cannot Scan cannot acquire one by accident later.
      Action   = ["dynamodb:Query"]
      Resource = [var.transcriptions_table_arn]
    }

    sign_audio_upload = {
      Sid    = "SignAudioUpload"
      Effect = "Allow"
      # A presigned POST carries the signer's authority, so the upload the
      # browser performs is evaluated against this statement.
      Action   = ["s3:PutObject"]
      Resource = [local.audio_objects_arn]
    }

    read_audio = {
      Sid    = "ReadUploadedAudio"
      Effect = "Allow"
      # Signs the short-lived URL the provider fetches the audio from. The
      # function never reads the bytes itself.
      Action   = ["s3:GetObject"]
      Resource = [local.audio_objects_arn]
    }

    write_transcript = {
      Sid      = "WriteTranscript"
      Effect   = "Allow"
      Action   = ["s3:PutObject"]
      Resource = [local.transcript_objects_arn]
    }

    read_transcript = {
      Sid      = "ReadTranscript"
      Effect   = "Allow"
      Action   = ["s3:GetObject"]
      Resource = [local.transcript_objects_arn]
    }

    read_provider_api_key = {
      Sid    = "ReadProviderApiKey"
      Effect = "Allow"
      # GetParameter and not GetParameters: the plural form takes a list, and
      # a list is harder to reason about than the single named parameter the
      # secrets adapter asks for.
      Action   = ["ssm:GetParameter"]
      Resource = [local.provider_api_key_parameter_arn]
    }

    read_provider_webhook_secret = {
      Sid      = "ReadProviderWebhookSecret"
      Effect   = "Allow"
      Action   = ["ssm:GetParameter"]
      Resource = [local.provider_webhook_secret_parameter_arn]
    }

    decrypt_secrets = {
      Sid    = "DecryptSecureStringParameters"
      Effect = "Allow"
      # Reading a SecureString is two authorisations: one at Parameter Store
      # and one at KMS. Without this the parameter read fails at the second.
      Action   = ["kms:Decrypt"]
      Resource = [local.secrets_kms_key_arn]
    }
  }

  # The functions this platform will run, and what each is allowed to touch.
  # They do not exist yet — the round that creates them consumes the role and
  # the log group produced here — but their permissions do, because a role
  # written alongside a function tends to be written to make the function
  # work, and a role written from its use cases tends to be written to be
  # small.
  functions = {
    "create-upload-intent" = [
      local.statements.write_record,
      local.statements.sign_audio_upload,
    ]

    "start-transcription-job" = [
      local.statements.read_record,
      local.statements.write_record,
      local.statements.read_audio,
      local.statements.read_provider_api_key,
      local.statements.decrypt_secrets,
    ]

    "handle-provider-callback" = [
      local.statements.read_record,
      local.statements.write_record,
      local.statements.write_transcript,
      local.statements.read_provider_webhook_secret,
      local.statements.decrypt_secrets,
    ]

    "list-transcriptions" = [
      local.statements.query_history,
    ]

    "get-transcription" = [
      local.statements.read_record,
    ]

    "get-transcription-download-url" = [
      local.statements.read_record,
      local.statements.read_transcript,
    ]

    "create-realtime-session" = [
      local.statements.read_provider_api_key,
      local.statements.decrypt_secrets,
    ]

    "save-realtime-transcription" = [
      local.statements.write_record,
      local.statements.write_transcript,
    ]
  }

  function_names = { for key, _ in local.functions : key => "${var.name_prefix}-${key}" }

  data_key_statements = length(var.data_kms_key_arns) == 0 ? [] : [{
    Sid      = "UseDataKeys"
    Effect   = "Allow"
    Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
    Resource = var.data_kms_key_arns
  }]
}

# One role per function, never one role shared by all of them. A shared role is
# the union of every permission any function needs, so the function that only
# lists a history would also be able to write transcripts and read the
# provider's API key. The blast radius of a bug in one handler is whatever its
# role allows.
data "aws_iam_policy_document" "assume_role" {
  statement {
    sid     = "LambdaAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "function" {
  for_each = local.functions

  name               = "${local.function_names[each.key]}-role"
  description        = "Execution role for the ${local.function_names[each.key]} function"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json

  tags = {
    Name = "${local.function_names[each.key]}-role"
  }
}

# Inline rather than attached. An inline policy has exactly one holder, so it
# cannot quietly acquire a second, and it is deleted with the role instead of
# outliving it. AWSLambdaBasicExecutionRole, the managed policy that would
# normally be here, grants logs:CreateLogGroup on every log group in the
# account; the statement below grants two actions on one log group.
resource "aws_iam_role_policy" "function" {
  for_each = local.functions

  name = "${local.function_names[each.key]}-policy"
  role = aws_iam_role.function[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid    = "WriteOwnLogs"
          Effect = "Allow"
          # No logs:CreateLogGroup. Terraform creates the group below, so the
          # function never needs to, and a function that cannot create a log
          # group cannot create one without a retention policy either — which
          # is how logs end up being kept forever.
          Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
          Resource = ["${aws_cloudwatch_log_group.function[each.key].arn}:*"]
        }
      ],
      each.value,
      local.data_key_statements,
    )
  })
}

# Created here, ahead of the functions, and with a retention that is stated.
# A log group Lambda creates for itself never expires, and these lines carry
# file names, user identifiers and provider correlation ids for clinical
# recordings.
resource "aws_cloudwatch_log_group" "function" {
  for_each = local.functions

  name              = "/aws/lambda/${local.function_names[each.key]}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "/aws/lambda/${local.function_names[each.key]}"
  }
}
