/**
 * The one field of an S3 event notification this handler reads. The entry
 * point in `src/lambda/` declares AWS's `S3Handler`, so this narrowing is
 * still checked against the real event shape.
 */
export interface S3ObjectCreatedEvent {
  readonly Records: readonly {
    readonly s3: { readonly object: { readonly key: string } };
  }[];
}
