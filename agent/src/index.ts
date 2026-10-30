import { config } from "./config.js";
import { startApi } from "./api.js";
import { agentAccount, decodeError, publicClient, syncIndex } from "./chain.js";
import { tickDue } from "./agents/pipeline.js";
import { investDue, syncPrices } from "./keeper.js";
import { llmEnabled } from "./llm.js";
import { refreshPrices } from "./prices.js";

function loop(name: string, everyMs: number, fn: () => Promise<unknown>) {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (e) {
      console.warn(`[${name}] ${decodeError(e)}`);
    } finally {
      busy = false;
    }
  };
  void run();
  return setInterval(run, everyMs);
}

async function main() {
  console.log(
    `[agent] chain ${config.chainId} rpc ${config.rpcUrl} agent ${agentAccount?.address ?? "(no AGENT_KEY)"} engine ${llmEnabled() ? `llm (${config.analystModel})` : "rules"}`,
  );
  startApi();
  loop("prices", 15_000, refreshPrices);

  if (!config.deployment) {
    console.warn(`[agent] no deployment at ${config.deploymentPath}; API-only mode (restart after deploying)`);
    return;
  }
  if (!agentAccount) {
    console.warn("[agent] AGENT_KEY missing; read-only mode");
    return;
  }
  try {
    const bal = await publicClient.getBalance({ address: agentAccount.address });
    console.log(`[agent] vault ${config.deployment.vault}, agent gas balance ${Number(bal) / 1e18}`);
  } catch (e) {
    console.warn("[agent] rpc check failed:", decodeError(e));
  }
  loop("index", 10_000, () => syncIndex(true));
  loop("tick", config.schedulerMs, () => tickDue());
  loop("invest", 20_000, investDue);
  if ([31337, 133].includes(config.chainId)) loop("sync", config.priceSyncSec * 1000, syncPrices);
}

process.on("unhandledRejection", (e) => console.warn("[agent] unhandledRejection:", decodeError(e)));
main().catch((e) => {
  console.error("[agent] fatal:", e);
  process.exit(1);
});
