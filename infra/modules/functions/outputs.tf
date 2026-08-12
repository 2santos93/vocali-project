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
