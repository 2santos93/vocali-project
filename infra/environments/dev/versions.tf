terraform {
  required_version = ">= 1.9.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Created by infra/bootstrap, which is applied once per account. A backend
  # block cannot interpolate, so these are the only literals in the tree that
  # name the account; everything else derives its names at plan time.
  backend "s3" {
    bucket         = "vocali-tfstate-931779397727"
    key            = "dev/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "vocali-tfstate-locks"
    encrypt        = true
  }
}
