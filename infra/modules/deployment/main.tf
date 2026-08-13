data "aws_partition" "current" {}

data "aws_caller_identity" "current" {}

locals {
  oidc_provider_arn = coalesce(
    var.oidc_provider_arn,
    "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com",
  )

  role_name = "${var.name_prefix}-github-deploy"

  code_arns = concat(values(var.function_arns), [var.ssr_function_arn])
}

data "aws_iam_policy_document" "assume_role" {
  statement {
    sid     = "GitHubActionsWebIdentity"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    # Without this the role would trust any token the provider issued,
    # which is to say, a workflow in any repository on GitHub.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = var.subject_claims
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = local.role_name
  description        = "Assumed by GitHub Actions to deploy code and assets to ${var.name_prefix}"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json

  # An hour. A deployment that has not finished in an hour has not failed
  # gracefully, and the longer the session the longer a stolen one is useful.
  max_session_duration = 3600

  tags = {
    Name = local.role_name
  }
}

resource "aws_iam_role_policy" "github_actions" {
  name = "${local.role_name}-policy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      {
        Sid      = "UpdateFunctionCode"
        Effect   = "Allow"
        Action   = ["lambda:UpdateFunctionCode"]
        Resource = local.code_arns
      },
      {
        Sid    = "ObserveDeployment"
        Effect = "Allow"
        # `aws lambda wait function-updated` polls this. Without it a workflow
        # that deploys several functions in sequence races its own updates.
        Action   = ["lambda:GetFunction", "lambda:GetFunctionConfiguration"]
        Resource = local.code_arns
      },
      {
        Sid    = "PublishAssets"
        Effect = "Allow"
        # The objects, under the one bucket that holds build output. Nothing
        # here reaches the audio or the transcripts.
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = ["${var.assets_bucket_arn}/*"]
      },
      {
        Sid    = "CompareAssets"
        Effect = "Allow"
        # `aws s3 sync --delete` lists before it writes. Scoped to the bucket
        # itself, which is where a list is authorised, rather than to its
        # objects.
        Action   = ["s3:ListBucket"]
        Resource = [var.assets_bucket_arn]
      },
      ], var.distribution_arn == null ? [] : [
      {
        Sid      = "InvalidateCache"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
        Resource = [var.distribution_arn]
      },
    ])
  })
}
