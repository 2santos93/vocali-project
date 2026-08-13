data "aws_caller_identity" "current" {}

locals {
  webhook_route_path = "/webhooks/transcription-provider"

  environment_variables = {
    AUDIO_BUCKET_NAME         = var.audio_bucket_name
    TRANSCRIPTIONS_TABLE_NAME = var.transcriptions_table_name

    SPEECHMATICS_API_KEY_PARAMETER        = var.provider_api_key_parameter_name
    SPEECHMATICS_WEBHOOK_SECRET_PARAMETER = var.provider_webhook_secret_parameter_name

    PROVIDER_CALLBACK_BASE_URL  = "${var.api_endpoint}${local.webhook_route_path}"
    PROVIDER_REQUEST_TIMEOUT_MS = tostring(var.provider_request_timeout_ms)
    PROVIDER_MAX_ATTEMPTS       = tostring(var.provider_max_attempts)

    WEBSOCKET_URL                 = var.websocket_browser_url
    WEBSOCKET_MANAGEMENT_ENDPOINT = var.websocket_management_endpoint

    LOG_LEVEL = var.log_level

    TRANSCRIPTS_BUCKET_NAME = var.transcripts_bucket_name
  }

  functions = {
    "create-upload-intent" = {
      memory_size = 512
      timeout     = 10
      # One PutItem and one signature computed locally. There is no network
      # call to the provider and no object read.
      route = {
        method          = "POST"
        path            = "/uploads"
        permission_path = "/uploads"
        authenticated   = true
      }
    }

    "list-transcriptions" = {
      memory_size = 512
      timeout     = 10
      # One Query returning at most ten items. The most frequently called
      # endpoint here, so its cold start is the one users feel most often.
      route = {
        method          = "GET"
        path            = "/transcriptions"
        permission_path = "/transcriptions"
        authenticated   = true
      }
    }

    "get-transcription" = {
      memory_size = 512
      timeout     = 10
      # One GetItem. Called repeatedly while a client polls an upload.
      route = {
        method          = "GET"
        path            = "/transcriptions/{transcriptionId}"
        permission_path = "/transcriptions/*"
        authenticated   = true
      }
    }

    "get-transcription-download-url" = {
      memory_size = 512
      timeout     = 10
      # A GetItem and a signature. It never reads the transcript's bytes.
      route = {
        method          = "GET"
        path            = "/transcriptions/{transcriptionId}/download"
        permission_path = "/transcriptions/*/download"
        authenticated   = true
      }
    }

    "save-realtime-transcription" = {
      memory_size = 768
      timeout     = 20
      route = {
        method          = "POST"
        path            = "/transcriptions/realtime"
        permission_path = "/transcriptions/realtime"
        authenticated   = true
      }
    }

    "create-realtime-session" = {
      memory_size = 512
      timeout     = 29
      route = {
        method          = "POST"
        path            = "/realtime-sessions"
        permission_path = "/realtime-sessions"
        authenticated   = true
      }
    }

    "handle-provider-callback" = {
      memory_size = 1024
      timeout     = 29
      route = {
        method          = "POST"
        path            = local.webhook_route_path
        permission_path = local.webhook_route_path
        authenticated   = false
      }
    }

    "start-transcription-job" = {
      memory_size = 1024
      timeout     = 60
      route       = null
    }

    "create-connection-ticket" = {
      memory_size = 512
      timeout     = 10
      route = {
        method          = "POST"
        path            = "/connection-tickets"
        permission_path = "/connection-tickets"
        authenticated   = true
      }
    }

    "authorize-connection" = {
      memory_size = 512
      timeout     = 10
      route       = null
    }

    "handle-connection-opened" = {
      memory_size = 512
      timeout     = 10
      route       = null
    }

    "handle-connection-closed" = {
      memory_size = 512
      timeout     = 10
      route       = null
    }
  }

  http_functions = { for name, spec in local.functions : name => spec if spec.route != null }

  websocket_routes = {
    "handle-connection-opened" = { route_key = "$connect", authorised = true }
    "handle-connection-closed" = { route_key = "$disconnect", authorised = false }
  }
}

data "archive_file" "function" {
  for_each = local.functions

  type        = "zip"
  source_file = "${var.bundle_dir}/${each.key}/index.mjs"
  output_path = "${var.bundle_dir}/${each.key}.zip"

  lifecycle {
    precondition {
      condition     = fileexists("${var.bundle_dir}/${each.key}/index.mjs")
      error_message = "No bundle for ${each.key} at ${var.bundle_dir}. Run infra/build/bundle-functions.sh before planning."
    }
  }
}

resource "aws_lambda_function" "this" {
  for_each = local.functions

  function_name = var.function_names[each.key]
  description   = "The ${each.key} entry point of the ${var.name_prefix} transcription platform"
  role          = var.role_arns[each.key]

  runtime = "nodejs24.x"
  handler = "index.handler"

  architectures = ["arm64"]

  filename         = data.archive_file.function[each.key].output_path
  source_code_hash = data.archive_file.function[each.key].output_base64sha256

  memory_size = var.max_memory_size_mb == null ? each.value.memory_size : min(each.value.memory_size, var.max_memory_size_mb)
  timeout     = each.value.timeout

  environment {
    variables = local.environment_variables
  }

  logging_config {
    log_format = "Text"
    log_group  = var.log_group_names[each.key]
  }

  tags = {
    Name = var.function_names[each.key]
  }
}

