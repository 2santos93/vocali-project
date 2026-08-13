export const OK = 200;

export const CREATED = 201;

export const BAD_REQUEST = 400;

export const UNAUTHORIZED = 401;

export const NOT_FOUND = 404;

export const CONFLICT = 409;

/**
 * Also the threshold the error mapper compares against: a domain error mapped
 * at or above this is answered with the generic body rather than its own
 * message, because a 5xx is this side's fault and its detail belongs in a log.
 */
export const INTERNAL_SERVER_ERROR = 500;
