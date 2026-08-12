output "state_bucket_name" {
  description = "Bucket holding the state of every environment, and, with use_lockfile, their locks too. Goes in the `bucket` argument of their backend blocks."
  value       = aws_s3_bucket.state.id
}

output "state_kms_key_arn" {
  description = "Key encrypting the state bucket. Anything that runs Terraform needs kms:Encrypt, kms:Decrypt and kms:GenerateDataKey on it."
  value       = aws_kms_key.state.arn
}

output "github_oidc_provider_arn" {
  description = "The identity provider each environment's deployment role trusts. One per account, which is why it is here and not in an environment."
  value       = aws_iam_openid_connect_provider.github_actions.arn
}
