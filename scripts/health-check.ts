#!/usr/bin/env ts-node

/**
 * Health check script
 * 
 * Displays current protocol state and health status
 */

import { IceProtocol } from "../src/index";

async function main() {
  console.log("🧊 ICE Protocol Health Check\n");

  try {
    const protocol = await IceProtocol.create();
    const state = protocol.getState();

    console.log("📊 Executor State:");
    console.log(`  Consecutive Failures: ${state.executor.consecutiveFailures}`);
    console.log(`  Circuit Breaker Active: ${state.executor.circuitBreakerActive}`);
    console.log(`  Epoch Number: ${state.executor.epochNumber}`);
    console.log(`  Last Execution: ${new Date(state.executor.lastExecutionTime * 1000).toISOString()}`);

    console.log("\n💰 Fee Tracker:");
    console.log(`  Total Collected (SOL): ${state.feeTracker.totalCollected.toFixed(4)}`);
    console.log(`  Events Tracked: ${state.feeTracker.eventCount}`);

    console.log("\n✅ Protocol is operational");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
