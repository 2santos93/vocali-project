/**
 * The variables an AWS SDK client would find if it resolved credentials
 * eagerly. They are stripped from the environment before the dependency graph
 * is built, which is what gives "the graph constructs without touching AWS"
 * any teeth: the SDK resolves credentials lazily, on the first command, and a
 * client that broke that — or anything else at module scope that read the
 * environment and threw — would otherwise pass on every developer machine
 * that happens to be logged in and fail only on a cold start after a deploy.
 */
const AWS_CREDENTIAL_VARIABLES = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_PROFILE',
];

export function withoutCredentials(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(source).filter(([name]) => !AWS_CREDENTIAL_VARIABLES.includes(name)),
  );
}
