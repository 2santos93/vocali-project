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
  websocket/        The websocket API finished transcriptions are pushed over
  lambda/           The twelve functions, their routes and the bucket notification
  web/              The Nuxt renderer, the asset bucket, and the CloudFront distribution in front of them
  observability/    Four alarms and the topic they publish to
  deployment/       The role GitHub Actions assumes through OIDC
environments/
  prod/             Composes the modules; holds no resource of its own
```

## One environment, and why

There is one deployable environment and it is `prod`. Development is local (the
Nuxt dev server, Jest and Cypress against a local build), so a second AWS
environment would describe a deployment nobody is going to create.

An earlier round had `environments/dev/` beside this one. It was removed rather
than kept as a specimen: two compositions and no deployment is a maintenance
cost paid for a benefit nobody collects, and it did not even buy the thing it
was supposed to. The proof of that is what it left behind, `prod` carried
`http://localhost:3000` in its CORS list, hardcoded and marked temporary,
because the browser develops against the only bucket that exists. A development
environment that existed would have absorbed that origin; one that was only
written down did not.

What a second composition was there to demonstrate (that the modules are
parameterised rather than holding literals) is demonstrated without it. Every
module under `modules/` is initialised and validated standalone, as the root of
its own run, which is why each carries its own `.terraform.lock.hcl`. The
module boundary is checked by that, not by counting callers.

The local origin is now passed at plan time, through `front_end_origins`, whose
validation admits `http://localhost` explicitly and refuses every other
non-HTTPS origin:

```bash
terraform plan -var 'github_repository=owner/name' \
               -var 'front_end_origins=["http://localhost:3000"]'
```

## What exists now

**This is applied.** `prod` is running in a real account: the Cognito user
pool and its confidential client, the single table, both data buckets, twelve
execution roles and twelve log groups, the twelve functions, the HTTP API with
its Cognito JWT authorizer, the websocket API that carries pushed completions,
the dead-letter queue, four alarms with the topic behind them, the asset
bucket, the renderer, and the deployment role assumed through OIDC.

One thing is written here and not applied: **the public edge.** AWS has not
verified this account, so `CreateDistribution` is refused, and the renderer's
function URL opened to `NONE` answers 403 to every caller, the same gate
blocks the intended edge and the substitute for it. A support case is open.
`expose_ssr_publicly` is set while it is outstanding, because it is the only
value that lets the environment apply at all; setting it back to `false` and
applying is what restores the distribution once the case is answered. See
`docs/adr/0009`, which records what that costs.

So the API, the data plane and the identity plane are reachable, and the front
end is run locally against them in the meantime.

Both applies still depend on an artefact that Terraform does not build:

- **The functions** need `infra/build/bundle-functions.sh` to have run.
- **The renderer** needs `apps/web/.output/server`, from the Nuxt build.

Neither is stubbed and neither is behind a flag. The plan stops on the missing
package, names it, and prints the command that produces it.

## Running it

These are the commands a deployment into a fresh account runs, in this order.
They are also what was run against this one.

```bash
# Once per account.
cd infra/bootstrap && terraform init && terraform apply

# Once per account, outside Terraform, so no secret enters the state file.
aws ssm put-parameter --type SecureString \
  --name /vocali/prod/transcription-provider/api-key --value '...'
aws ssm put-parameter --type SecureString \
  --name /vocali/prod/transcription-provider/webhook-secret --value '...'

# Build what is deployed, before planning what deploys it.
infra/build/bundle-functions.sh
NITRO_PRESET=aws_lambda pnpm --filter @vocali/web build

# Then the environment.
cd infra/environments/prod
terraform init
terraform plan -var 'github_repository=owner/name'
```

`github_repository` has no default. It decides which repository's workflows can
assume the deployment role, and a placeholder there would be applied by somebody
who never read it.

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

The invalidation is the one step that does not apply here yet: there is no
distribution while `expose_ssr_publicly` is set, so `web_distribution_id` has
no value to give.

## The checks

```bash
terraform fmt -check -recursive          # from infra/
terraform init -backend=false            # in each module and environment
terraform validate                       # likewise
```

Every directory here passes all three, and these are the checks CI runs, so
they are the ones to run before committing. None of them contacts AWS:
`validate` checks syntax, types, references and provider schemas without
reading any remote state or resolving any data source. `plan` is the first
command that needs credentials, which is why it is not a gate, a contributor
without an account can still verify everything above.

## Conventions

**Naming.** `<project>-<environment>-<thing>`, so `vocali-prod-audio-…`,
`vocali-prod-list-transcriptions-role`. Bucket names carry the account id
because S3 names are global; the account id is read at plan time rather than
written down.

**Tagging** is expressed once, in each environment's provider block, as
`default_tags`. Every taggable resource inherits `Project`, `Environment` and
`ManagedBy`, so a resource added to a module later cannot be missed. Modules
set only their own `Name` tag.

**Pinning.** Terraform is bounded below at 1.10, where the S3 backend learned
to lock on a lock file beside the state object (which is why no lock table
exists), and above at the next major. The AWS provider is
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
survive a clone, and an environment directory is the value set. The exceptions
are the three real variables: `github_repository`, which decides who may deploy;
`front_end_origins`, which changes when the front end is deployed and carries
the local development origin; and `alarm_email_addresses`, which is empty
because a subscription outlives the person committed to it.

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
Nothing can keep it out, a confidential client has a secret by definition,
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

## The bucket the code and this configuration once disagreed about

They agree now, and the disagreement is worth recording because of what it
cost. `buildContainer` in `apps/api` used to construct a single
`S3FileStorage` over `AUDIO_BUCKET_NAME` and write both audio and transcripts
through it, so a finished transcript landed under `transcripts/` **inside the
audio bucket**, while the execution roles granted `s3:PutObject` on the
transcripts bucket. The two functions that write a transcript were denied at
the moment they wrote.

`TRANSCRIPTS_BUCKET_NAME` was set on every function ahead of the fix. The
composition root now reads it and builds a second `S3FileStorage` over it, and
`environment.ts` requires it, so a function started without it refuses to
initialise rather than writing to the wrong bucket.

The lesson is the one the deployment kept teaching: a grant that does not
match what the code reads is invisible until it runs against IAM. The test
suite doubles the storage adapter, so it saw a write that always succeeded.
