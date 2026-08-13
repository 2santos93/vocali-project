# functions

Everything a Lambda function needs except the function itself: one execution
role per function, with an inline policy scoped to the resources that function
actually touches, one log group per function, with an explicit retention, and
the dead-letter queue that catches an asynchronous invocation Lambda has given
up on.

The functions themselves are created by the `lambda` module, which consumes
the names, roles, log groups and queue published here. They are named here
because the log group name has to match the function name exactly, and because
a role written alongside a function tends to be written until the function
works, while a role written from the use cases tends to be written to be
small.

## The permission matrix

| Function                         | DynamoDB                                            | S3                      | Parameter Store            |
| -------------------------------- | --------------------------------------------------- | ----------------------- | -------------------------- |
| `create-upload-intent`           | `PutItem`                                           | `PutObject` audio       | —                          |
| `start-transcription-job`        | `GetItem` `PutItem`                                 | `GetObject` audio       | API key and webhook secret |
| `handle-provider-callback`       | `GetItem` `PutItem` `Query` `DeleteItem` on `CONN#` | `PutObject` transcripts | Webhook secret             |
| `list-transcriptions`            | `Query`                                             | —                       | —                          |
| `get-transcription`              | `GetItem`                                           | —                       | —                          |
| `get-transcription-download-url` | `GetItem`                                           | `GetObject` transcripts | —                          |
| `create-realtime-session`        | —                                                   | —                       | API key                    |
| `save-realtime-transcription`    | `PutItem`                                           | `PutObject` transcripts | —                          |
| `create-connection-ticket`       | `PutItem` on `TICKET#`                              | —                       | —                          |
| `authorize-connection`           | `DeleteItem` on `TICKET#`                           | —                       | —                          |
| `handle-connection-opened`       | `PutItem` on `CONN#`                                | —                       | —                          |
| `handle-connection-closed`       | `DeleteItem` on `CONN#`                             | —                       | —                          |

Every one of those also gets `logs:CreateLogStream` and `logs:PutLogEvents` on
its own log group, and nothing else. `handle-provider-callback` additionally
holds `execute-api:ManageConnections`, on one stage of one websocket API,
which is the whole of this platform's outbound push capability.

`start-transcription-job` reads both secrets, and that is not redundancy. The
job it submits carries the header the provider presents when it calls back, so
a role holding only the API key made every file upload fail at the moment of
submission and stop at `PENDING_UPLOAD`, with nothing in the interface to say
why. No test could have found it: the suite doubles the secrets provider, so
it sees a read that always succeeds.

Four things are worth reading off that table:

- **No role can do everything.** The function that lists a history cannot read
  a transcript, write a record or reach the provider's API key. A bug in it
  reaches exactly one table with exactly one read action.
- **No `Scan`, ever.** `list-transcriptions` is granted `Query` only. There is
  no `Scan` in the codebase and no role that could perform one.
- **Nothing deletes a transcription.** `s3:DeleteObject` appears nowhere at
  all; audio is removed by a bucket lifecycle rule, which is S3's own doing
  and needs no permission of ours. `dynamodb:DeleteItem` does now exist —
  websocket connections and connection tickets have to be spent and cleaned up
  — but every grant of it is conditioned on `dynamodb:LeadingKeys` matching
  `TICKET#*` or `CONN#*`, so no role in the stack can reach a clinical record
  with it. That condition is why connections were given a partition of their
  own: IAM can condition on a partition key and not on a sort key. See
  `docs/adr/0011`.
- **The signing functions hold the permission the browser then uses.** A
  presigned URL carries the signer's authority, so `create-upload-intent`
  needs `s3:PutObject` even though it never writes an object itself.

## The dead-letter queue

`start-transcription-job` is the only function nobody is waiting on: S3
delivers an `ObjectCreated` notification to it and reads no response. Lambda
retries an asynchronous invocation twice and then discards it, so without a
failure destination the visible symptom of a permanent failure is an upload
that stays at `PENDING_UPLOAD` for ever, with the reason nowhere.

The queue is that destination. Nothing consumes it — a message in it is one
recording that was never transcribed, and the alarm on its depth is the only
thing that reads it automatically. The payload names the object, so an event
can be replayed once whatever caused it is fixed.

That is why one function, and only that one, is granted `sqs:SendMessage`: a
failure destination is delivered under the function's own execution role, not
the service's, so it is a permission and not merely a setting.

## Why one role per function

A shared role is the union of every permission any function needs. Under one,
`list-transcriptions` — the endpoint most exposed to ordinary traffic — would
also be able to write transcripts and read the provider's long-lived API key.
The cost of one role each is a few more resources in a graph that Terraform
manages anyway: twelve now, where the first version of this module had eight.

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
  --name /vocali/prod/transcription-provider/api-key --value '...'
aws ssm put-parameter --type SecureString \
  --name /vocali/prod/transcription-provider/webhook-secret --value '...'
```

Reading a `SecureString` is authorised twice, once at Parameter Store and once
at KMS, so each function that reads one also gets `kms:Decrypt` on the key
that encrypts it. When `secrets_kms_key_arn` is null the module resolves
`alias/aws/ssm` to a concrete key ARN rather than granting a wildcard, which
is why the parameters should exist before the first apply — the alias appears
with the account's first `SecureString`.

The adapter must call `GetParameter`, singular. `GetParameters` is a different
action and is not granted.
