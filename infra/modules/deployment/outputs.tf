output "role_arn" {
  description = "The role a workflow assumes. It goes in the workflow's aws-actions/configure-aws-credentials step, where it is configuration and not a secret."
  value       = aws_iam_role.github_actions.arn
}

output "role_name" {
  description = "Name of the deployment role."
  value       = aws_iam_role.github_actions.name
}

output "trusted_subject_claims" {
  description = "Exactly which workflows can assume it. An output rather than a detail of the trust policy, because who may deploy is something a reviewer should be able to read."
  value       = sort(var.subject_claims)
}
