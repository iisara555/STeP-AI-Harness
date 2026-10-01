import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
const execute = promisify(execFile);
export async function boundedCommand(
  command,
  args,
  {
    cwd,
    input,
    env = process.env,
    timeout = 60_000,
    signal,
    limit = 300_000,
  } = {},
) {
  if (command === "git")
    args = [
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "core.fsmonitor=false",
      ...args,
    ];
  // Windows .cmd shims require a shell. Resolve known npm CLIs to their JS entrypoints instead.
  if (
    process.platform === "win32" &&
    ["npm", "codex", "claude"].includes(command)
  ) {
    const found = await execute("where.exe", [command], {
      windowsHide: true,
      timeout: 5000,
    }).catch(() => ({ stdout: "" }));
    const paths = found.stdout.trim().split(/\r?\n/),
      executable = paths.find((p) => p.endsWith(".exe"));
    const packagePath =
      command === "npm"
        ? "npm/bin/npm-cli.js"
        : command === "codex"
          ? "@openai/codex/bin/codex.js"
          : "@anthropic-ai/claude-code/cli.js";
    const entry = paths
      .map((p) => join(dirname(p), "node_modules", ...packagePath.split("/")))
      .find((p) => existsSync(p));
    if (executable) command = executable;
    else if (entry) {
      args = [entry, ...args];
      command = process.execPath;
    } else throw new Error("RUNTIME_UNAVAILABLE");
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("CANCELLED"));
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "",
      stderr = "",
      size = 0,
      failure = "";
    const stop = (code) => {
      if (failure) return;
      failure = code;
      if (process.platform === "win32" && child.pid)
        void execute("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          timeout: 5000,
        }).catch(() => {});
      else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    };
    const timer = setTimeout(() => stop("PROCESS_TIMEOUT"), timeout),
      cancel = () => stop("CANCELLED");
    signal?.addEventListener("abort", cancel, { once: true });
    const clean = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    };
    const data = (chunk, error) => {
      size += chunk.length;
      if (size > limit) stop("OUTPUT_LIMIT");
      else if (error) stderr += chunk.toString("utf8");
      else output += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk) => data(chunk, false));
    child.stderr.on("data", (chunk) => data(chunk, true));
    child.stdin.on("error", () => {});
    child.stdin.end(input || "");
    child.on("error", () => {
      clean();
      reject(new Error("PROCESS_UNAVAILABLE"));
    });
    child.on("close", (code) => {
      clean();
      failure ? reject(new Error(failure)) : resolve({ code, output, stderr });
    });
  });
}
