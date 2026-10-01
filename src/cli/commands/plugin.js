import {
  installPack,
  listPacks,
  enablePack,
  exportPack,
} from "../../modules/packs/index.js";
import { readManagedPolicy } from "../../utils/managed-policy.js";
export function runPlugin(args) {
  const policy = readManagedPolicy(),
    workspace = process.cwd(),
    action = args._[1];
  let result;
  if (action === "list") result = listPacks(workspace, policy);
  else if (action === "install")
    result = installPack(workspace, args._[2], { name: args.name });
  else if (action === "enable")
    result = enablePack(workspace, args._[2], policy, {
      approve: args["approve-enable"] === true,
      hooks: args["approve-hooks"] === true,
      agents: args["approve-agents"] === true,
      disable: args.disable === true,
    });
  else if (action === "export")
    result = exportPack(workspace, args._[2], args._[3], {
      approve: args["approve-export"] === true,
    });
  else throw new Error("PLUGIN_ACTION_INVALID");
  console.log(JSON.stringify(result, null, 2));
  return result;
}
