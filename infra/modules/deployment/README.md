# deployment

One IAM role, assumed by GitHub Actions through OIDC, that can deploy code and
assets and can do nothing else.

There is no access key in this repository, in this account, or in GitHub's
secrets. A workflow presents a token GitHub signed, STS validates it against
the identity provider `infra/bootstrap` created, and hands back credentials
that expire in an hour. Criterion H3 is met by there being no long-lived
credential to leak rather than by a rotation policy for one.

## What it can do

| Action                                 | On                                       |
| -------------------------------------- | ---------------------------------------- |
| `lambda:UpdateFunctionCode`            | The eight API functions and the renderer |
| `lambda:GetFunction[Configuration]`    | The same nine, so a workflow can wait    |
| `s3:PutObject` `s3:DeleteObject`       | Objects in the asset bucket              |
| `s3:ListBucket`                        | The asset bucket, for `sync --delete`    |
| `cloudfront:CreateInvalidation` `Get…` | One distribution                         |

Every resource is a concrete ARN. There is no wildcard anywhere in the policy,
and no managed policy attached.

## What it deliberately cannot do

It cannot apply Terraform. It cannot create a role, edit a policy, read the
state file, or touch the table, the audio, the transcripts or the user pool.
It cannot even change a function's memory, timeout, role or environment —
`lambda:UpdateFunctionConfiguration` is absent, because a pipeline that can
change a function's role is a pipeline that can give a function a different
one.

Infrastructure changes are applied by a person, from a short-lived SSO
session, having read the plan. ADR 10 argues that case; the short version is
that a role able to apply this configuration is a role able to rewrite every
policy in it, and putting that behind a push undoes what the rest of these
modules are for.

## Who it trusts

`subject_claims` is the exact list of `sub` values the trust policy accepts.
GitHub composes that claim from the repository and the ref, environment or
workflow a run belongs to, and a workflow cannot set it.

The variable refuses a wildcard. `repo:owner/name:*` trusts every branch,
every tag and every pull request — including one opened from a fork by a
stranger, which is the ordinary way a deployment role ends up assumable by
somebody who does not work here. Name what you mean:

```hcl
subject_claims = ["repo:owner/name:ref:refs/heads/main"]              # dev
subject_claims = ["repo:owner/name:environment:production"]           # prod
```

The production form is worth preferring: a GitHub deployment environment can
require an approval, and the claim is only minted for a run that got one.

## The workflow that uses it

Not in this change. `.github/` is outside the files this round touches, so the
role exists and nothing assumes it yet. What has to be added there:

```yaml
permissions:
  id-token: write # without this no token is minted at all
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::<account>:role/vocali-dev-github-deploy
      aws-region: eu-west-1

  - run: infra/build/bundle-functions.sh
  - run: |
      for function in infra/build/dist/*/; do
        name="vocali-dev-$(basename "$function")"
        aws lambda update-function-code --function-name "$name" \
          --zip-file "fileb://infra/build/dist/$(basename "$function").zip"
      done
```

`role-to-assume` is an ARN, not a secret: it identifies the role and grants
nothing without a token that satisfies the trust policy.
