terraform {
  required_version = ">= 1.9.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # One bucket holds both environments, separated by this key and never by a
  # shared state file. Created by infra/bootstrap.
  backend "s3" {
    bucket         = "vocali-tfstate-931779397727"
    key            = "prod/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "vocali-tfstate-locks"
    encrypt        = true
  }
}
