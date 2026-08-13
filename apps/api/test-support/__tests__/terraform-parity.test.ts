import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/infrastructure/config/environment.js';
import {
  CONNECTION_PARTITION_KEY_PREFIX,
  TICKET_PARTITION_KEY_PREFIX,
} from '../../src/infrastructure/persistence/connection.mapper.js';

/**
 * The only check that compares the TypeScript against the Terraform. Three
 * families of string are written twice, in two languages, with no compiler on
 * either side able to see the other:
 *
 * 1. The API route paths — in handler docblocks, in Lambda entry-point
 *    docblocks, in the front end's route constants, and in the Terraform route
 *    list. They have already disagreed.
 * 2. The DynamoDB partition-key prefixes — in the mappers, and again in the
 *    `dynamodb:LeadingKeys` conditions on the function roles. If one moves and
 *    the other does not, the function is denied at the moment it writes, and no
 *    other test can see it: the suite doubles DynamoDB, and a double has no IAM.
 * 3. The environment variable names carrying the Parameter Store paths — in the
 *    configuration schema and in the Terraform locals.
 *
 * **The HCL is read with regular expressions, deliberately.** A real parser
 * means a dependency and a grammar to maintain; the honest alternative is what
 * existed before, which is nothing. Every extraction asserts its own yield
 * before anything is compared, so a Terraform refactor that moves an attribute
 * fails loudly instead of quietly matching nothing.
 *
 * **Every expectation below is a literal this file owns.** Nothing is imported
 * from the module being compared and asserted against itself, because
 * `expect(constant).toBe(constant)` pins nothing. Changing a route path means
 * editing this file too, which is the deliberate act such a change deserves.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const LAMBDA_MODULE = 'infra/modules/lambda/main.tf';
const FUNCTIONS_MODULE = 'infra/modules/functions/main.tf';
const WEB_ROUTES_MODULE = 'apps/web/app/utils/api-routes.ts';

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

/**
 * Wider than "locals": an HCL block is invisible to a line-oriented
 * expression, so resource attributes are collected too. Harmless, because
 * every use is a lookup of a name this file already knows.
 */
function terraformStringAssignments(source: string): ReadonlyMap<string, string> {
  const assignments = new Map<string, string>();

  for (const match of source.matchAll(/^[ \t]*([a-z][a-z0-9_]*)[ \t]*=[ \t]*"([^"]*)"[ \t]*$/gm)) {
    assignments.set(match[1]!, match[2]!);
  }

  return assignments;
}

/**
 * The Terraform key is the function name, which is also the name of its Lambda
 * entry point and of the handler behind it, so this one table is what all four
 * sources are checked against.
 */
const ROUTED_FUNCTIONS = {
  'create-upload-intent': { method: 'POST', path: '/uploads' },
  'list-transcriptions': { method: 'GET', path: '/transcriptions' },
  'get-transcription': { method: 'GET', path: '/transcriptions/{transcriptionId}' },
  'get-transcription-download-url': {
    method: 'GET',
    path: '/transcriptions/{transcriptionId}/download',
  },
  'save-realtime-transcription': { method: 'POST', path: '/transcriptions/realtime' },
  'create-realtime-session': { method: 'POST', path: '/realtime-sessions' },
  'create-connection-ticket': { method: 'POST', path: '/connection-tickets' },
  'handle-provider-callback': { method: 'POST', path: '/webhooks/transcription-provider' },
} as const satisfies Record<string, { method: string; path: string }>;

type RoutedFunction = keyof typeof ROUTED_FUNCTIONS;

const ROUTED_FUNCTION_NAMES = Object.keys(ROUTED_FUNCTIONS) as readonly RoutedFunction[];

function routeKey(route: { method: string; path: string }): string {
  return `${route.method} ${route.path}`;
}

const EXPECTED_ROUTE_KEYS = ROUTED_FUNCTION_NAMES.map((name) =>
  routeKey(ROUTED_FUNCTIONS[name]),
).sort();

/**
 * `\b` before `method` is what keeps `integration_method` out, and requiring
 * `path` to open its own line is what keeps `permission_path` out.
 *
 * A path is either a literal or a reference to a local — the webhook's is a
 * local because the same string has to be both the route key and the base of
 * the callback URL the provider is handed.
 */
