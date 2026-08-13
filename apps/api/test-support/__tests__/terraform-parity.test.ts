import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/infrastructure/config/environment.js';
import {
  CONNECTION_PARTITION_KEY_PREFIX,
  TICKET_PARTITION_KEY_PREFIX,
} from '../../src/infrastructure/persistence/connection.mapper.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const LAMBDA_MODULE = 'infra/modules/lambda/main.tf';
const FUNCTIONS_MODULE = 'infra/modules/functions/main.tf';
const WEB_ROUTES_MODULE = 'apps/web/app/utils/api-routes.ts';

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function terraformStringAssignments(source: string): ReadonlyMap<string, string> {
  const assignments = new Map<string, string>();

  for (const match of source.matchAll(/^[ \t]*([a-z][a-z0-9_]*)[ \t]*=[ \t]*"([^"]*)"[ \t]*$/gm)) {
    assignments.set(match[1]!, match[2]!);
  }

  return assignments;
}

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