resource "aws_lambda_function_event_invoke_config" "asynchronous" {
  for_each = toset(var.asynchronous_function_keys)

  function_name = aws_lambda_function.this[each.value].function_name

  maximum_retry_attempts = 2

  # An upload event worth acting on an hour later is one whose user gave up
  # long ago. Six hours, the default, only makes the queue's contents older.
  maximum_event_age_in_seconds = 3600

  destination_config {
    on_failure {
      destination = var.dead_letter_queue_arn
    }
  }
}

resource "aws_s3_bucket_notification" "audio_uploaded" {
  bucket = var.audio_bucket_name

  lambda_function {
    lambda_function_arn = aws_lambda_function.this["start-transcription-job"].arn

    events = ["s3:ObjectCreated:*"]

    filter_prefix = var.audio_object_prefix
  }

  # S3 validates that it may invoke the function while the notification is
  # being configured, so the permission has to exist first or the apply fails.
  depends_on = [aws_lambda_permission.audio_bucket]
}

resource "aws_lambda_permission" "audio_bucket" {
  statement_id  = "AllowInvocationFromAudioBucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this["start-transcription-job"].function_name
  principal     = "s3.amazonaws.com"

  source_arn     = var.audio_bucket_arn
  source_account = data.aws_caller_identity.current.account_id
}

resource "aws_apigatewayv2_integration" "this" {
  for_each = local.http_functions

  api_id           = var.api_id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.this[each.key].invoke_arn

  # POST regardless of the route's method: this is how API Gateway calls
  # Lambda, not how the client called API Gateway.
  integration_method = "POST"

  payload_format_version = "2.0"

  timeout_milliseconds = min((each.value.timeout + 1) * 1000, 30000)
}

resource "aws_apigatewayv2_route" "this" {
  for_each = local.http_functions

  api_id    = var.api_id
  route_key = "${each.value.route.method} ${each.value.route.path}"
  target    = "integrations/${aws_apigatewayv2_integration.this[each.key].id}"

  authorization_type = each.value.route.authenticated ? "JWT" : "NONE"
  authorizer_id      = each.value.route.authenticated ? var.jwt_authorizer_id : null
}

resource "aws_lambda_permission" "api_gateway" {
  for_each = local.http_functions

  statement_id  = "AllowInvocationFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this[each.key].function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${var.api_execution_arn}/${var.stage_name}/${each.value.route.method}${each.value.route.permission_path}"
}

resource "aws_apigatewayv2_authorizer" "websocket_connect" {
  api_id           = var.websocket_api_id
  name             = "${var.name_prefix}-connection-ticket"
  authorizer_type  = "REQUEST"
  authorizer_uri   = aws_lambda_function.this["authorize-connection"].invoke_arn
  identity_sources = ["route.request.querystring.ticket"]

}

resource "aws_lambda_permission" "websocket_authorizer" {
  statement_id  = "AllowInvocationFromWebsocketAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this["authorize-connection"].function_name
  principal     = "apigateway.amazonaws.com"

  # The authorizer's own ARN, not a route's. An authorizer is invoked under
  # `/authorizers/<id>` rather than under a method and path.
  source_arn = "${var.websocket_api_execution_arn}/authorizers/${aws_apigatewayv2_authorizer.websocket_connect.id}"
}

resource "aws_apigatewayv2_integration" "websocket" {
  for_each = local.websocket_routes

  api_id           = var.websocket_api_id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.this[each.key].invoke_arn

  # How API Gateway calls Lambda, not how the client reached API Gateway. A
  # websocket frame has no method of its own.
  integration_method = "POST"

  timeout_milliseconds = min((local.functions[each.key].timeout + 1) * 1000, 29000)
}

resource "aws_apigatewayv2_route" "websocket" {
  for_each = local.websocket_routes

  api_id    = var.websocket_api_id
  route_key = each.value.route_key
  target    = "integrations/${aws_apigatewayv2_integration.websocket[each.key].id}"

  authorization_type = each.value.authorised ? "CUSTOM" : "NONE"
  authorizer_id      = each.value.authorised ? aws_apigatewayv2_authorizer.websocket_connect.id : null
}

resource "aws_lambda_permission" "websocket_route" {
  for_each = local.websocket_routes

  statement_id  = "AllowInvocationFromWebsocketApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this[each.key].function_name
  principal     = "apigateway.amazonaws.com"

  # One route of one stage of one API. The route key is the path segment here,
  # so `$connect` and `$disconnect` appear literally.
  source_arn = "${var.websocket_api_execution_arn}/${var.websocket_stage_name}/${each.value.route_key}"
}

check "every_function_is_named_and_assumable" {
  assert {
    condition = (
      length(setsubtract(keys(local.functions), keys(var.function_names))) == 0 &&
      length(setsubtract(keys(var.function_names), keys(local.functions))) == 0
    )
    error_message = "function_names must name exactly the functions this module deploys. Missing: ${join(", ", setsubtract(keys(local.functions), keys(var.function_names)))}. Unexpected: ${join(", ", setsubtract(keys(var.function_names), keys(local.functions)))}."
  }

  assert {
    condition = (
      length(setsubtract(keys(local.functions), keys(var.role_arns))) == 0 &&
      length(setsubtract(keys(var.role_arns), keys(local.functions))) == 0
    )
    error_message = "role_arns must cover exactly the functions this module deploys. Missing: ${join(", ", setsubtract(keys(local.functions), keys(var.role_arns)))}."
  }
}
