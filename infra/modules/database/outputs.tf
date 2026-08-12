output "table_name" {
  description = "Table name. Every function reads it from an environment variable."
  value       = aws_dynamodb_table.transcriptions.name
}

output "table_arn" {
  description = "Table ARN. The concrete resource every function policy is scoped to."
  value       = aws_dynamodb_table.transcriptions.arn
}
