data "aws_partition" "current" {}

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

# Only consulted when no customer-managed key was given, and for the same
# reason as in the functions module: resolving the alias means the grant names
# one concrete key instead of a wildcard.
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

  # Nuxt writes hashed, immutable files here and nowhere else, which is what
  # makes it the one path that can be cached for a year and served from S3
  # instead of from a function.
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

# No versioning, and this is the one bucket in the platform without it. Its
# contents are build output: every object here is reproducible from a commit,
# and a rollback is a redeploy of the previous build rather than a restore of
# a previous version. Versioning would keep every asset of every build for
# ever for nothing.
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

  # The only read grant on the bucket, and it is not to a principal anyone can
  # be: it is to the CloudFront service, acting for one named distribution.
  # Another distribution in this account, or anyone's, gets nothing.
  statement {
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
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id
  policy = data.aws_iam_policy_document.assets.json

  depends_on = [aws_s3_bucket_public_access_block.assets]
}

# The Nuxt server. Its own role and its own log group rather than the
# functions module's, because it is not one of the eight: it renders pages and
# holds the session, and what it may reach is a different list.
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
      # The renderer calls the API as the signed-in user, with that user's
      # token, so it needs no AWS permission to do it. The only thing it reads
      # from AWS is whatever credential it authenticates to Cognito with, and
      # that is a SecureString it is named here.
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

# The Nitro server bundle, as built by `NITRO_PRESET=aws_lambda nuxt build`.
#
# The whole directory, not one file: unlike the API bundles this one is
# produced by Nitro rather than by our own esbuild call, and it ships its own
# chunks beside the entry point.
#
# If the directory is not there the plan stops here with the command that
# builds it. There is no flag that makes this module create a distribution
# pointing at nothing.
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

  # Rendering a page is more work than any of the API handlers do: a Vue
  # render pass plus the fetches behind it, all on one thread whose speed is
  # bought with memory.
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

# IAM, not NONE. A function URL with no authorisation is a public HTTPS
# endpoint that bypasses CloudFront entirely — no security headers, no
# caching, no WAF later, and a second origin for the same application on a
# domain nobody would think to check.
resource "aws_lambda_function_url" "ssr" {
  function_name      = aws_lambda_function.ssr.function_name
  authorization_type = "AWS_IAM"

  # Buffered rather than streamed. Streaming would shorten time-to-first-byte
  # on a slow render, and it is not compatible with the response compression
  # and header rewriting the distribution does on every response.
  invoke_mode = "BUFFERED"
}

resource "aws_lambda_permission" "cloudfront_ssr" {
  statement_id  = "AllowInvocationFromCloudFront"
  action        = "lambda:InvokeFunctionUrl"
  function_name = aws_lambda_function.ssr.function_name
  principal     = "cloudfront.amazonaws.com"

  # One distribution. Not the CloudFront service at large, which would let any
  # distribution in any account invoke this renderer.
  source_arn = aws_cloudfront_distribution.this.arn
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

# Everything the viewer sent except Host, which has to be dropped: the origin
# is a function URL whose certificate and SigV4 signature are for its own
# hostname, and forwarding the viewer's Host breaks both.
#
# `allExcept` rather than the managed AllViewerExceptHostHeader policy so that
# the signing header CloudFront adds for a request with a body travels with
# it. A request whose body is not covered by the signature is rejected by the
# function URL, and sign-in is a POST with a body.
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

  # No Content-Security-Policy here, deliberately. Nuxt emits an inline
  # hydration script on every page, so a useful policy needs a per-response
  # nonce, and a nonce has to come from the renderer that emitted the script —
  # a static header at the edge can only be `unsafe-inline`, which is the
  # policy that permits what a policy exists to forbid. It belongs in the Nuxt
  # application, and this is the note saying so rather than a header
  # pretending the question is settled.
}

resource "aws_cloudfront_distribution" "this" {
  enabled         = true
  comment         = "${var.name_prefix} front end"
  price_class     = var.price_class
  is_ipv6_enabled = true

  # No `default_root_object`. The renderer answers `/` itself, and naming an
  # object here would make CloudFront rewrite that request to a file in the
  # asset bucket that a server-rendered application does not have.

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

    # Nothing is cached. Every page here is personalised — it is somebody's
    # transcription history — and a cached response served to the next viewer
    # is a disclosure, not a performance win.
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id   = aws_cloudfront_origin_request_policy.ssr.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    compress = true
  }

  # The hashed build assets, which are immutable by construction: a change to
  # one produces a different file name. They come from the bucket rather than
  # from the renderer, so a page load costs one invocation instead of thirty.
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
    # CloudFront's own certificate, on the distribution's own domain. There is
    # no custom domain yet, and the day there is one this becomes an ACM
    # certificate in us-east-1 and a minimum protocol version of TLSv1.2_2021;
    # with the default certificate that argument is fixed and cannot be
    # raised.
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${var.name_prefix}-web"
  }
}
