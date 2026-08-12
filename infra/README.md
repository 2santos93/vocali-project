# Infrastructure

Every AWS resource this platform uses is defined here, in Terraform, in
`eu-west-1`.

```
bootstrap/          State bucket, its key, and the GitHub identity provider. Applied once, by hand.
build/              The esbuild step that produces the function packages
modules/
  auth/             Cognito user pool and the app client the BFF uses
  database/         The single DynamoDB table
  storage/          The audio and transcript buckets
  functions/        One execution role and one log group per function, and the dead-letter queue
  api/              The HTTP API, its Cognito JWT authorizer and its stage
  lambda/           The eight functions, their routes and the bucket notification
  web/              CloudFront, the asset bucket and the Nuxt renderer
  observability/    Four alarms and the topic they publish to
  deployment/       The role GitHub Actions assumes through OIDC
environments/
  dev/              Composes the modules; holds no resource of its own
  prod/             The same composition with production settings
```

## What exists now

All of it. Identity, the table, the buckets, the roles, the log groups, the
eight functions, the API in front of them, the front end's distribution, the
alarms and the deployment role.

Two things are complete in configuration and cannot be applied until an
artefact exists:

- **The functions** need `infra/build/bundle-functions.sh` to have run.
- **The renderer** needs `apps/web/.output/server`, which needs the front end
  to build. It is being written as this is committed.

Neither is stubbed and neither is behind a flag. The plan stops on the missing
package, names it, and prints the command that produces it.

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

# Build what is deployed, before planning what deploys it.
infra/build/bundle-functions.sh
NITRO_PRESET=aws_lambda pnpm --filter @vocali/web build

# Then, per environment.
cd infra/environments/dev
terraform init
terraform plan -var 'github_repository=owner/name'
```

`github_repository` has no default in either environment. It decides which
repository's workflows can assume the deployment role, and a placeholder there
would be applied by somebody who never read it.

After the first apply, one more parameter. Cognito generates the app client
secret, so it is in the state file already; this copies it where the renderer
can read it at runtime rather than from a plaintext environment variable.

```bash
aws ssm put-parameter --type SecureString \
  --name "$(terraform output -raw bff_client_secret_parameter_name)" \
  --value "$(terraform output -raw cognito_user_pool_client_secret)"
```

Then the assets, which Terraform creates a bucket for and never writes to:

```bash
aws s3 sync apps/web/.output/public "s3://$(terraform output -raw web_assets_bucket_name)" --delete
aws cloudfront create-invalidation --distribution-id "$(terraform output -raw web_distribution_id)" --paths '/*'
```

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

**Pinning.** Terraform is bounded below at 1.10, where the S3 backend learned
to lock on a lock file beside the state object — which is why no lock table
exists — and above at the next major. The AWS provider is
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

| Requirement                   | Where                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| Encryption at rest            | Every bucket, the table, the queue, the alert topic, and the state bucket under its own key |
| No public access              | Every bucket: access blocked, ACLs disabled, TLS-only policy, reached only through an OAC   |
| Least privilege               | One role per function, inline policies, concrete ARNs, no wildcard resource                 |
| Bounded log retention         | Log groups created here rather than by the services, with an explicit retention             |
| Mandatory email verification  | The Cognito pool auto-verifies email and recovers only through it                           |
| Secrets out of the repository | SSM parameters created out of band; Terraform holds only their names                        |
| No long-lived AWS credentials | Deployment is a federated role assumed with an OIDC token, valid for an hour                |

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

The compute and edge layers added nothing to that list. Function environment
variables carry Parameter Store paths and never values; the deployment role
holds no key, because there is no key; and the renderer reads the client
secret from a `SecureString` put there by hand rather than from a variable.

## One thing the code and this configuration disagree about

`buildContainer` in `apps/api` constructs a single `S3FileStorage` over
`AUDIO_BUCKET_NAME` and writes both audio and transcripts through it, so a
finished transcript lands under `transcripts/` **inside the audio bucket**.
The execution roles grant `s3:PutObject` on the transcripts bucket, so the two
functions that write a transcript would be denied at the moment they write.

The fix is a second bucket name in the composition root, in `apps/`, which
this round does not touch. `TRANSCRIPTS_BUCKET_NAME` is already set on every
function so that nothing here has to change when it is made.
