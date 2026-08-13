output "api_id" {
  description = "Identifier of the websocket API. Every route, integration and authorizer attaches to it, and it is the dimension of the API's CloudWatch metrics."
  value       = aws_apigatewayv2_api.this.id
}

output "browser_url" {
  description = "What the browser dials: wss://<api>.execute-api.<region>.amazonaws.com/<stage>. Returned to the client in the ticket response rather than configured into the front end, so the endpoint is written down once."
  # Taken from the stage rather than the API, so it cannot be read before the
  # stage exists. A websocket API has no $default stage, so unlike the HTTP
  # API's endpoint this genuinely carries a stage segment.
  value = trimsuffix(aws_apigatewayv2_stage.default.invoke_url, "/")
}

output "management_endpoint" {
  description = "What the server posts to. The same API over https, which is NOT the browser URL: sending a message to a wss:// endpoint fails inside the SDK."
  # Built rather than derived from `browser_url` by string surgery. A scheme
  # rewrite in HCL is a silent failure the day the invoke URL's shape changes,
  # and this value sits between a finished transcription and the browser
  # waiting for it.
  value = "https://${aws_apigatewayv2_api.this.id}.execute-api.${data.aws_region.current.region}.amazonaws.com/${aws_apigatewayv2_stage.default.name}"
}

output "api_execution_arn" {
  description = "Prefix of the ARN a route is invoked under, and the prefix every execute-api:ManageConnections grant is scoped beneath."
  value       = aws_apigatewayv2_api.this.execution_arn
}

output "stage_name" {
  description = "The stage, so an invoke permission and a ManageConnections grant can name it rather than matching every stage with a wildcard."
  value       = aws_apigatewayv2_stage.default.name
}

output "access_log_group_name" {
  description = "Log group holding the stage's access log, already created with an explicit retention."
  value       = aws_cloudwatch_log_group.access.name
}