function terraformRouteKeys(source: string): readonly string[] {
  const assignments = terraformStringAssignments(source);
  const pattern =
    /\bmethod[ \t]*=[ \t]*"([A-Z]+)"[ \t]*\r?\n[ \t]*path[ \t]*=[ \t]*(?:"([^"]+)"|local\.([a-z0-9_]+))/g;

  return [...source.matchAll(pattern)]
    .map((match) => {
      const literal = match[2];
      if (literal !== undefined) {
        return `${match[1]!} ${literal}`;
      }

      const localName = match[3]!;
      const resolved = assignments.get(localName);
      if (resolved === undefined) {
        throw new Error(`No local named ${localName} was found in ${LAMBDA_MODULE}.`);
      }

      return `${match[1]!} ${resolved}`;
    })
    .sort();
}

/**
 * `METHOD /path` as written in prose. The character class stops at anything a
 * path cannot contain, which is what lets it read a docblock that continues
 * into a sentence or appends a query string without dragging either in.
 */
const DOCUMENTED_ROUTE_PATTERN = /\b(GET|POST|PUT|PATCH|DELETE) (\/[A-Za-z0-9/_{}-]*)/g;

function documentedRouteKeys(relativePath: string): readonly string[] {
  const source = readRepoFile(relativePath);

  return [...source.matchAll(DOCUMENTED_ROUTE_PATTERN)].map((match) => `${match[1]!} ${match[2]!}`);
}

