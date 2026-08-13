# Bootstrap

Creates the S3 bucket that holds the state of every other root module, and the
KMS key that encrypts it.

There is no lock table. The S3 backend takes its lock on a lock file beside
the state object, with a conditional write, so locking needs no second
service.

**This is applied once per AWS account, by hand, and then left alone.** It is
deliberately not part of `environments/`: those roots keep their state in the
resources created here, so they cannot create them.

## Running it

```bash
cd infra/bootstrap
terraform init
terraform apply
```

Nothing here is environment specific. One state bucket serves every
environment, separated by the key prefix in their backend blocks rather than
by the bucket. Today that is `prod` alone, an `environments/dev` existed
briefly and was removed, because a second composition nobody deploys is a
maintenance cost paid for a benefit nobody collects.

## Its own state

This root keeps its state locally, and `.gitignore` keeps that file out of the
repository. That is the chicken-and-egg answer, and it is a small risk: a
handful of resources with deterministic names. If the local state is lost,
recreate it
with `terraform import` rather than re-running `apply`, which would fail on
names that already exist.

Migrating this state into the bucket it just created is possible (add a
backend block and run `terraform init -migrate-state`), but it means a
destroyed bucket takes the record of itself with it. Local state was chosen
instead.

## Outputs and where they are used

| Output              | Used by                                              |
| ------------------- | ---------------------------------------------------- |
| `state_bucket_name` | `bucket` in each environment's backend block         |
| `state_kms_key_arn` | The permissions granted to whatever runs `terraform` |

The backend blocks in `environments/*` already carry the bucket name, computed
from the same naming rule this module uses. It is a literal there because a
backend block cannot interpolate.

## Why the state bucket has a customer-managed key

The state file records every attribute of every resource, and some of those
attributes are secrets that AWS generates rather than ones anybody typed,
the Cognito app client secret above all. A customer-managed key means access
to the key is a second gate in front of the object, every use of it appears in
CloudTrail, and rotation happens on its own. It costs about one dollar a
month.

Treat the state bucket as a secret store. Nobody who should not see the app
client secret should have `s3:GetObject` on it.
