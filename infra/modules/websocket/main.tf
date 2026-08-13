# The websocket front door, and only the front door: the API, its stage and
# the access log. The routes, the integrations and the `$connect` authorizer
# live in the `lambda` module, beside the functions they reach.
#
# The same split as the HTTP `api` module, for the same reason: the functions
# have to be told this API's management endpoint, and the routes have to be
# told the ARNs of the functions they invoke. One module holding both makes
# those two facts circular.
#
# Why an API Gateway websocket API at all, when this platform has already ruled
# that a Lambda cannot hold a duplex socket — the ruling that sends live
# dictation straight from the browser to the provider? Because nothing here
# holds a socket. API Gateway holds it; the functions react to connect,
# disconnect and message events and are gone. See docs/adr/0011.

data "aws_region" "current" {}

resource "aws_apigatewayv2_api" "this" {
  name          = "${var.name_prefix}-sockets"
  description   = "Websocket API pushing finished transcriptions to the browser"
  protocol_type = "WEBSOCKET"

  # Which field of an incoming frame selects a route. Nothing in this design
  # routes on content — the browser sends nothing at all, it only listens — but
  # the attribute is required, so it names a field no message carries and every
  # unexpected frame falls to `$default`.
  route_selection_expression = "$request.body.action"

  tags = {
    Name = "${var.name_prefix}-sockets"
  }
}

# Created here with a retention rather than left to API Gateway, for the same
# reason every other log group in this stack is.
resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${var.name_prefix}-sockets"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "/aws/apigateway/${var.name_prefix}-sockets"
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = var.stage_name
  description = "The only stage. A websocket API cannot use $default, so the name is part of the URL."

  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn

    # `$context.identity.sourceIp` and no user, matching the HTTP API's
    # reasoning: the application's own lines already carry the subject,
    # correlated by request id, and repeating it here spreads an identifier for
    # clinical records across a second store with a second retention.
    #
    # **No query string field, deliberately.** `$connect` carries the
    # connection ticket there, and a format naming `$context.path` or the raw
    # request would write that credential into this group.
    #
    # That omission is a second line of defence, not the first. The ticket is
    # designed on the assumption that it *will* reach a log somewhere — it
    # lives thirty seconds and can be spent once, so a leaked line holds
    # something already expired, already used, or both. The design that made
    # that acceptable is what let this be a websocket at all; see the note on
    # the ticket store.
    format = jsonencode({
      requestId         = "$context.requestId"
      requestTime       = "$context.requestTime"
      eventType         = "$context.eventType"
      routeKey          = "$context.routeKey"
      connectionId      = "$context.connectionId"
      status            = "$context.status"
      sourceIp          = "$context.identity.sourceIp"
      integrationStatus = "$context.integrationStatus"
      integrationError  = "$context.integrationErrorMessage"
      authorizerError   = "$context.authorizer.error"
      errorMessage      = "$context.error.message"
    })
  }

  default_route_settings {
    detailed_metrics_enabled = true

    # `data_trace_enabled` is left off, and that is the setting that matters
    # here rather than a preference about noise: it writes full request and
    # response payloads to CloudWatch, and on `$connect` the request includes
    # the query string the ticket travels in.
    logging_level = "ERROR"

    # A ceiling on what a client reconnecting in a loop can bill. A connect is
    # a Lambda invocation and a conditional write; a browser that reconnects
    # every second because a bug in a fallback never settles is the case this
    # bounds.
    throttling_rate_limit  = var.throttling_rate_limit
    throttling_burst_limit = var.throttling_burst_limit
  }

  tags = {
    Name = "${var.name_prefix}-sockets-${var.stage_name}"
  }
}
