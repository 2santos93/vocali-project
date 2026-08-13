# lambda

The twelve functions, and every way they are invoked: eight HTTP routes on the
API the `api` module created, `$connect` and `$disconnect` on the websocket
API the `websocket` module created, and one `ObjectCreated` notification on
the audio bucket.

The websocket API's authorizer is here too, for the same reason the routes
are: it has to name the function that runs it.

Each function is created with the role and the log group the `functions`
module already published. Nothing about permissions is decided here.

## Building before planning

Terraform is not the bundler.

```bash
infra/build/bundle-functions.sh          # writes infra/build/dist
cd infra/environments/prod && terraform plan
```

The script runs `esbuild` over each entry point in `apps/api/src/lambda` and
writes one self-contained `index.mjs` per function. Terraform zips those and
uploads them. If a bundle is missing the plan stops on that function by name
with the command to run — it does not deploy an empty package, and there is no
flag that makes it skip a function instead.

Why a separate step rather than a provisioner: Terraform resolves the archive
data sources during `plan` and runs provisioners during `apply`, so a build
wired into the graph is always one apply behind the source it bundles.
Building first and planning second is the only order that cannot be wrong.

## The functions, and what each was given

| Function                         | Memory | Timeout | Invoked by                                       |
| -------------------------------- | -----: | ------: | ------------------------------------------------ |
| `create-upload-intent`           | 512 MB |    10 s | `POST /uploads`                                  |
| `list-transcriptions`            | 512 MB |    10 s | `GET /transcriptions`                            |
| `get-transcription`              | 512 MB |    10 s | `GET /transcriptions/{transcriptionId}`          |
| `get-transcription-download-url` | 512 MB |    10 s | `GET /transcriptions/{transcriptionId}/download` |
| `save-realtime-transcription`    | 768 MB |    20 s | `POST /transcriptions/realtime`                  |
| `create-realtime-session`        | 512 MB |    29 s | `POST /realtime-sessions`                        |
| `handle-provider-callback`       |   1 GB |    29 s | `POST /webhooks/transcription-provider`          |
| `start-transcription-job`        |   1 GB |    60 s | `s3:ObjectCreated:*` under `audio/`              |
| `create-connection-ticket`       | 512 MB |    10 s | `POST /connection-tickets`                       |
| `authorize-connection`           | 512 MB |    10 s | The websocket `$connect` authorizer              |
| `handle-connection-opened`       | 512 MB |    10 s | `$connect` on the websocket API                  |
| `handle-connection-closed`       | 512 MB |    10 s | `$disconnect` on the websocket API               |

Memory is CPU: Lambda scales the two together, so 512 MB is not generosity for
a handler that initialises three AWS SDK clients — it is the point below which
the slower cold start costs more in billed milliseconds than the memory does.
The two functions that parse or build a whole transcript get a full vCPU.

That last sentence is the intent rather than what runs today. A new AWS
account is capped at 512 MB per function until the quota is raised, so the
environment passes `max_memory_size_mb = 512` and every figure above is
clamped to it. The per-function sizing stays in the module because it is the
decision; the cap is the account speaking, and it is one line to delete when
the quota request is granted.

Timeouts bound failure rather than budget success; all of these answer in well
under a second when nothing is wrong. Nothing on a route exceeds 29 seconds,
because an HTTP API integration gives up at 30 whatever the function says, and
the seconds after that are billed to a caller who already has a 504.

`start-transcription-job` is the exception at 60 seconds. Nobody is waiting on
it, and the provider submission it makes is retried three times at ten seconds
each with backoff — a worst case around thirty-one seconds, which a 30-second
timeout would cut off mid-attempt.

## The webhook route has no authorizer

`POST /webhooks/transcription-provider` is the only HTTP route created with
`authorization_type = "NONE"`, and the reason is written next to it in
`main.tf` as well as here.

(`$disconnect` on the websocket API is also `NONE`, and for a different reason
entirely: it is not a request a client makes. It is the service reporting that
a connection it already authorised has ended, so there is nothing to
authorise and no credential to present.)

The caller is the transcription provider. It holds no Cognito token and cannot
be given one, so a JWT authorizer on this route would reject every legitimate
callback and no transcription would ever complete.

What authenticates it is a shared secret: generated out of band, stored in
Parameter Store as a `SecureString`, handed to the provider with the job and
echoed back in the `Authorization` header. The handler compares it in constant
time — hashing both sides first, so the comparison examines thirty-two bytes
whatever was presented and leaks neither the secret's length nor how close a
guess came — and it does so before reading the query string, before parsing
the body and before touching a use case.

That check is the whole boundary between the open internet and a write into a
named user's clinical history. ADR 8 records the decision; the module also
exports `unauthenticated_route_keys`, so the fact is visible from outside
rather than buried in a route definition.

## Environment variables

Every function gets every variable, because `loadConfig` validates the whole
schema during initialisation: a function missing one refuses to start rather
than failing later on the single request that needed it.

`AWS_REGION` is not among them. It is a reserved key that Lambda populates
itself and refuses to let a function set, so declaring it would make the
function fail to update at all.

None of these is a secret. `SPEECHMATICS_API_KEY_PARAMETER` and
`SPEECHMATICS_WEBHOOK_SECRET_PARAMETER` are Parameter Store paths; the values
behind them are `SecureString`s created by hand and read at runtime by a role
that may read exactly those two. A plaintext environment variable is legible
to anyone holding `lambda:GetFunctionConfiguration`, and these are legible to
no effect.

## The bucket this configuration and the application once disagreed about

`TRANSCRIPTS_BUCKET_NAME` is set here and is read by the application. That is
worth a heading because for a while it was not.

`buildContainer` used to construct a single `S3FileStorage` over
`config.audioBucketName` and use it for audio and for transcripts alike, so a
finished transcript was written to `transcripts/…` **inside the audio
bucket**, not into the transcripts bucket the `storage` module creates. The
execution roles grant `s3:PutObject` on the transcripts bucket, so
`handle-provider-callback` and `save-realtime-transcription` were denied at
the moment they wrote.

Both sides are correct now. `environment.ts` requires the variable and
`composition-root.ts` builds a second `S3FileStorage` from it. Because the
schema requires it, a function deployed without it refuses to initialise
rather than falling back to the wrong bucket.

The defect survived the whole test suite, which is the part to remember: the
suite doubles the storage adapter, so it saw a write that always succeeded. A
grant that does not match what the code reads is invisible until it runs
against IAM.

## What is here and what is next door

- `api` owns the HTTP API, its Cognito authorizer and its stage.
- `websocket` owns the websocket API and its stage.
- `functions` owns the roles, the log groups and the dead-letter queue.
- This module owns the functions, their integrations, their routes on both
  APIs, the websocket `$connect` authorizer and the bucket notification.

The split exists because `start-transcription-job` needs the API's endpoint to
build `PROVIDER_CALLBACK_BASE_URL` while the routes need the functions' ARNs.
One module for both makes those circular; the routes living with the functions
makes the dependency run one way.
