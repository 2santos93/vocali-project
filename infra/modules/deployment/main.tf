data "aws_partition" "current" {}

data "aws_caller_identity" "current" {}

locals {
  # Created by infra/bootstrap, once per account. Its ARN is derived rather
  # than read through a data source or a remote state: it is entirely
  # determined by the account and the issuer's host, and a data source here
  # would make every plan in this environment depend on a lookup that fails
  # confusingly when bootstrap has not been applied.
  oidc_provider_arn = coalesce(
    var.oidc_provider_arn,
    "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com",
  )

  role_name = "${var.name_prefix}-github-deploy"

  code_arns = concat(values(var.function_arns), [var.ssr_function_arn])
}

# The role GitHub Actions assumes. There is no access key anywhere in this
# repository, in this account, or in GitHub's secrets: a workflow presents a
# token GitHub signed, STS validates it against the identity provider and
# hands back credentials that expire in an hour.
data "aws_iam_policy_document" "assume_role" {
  statement {
    sid     = "GitHubActionsWebIdentity"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    # Without this the role would trust any token the provider issued —
    # which is to say, a workflow in any repository on GitHub.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # And this is what makes it one repository, and within it the specific
    # branches, tags or environments named. `sub` is a claim GitHub composes,
    # not one a workflow can set.
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

# What a deployment is permitted to do, and nothing beyond it.
#
# This role cannot apply Terraform. It updates the code inside functions that
# already exist, writes the built assets into the bucket that already exists,
# and invalidates the distribution that already exists. It cannot create a
# role, change a policy, read the state file, touch the table, the audio, the
# transcripts or the user pool, or delete any of them.
#
# The reasoning is in ADR 10. In short: a role that can apply this
# configuration is a role that can rewrite every policy in it, and granting
# that to anything that runs on a push undoes the least privilege the rest of
# these modules spend their lines establishing. Criterion H3 asks that
# deployment carry no long-lived credential, which this satisfies without
# handing the pipeline the account.
resource "aws_iam_role_policy" "github_actions" {
  name = "${local.role_name}-policy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      {
        Sid    = "UpdateFunctionCode"
        Effect = "Allow"
        # Code only. UpdateFunctionConfiguration is absent on purpose: memory,
        # timeout, role and environment are decided in Terraform and reviewed
        # there, and a pipeline that could change them could give a function a
        # different role.
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
        Sid    = "InvalidateCache"
        Effect = "Allow"
        # One distribution. GetInvalidation is what `aws cloudfront wait`
        # polls, so a workflow can finish when the edge has actually caught up
        # rather than when the request was accepted.
        Action   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
        Resource = [var.distribution_arn]
      },
    ])
  })
}
