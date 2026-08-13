data "aws_partition" "current" {}

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

data "aws_kms_alias" "ssm" {
  count = var.secrets_kms_key_arn == null ? 1 : 0

  name = "alias/aws/ssm"
}

locals {
  secrets_kms_key_arn = coalesce(var.secrets_kms_key_arn, one(data.aws_kms_alias.ssm[*].target_key_arn))

  parameter_arn_prefix = "arn:${data.aws_partition.current.partition}:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter"

  secret_parameter_arns = [for name in var.secret_parameter_names : "${local.parameter_arn_prefix}${name}"]

  ssr_function_name  = "${var.name_prefix}-web-ssr"
  ssr_log_group_name = "/aws/lambda/${local.ssr_function_name}"

  # The host of the function URL. CloudFront takes an origin domain, and
  # Lambda hands out a URL; there is no attribute for the host on its own.
  ssr_origin_domain = replace(aws_lambda_function_url.ssr.function_url, "/^https?://([^/]*)/?$/", "$1")

  assets_origin_id = "assets"
  ssr_origin_id    = "ssr"

  hashed_asset_path_pattern = "/_nuxt/*"
}

# The build output. Private, like every other bucket here: CloudFront reaches
# it through an origin access control and nobody else reaches it at all.
resource "aws_s3_bucket" "assets" {
  bucket        = var.assets_bucket_name
  force_destroy = var.force_destroy

  tags = {
    Name = var.assets_bucket_name
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "assets" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.assets.arn,
      "${aws_s3_bucket.assets.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  dynamic "statement" {
    for_each = aws_cloudfront_distribution.this[*].arn

    content {
      sid    = "AllowThisDistributionToRead"
      effect = "Allow"

      principals {
        type        = "Service"
        identifiers = ["cloudfront.amazonaws.com"]
      }

      actions   = ["s3:GetObject"]
      resources = ["${aws_s3_bucket.assets.arn}/*"]

      condition {
        test     = "StringEquals"
        variable = "AWS:SourceArn"
        values   = [statement.value]
      }
    }
  }
}

resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id
  policy = data.aws_iam_policy_document.assets.json

  depends_on = [aws_s3_bucket_public_access_block.assets]
}

data "aws_iam_policy_document" "ssr_assume_role" {
  statement {
    sid     = "LambdaAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ssr" {
  name               = "${local.ssr_function_name}-role"
  description        = "Execution role for the Nuxt server-side renderer"
  assume_role_policy = data.aws_iam_policy_document.ssr_assume_role.json

  tags = {
    Name = "${local.ssr_function_name}-role"
  }
}

resource "aws_cloudwatch_log_group" "ssr" {
  name              = local.ssr_log_group_name
  retention_in_days = var.log_retention_days

  tags = {
    Name = local.ssr_log_group_name
  }
}

resource "aws_iam_role_policy" "ssr" {
  name = "${local.ssr_function_name}-policy"
  role = aws_iam_role.ssr.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid      = "WriteOwnLogs"
          Effect   = "Allow"
          Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
          Resource = ["${aws_cloudwatch_log_group.ssr.arn}:*"]
        }
      ],
      length(local.secret_parameter_arns) == 0 ? [] : [
        {
          Sid      = "ReadOwnSecrets"
          Effect   = "Allow"
          Action   = ["ssm:GetParameter"]
          Resource = local.secret_parameter_arns
        },
        {
          Sid      = "DecryptSecureStringParameters"
          Effect   = "Allow"
          Action   = ["kms:Decrypt"]
          Resource = [local.secrets_kms_key_arn]
        }
      ],
    )
  })
}

data "archive_file" "ssr" {
  type        = "zip"
  source_dir  = "${var.nuxt_output_dir}/server"
  output_path = "${var.nuxt_output_dir}/server.zip"

  lifecycle {
    precondition {
      condition     = fileexists("${var.nuxt_output_dir}/server/index.mjs")
      error_message = "No Nuxt server bundle at ${var.nuxt_output_dir}/server. Run NITRO_PRESET=aws_lambda pnpm --filter @vocali/web build before planning."
    }
  }
}

