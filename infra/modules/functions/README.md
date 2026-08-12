# functions

Everything a Lambda function needs except the function itself: one execution
role per function, with an inline policy scoped to the resources that function
actually touches, and one log group per function, with an explicit retention.

The functions arrive in the next round, when there are handlers to deploy.
They are named here because the log group name has to match the function name
exactly, and because a role written alongside a function tends to be written
until the function works, while a role written from the use cases tends to be
written to be small.

## The permission matrix

| Function                         | DynamoDB            | S3                      | Parameter Store |
| -------------------------------- | ------------------- | ----------------------- | --------------- |
| `create-upload-intent`           | `PutItem`           | `PutObject` audio       | —               |
| `start-transcription-job`        | `GetItem` `PutItem` | `GetObject` audio       | API key         |
| `handle-provider-callback`       | `GetItem` `PutItem` | `PutObject` transcripts | Webhook secret  |
| `list-transcriptions`            | `Query`             | —                       | —               |
| `get-transcription`              | `GetItem`           | —                       | —               |
| `get-transcription-download-url` | `GetItem`           | `GetObject` transcripts | —               |
| `create-realtime-session`        | —                   | —                       | API key         |
| `save-realtime-transcription`    | `PutItem`           | `PutObject` transcripts | —               |

Every one of those also gets `logs:CreateLogStream` and `logs:PutLogEvents` on
its own log group, and nothing else.

Four things are worth reading off that table:

- **No role can do everything.** The function that lists a history cannot read
  a transcript, write a record or reach the provider's API key. A bug in it
  reaches exactly one table with exactly one read action.
- **No `Scan`, ever.** `list-transcriptions` is granted `Query` only. There is
  no `Scan` in the codebase and no role that could perform one.
- **Nothing deletes.** `DeleteItem` and `s3:DeleteObject` appear nowhere.
  Audio is removed by a bucket lifecycle rule, which is S3's own doing and
  needs no permission of ours.
- **The signing functions hold the permission the browser then uses.** A
  presigned URL carries the signer's authority, so `create-upload-intent`
  needs `s3:PutObject` even though it never writes an object itself.

## Why one role per function

A shared role is the union of every permission any function needs. Under one,
`list-transcriptions` — the endpoint most exposed to ordinary traffic — would
also be able to write transcripts and read the provider's long-lived API key.
The cost of one role each is a few more resources in a graph that Terraform
manages anyway.

## Why inline policies

An inline policy has exactly one holder, so it cannot quietly acquire a second
one later, and it is deleted with the role rather than outliving it as an
orphan.

The managed policy that would normally be attached here,
`AWSLambdaBasicExecutionRole`, grants `logs:CreateLogGroup` across the whole
account plus stream and event writes on every log group in it. The inline
statement grants two actions on one group. `CreateLogGroup` is deliberately
missing: this module creates the group with a retention, and a function that
cannot create a log group cannot create one that keeps its lines forever.

## Parameter Store and its key

The API key and the webhook secret are read from SSM at runtime. **Terraform
does not create those parameters**, on purpose: a parameter created here would
have its value written into the state file. They are created out of band,
once:

```bash
aws ssm put-parameter --type SecureString \
  --name /vocali/dev/transcription-provider/api-key --value '...'
aws ssm put-parameter --type SecureString \
  --name /vocali/dev/transcription-provider/webhook-secret --value '...'
```

Reading a `SecureString` is authorised twice, once at Parameter Store and once
at KMS, so each function that reads one also gets `kms:Decrypt` on the key
that encrypts it. When `secrets_kms_key_arn` is null the module resolves
`alias/aws/ssm` to a concrete key ARN rather than granting a wildcard, which
is why the parameters should exist before the first apply — the alias appears
with the account's first `SecureString`.

The adapter must call `GetParameter`, singular. `GetParameters` is a different
action and is not granted.
