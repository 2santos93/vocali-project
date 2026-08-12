provider "aws" {
  region = var.aws_region

  # Applied to every taggable resource this root creates, so a resource added
  # later cannot be missed. Modules therefore only set a `Name` tag.
  default_tags {
    tags = {
      Project     = var.project_name
      Environment = "shared"
      ManagedBy   = "terraform"
    }
  }
}
