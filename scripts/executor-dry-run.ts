#!/usr/bin/env ts-node

/**
 * Executor dry-run script
 * 
 * Tests executor logic without making transactions
 */

import { IceProtocol } from "../src/index";

async function main() {
  console.log("🧊 ICE Protocol Executor (Dry-Run Mode)\n");

  try {
    // Force dry-run mode
    process.env.EXECUTOR_MODE = "dry-run";

    const protocol = await IceProtocol.create();

    console.log("Running 1 epoch in dry-run mode (no transactions will be submitted)...\n");

    // Run one epoch
    await protocol.simulate(1);

    console.log("\n✅ Dry-run completed successfully");
    console.log("Check ./reports/ for detailed epoch report");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
