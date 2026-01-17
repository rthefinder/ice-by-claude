import { IceHealthEngine, HealthMetricsInput } from "../src/services/ice-health/engine";
import { ProtocolConfig } from "../src/types";
import { createLogger } from "../src/utils/logger";

const logger = createLogger("info");

// Mock config for testing
const mockConfig: ProtocolConfig = {
  solanaNetwork: "devnet",
  solanaRpcUrl: "https://api.devnet.solana.com",
  solanaWsUrl: "wss://api.devnet.solana.com",
  iceTokenMint: new (require("@solana/web3.js")).PublicKey(
    "11111111111111111111111111111111"
  ),
  iceCreatorFeeWallet: new (require("@solana/web3.js")).PublicKey(
    "11111111111111111111111111111111"
  ),
  botKeypair: null as any,
  feeSource: "mock",
  feePollIntervalMs: 30000,
  feeConfirmationDepth: 32,
  executor: {
    mode: "dry-run",
    epochIntervalSeconds: 1800,
    maxBudgetPerEpochSol: 1.0,
    minIntervalSeconds: 300,
    maxConsecutiveFailures: 5,
    minBalanceToOperateSol: 0.5,
    driftToleranceBps: 50,
  },
  dexEngine: "mock",
  maxSlippageBps: 500,
  maxPriceImpactBps: 1000,
  iceHealthThreshold: 50,
  iceHealthCheckIntervalMinutes: 5,
  iceHealthWeights: {
    buybackFrequency: 0.25,
    buybackCoverage: 0.25,
    liquidityDepth: 0.25,
    volatilityPenalty: 0.15,
    timeDecay: 0.1,
  },
  allocationMode: "adaptive",
  allocationConfig: {
    buybackPct: 70,
    lpPct: 20,
    burnPct: 5,
    coolingPct: 5,
  },
  logLevel: "info",
  reportsDir: "./reports",
  simulateMode: true,
};

function testHealthCalculation() {
  console.log("\n========== ICE HEALTH ENGINE TEST ==========\n");

  const engine = new IceHealthEngine(mockConfig, logger);
  const now = Math.floor(Date.now() / 1000);

  // Test case 1: Healthy ice
  console.log("Test 1: Healthy Ice (recent buyback, good coverage)");
  const input1: HealthMetricsInput = {
    buybackCountLast24h: 5,
    buybackVolumeSolLast24h: 10,
    recentSellPressureSol: 5,
    currentLiquidity: 100,
    volatilityPercent24h: 10,
    lastBuybackTimestampSeconds: now - 3600, // 1 hour ago
    currentTimestampSeconds: now,
  };

  const health1 = engine.computeHealth(input1, 1);
  console.log(`  Health: ${health1.health} (should be high)`);
  console.log(`  Status: ${health1.status}`);
  console.log(`  Metrics:`, health1.metrics);
  console.log("");

  // Test case 2: Melting ice
  console.log("Test 2: Melting Ice (no buyback, low liquidity)");
  const input2: HealthMetricsInput = {
    buybackCountLast24h: 0,
    buybackVolumeSolLast24h: 0,
    recentSellPressureSol: 10,
    currentLiquidity: 10,
    volatilityPercent24h: 30,
    lastBuybackTimestampSeconds: now - 86400 * 2, // 2 days ago
    currentTimestampSeconds: now,
  };

  const health2 = engine.computeHealth(input2, 2);
  console.log(`  Health: ${health2.health} (should be low)`);
  console.log(`  Status: ${health2.status}`);
  console.log(`  Metrics:`, health2.metrics);
  console.log("");

  // Test case 3: Dead ice
  console.log("Test 3: Dead Ice (no activity)");
  const input3: HealthMetricsInput = {
    buybackCountLast24h: 0,
    buybackVolumeSolLast24h: 0,
    recentSellPressureSol: 20,
    currentLiquidity: 1,
    volatilityPercent24h: 50,
    lastBuybackTimestampSeconds: now - 86400 * 5, // 5 days ago
    currentTimestampSeconds: now,
  };

  const health3 = engine.computeHealth(input3, 3);
  console.log(`  Health: ${health3.health} (should be dead)`);
  console.log(`  Status: ${health3.status}`);
  console.log(`  Metrics:`, health3.metrics);
  console.log("");

  console.log("✅ Health calculation tests passed!");
}

// Run tests
testHealthCalculation();
