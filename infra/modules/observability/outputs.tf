output "alert_topic_arn" {
  description = "Topic every alarm publishes to. Subscribe to it to be told; nothing here does that for you."
  value       = aws_sns_topic.alerts.arn
}

output "alert_topic_kms_key_arn" {
  description = "Key encrypting the topic. CloudWatch is granted use of it, which the AWS-managed SNS key does not allow."
  value       = aws_kms_key.alerts.arn
}

output "alarm_names" {
  description = "The alarms this module raises, so what is watched can be read without opening the console."
  value = sort([
    aws_cloudwatch_metric_alarm.function_errors.alarm_name,
    aws_cloudwatch_metric_alarm.function_throttles.alarm_name,
    aws_cloudwatch_metric_alarm.asynchronous_failures.alarm_name,
    aws_cloudwatch_metric_alarm.api_server_errors.alarm_name,
  ])
}