describe('API route paths agree across the TypeScript and the Terraform', () => {
  it('declares exactly these routes in the Terraform route list', () => {
    expect(terraformRouteKeys(readRepoFile(LAMBDA_MODULE))).toEqual(EXPECTED_ROUTE_KEYS);
  });

  it.each(ROUTED_FUNCTION_NAMES)('documents %s on its Lambda entry point', (name) => {
    expect(documentedRouteKeys(`apps/api/src/lambda/${name}.ts`)).toContain(
      routeKey(ROUTED_FUNCTIONS[name]),
    );
  });

  it.each(ROUTED_FUNCTION_NAMES)('documents %s on its request handler', (name) => {
    expect(documentedRouteKeys(`apps/api/src/presentation/handlers/${name}.ts`)).toContain(
      routeKey(ROUTED_FUNCTIONS[name]),
    );
  });

  /**
   * The direction the per-file checks cannot see. A docblock that mentions a
   * path the API does not serve is how the front end came to be built against
   * `/uploads/intent`, and a `toContain` on a different file would never
   * notice it.
   */
  it.each([...ROUTED_FUNCTION_NAMES])('mentions no unserved path anywhere around %s', (name) => {
    const documented = [
      ...documentedRouteKeys(`apps/api/src/lambda/${name}.ts`),
      ...documentedRouteKeys(`apps/api/src/presentation/handlers/${name}.ts`),
    ];

    expect(documented.length).toBeGreaterThanOrEqual(2);
    for (const key of documented) {
      expect(EXPECTED_ROUTE_KEYS).toContain(key);
    }
  });

  /**
   * The front end reaches the API through its own BFF proxy, which forwards the
   * path unchanged under an `/api` prefix.
   *
   * Comments are stripped first: that file's docblock quotes several of these
   * paths, and a quoted path is documentation rather than a call.
   */
  it('builds the same paths in the front end, under the proxy prefix', () => {
    const source = readRepoFile(WEB_ROUTES_MODULE)
      .replaceAll(/\/\*[\s\S]*?\*\//g, '')
      .replaceAll(/\/\/[^\n]*/g, '');

    expect(/const BFF_PREFIX = '\/api';/.test(source)).toBe(true);

    const built = [...source.matchAll(/`([^`]*)`/g)]
      .map((match) =>
        match[1]!
          .replaceAll('${BFF_PREFIX}', '/api')
          .replaceAll('${TRANSCRIPTIONS_PATH}', '/api/transcriptions')
          .replaceAll('${transcriptionId}', '{transcriptionId}'),
      )
      .sort();

    // The webhook is the provider's route, not the browser's — nothing on the
    // front end has any business calling it, so it is the one served path with
    // no constant here.
    const expected = EXPECTED_ROUTE_KEYS.map((key) => `/api${key.split(' ')[1]!}`)
      .filter((route) => route !== '/api/webhooks/transcription-provider')
      .sort();

    expect(built).toEqual(expected);
  });
});

describe('DynamoDB key prefixes agree with the IAM conditions', () => {
  const TICKET_PREFIX = 'TICKET#';
  const CONNECTION_PREFIX = 'CONN#';

  it('writes ticket items under the prefix IAM conditions on', () => {
    expect(TICKET_PARTITION_KEY_PREFIX).toBe(TICKET_PREFIX);
  });

  it('writes connection items under the prefix IAM conditions on', () => {
    expect(CONNECTION_PARTITION_KEY_PREFIX).toBe(CONNECTION_PREFIX);
  });

  it('conditions the function roles on those same two prefixes', () => {
    const source = readRepoFile(FUNCTIONS_MODULE);
    const assignments = terraformStringAssignments(source);

    expect(assignments.get('ticket_partition_key_prefix')).toBe(TICKET_PREFIX);
    expect(assignments.get('connection_partition_key_prefix')).toBe(CONNECTION_PREFIX);
  });

  /**
   * The locals above are only worth comparing if the conditions are written
   * against them. A grant that inlines its own prefix would pass the previous
   * check and still deny the write.
   */
  it('writes every LeadingKeys condition against one of those locals', () => {
    const source = readRepoFile(FUNCTIONS_MODULE);
    const assignments = terraformStringAssignments(source);

    const conditions = [...source.matchAll(/"dynamodb:LeadingKeys"[ \t]*=[ \t]*\[([^\]]*)\]/g)].map(
      (match) =>
        match[1]!
          .trim()
          .replaceAll(
            /\$\{local\.([a-z0-9_]+)\}/g,
            (_whole, name: string) => assignments.get(name) ?? `<unresolved ${name}>`,
          ),
    );

    // Five: two on the ticket partition (mint, redeem) and three on the
    // connection partition (record, query, forget).
    expect(conditions).toHaveLength(5);
    expect(new Set(conditions)).toEqual(
      new Set([`"${TICKET_PREFIX}*"`, `"${CONNECTION_PREFIX}*"`]),
    );
  });
});

describe('Parameter Store variable names agree with the configuration schema', () => {
  const API_KEY_VARIABLE = 'SPEECHMATICS_API_KEY_PARAMETER';
  const WEBHOOK_SECRET_VARIABLE = 'SPEECHMATICS_WEBHOOK_SECRET_PARAMETER';

  function terraformEnvironmentVariableNames(): readonly string[] {
    const source = readRepoFile(LAMBDA_MODULE);
    const block = /environment_variables = \{([\s\S]*?)\n {2}\}/.exec(source);

    if (block === null) {
      throw new Error(`No environment_variables block was found in ${LAMBDA_MODULE}.`);
    }

    return [...block[1]!.matchAll(/^[ \t]*([A-Z][A-Z0-9_]*)[ \t]*=/gm)].map((match) => match[1]!);
  }

  it('sets both parameter paths on every function', () => {
    const names = terraformEnvironmentVariableNames();

    expect(names).toContain(API_KEY_VARIABLE);
    expect(names).toContain(WEBHOOK_SECRET_VARIABLE);
  });

  /**
   * The stronger form of the check above: the environment Terraform produces is
   * handed to the real loader, and the two secret paths are followed to where
   * the provider adapter reads them.
   *
   * `AWS_REGION` is supplied by the test because Lambda supplies it at runtime:
   * it is reserved, and a function declaring it would fail to update.
   */
  it('produces an environment the schema accepts, carrying both paths through', () => {
    const values: Record<string, string> = {
      [API_KEY_VARIABLE]: '/vocali/test/transcription-provider/api-key',
      [WEBHOOK_SECRET_VARIABLE]: '/vocali/test/transcription-provider/webhook-secret',
      PROVIDER_CALLBACK_BASE_URL: 'https://api.example.test/webhooks/transcription-provider',
      PROVIDER_REQUEST_TIMEOUT_MS: '10000',
      PROVIDER_MAX_ATTEMPTS: '3',
      WEBSOCKET_URL: 'wss://sockets.example.test/dev',
      WEBSOCKET_MANAGEMENT_ENDPOINT: 'https://sockets.example.test/dev',
      LOG_LEVEL: 'info',
    };

    const environment: Record<string, string> = { AWS_REGION: 'eu-west-1' };
    for (const name of terraformEnvironmentVariableNames()) {
      environment[name] = values[name] ?? 'set-by-terraform';
    }

    const config = loadConfig(environment);

    expect(config.speechmatics.apiKeySecretName).toBe(values[API_KEY_VARIABLE]);
    expect(config.speechmatics.webhookSecretName).toBe(values[WEBHOOK_SECRET_VARIABLE]);
  });
});
