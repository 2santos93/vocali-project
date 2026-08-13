resource "aws_apigatewayv2_api" "this" {
  name          = "${var.name_prefix}-api"
  description   = "HTTP API for the ${var.name_prefix} transcription platform"
  protocol_type = "HTTP"

  tags = {
    Name = "${var.name_prefix}-api"
  }
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.this.id
  name             = "${var.name_prefix}-cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [var.user_pool_client_id]
    issuer   = var.user_pool_issuer_url
  }
}

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

  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn

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

    throttling_rate_limit  = var.throttling_rate_limit
    throttling_burst_limit = var.throttling_burst_limit
  }

  tags = {
    Name = "${var.name_prefix}-api-default"
  }
}
