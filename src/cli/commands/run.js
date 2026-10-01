import { readManagedPolicy } from "../../utils/managed-policy.js";
import { runGovernedDraft } from "../../modules/runner/index.js";
import { resolveRoutingIdentity } from "../../modules/routing-identity.js";
import { RunnerLedger } from "../../modules/runner/ledger.js";
import { join } from "node:path";
import { homedir } from "node:os";

export async function runRun(args, dependencies = {}) {
  const format = args["output-format"] || "text";
  if (!["text", "json", "stream-json"].includes(format))
    throw new Error("OUTPUT_FORMAT_INVALID");
  const keyName = args["api-key-env"];
  if (
    keyName !== undefined &&
    (typeof keyName !== "string" || !/^[A-Z][A-Z0-9_]{2,80}$/.test(keyName))
  )
    throw new Error("KEY_ENV_INVALID");
  const key = keyName ? process.env[keyName] : undefined;
  const policy = dependencies.policy || readManagedPolicy();
  const identity = await resolveRoutingIdentity(process.cwd(), {
    team: args.team || "",
  });
  const controller = new AbortController(),
    stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const write = dependencies.write || ((value) => process.stdout.write(value));
  try {
    const approveProvider =
      args["approve-provider"] === true && args["approve-destination"] === true;
    const result = await runGovernedDraft(
      {
        query: (args._ || []).slice(1).join(" "),
        answer: args.answer,
        team: identity.team,
        profile: {
          baseUrl: args["base-url"],
          protocol: args.protocol || "openai",
          model: args.model,
        },
        key,
        policy,
        workspace: process.cwd(),
        approveProvider,
        signal: controller.signal,
      },
      {
        ...dependencies,
        policy: () => dependencies.policy || readManagedPolicy(),
        ledger:
          dependencies.ledger ||
          (approveProvider && policy.features?.headless === true
            ? new RunnerLedger(join(homedir(), ".step-ai", "headless"))
            : undefined),
        event: (event) => {
          if (format === "stream-json") write(JSON.stringify(event) + "\n");
        },
      },
    );
    if (format === "text") write(result.text + "\n");
    else if (format === "json") write(JSON.stringify(result) + "\n");
    else {
      if (result.text)
        write(JSON.stringify({ type: "delta", text: result.text }) + "\n");
      write(JSON.stringify({ type: "complete", ...result }) + "\n");
    }
    if (result.status !== "review") process.exitCode = 2;
    return result;
  } catch (error) {
    const code = /^[A-Z_]+$/.test(error.message)
      ? error.message
      : controller.signal.aborted
        ? "CANCELLED"
        : "RUN_FAILED";
    if (format === "text") write(code + "\n");
    else write(JSON.stringify({ type: "error", code }) + "\n");
    process.exitCode = 1;
    return { status: "error", code };
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
