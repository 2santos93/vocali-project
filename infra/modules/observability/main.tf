data "aws_partition" "current" {}

data "aws_caller_identity" "current" {}

locals {
  # A CloudWatch metric-math identifier has to start with a lowercase letter
  # and hold nothing but letters, digits and underscores, so the hyphens in
  # the logical names come out.
  function_metric_ids = { for name, full_name in var.function_names : replace(name, "-", "_") => full_name }
}

# Four alarms.
#
# The number is a decision, not what was left after running out of ideas. An
# alarm that nobody would act on trains everyone to ignore the ones that
# matter, and a dashboard of twelve amber tiles is how a real failure goes
# unnoticed for a day. Each of these corresponds to a specific way this
# platform breaks in production, and each has an obvious first action.
#
# What is deliberately not alarmed: duration, concurrency, invocation count,
# 4xx. Those describe load. Load here is a handful of clinicians, and a number
# that moves when the product succeeds is not a signal that something is
# wrong.

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

  # CloudWatch publishes the alarm notification itself, so it is CloudWatch
  # that needs to encrypt under this key. The AWS-managed alias/aws/sns key
  # cannot be used for this: its policy does not admit the CloudWatch service
  # principal, and an alarm pointed at a topic encrypted with it fails to
  # publish — silently, which is the worst possible failure for an alarm.
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

# Empty by default. A subscription is an operational act — the address has to
# confirm it before anything is delivered — and an address written into a
# repository is a personal datum that outlives the person's involvement.
# `alarm_email_addresses` exists so an environment can declare them anyway;
# the README gives the one-line alternative.
resource "aws_sns_topic_subscription" "email" {
  for_each = toset(var.alarm_email_addresses)

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

# 1. A function threw.
#
# One alarm summing Errors across all eight rather than eight alarms, because
# the first action is the same in every case — read the log group — and eight
# alarms firing together during a bad deploy is eight notifications describing
# one event.
#
# The threshold is not zero-tolerance by accident. Every expected failure in
# this application is a returned Result and a 4xx; an Errors data point means
# an exception escaped a handler, which is a defect. A single one is worth
# knowing about.
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

  # The service-wide metric rather than a sum over each function. A metric-math
  # alarm takes ten elements, which put a ceiling on how many functions this
  # platform could have, and that ceiling was reached the moment four were
  # added. This account holds nothing but this application, so the aggregate is
  # exactly the same number without the arithmetic and without the limit — and
  # a function added later is covered without anyone remembering to add it.
  namespace   = "AWS/Lambda"
  metric_name = "Errors"
  period      = var.period_seconds
  statistic   = "Sum"
}

# 2. A function was throttled.
#
# Throttling is invisible from inside the function — there is no log line,
# because nothing ran. On a synchronous route the caller gets a 429; on the
# S3 notification the event is retried and then dropped, so an upload is
# simply never transcribed. Either way the cause is concurrency, and the fix
# is a quota increase or a reserved concurrency, neither of which anyone
# reaches for without knowing it is happening.
resource "aws_cloudwatch_metric_alarm" "function_throttles" {
  alarm_name        = "${var.name_prefix}-function-throttles"
  alarm_description = "Lambda refused an invocation for want of concurrency. Nothing ran, so there is no log line: on a synchronous route the caller saw a 429, and on the S3 notification an upload was simply never transcribed. Group Lambda metrics by function name to see which one."

  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = var.throttle_threshold
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  # The service-wide metric rather than a sum over each function. A metric-math
  # alarm takes ten elements, which put a ceiling on how many functions this
  # platform could have, and that ceiling was reached the moment four were
  # added. This account holds nothing but this application, so the aggregate is
  # exactly the same number without the arithmetic and without the limit — and
  # a function added later is covered without anyone remembering to add it.
  namespace   = "AWS/Lambda"
  metric_name = "Throttles"
  period      = var.period_seconds
  statistic   = "Sum"
}

# 3. An asynchronous invocation was given up on.
#
# The most valuable of the four. A message in the dead-letter queue is one
# recording that was uploaded, paid for in the user's attention, and will
# never be transcribed — and it is invisible from every other angle: the
# record sits at PENDING_UPLOAD, the API returned 200 long ago, and the user
# is looking at a spinner that will not resolve.
#
# The first action is to read the message, which names the object, fix
# whatever rejected it and redrive.
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

  # Not notBreaching: SQS stops publishing this metric for a queue that has
  # been idle, and an empty queue is exactly the state that stops publishing.
  # Missing data here means nothing has failed.
  treat_missing_data = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# 4. The API answered 5xx.
#
# Not the same signal as the first alarm. This one catches the failures that
# happen either side of the function: an integration timing out at thirty
# seconds, a permission that stops the API invoking a function at all, a
# malformed response from a handler. In each case the caller sees a broken
# product and Lambda's Errors metric shows nothing.
resource "aws_cloudwatch_metric_alarm" "api_server_errors" {
  alarm_name        = "${var.name_prefix}-api-server-errors"
  alarm_description = "The HTTP API returned 5xx. This catches what happens either side of a function — an integration timeout, a missing invoke permission, a malformed response — none of which appears in the Lambda error metric."

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
