# database

The single DynamoDB table.

## The key model

| Attribute | Value          | Purpose                                                              |
| --------- | -------------- | -------------------------------------------------------------------- |
| `PK`      | `USER#<sub>`   | Partition per user, taken from the verified Cognito `sub`            |
| `SK`      | `TRANS#<ULID>` | Chronological by construction, so newest-first is a descending query |

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

There is no TTL attribute. The proposal mentioned one; the data model has no
field that expires, and a transcription history that quietly deletes itself
is the opposite of what this product promises. Raw audio expiry is a bucket
lifecycle rule instead, which is where the bytes actually are.
