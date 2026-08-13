variable "name_prefix" {
  description = "Prefix shared by every resource in one environment, such as vocali-dev."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.name_prefix))
    error_message = "name_prefix must be 3-21 characters of lowercase letters, digits and hyphens."
  }
}

variable "github_repository" {
  description = "The repository allowed to assume this role, as owner/name. There is no default: a wrong value here is a role somebody else's workflow can assume."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$", var.github_repository))
    error_message = "github_repository must be owner/name, such as vocali/transcription-platform."
  }
}

variable "subject_claims" {
  description = "The exact `sub` claims this role trusts. GitHub composes the claim from the repository and the ref, environment or workflow the run belongs to, so each entry names one branch, tag or deployment environment."
  type        = list(string)

  validation {
    condition     = length(var.subject_claims) > 0
    error_message = "subject_claims must name at least one subject. An empty list would produce a role nothing can assume."
  }

  validation {
    condition     = alltrue([for claim in var.subject_claims : startswith(claim, "repo:${var.github_repository}:")])
    error_message = "Every subject claim must begin with repo:<github_repository>:, or the role would trust a workflow in another repository."
  }

  validation {
    condition     = alltrue([for claim in var.subject_claims : !strcontains(claim, "*")])
    error_message = "A subject claim must not contain a wildcard. Name the branch, tag or environment: repo:owner/name:ref:refs/heads/main, or repo:owner/name:environment:production."
  }
}

variable "oidc_provider_arn" {
  description = "The GitHub identity provider, created once per account by infra/bootstrap. Null derives it from the account id, which is the only thing its ARN depends on."
  type        = string
  default     = null

  validation {
    condition     = var.oidc_provider_arn == null || can(regex("^arn:aws[a-z-]*:iam::[0-9]{12}:oidc-provider/", var.oidc_provider_arn))
    error_message = "oidc_provider_arn must be an IAM OIDC provider ARN or null."
  }
}

variable "function_arns" {
  description = "The API functions whose code a deployment may replace. Concrete ARNs, one per function; the role can reach no other function in the account."
  type        = map(string)

  validation {
    condition     = length(var.function_arns) > 0
    error_message = "function_arns must name at least one function."
  }

  validation {
    condition     = alltrue([for arn in values(var.function_arns) : can(regex("^arn:aws[a-z-]*:lambda:", arn))])
    error_message = "Every entry in function_arns must be a Lambda function ARN."
  }
}

variable "ssr_function_arn" {
  description = "The Nuxt renderer, deployed by the same workflow as the API functions."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:lambda:", var.ssr_function_arn))
    error_message = "ssr_function_arn must be a Lambda function ARN."
  }
}

variable "assets_bucket_arn" {
  description = "Bucket the built front-end assets are synced into. The only bucket this role can write to, and it holds nothing but build output."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:s3:::", var.assets_bucket_arn))
    error_message = "assets_bucket_arn must be an S3 bucket ARN."
  }
}

variable "distribution_arn" {
  description = "The distribution a deployment invalidates once the new assets are in place. Null while no distribution exists, in which case the deployment role is granted no invalidation permission at all rather than a wildcard one."
  type        = string
  default     = null

  validation {
    condition     = var.distribution_arn == null || can(regex("^arn:aws[a-z-]*:cloudfront::[0-9]{12}:distribution/", var.distribution_arn))
    error_message = "distribution_arn must be a CloudFront distribution ARN, or null when there is no distribution."
  }
}
