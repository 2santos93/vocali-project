# lambda

The eight functions, and every way they are invoked: seven HTTP routes on the
API the `api` module created, and one `ObjectCreated` notification on the
audio bucket.

Each function is created with the role and the log group the `functions`
module already published. Nothing about permissions is decided here.

## Building before planning

Terraform is not the bundler.

```bash
infra/build/bundle-functions.sh          # writes infra/build/dist
cd infra/environments/dev && terraform plan
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

Memory is CPU: Lambda scales the two together, so 512 MB is not generosity for
a handler that initialises three AWS SDK clients — it is the point below which
the slower cold start costs more in billed milliseconds than the memory does.
The two functions that parse or build a whole transcript get a full vCPU.

Timeouts bound failure rather than budget success; all of these answer in well
under a second when nothing is wrong. Nothing on a route exceeds 29 seconds,
because an HTTP API integration gives up at 30 whatever the function says, and
the seconds after that are billed to a caller who already has a 504.

`start-transcription-job` is the exception at 60 seconds. Nobody is waiting on
it, and the provider submission it makes is retried three times at ten seconds
each with backoff — a worst case around thirty-one seconds, which a 30-second
timeout would cut off mid-attempt.

## The webhook route has no authorizer

`POST /webhooks/transcription-provider` is the only route created with
`authorization_type = "NONE"`, and the reason is written next to it in
`main.tf` as well as here.

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

## A disagreement between this configuration and the application

`TRANSCRIPTS_BUCKET_NAME` is set here and is not read by the application.

`buildContainer` constructs a single `S3FileStorage` over
`config.audioBucketName` and uses it for audio and for transcripts alike, so
today a finished transcript is written to `transcripts/…` **inside the audio
bucket**, not into the transcripts bucket the `storage` module creates. The
execution roles grant `s3:PutObject` on the transcripts bucket, which is where
the two disagree: as things stand, `handle-provider-callback` and
`save-realtime-transcription` would be denied at the moment they write.

That is a defect in `apps/api`, not here, and it is one line — a second bucket
name in the composition root. It is not fixed in this change because this
round owns `infra/` only. The variable is set now so the day it is corrected
the value is already in place, and an environment variable the schema does not
recognise is ignored.

## What is here and what is next door

- `api` owns the API, the authorizer and the stage.
- `functions` owns the roles, the log groups and the dead-letter queue.
- This module owns the functions, their integrations, their routes and the
  bucket notification.

The split exists because `start-transcription-job` needs the API's endpoint to
build `PROVIDER_CALLBACK_BASE_URL` while the routes need the functions' ARNs.
One module for both makes those circular; the routes living with the functions
makes the dependency run one way.
