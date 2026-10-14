// No credentials or workspace access in this process. It only forwards MCP
// requests to the live evaluation host over a per-trial local named pipe.
import { connect } from 'node:net';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { NATIVE_SCHEMA } from './spec.mjs';
const endpoint = process.argv[2];
if (!endpoint) throw new Error('EVAL_HOST_REQUIRED');
const server = new Server({ name: 'step-eval', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'step_host',
      description: 'Call a governed STeP host tool. Host permission and privacy checks apply.',
      inputSchema: NATIVE_SCHEMA,
    },
  ],
}));
server.setRequestHandler(CallToolRequestSchema, async request => {
  if (request.params.name !== 'step_host') return { content: [{ type: 'text', text: 'EVAL_TOOL_DISABLED' }], isError: true };
  const result = await new Promise((resolve, reject) => {
    const socket = connect(endpoint);
    let text = '';
    socket.setTimeout(30000, () => socket.destroy(new Error('EVAL_HOST_TIMEOUT')));
    socket.on('connect', () => socket.write(JSON.stringify(request.params.arguments) + '\n'));
    socket.on('error', reject);
    socket.on('data', bytes => {
      text += bytes;
      if (text.length > 1000000) return socket.destroy(new Error('TOOL_OUTPUT_LIMIT'));
      if (text.includes('\n')) {
        try {
          resolve(JSON.parse(text.slice(0, text.indexOf('\n'))));
        } catch {
          reject(new Error('INVALID_TOOL_RESULT'));
        }
        socket.end();
      }
    });
  });
  return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.ok };
});
await server.connect(new StdioServerTransport());
