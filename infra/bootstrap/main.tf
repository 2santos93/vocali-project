data "aws_caller_identity" "current" {}

locals {
  # Bucket names are globally unique across all of AWS, so the account id is
  # part of the name rather than a random suffix: it is stable, so a second
  # apply from a clean checkout addresses the same bucket.
  state_bucket_name = "${var.project_name}-tfstate-${data.aws_caller_identity.current.account_id}"
  lock_table_name   = "${var.project_name}-tfstate-locks"
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

# State locking. Two applies against the same state at once is how a state
# file gets corrupted, and CI plus a human running a local apply is the usual
# way it happens.
#
# Terraform is moving towards S3-native locking (`use_lockfile`), which needs
# no table at all. The table is what the environments configure today because
# it is the mechanism supported across the whole version range in
# `required_version`; the migration is a backend argument change and a
# `terraform init -migrate-state`, with no resource to recreate.
resource "aws_dynamodb_table" "state_lock" {
  name         = local.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }

  deletion_protection_enabled = true

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name = local.lock_table_name
  }
}
