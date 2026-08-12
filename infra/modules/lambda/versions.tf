terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }

    # Zips the bundles the build script produced. Terraform is not the
    # bundler — see infra/build/bundle-functions.sh — but it is what turns a
    # directory into the deterministic archive Lambda is given, with the file
    # timestamps normalised so an unchanged bundle produces an unchanged hash
    # and therefore no deployment.
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}
