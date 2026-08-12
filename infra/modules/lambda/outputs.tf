output "function_arns" {
  description = "Logical name to function ARN. The deployment role's permission to update code is scoped to exactly these."
  value       = { for key, function in aws_lambda_function.this : key => function.arn }
}

output "function_names" {
  description = "Logical name to deployed function name, which is also the dimension of every CloudWatch metric an alarm here watches."
  value       = { for key, function in aws_lambda_function.this : key => function.function_name }
}

output "webhook_url" {
  description = "The URL the transcription provider calls back on. Handed to it per job with the transcription's identity appended as query parameters, and the value the application receives as PROVIDER_CALLBACK_BASE_URL."
  value       = local.environment_variables.PROVIDER_CALLBACK_BASE_URL
}

output "route_keys" {
  description = "Every route this module attached to the API, so a reader can see the surface without opening the console."
  value       = sort([for route in aws_apigatewayv2_route.this : route.route_key])
}

output "unauthenticated_route_keys" {
  description = "The routes with no authorizer. It is deliberately an output: an unauthenticated route should be visible from outside the module, not buried in it."
  value       = sort([for name, spec in local.http_functions : "${spec.route.method} ${spec.route.path}" if !spec.route.authenticated])
}
