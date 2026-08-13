data "aws_region" "current" {}

resource "aws_apigatewayv2_api" "this" {
  name          = "${var.name_prefix}-sockets"
  description   = "Websocket API pushing finished transcriptions to the browser"
  protocol_type = "WEBSOCKET"

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

    logging_level = "ERROR"

    throttling_rate_limit  = var.throttling_rate_limit
    throttling_burst_limit = var.throttling_burst_limit
  }

  tags = {
    Name = "${var.name_prefix}-sockets-${var.stage_name}"
  }
}
