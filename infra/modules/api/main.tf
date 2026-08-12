# The front door, and only the front door: the API, the authorizer every
# protected route points at, the stage and its access log. The routes and the
# integrations live in the `lambda` module, next to the functions they reach.
#
# That split is not an aesthetic choice. `start-transcription-job` has to be
# told the URL its provider callback comes back to, which is derived from this
# API's endpoint, and the routes have to be told the ARNs of the functions
# they invoke. Putting both halves in one module makes those two facts
# circular; putting the routes with the functions makes the dependency run one
# way, from `lambda` to `api`.

resource "aws_apigatewayv2_api" "this" {
  name          = "${var.name_prefix}-api"
  description   = "HTTP API for the ${var.name_prefix} transcription platform"
  protocol_type = "HTTP"

  # No `cors_configuration`, deliberately. No browser calls this API: the Nuxt
  # server is the only client, it calls from its own runtime with the access
  # token it holds, and a preflight never happens. Configuring CORS here would
  # publish an allow-list for requests that do not exist and would be the
  # first thing to loosen the day something looked broken.
  #
  # The one browser-to-AWS request this platform does make — the direct audio
  # upload — bypasses the API entirely and is answered by the bucket's own
  # CORS rule.

  tags = {
    Name = "${var.name_prefix}-api"
  }
}

# Cognito issues the tokens, so API Gateway validates them: signature against
# the pool's JWKS, `iss`, `aud`/`client_id`, and expiry, before any function is
# invoked. A request that fails is rejected at the edge and is never billed as
# an invocation.
#
# The claims reach the handler in `requestContext.authorizer.jwt.claims`, and
# `sub` from there is the only identity the application accepts. Nothing in
# the handlers reads a user id from a path, a query or a body.
resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.this.id
  name             = "${var.name_prefix}-cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    # The app client id. On a Cognito access token the audience arrives as
    # `client_id` rather than `aud`, and API Gateway checks whichever of the
    # two the token carries, so one value covers both token types.
    audience = [var.user_pool_client_id]
    issuer   = var.user_pool_issuer_url
  }
}

# Created here with a retention rather than left to API Gateway, for the same
# reason the function log groups are: a group created by the service keeps its
# lines for ever, and these lines describe requests made on clinical records.
resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${var.name_prefix}-api"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "/aws/apigateway/${var.name_prefix}-api"
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  description = "The only stage. Its name keeps the stage out of the URL."

  # A route added by a plan is reachable as soon as that plan is applied.
  # Without this a deployment resource has to be created and pointed at the
  # stage by hand, which is a second thing to forget.
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn

    # Enough to answer "which request was that, and what did it do", and no
    # more. `routeKey` is the template — `GET /transcriptions/{transcriptionId}`
    # — so no record identifier is written here, and the authenticated subject
    # is deliberately absent: the application's own log lines already carry
    # the user, correlated by `requestId`, and repeating it on every access
    # line spreads an identifier for clinical records across a second store
    # with a second retention.
    format = jsonencode({
      requestId               = "$context.requestId"
      requestTime             = "$context.requestTime"
      httpMethod              = "$context.httpMethod"
      routeKey                = "$context.routeKey"
      status                  = "$context.status"
      protocol                = "$context.protocol"
      responseLength          = "$context.responseLength"
      responseLatency         = "$context.responseLatency"
      integrationStatus       = "$context.integrationStatus"
      integrationErrorMessage = "$context.integrationErrorMessage"
      authorizerError         = "$context.authorizer.error"
    })
  }

  default_route_settings {
    # Per-route metrics, which is what makes an alarm able to say which
    # endpoint started failing rather than that the API did.
    detailed_metrics_enabled = true

    # A ceiling, not a quota. The account's default is ten thousand requests a
    # second, which for this platform is not a limit at all — it is the number
    # of Lambda invocations a runaway client can bill before anyone notices.
    throttling_rate_limit  = var.throttling_rate_limit
    throttling_burst_limit = var.throttling_burst_limit
  }

  tags = {
    Name = "${var.name_prefix}-api-default"
  }
}
