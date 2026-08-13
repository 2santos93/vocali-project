# observability

Four alarms, one topic to send them to, and the key that encrypts it.

Four is a decision. An alarm nobody acts on teaches everyone to ignore the
ones that matter, and a wall of amber tiles is how a real failure goes
unnoticed for a day. Each of these names a specific way this platform breaks,
and each has an obvious first action.

| Alarm                    | Fires when                                           | First action                                              |
| ------------------------ | ---------------------------------------------------- | --------------------------------------------------------- |
| `-function-errors`       | Any function raised an unhandled error               | Read that function's log group                            |
| `-function-throttles`    | Lambda refused an invocation for want of concurrency | Check concurrency; nothing is logged, because nothing ran |
| `-asynchronous-failures` | The dead-letter queue is not empty                   | Read the message, fix the cause, redrive                  |
| `-api-server-errors`     | The API returned 5xx                                 | Check the integration, not the handler                    |

## Why these four and not others

**Errors** is one alarm across every function rather than one alarm each. The
first action is the same in every case, and twelve notifications during a bad
deploy describe one event. The threshold is one: every expected failure in
this application is a returned result and a 4xx, so a data point on this metric
means an exception escaped a handler, which is a defect.

It reads the service-wide `AWS/Lambda` metric rather than summing a
per-function metric for each. The first version did sum them, and that put a
ceiling on the platform: a metric-math alarm takes ten elements, and the
twelfth function passed it. This account holds nothing but this application,
so the aggregate is the same number without the arithmetic — and a function
added later is covered without anyone remembering to add it.

**Throttles** is the failure with no log line. Nothing ran, so nothing was
written. A user on a route sees 429; an upload event is retried and then
dropped, and the recording is simply never transcribed.

**The dead-letter queue** is the most valuable of the four. A message in it is
one recording that was uploaded and will never be transcribed, and it is
invisible from every other angle — the record sits at `PENDING_UPLOAD`, the
API returned 200 long ago, and the user is watching a spinner that will not
resolve.

**API 5xx** is not the same signal as function errors. It catches what happens
either side of the function: an integration timing out at thirty seconds, a
missing invoke permission, a malformed response. The caller sees a broken
product and the Lambda error metric shows nothing.

Deliberately absent: duration, concurrency, invocation count, 4xx. Those
describe load. The load here is a handful of clinicians, and a number that
rises when the product succeeds is not a signal that something is wrong.

## Getting told

The topic has no subscriber by default. A subscription has to be confirmed by
the recipient, and an address written into a repository outlives the person's
involvement with the project.

```bash
aws sns subscribe --protocol email \
  --topic-arn "$(terraform output -raw alert_topic_arn)" \
  --notification-endpoint someone@example.com
```

`alarm_email_addresses` does the same from Terraform for an environment that
prefers it. Either way the address has to click the confirmation.

## Why the topic has its own key

CloudWatch publishes the alarm notification itself, so it is the CloudWatch
service that encrypts under the key. The AWS-managed `alias/aws/sns` key does
not admit the CloudWatch service principal, and an alarm pointed at a topic
encrypted with it fails to publish — silently, which is the worst failure an
alarm has.

So the key is customer-managed, with a policy granting CloudWatch
`GenerateDataKey` and `Decrypt` in this account and delegating everything else
to the account's IAM. It costs about a dollar a month.
