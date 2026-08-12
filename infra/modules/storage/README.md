# storage

The two buckets: `audio`, which the browser uploads to directly, and
`transcripts`, which holds the finished text.

They are one module because they are one story — a file arrives in the first,
and what the platform makes of it lands in the second — and because the
settings they share are the ones that must not diverge: no public access, ACLs
disabled, encryption at rest, versioning, TLS-only, and lifecycle rules that
stop either from growing without bound.

## What differs between them

|                  | `audio`                                | `transcripts`                                            |
| ---------------- | -------------------------------------- | -------------------------------------------------------- |
| CORS             | Yes, `POST` from the front-end origins | None; a download is a navigation, not a scripted request |
| Current versions | Expire after `audio_retention_days`    | Kept — the history has to keep resolving                 |
| Written by       | The browser, with a presigned POST     | The functions, server side                               |

## The CORS rule

It exists for one request: the browser's direct upload. That upload has to
bypass the API entirely, because a 20 MB file does not fit through API Gateway
at 10 MB or Lambda at 6 MB, and base64 would inflate it by a third.

The rule allows `POST` and nothing else. A presigned POST carries its policy
and signature in the form body rather than in headers, so `Content-Type` is
the only header the preflight has to clear.

`cors_allowed_origins` rejects `*`. A wildcard would let any page on the
internet drive an upload with a policy it had somehow obtained, and the
variable refuses the value rather than documenting that it is a bad idea.

## The size limit is not here

The 20 MB cap lives in the `content-length-range` condition of the presigned
POST policy, which the API signs per upload. There is no bucket-level setting
that could express it, and putting it in the policy is stronger than a bucket
setting would be: S3 rejects the request on the bytes actually sent, before
any of our code runs and regardless of what the client claimed.

## Why raw audio expires

`audio_retention_days` defaults to thirty. The recording is an input that has
already been consumed: once the transcript exists, that is what the user comes
back for. Keeping the audio indefinitely means accumulating clinical voice
recordings that serve no purpose but that would still have to be protected,
audited and disclosed. Deleting them is the cheaper and the safer answer.

The delete-marker and abandoned-upload rules are there because versioning and
multipart uploads both leave residue that is billed and does not appear in a
normal listing.

## The notification is next door

The audio bucket's `ObjectCreated` notification, which starts a transcription
job, is configured by the `lambda` module rather than here: a notification has
to name the function it invokes, and that function is created there.

It filters on the `audio/` prefix, which is also what stops it feeding itself
— anything the platform writes back into this bucket under another prefix
creates an object too.

## A disagreement to be aware of

The application does not currently write to the transcripts bucket. Its
composition root builds one `S3FileStorage` over `AUDIO_BUCKET_NAME` and uses
it for both, so a finished transcript is written to `transcripts/…` inside the
**audio** bucket. The execution roles grant that write on this module's
transcripts bucket, so as things stand the write would be denied.

It is one line in `apps/api/src/composition-root.ts` and it is not fixed here,
because that file is outside the round this module was last changed in. See
`modules/lambda/README.md`, which sets `TRANSCRIPTS_BUCKET_NAME` ready for it.
