data "aws_caller_identity" "current" {}

locals {
  # The path the transcription provider calls back on. It is a local rather
  # than a variable because it is not a choice an environment gets to make:
  # the same string has to be the route key below and the base of
  # PROVIDER_CALLBACK_BASE_URL, and the job the provider was given carries the
  # URL for as long as it runs.
  webhook_route_path = "/webhooks/transcription-provider"

  # Every function gets every variable.
  #
  # `loadConfig` validates the whole schema during initialisation, in the
  # composition root, so a function missing one refuses to start — it does not
  # fail later on the one request that needed it. That is deliberate in the
  # application, and it means there is no such thing as a variable only some
  # functions need.
  #
  # AWS_REGION is absent, and its absence is not an oversight. It is a
  # reserved key: Lambda populates it in the execution environment and rejects
  # any attempt to set it, so a function that declared it would fail to update
  # at all. The application reads it from the runtime, like every AWS SDK does.
  #
  # Nothing here is a secret. The two credentials this platform holds are in
  # Parameter Store as SecureStrings, and what appears below are their paths —
  # which is what makes criterion F4 hold: a plaintext environment variable is
  # readable by anyone with lambda:GetFunctionConfiguration, and these are
  # readable to no effect.
  environment_variables = {
    AUDIO_BUCKET_NAME         = var.audio_bucket_name
    TRANSCRIPTIONS_TABLE_NAME = var.transcriptions_table_name

    SPEECHMATICS_API_KEY_PARAMETER        = var.provider_api_key_parameter_name
    SPEECHMATICS_WEBHOOK_SECRET_PARAMETER = var.provider_webhook_secret_parameter_name

    PROVIDER_CALLBACK_BASE_URL  = "${var.api_endpoint}${local.webhook_route_path}"
    PROVIDER_REQUEST_TIMEOUT_MS = tostring(var.provider_request_timeout_ms)
    PROVIDER_MAX_ATTEMPTS       = tostring(var.provider_max_attempts)

    LOG_LEVEL = var.log_level

    # Set although the configuration schema does not read it yet. The
    # application currently writes transcripts through the same storage
    # adapter, and therefore the same bucket, as the audio — see the note in
    # README.md. The value the code will need the day that is corrected is
    # already here, and an unrecognised variable is ignored by the schema.
    TRANSCRIPTS_BUCKET_NAME = var.transcripts_bucket_name
  }

  # Memory and timeout are chosen per function, from what that function does.
  #
  # Memory is also CPU: Lambda scales the two together, so 512 MB is not a
  # generous allocation for a handler that initialises three AWS SDK clients,
  # it is the point below which the cold start costs more in billed
  # milliseconds than the extra memory does. The functions that parse or build
  # a whole transcript get a full vCPU at 1024 MB.
  #
  # Timeouts are bounds on failure, not budgets for success. Every one of
  # these handlers answers in well under a second when nothing is wrong; the
  # number is how long the platform waits before deciding something is.
  #
  # An HTTP API integration gives up at 30 seconds whatever the function's own
  # timeout says, so no function on a route is given more than 29: past that
  # the caller has already had a 504 and the remaining seconds are billed to
  # nobody's benefit.
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
      # Writes the finished text to S3 and the record to DynamoDB. The body is
      # a whole consultation's transcript, so it is the largest request this
      # API accepts and the extra memory is for serialising it.
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
      # Reads the provider's API key from Parameter Store and calls the
      # provider to mint a temporary key. The only user-facing function whose
      # latency depends on a third party, so it gets everything API Gateway
      # will wait for.
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
      # Parses the provider's transcript payload — the biggest JSON document
      # this platform handles — builds the text from it, writes the object and
      # saves the record. A full vCPU, because the parse is the work.
      #
      # No authorizer on this route. See the comment on the route itself.
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
      # Invoked by S3, not by a request, so the 30-second ceiling does not
      # apply and nobody is waiting. It signs a read URL and submits the job
      # to the provider, and that submission is retried: three attempts of ten
      # seconds each plus backoff is a worst case around thirty-one seconds,
      # which a 30-second timeout would cut off during the final attempt.
      # Sixty leaves the retry policy room to finish being wrong.
      route = null
    }
  }

  http_functions = { for name, spec in local.functions : name => spec if spec.route != null }
}

# The bundle for each function, zipped.
#
# `source_file` is what infra/build/bundle-functions.sh wrote. If it is not
# there the plan fails here, with the command to run — which is the point.
# The alternative, a package built from an empty directory or skipped by a
# feature flag, deploys a function that answers every request with an
# initialisation error and looks deployed while doing it.
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

  # Graviton. Around a fifth cheaper per gigabyte-second and no slower for
  # this workload: the bundle is JavaScript, every dependency is JavaScript,
  # and nothing here compiles a native module that would have to be built for
  # the architecture.
  architectures = ["arm64"]

  filename         = data.archive_file.function[each.key].output_path
  source_code_hash = data.archive_file.function[each.key].output_base64sha256

  memory_size = each.value.memory_size
  timeout     = each.value.timeout

  environment {
    variables = local.environment_variables
  }

  # Names the group the functions module already created with a retention,
  # rather than letting Lambda create one that never expires. The name is the
  # same either way; stating it is what makes the dependency real, so the
  # group cannot be removed while a function is still writing to it.
  #
  # The format is left as text. The application logs structured JSON through
  # pino already, and Lambda's JSON log format wraps what it captures in a
  # second envelope, which would put every field a query needs one level
  # further down for no gain.
  logging_config {
    log_format = "Text"
    log_group  = var.log_group_names[each.key]
  }

  tags = {
    Name = var.function_names[each.key]
  }
}

