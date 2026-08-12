terraform {
  # Bounded on both sides: the lower bound is where the S3 backend learned to
  # lock on the state object itself, which the environments rely on, and the
  # upper bound stops a future major from being picked up silently by a runner
  # that installs "latest".
  required_version = ">= 1.10.0, < 2.0.0"

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
