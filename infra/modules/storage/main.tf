locals {
  buckets = {
    audio       = var.audio_bucket_name
    transcripts = var.transcripts_bucket_name
  }

  audio_object_prefix      = "audio/"
  transcript_object_prefix = "transcripts/"
}

resource "aws_s3_bucket" "this" {
  for_each = local.buckets

  bucket        = each.value
  force_destroy = var.force_destroy

  tags = {
    Name = each.value
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ACLs disabled outright, so an object ACL cannot grant access to anyone and
# the bucket policy is the only place access is expressed.
resource "aws_s3_bucket_ownership_controls" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.kms_key_arn == null ? "AES256" : "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    # No effect under AES256, and a large reduction in KMS calls under
    # aws:kms, where every object would otherwise need its own data key.
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id

  versioning_configuration {
    status = "Enabled"
  }
}

data "aws_iam_policy_document" "deny_insecure_transport" {
  for_each = aws_s3_bucket.this

  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]

    resources = [
      each.value.arn,
      "${each.value.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id
  policy = data.aws_iam_policy_document.deny_insecure_transport[each.key].json

  depends_on = [aws_s3_bucket_public_access_block.this]
}

resource "aws_s3_bucket_cors_configuration" "audio" {
  bucket = aws_s3_bucket.this["audio"].id

  cors_rule {
    allowed_methods = ["POST"]
    allowed_origins = var.cors_allowed_origins

    allowed_headers = ["Content-Type"]

    # Read by the upload code to confirm what S3 stored.
    expose_headers = ["ETag", "Location"]

    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "audio" {
  bucket = aws_s3_bucket.this["audio"].id

  rule {
    id     = "expire-raw-audio"
    status = "Enabled"

    filter {
      prefix = local.audio_object_prefix
    }

    expiration {
      days = var.audio_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_retention_days
    }
  }

  # An upload the browser abandoned half way leaves parts that are billed and
  # are invisible in the object listing.
  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # Expiring a versioned object leaves a delete marker behind, and a bucket
  # full of markers over nothing is both a cost and a slower listing.
  rule {
    id     = "remove-orphaned-delete-markers"
    status = "Enabled"

    filter {}

    expiration {
      expired_object_delete_marker = true
    }
  }

  depends_on = [aws_s3_bucket_versioning.this]
}

resource "aws_s3_bucket_lifecycle_configuration" "transcripts" {
  bucket = aws_s3_bucket.this["transcripts"].id

  rule {
    id     = "expire-superseded-transcripts"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_retention_days
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

  depends_on = [aws_s3_bucket_versioning.this]
}
