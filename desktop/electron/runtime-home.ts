import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Connection } from '../src/types';
import { geminiTools } from './runtime-policy';

/**
 * Prepares a runtime's own home folder so Codex, Gemini CLI and Claude never read the employee's
 * personal MCP servers, plugins, context files or credentials, and returns the environment to
 * start it with. The app keeps one home per connection; the evaluation runner uses a throwaway one.
 */
export async function isolatedRuntimeHome(
  home: string,
  connection: Pick<Connection, 'provider' | 'mode' | 'googleCloudProject'>,
  webSearch = false,
) {
  const cwd = join(home, 'workspace');
  await mkdir(cwd, { recursive: true });
  await mkdir(join(home, '.gemini'), { recursive: true });
  const geminiAuthType = connection.provider === 'gemini' ? (connection.mode === 'api' ? 'gemini-api-key' : 'oauth-personal') : undefined;
  await writeFile(
    join(home, '.gemini', 'settings.json'),
    JSON.stringify({
      // Native tools stay off; only an isolated web-search run gets the search tool.
      tools: geminiTools(webSearch),
      mcpServers: {},
      telemetry: { enabled: false },
      context: { fileName: '__STEP_NO_CONTEXT__' },
      ...(geminiAuthType ? { security: { auth: { selectedType: geminiAuthType, enforcedType: geminiAuthType } } } : {}),
    }),
  );
  await writeFile(
    join(home, 'config.toml'),
    'web_search = "disabled"\ncli_auth_credentials_store = "file"\n[features]\nshell_tool = false\nplugins = false\nremote_plugin = false\nplugin_sharing = false\napps = false\ngoals = false\n',
  );
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    HOME: home,
    USERPROFILE: home,
    APPDATA: home,
    LOCALAPPDATA: home,
    CODEX_HOME: home,
    GEMINI_CLI_HOME: home,
    GOOGLE_CLOUD_PROJECT: connection.provider === 'gemini' ? connection.googleCloudProject : undefined,
    GOOGLE_CLOUD_PROJECT_ID: connection.provider === 'gemini' ? connection.googleCloudProject : undefined,
    CLAUDE_CONFIG_DIR: join(home, '.claude'),
    ANTHROPIC_CONFIG_DIR: connection.provider === 'claude' && connection.mode === 'oauth' ? join(home, '.anthropic') : undefined,
  };
  return { cwd, env };
}
