# database

The single DynamoDB table.

## The key model

The table holds four kinds of item, in three kinds of partition.

| `PK`              | `SK`             | What it is                                                                                         |
| ----------------- | ---------------- | -------------------------------------------------------------------------------------------------- |
| `USER#<sub>`      | `TRANS#<ULID>`   | A transcription. Chronological by construction, so newest-first is a descending query              |
| `USER#<sub>`      | `IDEM#<id>`      | An idempotency claim on a realtime save, which is why the history query needs a `begins_with` term |
| `TICKET#<digest>` | `TICKET`         | An unspent connection ticket, filed under a SHA-256 digest of itself rather than under its value   |
| `CONN#<sub>`      | `<connectionId>` | An open websocket connection. One user has several — two tabs is normal                            |

Connections and tickets have partitions of their own **because of the IAM
policy, not the query**. Filing them under `USER#<sub>` answers every query
identically, and it would mean the grant that deletes a departed connection
was `DeleteItem` on every item in the table, clinical records included. IAM
can condition on a partition key and not on a sort key, so a separate
partition is what makes `LeadingKeys: CONN#*` expressible. `docs/adr/0011`
records that in full.

Two consequences that the application relies on and that are worth stating
where the table is defined:

- **Isolation is structural.** A record is addressed by a partition key built
  from the requesting user, so another user's transcription id resolves to an
  item that does not exist rather than to one that has to be filtered out
  afterwards. There is no code path where forgetting a check leaks a record.
- **History is one query.** `Query` on the partition with `begins_with` on the
  sort key, read backwards, limited to ten. There is no `Scan` anywhere in the
  codebase.

## No secondary index

An index on `JOB#<externalJobId>` was in the original design so a provider
callback could find its record. It is gone, by ruling R13: the callback URL
carries the transcription id and the user id, so the webhook resolves the
record by primary key. That removed the index, the eventual-consistency race
between submitting a job and receiving its callback, and the retry loop
written to survive that race.

The `externalJobId` attribute still exists and is still compared against the
callback — it is the check that stops a callback with a guessed identity
writing into a record it does not own. It is simply no longer a lookup key.

If the reconciler for stale jobs is built it will need to find records by
status and age, which is a different index from the one that was removed. It
belongs to that work, keyed for the query it serves.

## Encryption, recovery and deletion

Encryption at rest is always on in DynamoDB; what this module chooses is the
key. `server_side_encryption { enabled = true }` moves the table off the
invisible AWS-owned key onto one that appears in the account and whose use is
logged. Passing `kms_key_arn` goes further, to a key with a policy of our own
— in which case the function roles need `kms:Decrypt` and
`kms:GenerateDataKey` on it, which the `functions` module takes as
`kms_key_arns`.

Point-in-time recovery is on. The transcripts survive in S3, but the records
that point at them, their status and their timestamps exist only here.

TTL is enabled, on `ttlEpochSeconds`, and it cannot reach a transcription. A
transcription item does not carry that attribute at all, and DynamoDB never
expires an item that lacks it; only connections and tickets are written with
one. A transcription history that quietly deleted itself would be the opposite
of what this product promises, and raw audio expiry is still a bucket
lifecycle rule, which is where the bytes actually are.

It is a sweeper rather than a clock — DynamoDB deletes within a couple of days
of the expiry, not at it — so both readers compare the stored expiry
themselves. A thirty-second ticket honoured for two more days is exactly the
bug that would follow from trusting the TTL alone. What it is for is the
residue: a browser that vanishes without a close frame never produces a
`$disconnect`, and without this nothing would ever remove its entry.
