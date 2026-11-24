import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MIN_TOKEN_LENGTH, StepMcpServer } from "./service.js";
import { createStepCatalogTools } from "./tools/step-catalog.js";

const args = process.argv.slice(2);
const serve = args.includes("--serve");
const stdio = args.includes("--stdio");

function readRootArg(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root" && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      return argv[i + 1];
    }
    if (argv[i].startsWith("--root=")) {
      return argv[i].slice("--root=".length);
    }
  }
  return "";
}

if (serve === stdio) {
  process.stderr.write(
    "Usage: node gateway/mcp/run.js --serve | --stdio [--root <path>]\n" +
      "วิธีใช้: ระบุ --serve (HTTP บน 127.0.0.1) หรือ --stdio อย่างใดอย่างหนึ่ง\n",
  );
  process.exit(1);
}

const defaultRoot = fileURLToPath(new URL("../..", import.meta.url));
const rootDir = resolve(readRootArg(args) || process.env.STEP_MCP_ROOT || defaultRoot);
const tools = createStepCatalogTools({ rootDir });

if (stdio) {
  const mcp = new StepMcpServer({
    tools,
    onAudit:
      process.env.STEP_MCP_AUDIT === "1"
        ? (entry) => process.stderr.write(JSON.stringify(entry) + "\n")
        : undefined,
  });
  const handle = mcp.attachStdio();
  process.once("SIGTERM", () => handle.close());
  process.once("SIGINT", () => handle.close());
} else {
  const authToken = process.env.STEP_MCP_AUTH_TOKEN;
  if (typeof authToken !== "string" || authToken.length < MIN_TOKEN_LENGTH) {
    process.stderr.write(
      `STEP_MCP_AUTH_TOKEN must be set and at least ${MIN_TOKEN_LENGTH} characters.\n`,
    );
    process.exit(1);
  }
  const port = Number(process.env.STEP_MCP_PORT || 8790);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    process.stderr.write("STEP_MCP_PORT must be an integer between 1024 and 65535.\n");
    process.exit(1);
  }
  const mcp = new StepMcpServer({
    tools,
    authToken,
    onAudit: (entry) => process.stderr.write(JSON.stringify(entry) + "\n"),
  });
  const server = mcp.createHttpServer();
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.listen(port, "127.0.0.1", () => console.log("STEP_MCP_READY"));

  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
