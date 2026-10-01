import { main } from "../../src/cli/index.js";
await main(["autopilot", ...process.argv.slice(2)]);
