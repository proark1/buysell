import { execFileSync } from 'node:child_process';

const service = process.env.RAILWAY_SERVICE ?? 'buysell';
const environment = process.env.RAILWAY_ENVIRONMENT ?? 'production';
const logLines = process.env.RAILWAY_LOG_LINES ?? '120';

function runRailway(args) {
  return execFileSync('railway', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function printLogs(kind, flag) {
  console.log(`\n--- Latest ${kind} logs ---`);
  try {
    const logs = runRailway(['logs', '--latest', flag, '--service', service, '--environment', environment, '--lines', logLines]);
    console.log(logs.trim() || '(no logs)');
  } catch (error) {
    console.log(error instanceof Error ? error.message : String(error));
  }
}

function latestDeployment() {
  const raw = runRailway(['deployment', 'list', '--service', service, '--environment', environment, '--limit', '5', '--json']);
  const deployments = JSON.parse(raw);
  if (!Array.isArray(deployments) || deployments.length === 0) {
    throw new Error(`No Railway deployments found for ${service}/${environment}.`);
  }
  return deployments[0];
}

async function checkJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}: ${text}`);
  }

  return body;
}

async function main() {
  const deployment = latestDeployment();
  const shortCommit = deployment.meta?.commitHash?.slice(0, 7) ?? 'unknown';
  console.log(`Latest Railway deployment: ${deployment.id} · ${deployment.status} · ${shortCommit}`);

  if (deployment.status !== 'SUCCESS') {
    printLogs('build', '--build');
    printLogs('deploy', '--deployment');
    throw new Error(`Latest Railway deployment is ${deployment.status}, expected SUCCESS.`);
  }

  const domain = runRailway([
    'run',
    '--service',
    service,
    '--environment',
    environment,
    'node',
    '-e',
    'process.stdout.write(process.env.RAILWAY_PUBLIC_DOMAIN || "")'
  ]).trim();

  if (!domain) {
    throw new Error('RAILWAY_PUBLIC_DOMAIN is not set for the Railway service.');
  }

  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  const health = await checkJson(baseUrl, '/health');
  const dbHealth = await checkJson(baseUrl, '/api/health/db');

  if (health?.status !== 'ok') {
    throw new Error(`/health returned unexpected body: ${JSON.stringify(health)}`);
  }
  if (dbHealth?.connected !== true) {
    throw new Error(`/api/health/db returned disconnected: ${JSON.stringify(dbHealth)}`);
  }

  console.log(`Health OK: ${baseUrl}/health`);
  console.log(`Database OK: ${baseUrl}/api/health/db`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
