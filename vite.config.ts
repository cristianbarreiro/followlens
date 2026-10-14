import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import hostingConfig from './.openai/hosting.json';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';
const requestedDeploymentTarget = process.env.FOLLOWLENS_DEPLOY_TARGET;
const deploymentTarget =
  requestedDeploymentTarget ??
  (process.env.VERCEL === '1' ? 'vercel' : 'cloudflare');

if (deploymentTarget !== 'vercel' && deploymentTarget !== 'cloudflare') {
  throw new Error(
    'FOLLOWLENS_DEPLOY_TARGET must be either "vercel" or "cloudflare".',
  );
}

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  const deploymentPlugins = [];

  if (deploymentTarget === 'vercel') {
    if (process.env.NITRO_PRESET && process.env.NITRO_PRESET !== 'vercel') {
      throw new Error(
        'NITRO_PRESET must be "vercel" when FOLLOWLENS_DEPLOY_TARGET is "vercel".',
      );
    }
    process.env.NITRO_PRESET = 'vercel';
    const { nitro } = await import('nitro/vite');
    deploymentPlugins.push(nitro());
  } else {
    // Keep Wrangler and Miniflare state project-local. These are non-secret
    // tool settings; application environment belongs in ignored `.env*` files.
    process.env.WRANGLER_WRITE_LOGS ??= 'false';
    process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
    process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

    // Wrangler snapshots its log path while the Cloudflare plugin is imported.
    const { cloudflare } = await import('@cloudflare/vite-plugin');
    deploymentPlugins.push(
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    );
  }

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [vinext(), tailwindcss(), ...deploymentPlugins, sites()],
  };
});
