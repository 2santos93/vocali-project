output "api_id" {
  description = "Identifier of the HTTP API. Every route and integration attaches to it, and it is the dimension of the API's CloudWatch metrics."
  value       = aws_apigatewayv2_api.this.id
}

output "api_endpoint" {
  description = "Base URL of the API, with no trailing slash and no stage segment because the stage is $default. The application's PROVIDER_CALLBACK_BASE_URL is built from it."
  # Taken from the stage rather than from the API so that it cannot be read
  # before the stage exists, and trimmed because the stage reports it with a
  # trailing slash: a path is appended to this, and `…com//webhooks/…` is a
  # different URL from `…com/webhooks/…` to a router that is matching strings.
  value = trimsuffix(aws_apigatewayv2_stage.default.invoke_url, "/")
}

output "api_execution_arn" {
  description = "Prefix of the ARN a route is invoked under. Every lambda:InvokeFunction permission granted to API Gateway is scoped to one method and path beneath it."
  value       = aws_apigatewayv2_api.this.execution_arn
}

output "stage_name" {
  description = "The stage, so an invoke permission can name it rather than matching every stage with a wildcard."
  value       = aws_apigatewayv2_stage.default.name
}

output "jwt_authorizer_id" {
  description = "The Cognito JWT authorizer. Every route except the provider webhook points at it."
  value       = aws_apigatewayv2_authorizer.jwt.id
}

output "access_log_group_name" {
  description = "Log group holding the stage's access log, already created with an explicit retention."
  value       = aws_cloudwatch_log_group.access.name
}
