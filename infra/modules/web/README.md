# web

Where the front end is served from: a CloudFront distribution with two
origins, a private bucket for the hashed build assets, and the Nuxt server as
a Lambda function behind a function URL.

```
viewer ──► CloudFront ──┬── /_nuxt/*  ──► S3 (private, read through an OAC)
                        └── everything ──► Lambda function URL (IAM, signed by the OAC)
```

## Not deployable yet

The front end is being written as this is committed. Two things wait on it:

- **The renderer's package.** The plan stops at `data.archive_file.ssr` until
  `apps/web/.output/server` exists, naming the command that produces it. That
  is deliberate: the alternative — a `count` on a flag, or an archive of an
  empty directory — creates a distribution that serves 500s and looks
  deployed.
- **The assets.** Terraform creates the bucket and never writes to it. A few
  thousand `aws_s3_object` resources in a state file is not how build output
  is shipped; the deployment syncs `.output/public` into it and invalidates
  the distribution, with the permissions the `deployment` module grants for
  exactly that.

Everything else in this module — the distribution, the origins, the access
controls, the bucket, the policies, the role — is complete and applies as
written the moment the build output exists.

```bash
NITRO_PRESET=aws_lambda pnpm --filter @vocali/web build
cd infra/environments/dev && terraform apply

aws s3 sync apps/web/.output/public "s3://$(terraform output -raw web_assets_bucket_name)" --delete
aws cloudfront create-invalidation --distribution-id "$(terraform output -raw web_distribution_id)" --paths '/*'
```

`NITRO_PRESET` is set on the command rather than in `nuxt.config.ts` because
the same source has to keep running under `nuxt dev`, and because this round
does not modify `apps/`.

## Why a function URL and not API Gateway

The renderer needs one route — every path — and none of what an API gateway
adds: no authorizer, no per-route configuration, no request validation. A
function URL is the same thing with none of it, at a lower price and a 6 MB
response limit rather than 10.

It is not public. `authorization_type = "AWS_IAM"`, and the only principal
allowed to invoke it is the CloudFront service acting for one named
distribution, which reaches it through an origin access control that signs
every request with SigV4. A public function URL would be a second address for
the application, on a domain nobody thinks to check, with none of the headers
or caching the distribution applies.

## Two behaviours, and only two

**`/_nuxt/*` is served from S3** with the managed `CachingOptimized` policy.
Those files are immutable by construction — a change to one changes its name —
so they are cached at the edge for a year and a page load costs one Lambda
invocation instead of thirty.

**Everything else is rendered**, with caching disabled. Every page here is
somebody's transcription history. A cached page served to the next viewer is
not a performance win, it is a disclosure.

The origin request policy forwards everything except `Host`, which has to be
dropped: the origin is a function URL whose certificate and whose SigV4
signature are for its own hostname. It is a policy of our own rather than the
managed `AllViewerExceptHostHeader` so that the signing header CloudFront adds
for a request carrying a body travels with it — sign-in is a POST with a body,
and a body the signature does not cover is rejected by the function URL.

## Security headers

HSTS for a year including subdomains, `nosniff`, `frame-options: DENY` — a
clinical record inside somebody else's frame is the classic clickjacking setup
— and `strict-origin-when-cross-origin`.

There is no `Content-Security-Policy`, and its absence is a decision rather
than an omission. Nuxt emits an inline hydration script on every page, so a
policy that is worth having needs a per-response nonce, and only the renderer
that emitted the script can produce one. A static header at the edge can only
say `unsafe-inline`, which permits exactly what the policy exists to forbid.
It belongs in the Nuxt application.

## Configuration and secrets

`environment_variables` takes plain configuration. It refuses a variable whose
name ends in `SECRET`, `PASSWORD`, `CREDENTIAL`, `API_KEY` or `_TOKEN`,
because a Lambda environment variable is stored in plaintext and is legible to
anyone holding `lambda:GetFunctionConfiguration` — a read-only permission
should not disclose a credential.

A secret is a `SecureString` in Parameter Store. Name its path in
`secret_parameter_names` and the renderer's role is granted `ssm:GetParameter`
on that one parameter and `kms:Decrypt` on the key behind it, both as concrete
ARNs.

## What is missing on purpose

- **A custom domain.** There is none yet, so the distribution uses
  CloudFront's certificate on its own domain. With the default certificate the
  minimum TLS version is fixed and cannot be raised; an ACM certificate in
  `us-east-1` and `TLSv1.2_2021` is the change, and it is two arguments.
- **Access logs.** CloudFront's legacy log delivery requires a bucket with
  ACLs enabled, which contradicts the bucket-owner-enforced ownership applied
  everywhere else here. The v2 delivery to a log group is the follow-up.
- **A WAF.** Worth having in front of a clinical application and not worth
  guessing at a rule set for before there is traffic to shape it against.
