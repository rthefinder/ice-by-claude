import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { PublicKey, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { ProtocolConfig, ExecutorConfig, AllocationConfig, Logger } from "../types";

dotenv.config();

export class ConfigManager {
  private config: ProtocolConfig | null = null;

  constructor(private logger: Logger) {}

  load(): ProtocolConfig {
    if (this.config) {
      return this.config;
    }

    this.logger.info("Loading configuration from environment");

    const config: ProtocolConfig = {
      // Network
      solanaNetwork: this.getEnvString("SOLANA_NETWORK", "devnet") as
        | "devnet"
        | "testnet"
        | "mainnet-beta",
      solanaRpcUrl: this.getEnvString(
        "SOLANA_RPC_URL",
        "https://api.devnet.solana.com"
      ),
      solanaWsUrl: this.getEnvString("SOLANA_WS_URL", "wss://api.devnet.solana.com"),

      // Token
      iceTokenMint: new PublicKey(this.getEnvStringRequired("ICE_TOKEN_MINT")),
      iceCreatorFeeWallet: new PublicKey(
        this.getEnvStringRequired("ICE_CREATOR_FEE_WALLET")
      ),

      // Bot keypair
      botKeypair: this.loadKeypair(),

      // Fee source
      feeSource: this.getEnvString("FEE_SOURCE", "wallet-watcher") as
        | "wallet-watcher"
        | "api"
        | "mock",
      feePollIntervalMs: this.getEnvNumber("FEE_POLL_INTERVAL_MS", 30000),
      feeConfirmationDepth: this.getEnvNumber("FEE_CONFIRMATION_DEPTH", 32),

      // Executor
      executor: this.loadExecutorConfig(),

      // DEX
      dexEngine: this.getEnvString("DEX_ENGINE", "mock") as "mock" | "raydium" | "orca",
      maxSlippageBps: this.getEnvNumber("MAX_SLIPPAGE_BPS", 500),
      maxPriceImpactBps: this.getEnvNumber("MAX_PRICE_IMPACT_BPS", 1000),

      // Ice Health
      iceHealthThreshold: this.getEnvNumber("ICE_HEALTH_THRESHOLD", 50),
      iceHealthCheckIntervalMinutes: this.getEnvNumber(
        "ICE_HEALTH_CHECK_INTERVAL_MINUTES",
        5
      ),
      iceHealthWeights: {
        buybackFrequency: this.getEnvNumber("BUYBACK_FREQUENCY_WEIGHT", 0.25),
        buybackCoverage: this.getEnvNumber("BUYBACK_COVERAGE_WEIGHT", 0.25),
        liquidityDepth: this.getEnvNumber("LIQUIDITY_DEPTH_WEIGHT", 0.25),
        volatilityPenalty: this.getEnvNumber("VOLATILITY_PENALTY_WEIGHT", 0.15),
        timeDecay: this.getEnvNumber("TIME_DECAY_WEIGHT", 0.1),
      },

      // Allocations
      allocationMode: this.getEnvString("ALLOCATION_MODE", "adaptive") as
        | "adaptive"
        | "fixed",
      allocationConfig: this.loadAllocationConfig(),

      // Logging
      logLevel: this.getEnvString("LOG_LEVEL", "info") as
        | "debug"
        | "info"
        | "warn"
        | "error",
      reportsDir: this.getEnvString("REPORTS_DIR", "./reports"),

      // Simulation
      simulateMode: this.getEnvBool("SIMULATE_MODE", false),
    };

    this.validateConfig(config);
    this.config = config;
    this.logConfig(config);

    return config;
  }

  private loadKeypair(): Keypair {
    const b58Keypair = process.env.BOT_KEYPAIR_B58;
    const keypairFilePath = process.env.BOT_KEYPAIR_FILE;

    if (b58Keypair) {
      this.logger.info("Loading keypair from BOT_KEYPAIR_B58");
      const decoded = bs58.decode(b58Keypair);
      return Keypair.fromSecretKey(decoded);
    }

    if (keypairFilePath) {
      this.logger.info("Loading keypair from BOT_KEYPAIR_FILE", { path: keypairFilePath });
      if (!fs.existsSync(keypairFilePath)) {
        throw new Error(`Keypair file not found: ${keypairFilePath}`);
      }
      const fileContent = fs.readFileSync(keypairFilePath, "utf-8");
      const secret = JSON.parse(fileContent);
      return Keypair.fromSecretKey(new Uint8Array(secret));
    }

    throw new Error("Either BOT_KEYPAIR_B58 or BOT_KEYPAIR_FILE must be set");
  }

  private loadExecutorConfig(): ExecutorConfig {
    return {
      mode: this.getEnvString("EXECUTOR_MODE", "dry-run") as "dry-run" | "live",
      epochIntervalSeconds: this.getEnvNumber("EXECUTOR_EPOCH_INTERVAL_SECONDS", 1800),
      maxBudgetPerEpochSol: this.getEnvNumber("MAX_BUDGET_PER_EPOCH_SOL", 1.0),
      minIntervalSeconds: this.getEnvNumber("MIN_INTERVAL_SECONDS", 300),
      maxConsecutiveFailures: this.getEnvNumber("MAX_CONSECUTIVE_FAILURES", 5),
      minBalanceToOperateSol: this.getEnvNumber("MIN_BALANCE_TO_OPERATE_SOL", 0.5),
      driftToleranceBps: this.getEnvNumber("DRIFT_TOLERANCE_BPS", 50),
    };
  }

  private loadAllocationConfig(): AllocationConfig {
    return {
      buybackPct: this.getEnvNumber("ALLOCATION_BUYBACK_PCT", 70),
      lpPct: this.getEnvNumber("ALLOCATION_LP_PCT", 20),
      burnPct: this.getEnvNumber("ALLOCATION_BURN_PCT", 5),
      coolingPct: this.getEnvNumber("ALLOCATION_COOLING_PCT", 5),
    };
  }

  private validateConfig(config: ProtocolConfig): void {
    const weights = config.iceHealthWeights;
    const totalWeight =
      weights.buybackFrequency +
      weights.buybackCoverage +
      weights.liquidityDepth +
      weights.volatilityPenalty +
      weights.timeDecay;

    if (Math.abs(totalWeight - 1.0) > 0.001) {
      throw new Error(
        `Ice health weights must sum to 1.0, got ${totalWeight.toFixed(4)}`
      );
    }

    const alloc = config.allocationConfig;
    const totalAlloc = alloc.buybackPct + alloc.lpPct + alloc.burnPct + alloc.coolingPct;

    if (totalAlloc !== 100) {
      throw new Error(
        `Allocation percentages must sum to 100, got ${totalAlloc}`
      );
    }

    if (config.iceHealthThreshold < 0 || config.iceHealthThreshold > 100) {
      throw new Error("IceHealthThreshold must be between 0 and 100");
    }

    this.logger.info("Configuration validated successfully");
  }

  private logConfig(config: ProtocolConfig): void {
    this.logger.info("Configuration loaded", {
      network: config.solanaNetwork,
      feeSource: config.feeSource,
      dexEngine: config.dexEngine,
      executorMode: config.executor.mode,
      iceHealthThreshold: config.iceHealthThreshold,
      allocationMode: config.allocationMode,
    });
  }

  private getEnvString(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue;
  }

  private getEnvStringRequired(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable not set: ${key}`);
    }
    return value;
  }

  private getEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (value === undefined) {
      return defaultValue;
    }
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
      throw new Error(`Invalid number for ${key}: ${value}`);
    }
    return parsed;
  }

  private getEnvBool(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (value === undefined) {
      return defaultValue;
    }
    return value.toLowerCase() === "true" || value === "1";
  }
}
