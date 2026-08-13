/**
 * The HTTP statuses this API answers with, named once.
 *
 * They were previously declared in eight modules — four handlers with an
 * `OK_STATUS`, two with a `CREATED_STATUS`, and the validation wrapper, the
 * error mapper, the authentication wrapper and the provider webhook each with
 * a private name for a number one of the others already had. Eight private
 * copies is how two of them quietly stop agreeing.
 *
 * Only the statuses this codebase actually returns are listed: an exhaustive
 * table of the registry would be a list of numbers nobody chose.
 */

export const OK = 200;

/** A request that created a record: the upload intent and the realtime save. */
export const CREATED = 201;

/** A request this API refused to act on: malformed body, query or path. */
export const BAD_REQUEST = 400;

/**
 * The provider webhook's rejection of a bad shared secret, and the answer when
 * an authorizer-guarded route somehow arrives without a `sub` claim.
 */
export const UNAUTHORIZED = 401;

export const NOT_FOUND = 404;

export const CONFLICT = 409;

/**
 * Also the threshold the error mapper compares against: a domain error mapped
 * at or above this is answered with the generic body rather than its own
 * message, because a 5xx is this side's fault and its detail belongs in a log.
 */
export const INTERNAL_SERVER_ERROR = 500;
