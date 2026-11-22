import { test } from "node:test";
import assert from "node:assert/strict";
import { compatibleRun } from "../src/modules/providers/compatible.js";
const event = (data) => `data: ${JSON.stringify(data)}\n\n`;
const stream = (text) =>
  new Response(text, { headers: { "content-type": "text/event-stream" } });
const profile = { baseUrl: "https://fixture.invalid/v1", model: "fixture" };
const TOOL = {
  type: "function",
  function: {
    name: "step_tool",
    parameters: { type: "object", properties: { tool: { type: "string" } } },
  },
};
const fenceBodies = (text) =>
  [...text.matchAll(/```step-tool\n([\s\S]*?)\n```/g)].map((m) =>
    JSON.parse(m[1]),
  );

test("native tool calls stream back as step-tool requests the loop already reads", async () => {
  let body;
  const args = JSON.stringify({
    tool: "changes",
    input: "notes.md",
    content: 'บรรทัด "หนึ่ง"\n```js\nx\n```',
  });
  const fetcher = async (_url, options) => {
    body = JSON.parse(options.body);
    return stream(
      event({ choices: [{ delta: { content: "จะบันทึกไฟล์" } }] }) +
        event({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "a",
                    function: { name: "step_tool", arguments: args.slice(0, 20) },
                  },
                ],
              },
            },
          ],
        }) +
        event({
          choices: [
            { delta: { tool_calls: [{ index: 0, function: { arguments: args.slice(20) } }] } },
          ],
        }) +
        event({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 1,
                    function: { name: "step_tool", arguments: '{"tool":"skill","input":"step-tor"}' },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }) +
        "data: [DONE]\n\n",
    );
  };
  const text = await compatibleRun(
    "task",
    profile,
    { nativeTools: [TOOL] },
    fetcher,
  );
  assert.deepEqual(body.tools, [TOOL]);
  assert.ok(text.startsWith("จะบันทึกไฟล์"));
  const [write, skill] = fenceBodies(text);
  assert.deepEqual(write, JSON.parse(args));
  assert.deepEqual(skill, { tool: "skill", input: "step-tor" });
  // A code fence inside content cannot end the block early.
  assert.equal(text.match(/```/g).length, 4);
});

test("arguments that are not JSON stay unreadable for the loop to report; other function names keep their name", async () => {
  const fetcher = async () =>
    stream(
      event({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, function: { name: "step_tool", arguments: '{"tool":"files",' } },
                { index: 1, function: { name: "read_file", arguments: '{"path":"a.md"}' } },
              ],
            },
          },
        ],
      }) + "data: [DONE]\n\n",
    );
  const text = await compatibleRun("task", profile, { nativeTools: [TOOL] }, fetcher);
  const blocks = [...text.matchAll(/```step-tool\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  assert.equal(blocks[0], '{"tool":"files",');
  assert.deepEqual(JSON.parse(blocks[1]), { tool: "read_file", path: "a.md" });
});

test("without native tools, or on the Anthropic protocol, tool calls stay refused and no tools are sent", async () => {
  let body;
  const calling = async (_url, options) => {
    body = JSON.parse(options.body);
    return stream(
      event({
        choices: [
          { delta: { tool_calls: [{ index: 0, function: { name: "x", arguments: "{}" } }] } },
        ],
      }) + "data: [DONE]\n\n",
    );
  };
  await assert.rejects(compatibleRun("task", profile, {}, calling), /PROVIDER_TOOL_DENIED/);
  assert.ok(!Object.hasOwn(body, "tools"));
  const anthropic = async (_url, options) => {
    body = JSON.parse(options.body);
    return stream(
      event({ type: "content_block_start", content_block: { type: "tool_use" } }) +
        event({ type: "message_stop" }),
    );
  };
  await assert.rejects(
    compatibleRun("task", { ...profile, protocol: "anthropic" }, { key: "k", nativeTools: [TOOL] }, anthropic),
    /PROVIDER_TOOL_DENIED/,
  );
  assert.ok(!Object.hasOwn(body, "tools"));
  await assert.rejects(
    compatibleRun("task", profile, { nativeTools: Array(9).fill(TOOL) }, calling),
    /INVALID_INPUT/,
  );
});
