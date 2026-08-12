output "function_names" {
  description = "Logical name to full function name. The round that creates the functions must use these, because the log groups are already named after them."
  value       = local.function_names
}

output "role_arns" {
  description = "Logical name to execution role ARN, for the `role` argument of each function."
  value       = { for key, role in aws_iam_role.function : key => role.arn }
}

output "log_group_names" {
  description = "Logical name to log group name. Each already exists with an explicit retention, so no function creates its own."
  value       = { for key, group in aws_cloudwatch_log_group.function : key => group.name }
}

output "log_group_arns" {
  description = "Logical name to log group ARN, for anything that reads these logs rather than writes them."
  value       = { for key, group in aws_cloudwatch_log_group.function : key => group.arn }
}

output "dead_letter_queue_arn" {
  description = "Failure destination for asynchronous invocations. Goes in the event invoke configuration of every function invoked by an event rather than by a request."
  value       = aws_sqs_queue.asynchronous_failures.arn
}

output "dead_letter_queue_name" {
  description = "Name of the dead-letter queue, which is the dimension the alarm on its depth is scoped to."
  value       = aws_sqs_queue.asynchronous_failures.name
}

output "asynchronous_function_keys" {
  description = "The functions granted a failure destination, so the module that creates them configures one for exactly these and no others."
  value       = local.asynchronous_functions
}