resource "aws_lambda_function" "ssr" {
  function_name = local.ssr_function_name
  description   = "Server-side renderer and backend for frontend for ${var.name_prefix}"
  role          = aws_iam_role.ssr.arn

  runtime = "nodejs24.x"
  handler = "index.handler"

  architectures = ["arm64"]

  filename         = data.archive_file.ssr.output_path
  source_code_hash = data.archive_file.ssr.output_base64sha256

  memory_size = var.ssr_memory_size

  # A page nobody has been served in fifteen seconds is a page the reader has
  # already given up on. The renderer's own upstream calls are far shorter.
  timeout = var.ssr_timeout

  environment {
    variables = var.environment_variables
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.ssr.name
  }

  tags = {
    Name = local.ssr_function_name
  }
}

resource "aws_lambda_function_url" "ssr" {
  function_name      = aws_lambda_function.ssr.function_name
  authorization_type = var.expose_ssr_publicly ? "NONE" : "AWS_IAM"

  invoke_mode = "BUFFERED"
}

resource "aws_lambda_permission" "public_ssr" {
  count = var.expose_ssr_publicly ? 1 : 0

  statement_id           = "AllowPublicInvocationOfFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.ssr.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "cloudfront_ssr" {
  count = var.expose_ssr_publicly ? 0 : 1

  statement_id  = "AllowInvocationFromCloudFront"
  action        = "lambda:InvokeFunctionUrl"
  function_name = aws_lambda_function.ssr.function_name
  principal     = "cloudfront.amazonaws.com"

  # One distribution. Not the CloudFront service at large, which would let any
  # distribution in any account invoke this renderer.
  source_arn = one(aws_cloudfront_distribution.this[*].arn)
}

resource "aws_cloudfront_origin_access_control" "assets" {
  name                              = "${var.name_prefix}-assets"
  description                       = "Signs CloudFront's reads of the ${var.name_prefix} asset bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "ssr" {
  name                              = "${var.name_prefix}-ssr"
  description                       = "Signs CloudFront's calls to the ${var.name_prefix} renderer's function URL"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Managed by AWS and referenced by name rather than by an id copied from the
# console, which is the same thing with a worse failure mode.
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

resource "aws_cloudfront_origin_request_policy" "ssr" {
  name    = "${var.name_prefix}-ssr"
  comment = "Forwards everything but Host to the renderer"

  headers_config {
    header_behavior = "allExcept"

    headers {
      items = ["host"]
    }
  }

  cookies_config {
    # The session lives in an httpOnly cookie, so a renderer that cannot see
    # cookies cannot tell who is asking.
    cookie_behavior = "all"
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${var.name_prefix}-security-headers"
  comment = "Security headers for every response from ${var.name_prefix}"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }

    content_type_options {
      override = true
    }

    # The application is never embedded, and a clinical record on a page
    # inside somebody else's frame is the classic clickjacking setup.
    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }

}

resource "aws_cloudfront_distribution" "this" {
  count = var.expose_ssr_publicly ? 0 : 1

  enabled         = true
  comment         = "${var.name_prefix} front end"
  price_class     = var.price_class
  is_ipv6_enabled = true

  origin {
    origin_id                = local.ssr_origin_id
    domain_name              = local.ssr_origin_domain
    origin_access_control_id = aws_cloudfront_origin_access_control.ssr.id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  origin {
    origin_id                = local.assets_origin_id
    domain_name              = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.assets.id
  }

  # Everything not matched below is a page, and a page is rendered.
  default_cache_behavior {
    target_origin_id       = local.ssr_origin_id
    viewer_protocol_policy = "redirect-to-https"

    # The renderer takes form posts and JSON, so the whole set. A read-only
    # site would list GET and HEAD and nothing else.
    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD"]

    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id   = aws_cloudfront_origin_request_policy.ssr.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = local.hashed_asset_path_pattern
    target_origin_id       = local.assets_origin_id
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD"]
    cached_methods  = ["GET", "HEAD"]

    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    compress = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${var.name_prefix}-web"
  }
}
