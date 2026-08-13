resource "aws_dynamodb_table" "transcriptions" {
  name      = var.table_name
  hash_key  = "PK"
  range_key = "SK"

  billing_mode = "PAY_PER_REQUEST"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  ttl {
    enabled        = true
    attribute_name = "ttlEpochSeconds"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = var.deletion_protection_enabled

  tags = {
    Name = var.table_name
  }
}
