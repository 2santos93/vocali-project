# Infrastructure

Every AWS resource this platform uses is defined here, in Terraform, in
`eu-west-1`.

```
bootstrap/          State bucket, lock table and their key. Applied once, by hand.
modules/
  auth/             Cognito user pool and the app client the BFF uses
  database/         The single DynamoDB table
  storage/          The audio and transcript buckets
  functions/        One execution role and one log group per function
environments/
  dev/              Composes the modules; holds no resource of its own
  prod/             The same composition with production settings
```

## What exists so far

This round covers the resources the application layer already needs: identity,
the table, the buckets, the roles those functions will run as, and the log
groups they will write to.

Not here yet, and deliberately: the Lambda functions themselves, API Gateway,
CloudFront and the Nuxt hosting. Each of those needs a deployable artefact
that does not exist yet, and a function resource pointing at a package that
has not been built is a configuration that cannot be applied. The modules are
shaped so they slot in — `functions` already publishes the names, roles and
log groups the next round consumes, and the storage module notes where the
`ObjectCreated` notification will attach.

## Running it

Nothing here has been applied. There is no AWS account wired up to it yet, and
the commands below are what a first deployment would run, in this order.

```bash
# Once per account.
cd infra/bootstrap && terraform init && terraform apply

# Once per account, outside Terraform, so no secret enters the state file.
aws ssm put-parameter --type SecureString \
  --name /vocali/dev/transcription-provider/api-key --value '...'
aws ssm put-parameter --type SecureString \
  --name /vocali/dev/transcription-provider/webhook-secret --value '...'

# Then, per environment.
cd infra/environments/dev && terraform init && terraform plan
```

`prod` additionally requires `front_end_origins`, which has no default on
purpose: the front end is served from a domain that does not exist yet, and a
placeholder would silently become the upload allow-list of a production
bucket.

## The checks

```bash
terraform fmt -check -recursive          # from infra/
terraform init -backend=false            # in each module and environment
terraform validate                       # likewise
```

Every directory here passes all three. None of them contacts AWS: `validate`
checks syntax, types, references and provider schemas without reading any
remote state or resolving any data source. `plan` is the first command that
needs credentials, and it has not been run.

## Conventions

**Naming.** `<project>-<environment>-<thing>`, so `vocali-dev-audio-…`,
`vocali-prod-list-transcriptions-role`. Bucket names carry the account id
because S3 names are global; the account id is read at plan time rather than
written down.

**Tagging** is expressed once, in each environment's provider block, as
`default_tags`. Every taggable resource inherits `Project`, `Environment` and
`ManagedBy`, so a resource added to a module later cannot be missed. Modules
set only their own `Name` tag.

**Pinning.** Terraform is bounded below and above, and the AWS provider is
pinned to a major with the exact build recorded in each `.terraform.lock.hcl`.
Those lock files carry checksums for both Linux and macOS, so a CI runner and
a laptop resolve the same provider. Every directory has one, including the
modules, because each is validated standalone and is the root of that run.

**Variables** are typed and described everywhere, and validated wherever a
wrong value can be expressed: a CORS origin that is a wildcard, a log
retention CloudWatch would reject, an ARN of the wrong service, a token
lifetime long enough to outlive its own revocation. The failure arrives at
`plan`, with a sentence explaining the rule, rather than at `apply` as an API
error.

**Environment values are literals in `locals`, not `.tfvars`.** The
repository's `.gitignore` excludes `*.tfvars`, so values kept there would not
survive a clone — and an environment directory is the value set. The one
exception is `front_end_origins`, a real variable because it changes when the
front end is deployed.

## Where the security requirements are met

| Requirement                   | Where                                                                       |
| ----------------------------- | --------------------------------------------------------------------------- |
| Encryption at rest            | Both buckets, the table, and the state bucket under a customer-managed key  |
| No public access              | Both buckets: access blocked, ACLs disabled, TLS-only policy                |
| Least privilege               | One role per function, inline policies, concrete ARNs, no wildcard resource |
| Bounded log retention         | Log groups created here rather than by Lambda, with an explicit retention   |
| Mandatory email verification  | The Cognito pool auto-verifies email and recovers only through it           |
| Secrets out of the repository | SSM parameters created out of band; Terraform holds only their names        |

## What is in the state file

The state records every attribute of every resource, and one of them is a
secret: `aws_cognito_user_pool_client.bff.client_secret`, which AWS generates.
Nothing can keep it out — a confidential client has a secret by definition,
and Terraform records what it creates. Everything else the platform treats as
sensitive is outside the state entirely: the transcription provider's API key
and the webhook secret live in Parameter Store as `SecureString` values put
there by hand, and Terraform never reads them.

So the state bucket is treated as a secret store: a customer-managed KMS key,
public access blocked, versioned, TLS-only, and `s3:GetObject` on it granted
to nobody who should not hold the client secret.
