data "aws_partition" "current" {}

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

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

  statements = {
    read_record = {
      Sid      = "ReadTranscriptionRecord"
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem"]
      Resource = [var.transcriptions_table_arn]
    }

    write_record = {
      Sid      = "WriteTranscriptionRecord"
      Effect   = "Allow"
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
      Sid      = "ReadProviderApiKey"
      Effect   = "Allow"
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

    write_connection_ticket = {
      Sid      = "IssueConnectionTicket"
      Effect   = "Allow"
      Action   = ["dynamodb:PutItem"]
      Resource = [var.transcriptions_table_arn]
      Condition = {
        "ForAllValues:StringLike" = {
          "dynamodb:LeadingKeys" = ["${local.ticket_partition_key_prefix}*"]
        }
      }
    }

    redeem_connection_ticket = {
      Sid      = "RedeemConnectionTicket"
      Effect   = "Allow"
      Action   = ["dynamodb:DeleteItem"]
      Resource = [var.transcriptions_table_arn]
      Condition = {
        "ForAllValues:StringLike" = {
          "dynamodb:LeadingKeys" = ["${local.ticket_partition_key_prefix}*"]
        }
      }
    }

    write_connection = {
      Sid      = "RecordWebsocketConnection"
      Effect   = "Allow"
      Action   = ["dynamodb:PutItem"]
      Resource = [var.transcriptions_table_arn]
      Condition = {
        "ForAllValues:StringLike" = {
          "dynamodb:LeadingKeys" = ["${local.connection_partition_key_prefix}*"]
        }
      }
    }

    query_connections = {
      Sid      = "ReadOwnConnections"
      Effect   = "Allow"
      Action   = ["dynamodb:Query"]
      Resource = [var.transcriptions_table_arn]
      Condition = {
        "ForAllValues:StringLike" = {
          "dynamodb:LeadingKeys" = ["${local.connection_partition_key_prefix}*"]
        }
      }
    }

    delete_connection = {
      Sid      = "ForgetWebsocketConnection"
      Effect   = "Allow"
      Action   = ["dynamodb:DeleteItem"]
      Resource = [var.transcriptions_table_arn]
      Condition = {
        "ForAllValues:StringLike" = {
          "dynamodb:LeadingKeys" = ["${local.connection_partition_key_prefix}*"]
        }
      }
    }

    manage_connections = {
      Sid      = "PushToWebsocketConnection"
      Effect   = "Allow"
      Action   = ["execute-api:ManageConnections"]
      Resource = ["${var.websocket_api_execution_arn}/${var.websocket_stage_name}/POST/@connections/*"]
    }
  }

  ticket_partition_key_prefix     = "TICKET#"
  connection_partition_key_prefix = "CONN#"

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
      local.statements.read_provider_webhook_secret,
      local.statements.decrypt_secrets,
    ]

    "handle-provider-callback" = [
      local.statements.read_record,
      local.statements.write_record,
      local.statements.write_transcript,
      local.statements.read_provider_webhook_secret,
      local.statements.decrypt_secrets,
      local.statements.query_connections,
      local.statements.delete_connection,
      local.statements.manage_connections,
    ]

    "create-connection-ticket" = [
      local.statements.write_connection_ticket,
    ]

    # The `$connect` authorizer. It reads no record and writes none: it spends
    # a ticket and resolves a user, and that is its whole authority.
    "authorize-connection" = [
      local.statements.redeem_connection_ticket,
    ]

    "handle-connection-opened" = [
      local.statements.write_connection,
    ]

    "handle-connection-closed" = [
      local.statements.delete_connection,
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

  asynchronous_functions = ["start-transcription-job"]

  asynchronous_statements = {
    for name in local.asynchronous_functions : name => [{
      Sid      = "RecordAsynchronousFailure"
      Effect   = "Allow"
      Action   = ["sqs:SendMessage"]
      Resource = [aws_sqs_queue.asynchronous_failures.arn]
    }]
  }
}

resource "aws_sqs_queue" "asynchronous_failures" {
  name = "${var.name_prefix}-asynchronous-failures"

  sqs_managed_sse_enabled = true

  message_retention_seconds = var.dead_letter_retention_days * 24 * 60 * 60

  # Long enough that a redrive by hand is not a race against the timer.
  visibility_timeout_seconds = 300

  tags = {
    Name = "${var.name_prefix}-asynchronous-failures"
  }
}

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

resource "aws_iam_role_policy" "function" {
  for_each = local.functions

  name = "${local.function_names[each.key]}-policy"
  role = aws_iam_role.function[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid      = "WriteOwnLogs"
          Effect   = "Allow"
          Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
          Resource = ["${aws_cloudwatch_log_group.function[each.key].arn}:*"]
        }
      ],
      each.value,
      local.data_key_statements,
      lookup(local.asynchronous_statements, each.key, []),
    )
  })
}

resource "aws_cloudwatch_log_group" "function" {
  for_each = local.functions

  name              = "/aws/lambda/${local.function_names[each.key]}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "/aws/lambda/${local.function_names[each.key]}"
  }
}
