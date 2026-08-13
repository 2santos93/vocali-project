# One table, keyed PK = USER#<cognito sub>, SK = TRANS#<ULID>.
#
# Only the key attributes are declared. DynamoDB stores the rest — status,
# language, object keys, the text preview, the timestamps — without being told
# they exist, and declaring an attribute here is only meaningful if an index
# uses it.
#
# There is no secondary index. One was planned, on JOB#<externalJobId>, so the
# provider callback could find the record it belonged to. Ruling R13 removed
# it: the callback URL now carries the record's own identity, so the webhook
# resolves by primary key with a strongly consistent read. That deleted an
# index we would pay for, the eventual-consistency race it introduced between
# submitting a job and receiving its callback, and the retry logic written to
# paper over that race. If the reconciler for stale jobs is built it will want
# a different index anyway — status and updated time — so it should be added
# then, keyed for the query it actually serves.
resource "aws_dynamodb_table" "transcriptions" {
  name      = var.table_name
  hash_key  = "PK"
  range_key = "SK"

  # On demand rather than provisioned. The load is one user's browsing plus a
  # handful of writes per transcription, and provisioned capacity would mean
  # guessing a number that is wrong in both directions: throttling the demo
  # and paying for idle the rest of the time.
  billing_mode = "PAY_PER_REQUEST"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  # Expires the websocket connection records, and nothing else.
  #
  # A transcription item has no `ttlEpochSeconds` attribute at all, and DynamoDB
  # simply never expires an item that lacks the attribute — so enabling this
  # cannot put a clinical record on a timer. Only the items written by the
  # connection registry and the ticket store carry it.
  #
  # It is a sweeper rather than a clock: DynamoDB deletes expired items within
  # a couple of days of their expiry, not at it. Both readers therefore compare
  # the stored expiry themselves, and this exists so an abandoned connection or
  # an unredeemed ticket does not accumulate for ever. A connection whose
  # browser vanished without a close frame never gets a `$disconnect`, and
  # without this there is nothing at all that would remove it.
  ttl {
    enabled        = true
    attribute_name = "ttlEpochSeconds"
  }

  # DynamoDB encrypts every table at rest regardless. Setting this moves the
  # table from the AWS-owned key, which is invisible, to a key that appears in
  # the account: its use is logged in CloudTrail and, with kms_key_arn set, it
  # can be governed by a key policy of ours. That is worth having for clinical
  # material even before a customer-managed key is introduced.
  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  # Continuous backups with a thirty-five day recovery window. Nothing else in
  # this design can reconstruct a user's history: the transcripts survive in
  # S3, but the records that point at them, and their status, live only here.
  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = var.deletion_protection_enabled

  tags = {
    Name = var.table_name
  }
}
