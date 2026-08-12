provider "aws" {
  region = local.aws_region

  # The one place tagging is expressed. Every taggable resource in every module
  # below inherits these, so a resource added later cannot be forgotten;
  # modules therefore set only a Name tag of their own.
  default_tags {
    tags = {
      Project     = local.project_name
      Environment = local.environment
      ManagedBy   = "terraform"
    }
  }
}
