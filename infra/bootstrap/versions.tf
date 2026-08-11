terraform {
  # Bounded on both sides: the lower bound is the oldest release these
  # configurations are known to parse, the upper bound stops a future major
  # from being picked up silently by a runner that installs "latest".
  required_version = ">= 1.9.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # No backend block on purpose. This root creates the bucket and the table
  # that every other root uses for its state, so it cannot store its own state
  # there on the first run. See README.md.
}
