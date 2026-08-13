data "aws_caller_identity" "current" {}

locals {
  # Bucket names are globally unique across all of AWS, so the account id is
  # part of the name rather than a random suffix: it is stable, so a second
  # apply from a clean checkout addresses the same bucket.
  state_bucket_name = "${var.project_name}-tfstate-${data.aws_caller_identity.current.account_id}"
}

# The state file is the most sensitive artefact this repository produces. It
# holds every attribute of every resource, including the Cognito app client
# secret, which AWS generates and Terraform therefore records. That is why the
# bucket gets a customer-managed key rather than SSE-S3: key use is logged in
# CloudTrail, the key policy is a second, independent gate in front of the
# object, and rotation is automatic.
resource "aws_kms_key" "state" {
  description             = "Encrypts the ${var.project_name} Terraform state bucket"
  enable_key_rotation     = true
  deletion_window_in_days = 30

  tags = {
    Name = "${var.project_name}-tfstate"
  }
}

resource "aws_kms_alias" "state" {
  name          = "alias/${var.project_name}-tfstate"
  target_key_id = aws_kms_key.state.key_id
}

resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket_name

  # Destroying this bucket destroys the record of everything else. Removing
  # the guard has to be a deliberate edit, not a stray `terraform destroy`.
  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name = local.state_bucket_name
  }
}

# Versioning is not optional for a state bucket: it is the only way back from
# a corrupted or truncated state file.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
    # One data key per bucket instead of one per object: same protection, far
    # fewer KMS requests, and Terraform reads state on every plan.
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ACLs are disabled outright. With bucket-owner-enforced ownership an object
# ACL cannot grant access to anyone, so the bucket policy is the only place
# access is expressed and the only place a review has to look.
resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state.json

  # A policy applied before public access is blocked would leave a window,
  # however short, where a mistake in it is actually reachable.
  depends_on = [aws_s3_bucket_public_access_block.state]
}

data "aws_iam_policy_document" "state" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.state.arn,
      "${aws_s3_bucket.state.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-superseded-state-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.state_version_retention_days
    }
  }

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.state]
}

# The identity provider GitHub Actions authenticates as.
#
# It belongs here rather than in an environment for the same reason the state
# bucket does: there is one per AWS account, and both environments live in one
# account, so a copy in each would be two resources fighting over one name.
# The roles that trust it are per environment, in the `deployment` module.
#
# What this makes possible is the whole point of criterion H3: a workflow
# presents a short-lived token that GitHub signs and that names the repository,
# the branch and the workflow it came from, and STS exchanges it for
# credentials that expire in an hour. No access key exists anywhere, so none
# can leak, and none has to be rotated.
resource "aws_iam_openid_connect_provider" "github_actions" {
  url = "https://token.actions.githubusercontent.com"

  # The audience a workflow requests, and the one the trust policies check.
  # Without this list AWS would accept tokens minted for any audience,
  # including one issued to a completely different cloud.
  client_id_list = ["sts.amazonaws.com"]

  # No thumbprint_list. IAM verifies this endpoint's certificate against its
  # own store of trusted certificate authorities, so a thumbprint pinned here
  # would be a value that does nothing until the day GitHub rotates a leaf
  # certificate and every deployment stops.
}

# There is no lock table. Two applies against one state file is how state gets
# corrupted, and CI racing a local apply is the ordinary way it happens, but
# the S3 backend now takes the lock on the state object itself with a
# conditional write — `use_lockfile = true` in each environment's backend
# block. The DynamoDB table that used to be required is the older mechanism,
# and its backend argument is deprecated: it still works, and warns on every
# init. Nothing here has to exist for locking to happen.

# API Gateway writes access logs through a role named in an account-wide
# setting, not through the role of whatever created the stage. A websocket
# stage refuses to be created at all while it is unset, and it is one setting
# per account rather than per environment — which is why it lives here beside
# the other account-level singleton rather than in either environment, where
# dev and prod would take turns overwriting each other's.
resource "aws_iam_role" "api_gateway_logs" {
  name = "${var.project_name}-apigateway-logs"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "apigateway.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "api_gateway_logs" {
  role       = aws_iam_role.api_gateway_logs.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

resource "aws_api_gateway_account" "this" {
  cloudwatch_role_arn = aws_iam_role.api_gateway_logs.arn

  depends_on = [aws_iam_role_policy_attachment.api_gateway_logs]
}
