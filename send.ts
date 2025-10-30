/* eslint-disable no-console */
import {
  createWalletClient,
  custom,
  formatUnits,
  http,
  parseEther,
  publicActions,
} from "viem";
import type { Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

// Custom transport that logs RPC calls
function loggingTransport(rpcUrl: string): Transport {
  return (opts) => {
    const httpTransport = http(rpcUrl)(opts);

    return custom({
      async request(args) {
        const method = args.method;
        const params = args.params || [];

        // Format params nicely
        let paramsStr = "";
        if (params.length > 0) {
          paramsStr = " " + JSON.stringify(params).slice(0, 80);
          if (JSON.stringify(params).length > 80) {
            paramsStr += "...";
          }
        }

        try {
          const result = await httpTransport.request(args);

          // Format result summary
          let summary = "";
          if (result === null) {
            summary = "null";
          } else if (typeof result === "string") {
            summary = result.length > 60 ? result.slice(0, 60) + "..." : result;
          } else if (typeof result === "object") {
            // For receipts, show status and block
            if ((result as any).status !== undefined) {
              summary = `status=${(result as any).status} block=${
                (result as any).blockNumber
              }`;
            }
            // For blocks, show more details
            else if ((result as any).number !== undefined) {
              const hash = (result as any).hash
                ? (result as any).hash.slice(0, 10) + "..."
                : "none";
              const parentHash = (result as any).parentHash
                ? (result as any).parentHash.slice(0, 10) + "..."
                : "none";
              const txCount = (result as any).transactions?.length || 0;
              summary = `block=${
                (result as any).number
              } hash=${hash} parent=${parentHash} txs=${txCount}`;
            }
            // For transactions, show block number if available
            else if ((result as any).blockNumber !== undefined) {
              summary = `blockNumber=${(result as any).blockNumber}`;
            } else {
              summary = JSON.stringify(result).slice(0, 60);
            }
          } else {
            summary = String(result);
          }

          // Log request and response atomically
          console.log(`  [RPC] ${method}${paramsStr}`);
          console.log(`        → ${summary}`);
          return result;
        } catch (error: any) {
          // Log error with request atomically
          const errorMsg = error?.details || error?.message || "Unknown error";
          console.log(`  [RPC] ${method}${paramsStr}`);
          console.log(`        → ERROR: ${errorMsg}`);
          throw error;
        }
      },
    })(opts);
  };
}

async function main() {
  // Configure via environment variable
  const rpcUrl = process.env.RPC_URL || "https://forno.celo.org";
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;

  if (!privateKey) {
    console.error("Error: PRIVATE_KEY environment variable is required");
    console.error("Usage: PRIVATE_KEY=0x... RPC_URL=https://... yarn start");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  console.log("Account:", account.address);
  console.log("RPC URL:", rpcUrl);
  console.log();

  const client = createWalletClient({
    account,
    chain: celo,
    transport: loggingTransport(rpcUrl),
  }).extend(publicActions);

  const balance = await client.getBalance({ address: account.address });
  console.log(`Balance: ${formatUnits(balance, 18)} CELO`);

  const numSends = 100;
  const results = {
    total: numSends,
    successful: 0,
    failed: 0,
    blockOutOfRangeErrors: 0,
    otherErrors: 0,
  };

  console.log(`\nStarting ${numSends} sends...\n`);

  for (let i = 1; i <= numSends; i++) {
    try {
      console.log(`[${i}/${numSends}] Sending 0.001 CELO...`);
      const hash = await client.sendTransaction({
        to: account.address,
        value: parseEther("0.001"),
      });

      console.log(`[${i}/${numSends}] Waiting for tx: ${hash}`);

      const receipt = await client.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        results.successful++;
        console.log(`[${i}/${numSends}] ✓ Success`);
      } else {
        results.failed++;
        console.log(`[${i}/${numSends}] ✗ Failed: tx status not success`);
      }
    } catch (error: any) {
      results.failed++;

      // Check if this is a "block is out of range" error
      const errorMessage = error?.message?.toLowerCase() || "";
      const errorDetails = JSON.stringify(error?.details || {}).toLowerCase();

      if (
        errorMessage.includes("block is out of range") ||
        errorDetails.includes("block is out of range") ||
        errorDetails.includes("-32019")
      ) {
        results.blockOutOfRangeErrors++;
        console.log(`[${i}/${numSends}] ✗ Failed: BLOCK OUT OF RANGE error`);
      } else {
        results.otherErrors++;
        console.log(`[${i}/${numSends}] ✗ Failed: ${errorMessage}`);
      }

      console.error(`[${i}/${numSends}] Error details:`, error);
    }

    // Small delay between sends to avoid overwhelming the RPC
    if (i < numSends) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log("\n=== RESULTS ===");
  console.log(`Total sends: ${results.total}`);
  console.log(
    `Successful: ${results.successful} (${(
      (results.successful / results.total) *
      100
    ).toFixed(2)}%)`
  );
  console.log(
    `Failed: ${results.failed} (${(
      (results.failed / results.total) *
      100
    ).toFixed(2)}%)`
  );
  console.log(
    `  - Block out of range errors: ${results.blockOutOfRangeErrors}`
  );
  console.log(`  - Other errors: ${results.otherErrors}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
