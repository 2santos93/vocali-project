output "distribution_id" {
  description = "The distribution, for the cache invalidation a deployment ends with."
  value       = aws_cloudfront_distribution.this.id
}

output "distribution_arn" {
  description = "Distribution ARN. The deployment role's permission to invalidate is scoped to exactly this one."
  value       = aws_cloudfront_distribution.this.arn
}

output "distribution_domain_name" {
  description = "Where the front end is served from. Until a custom domain exists this is the address of the application, and it is also the origin the audio bucket's CORS rule has to allow."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "front_end_origin" {
  description = "The distribution as an origin, scheme included, ready to be passed to the storage module's CORS allow-list."
  value       = "https://${aws_cloudfront_distribution.this.domain_name}"
}

output "assets_bucket_name" {
  description = "Bucket the built assets are synced into. Terraform does not upload them; the deployment does."
  value       = aws_s3_bucket.assets.id
}

output "assets_bucket_arn" {
  description = "Asset bucket ARN, which the deployment role's write permission is scoped to."
  value       = aws_s3_bucket.assets.arn
}

output "ssr_function_name" {
  description = "The renderer, whose code the deployment updates alongside the API functions."
  value       = aws_lambda_function.ssr.function_name
}

output "ssr_function_arn" {
  description = "Renderer ARN, for the deployment role's update permission."
  value       = aws_lambda_function.ssr.arn
}

output "ssr_role_arn" {
  description = "Execution role of the renderer, so an environment can see what the front end runs as."
  value       = aws_iam_role.ssr.arn
}
