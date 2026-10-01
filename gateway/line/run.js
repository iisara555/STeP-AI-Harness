import {
  readManagedPolicy,
  trustedManagedPolicyPath,
} from "../../src/utils/managed-policy.js";
import { readFileSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
import { LineGateway } from "./service.js";
import { RunnerLedger } from "../../src/modules/runner/ledger.js";

if (!process.argv.includes("--serve"))
  throw new Error("LINE_SERVE_OPT_IN_REQUIRED");
const allowlist = process.env.STEP_LINE_ALLOWLIST;
if (
  !allowlist ||
  !trustedManagedPolicyPath(allowlist) ||
  lstatSync(allowlist).size > 256_000
)
  throw new Error("LINE_ALLOWLIST_UNTRUSTED");
const storage = resolve(
    process.env.STEP_LINE_STORAGE || "./.step/line-private",
  ),
  workspace = resolve(process.env.STEP_LINE_WORKSPACE || process.cwd());
const users = () => {
  if (
    !trustedManagedPolicyPath(allowlist) ||
    lstatSync(allowlist).size > 256_000
  )
    throw new Error("LINE_ALLOWLIST_UNTRUSTED");
  return JSON.parse(readFileSync(allowlist, "utf8"));
};
const gateway = new LineGateway(
  {
    secret: process.env.STEP_LINE_CHANNEL_SECRET,
    token: process.env.STEP_LINE_CHANNEL_TOKEN,
    channelId: process.env.STEP_LINE_CHANNEL_ID,
    approverToken: process.env.STEP_LINE_APPROVER_TOKEN,
    users: users(),
    providerKey: process.env.STEP_LINE_PROVIDER_KEY,
    storage,
    workspace,
  },
  {
    policy: () => readManagedPolicy(),
    users,
    runner: { ledger: new RunnerLedger(storage) },
  },
);
const port = Number(process.env.STEP_LINE_PORT || 8788);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("LINE_PORT_INVALID");
const server = gateway.server();
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.listen(port, "127.0.0.1", () => console.log("LINE_GATEWAY_READY"));
let closing = false;
const stop = () => {
  if (closing) return;
  closing = true;
  server.close();
  void gateway.close().then(() => server.closeAllConnections());
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
