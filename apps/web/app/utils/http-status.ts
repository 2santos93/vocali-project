export const HTTP_OK = 200;

/** The upper bound of the 2xx range, exclusive: `>= OK && < MULTIPLE_CHOICES` is success. */
export const HTTP_MULTIPLE_CHOICES = 300;

export const HTTP_UNAUTHORIZED = 401;

/** From S3: the presigned POST's policy expired or its conditions were not met. */
export const HTTP_FORBIDDEN = 403;

export const HTTP_PAYLOAD_TOO_LARGE = 413;

export const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
