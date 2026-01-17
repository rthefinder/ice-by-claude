#!/usr/bin/env ts-node

/**
 * Simulation script
 * 
 * Runs simulation for N epochs with mock fee sources and DEX
 */

import { IceProtocol } from "../src/index";

async function main() {
  console.log("🧊 ICE Protocol Simulation\n");

  try {
    // Force simulation mode
    process.env.SIMULATE_MODE = "true";
    process.env.EXECUTOR_MODE = "dry-run";
    process.env.FEE_SOURCE = "mock";
    process.env.DEX_ENGINE = "mock";

    const epochs = parseInt(process.env.SIMULATION_DURATION_EPOCHS || "24", 10);

    const protocol = await IceProtocol.create();

    console.log(`Running simulation for ${epochs} epochs...\n`);

    await protocol.simulate(epochs);

    console.log("\n✅ Simulation completed");
    console.log("📊 Reports saved to ./reports/");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