# Where an asynchronous invocation goes once Lambda has stopped retrying it.
#
# Only for the functions the functions module granted SendMessage to, which is
# the set actually invoked asynchronously. Configuring a destination for a
# function invoked by API Gateway would be inert — a request-response
# invocation has no failure destination — and would quietly suggest otherwise.
resource "aws_lambda_function_event_invoke_config" "asynchronous" {
  for_each = toset(var.asynchronous_function_keys)

  function_name = aws_lambda_function.this[each.value].function_name

  # Two retries, which is the default, and worth stating: the handler is
  # idempotent by design — a redelivered event for a transcription already
  # past PENDING_UPLOAD is acknowledged without contacting the provider — so
  # retrying is safe and cannot produce a second job.
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

# S3 notifies the function directly. No queue in between, because the event is
# already durable in the sense that matters: Lambda retries it, and what it
# cannot deliver lands in the dead-letter queue above.
resource "aws_s3_bucket_notification" "audio_uploaded" {
  bucket = var.audio_bucket_name

  lambda_function {
    lambda_function_arn = aws_lambda_function.this["start-transcription-job"].arn

    # Every creation event, not only Post. The browser's upload is a presigned
    # POST today, but a multipart completion or a server-side copy would land
    # an object here just as legitimately, and narrowing this to the one verb
    # currently in use means such an object is silently never transcribed.
    events = ["s3:ObjectCreated:*"]

    # The prefix is what keeps this from feeding itself: anything the platform
    # writes back into this bucket under another prefix creates an object too,
    # and without the filter that object would start a transcription job.
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

  # Scoped to one bucket, and to one account. A bucket ARN carries no account
  # id — S3 names are global — so without source_account the grant would be
  # satisfied by a bucket of that name in somebody else's account, which is a
  # name anyone can try to take.
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

  # 2.0, which is the event shape every handler here is written against —
  # `requestContext.authorizer.jwt.claims`, lowercased header names, a single
  # `rawPath`. Under 1.0 the claims arrive somewhere else entirely and every
  # authenticated route would 401.
  payload_format_version = "2.0"

  # The function's own timeout plus a second, so the function times out first
  # and its error is what gets logged. The other way round, API Gateway
  # returns 504 while the function is still running and the log line that
  # explains the failure is written after nobody is listening.
  timeout_milliseconds = min((each.value.timeout + 1) * 1000, 30000)
}

resource "aws_apigatewayv2_route" "this" {
  for_each = local.http_functions

  api_id    = var.api_id
  route_key = "${each.value.route.method} ${each.value.route.path}"
  target    = "integrations/${aws_apigatewayv2_integration.this[each.key].id}"

  # The webhook is the one route with no authorizer, and it is not an
  # oversight.
  #
  # The caller is the transcription provider. It holds no Cognito token and
  # cannot be made to hold one, so a JWT authorizer here would reject every
  # legitimate callback and the platform would never complete a transcription.
  #
  # What authenticates it instead is a shared secret, generated out of band,
  # stored in Parameter Store as a SecureString, handed to the provider when
  # the job is submitted and echoed back in the Authorization header. The
  # handler compares it in constant time — hashing both sides first, so the
  # comparison examines the same number of bytes whatever was presented and
  # leaks neither the secret's length nor how far a guess got — and it does so
  # before it reads the query string, before it parses the body, and before it
  # touches a use case.
  #
  # That check is the entire boundary between the open internet and a write
  # into a named user's clinical history, which is why it is the first thing
  # the handler does and why it is covered on both the accept and the reject
  # path.
  authorization_type = each.value.route.authenticated ? "JWT" : "NONE"
  authorizer_id      = each.value.route.authenticated ? var.jwt_authorizer_id : null
}

resource "aws_lambda_permission" "api_gateway" {
  for_each = local.http_functions

  statement_id  = "AllowInvocationFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this[each.key].function_name
  principal     = "apigateway.amazonaws.com"

  # One method on one path of one stage of one API — not the whole API with a
  # trailing wildcard, which is what makes every function invocable by every
  # route the day somebody adds one.
  #
  # The `*` inside a path stands for a path parameter, which is the only form
  # API Gateway matches these against: the ARN is compared with the request's
  # actual path, so a literal `{transcriptionId}` would never match anything.
  source_arn = "${var.api_execution_arn}/${var.stage_name}/${each.value.route.method}${each.value.route.permission_path}"
}
