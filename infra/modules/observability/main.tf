data "aws_partition" "current" {}

data "aws_caller_identity" "current" {}

locals {
  function_metric_ids = { for name, full_name in var.function_names : replace(name, "-", "_") => full_name }
}

# Where an alarm goes. Encrypted, because a topic is a store until it is
# delivered and this account's policy is that everything at rest is encrypted.
resource "aws_kms_key" "alerts" {
  description             = "Encrypts the ${var.name_prefix} alert topic"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.alerts_key.json

  tags = {
    Name = "${var.name_prefix}-alerts"
  }
}

resource "aws_kms_alias" "alerts" {
  name          = "alias/${var.name_prefix}-alerts"
  target_key_id = aws_kms_key.alerts.key_id
}

data "aws_iam_policy_document" "alerts_key" {
  # Without this the key is unmanageable: IAM policies in the account have no
  # effect on a key whose own policy does not delegate to the account.
  statement {
    sid     = "DelegateToAccountIam"
    effect  = "Allow"
    actions = ["kms:*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    resources = ["*"]
  }

  statement {
    sid    = "AllowCloudWatchToPublish"
    effect = "Allow"

    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic" "alerts" {
  name              = "${var.name_prefix}-alerts"
  kms_master_key_id = aws_kms_key.alerts.arn

  tags = {
    Name = "${var.name_prefix}-alerts"
  }
}

resource "aws_sns_topic_subscription" "email" {
  for_each = toset(var.alarm_email_addresses)

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_cloudwatch_metric_alarm" "function_errors" {
  alarm_name        = "${var.name_prefix}-function-errors"
  alarm_description = "One or more Lambda functions raised an unhandled error. Every expected failure in this application is a 4xx, so this means a defect: open Lambda metrics grouped by function name to see which one, then read its log group."

  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = var.error_threshold
  evaluation_periods  = 1

  # No data means no invocations, which in a quiet environment is the ordinary
  # state and is not a failure. Alarming on it would page for a weekend.
  treat_missing_data = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  namespace   = "AWS/Lambda"
  metric_name = "Errors"
  period      = var.period_seconds
  statistic   = "Sum"
}

resource "aws_cloudwatch_metric_alarm" "function_throttles" {
  alarm_name        = "${var.name_prefix}-function-throttles"
  alarm_description = "Lambda refused an invocation for want of concurrency. Nothing ran, so there is no log line: on a synchronous route the caller saw a 429, and on the S3 notification an upload was simply never transcribed. Group Lambda metrics by function name to see which one."

  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = var.throttle_threshold
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  namespace   = "AWS/Lambda"
  metric_name = "Throttles"
  period      = var.period_seconds
  statistic   = "Sum"
}

resource "aws_cloudwatch_metric_alarm" "asynchronous_failures" {
  alarm_name        = "${var.name_prefix}-asynchronous-failures"
  alarm_description = "An upload event exhausted its retries and landed in the dead-letter queue. That is one recording that will never be transcribed, with the user still waiting on it."

  namespace   = "AWS/SQS"
  metric_name = "ApproximateNumberOfMessagesVisible"
  statistic   = "Maximum"
  dimensions  = { QueueName = var.dead_letter_queue_name }

  period              = var.period_seconds
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1

  treat_missing_data = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "api_server_errors" {
  alarm_name        = "${var.name_prefix}-api-server-errors"
  alarm_description = "The HTTP API returned 5xx. This catches what happens either side of a function (an integration timeout, a missing invoke permission, a malformed response), none of which appears in the Lambda error metric."

  namespace   = "AWS/ApiGateway"
  metric_name = "5xx"
  statistic   = "Sum"
  dimensions  = { ApiId = var.api_id }

  period              = var.period_seconds
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = var.error_threshold
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}
