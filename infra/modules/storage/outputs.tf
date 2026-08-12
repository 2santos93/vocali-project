output "audio_bucket_name" {
  description = "Audio bucket name, read by the function that signs the upload."
  value       = aws_s3_bucket.this["audio"].id
}

output "audio_bucket_arn" {
  description = "Audio bucket ARN, and the base of every policy statement scoped to it."
  value       = aws_s3_bucket.this["audio"].arn
}

output "transcripts_bucket_name" {
  description = "Transcript bucket name, read by the functions that write and sign transcripts."
  value       = aws_s3_bucket.this["transcripts"].id
}

output "transcripts_bucket_arn" {
  description = "Transcript bucket ARN."
  value       = aws_s3_bucket.this["transcripts"].arn
}

output "audio_object_prefix" {
  description = "Key prefix every audio object lives under. Function policies are scoped to it rather than to the whole bucket."
  value       = local.audio_object_prefix
}

output "transcript_object_prefix" {
  description = "Key prefix every transcript object lives under."
  value       = local.transcript_object_prefix
}
