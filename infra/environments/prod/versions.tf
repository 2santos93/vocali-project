terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    key          = "prod/terraform.tfstate"
    region       = "eu-west-1"
    use_lockfile = true
    encrypt      = true
  }
}
