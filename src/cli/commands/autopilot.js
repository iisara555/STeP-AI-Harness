import { autopilot } from "../../modules/autopilot/index.js";
export async function runAutopilot(args) {
  const controller = new AbortController(),
    stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    console.log(
      JSON.stringify(
        await autopilot({ ...args, signal: controller.signal }),
        null,
        2,
      ),
    );
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
