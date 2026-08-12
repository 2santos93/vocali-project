output "state_bucket_name" {
  description = "Bucket holding the state of every environment, and, with use_lockfile, their locks too. Goes in the `bucket` argument of their backend blocks."
  value       = aws_s3_bucket.state.id
}

output "state_kms_key_arn" {
  description = "Key encrypting the state bucket. Anything that runs Terraform needs kms:Encrypt, kms:Decrypt and kms:GenerateDataKey on it."
  value       = aws_kms_key.state.arn
}
