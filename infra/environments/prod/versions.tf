terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # One bucket holds both environments, separated by this key and never by a
  # shared state file. Created by infra/bootstrap.
  #
  # The lock is a conditional write on a lock file beside the state object, so
  # there is no second service to provision or to reach. The DynamoDB table
  # this used to require is the older mechanism, and its argument is
  # deprecated.
  backend "s3" {
    # The bucket is deliberately absent: it carries the account id, and a
    # literal here binds this repository to one account and silently points at
    # the wrong one everywhere else. Supplied at init instead:
    #
    #   terraform init -backend-config="bucket=$(terraform -chdir=../../bootstrap output -raw state_bucket_name)"
    #
    key          = "prod/terraform.tfstate"
    region       = "eu-west-1"
    use_lockfile = true
    encrypt      = true
  }
}
