# api

The HTTP API the platform is reached through: the API itself, the Cognito JWT
authorizer, the single `$default` stage, and the access log that stage writes.

The routes are not here. They are in the `lambda` module, attached to the API
this one publishes.

## Why the routes are somewhere else

`start-transcription-job` needs `PROVIDER_CALLBACK_BASE_URL`, which is this
API's endpoint plus the webhook path. The routes need the ARNs of the
functions they invoke. Both in one module and the two facts are circular; two
modules with the routes on the API side and the dependency runs backwards.

So the API is created first, knowing nothing about any function, and the
`lambda` module attaches each function to it along with the route that reaches
it. Each function ends up defined next to how it is invoked, which is where a
reader looks for it anyway.

## The authorizer

`JWT`, pointed at the user pool's issuer, with the app client id as the
audience. API Gateway fetches the pool's signing keys itself and checks the
signature, the issuer, the audience and the expiry before a function is
invoked — a request with a bad token costs no invocation and reaches no code
of ours.

Cognito puts the audience in `aud` on an id token and in `client_id` on an
access token. API Gateway checks whichever is present, so the single value
configured here works for both.

The validated claims arrive at the handler in
`requestContext.authorizer.jwt.claims`, and `sub` from there is the only
identity the application will accept. That is the whole of criterion F1: there
is no other place a user id could come from, because every handler that needs
one is wrapped in `withAuthenticatedUser`, which reads that claim and nothing
else.

## No CORS configuration

Nothing in a browser calls this API. The Nuxt server holds the session and
calls it from its own runtime, so no preflight is ever sent. An allow-list
here would describe requests that do not happen and would be the first thing
somebody loosened while debugging.

The one direct browser-to-AWS request the platform makes is the audio upload,
which goes to S3 and is answered by the bucket's own CORS rule.

## The stage

One stage, named `$default`, so the stage does not appear in the URL and the
callback URL handed to the transcription provider has no version segment to go
stale. `auto_deploy` is on: with a single stage, a deployment resource would
be a second step whose only failure mode is being forgotten.

`throttling_rate_limit` defaults to 50 requests a second with a burst of 100;
`environments/prod` raises them to 100 and 200. Either way it is not a
capacity estimate — it is a ceiling. The account default is ten thousand a
second, which is the number of Lambda invocations a loop in a client can bill
before anybody notices.

## The access log

Written to a log group created here with a retention, for the same reason the
function log groups are: a group the service creates for itself keeps its
lines for ever.

The format records the request id, the route template, the status, the latency
and the integration's error. It does not record the authenticated subject: the
application already logs the user, correlated by the same request id, and
copying that identifier into a second store with a second retention spreads
the record of who used a clinical service further than it needs to go.
