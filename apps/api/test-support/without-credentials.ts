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
