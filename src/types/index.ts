import { PublicKey } from "@solana/web3.js";

/**
 * Core types for the $ice protocol
 */

// ============================================================
// FEE & ACCOUNTING
// ============================================================

export interface FeeEvent {
  signature: string;
  timestamp: number; // Unix timestamp (seconds)
  amountSol: number;
  source: "wallet-watcher" | "api" | "mock";
  confirmationStatus: "processed" | "confirmed" | "finalized";
  processed: boolean;
}

export interface FeeTracker {
  totalFeesCollected: number; // in SOL
  lastProcessedSignature: string;
  lastProcessedTimestamp: number;
  events: FeeEvent[];
}

// ============================================================
// ICE HEALTH MODEL
// ============================================================

export interface IceHealthMetrics {
  buybackFrequency: number; // 0-100: frequency of buybacks
  buybackCoverage: number; // 0-100: buyback volume vs sell pressure
  liquidityDepth: number; // 0-100: LP depth and stability
  volatilityPenalty: number; // 0-100: penalty for volatility
  timeDecay: number; // 0-100: decay from inactivity
}

export interface IceHealthState {
  timestamp: number;
  health: number; // 0-100
  metrics: IceHealthMetrics;
  status: "ALIVE" | "MELTING" | "DEAD";
  lastActionTime: number;
  epochNumber: number;
}

// ============================================================
// ALLOCATIONS & BUDGET
// ============================================================

export interface AllocationConfig {
  buybackPct: number; // e.g., 70
  lpPct: number; // e.g., 20
  burnPct: number; // e.g., 5
  coolingPct: number; // e.g., 5
}

export interface EpochAllocation {
  totalFeesToAllocate: number;
  allocations: {
    buyback: number;
    lp: number;
    burn: number;
    cooling: number;
  };
  actions: AllocationAction[];
}

export interface AllocationAction {
  type: "buyback" | "add-lp" | "burn" | "cooling-event";
  amountSol: number;
  signature?: string;
  status: "pending" | "executed" | "failed";
  error?: string;
}

// ============================================================
// DEX / SWAP ABSTRACTIONS
// ============================================================

export interface QuoteInput {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amountIn: number;
  slippageBps?: number;
}

export interface Quote {
  inputAmount: number;
  outputAmount: number;
  priceImpactBps: number;
  feeBps: number;
  routePath: string;
}

export interface SwapInstruction {
  programId: PublicKey;
  accounts: any[];
  data: Buffer;
}

export interface SwapResult {
  signature: string;
  inputAmount: number;
  outputAmount: number;
  actualPriceImpactBps: number;
}

export interface LPAddResult {
  signature: string;
  lpTokenAmount: number;
}

// ============================================================
// EXECUTOR & CONTROL
// ============================================================

export interface ExecutorConfig {
  mode: "dry-run" | "live";
  epochIntervalSeconds: number;
  maxBudgetPerEpochSol: number;
  minIntervalSeconds: number;
  maxConsecutiveFailures: number;
  minBalanceToOperateSol: number;
  driftToleranceBps: number;
}

export interface ExecutorState {
  lastExecutionTime: number;
  consecutiveFailures: number;
  epochNumber: number;
  circuitBreakerActive: boolean;
}

// ============================================================
// REPORTING
// ============================================================

export interface EpochReport {
  epochNumber: number;
  timestamp: number;
  feesDetected: number;
  allocations: {
    buyback: number;
    lp: number;
    burn: number;
    cooling: number;
  };
  iceHealth: IceHealthState;
  actions: AllocationAction[];
  txSignatures: string[];
  errors: string[];
}

// ============================================================
// CONFIG
// ============================================================

export interface ProtocolConfig {
  // Network
  solanaNetwork: "devnet" | "testnet" | "mainnet-beta";
  solanaRpcUrl: string;
  solanaWsUrl: string;

  // Token
  iceTokenMint: PublicKey;
  iceCreatorFeeWallet: PublicKey;

  // Bot keys
  botKeypair: any; // Keypair object

  // Fee source
  feeSource: "wallet-watcher" | "api" | "mock";
  feePollIntervalMs: number;
  feeConfirmationDepth: number;

  // Executor
  executor: ExecutorConfig;

  // DEX
  dexEngine: "mock" | "raydium" | "orca";
  maxSlippageBps: number;
  maxPriceImpactBps: number;

  // Ice Health
  iceHealthThreshold: number; // e.g., 50
  iceHealthCheckIntervalMinutes: number;
  iceHealthWeights: {
    buybackFrequency: number;
    buybackCoverage: number;
    liquidityDepth: number;
    volatilityPenalty: number;
    timeDecay: number;
  };

  // Allocations
  allocationMode: "adaptive" | "fixed";
  allocationConfig: AllocationConfig;

  // Logging
  logLevel: "debug" | "info" | "warn" | "error";
  reportsDir: string;

  // Simulation
  simulateMode: boolean;
}

// ============================================================
// LOGGER
// ============================================================

export interface Logger {
  debug(msg: string, meta?: Record<string, any>): void;
  info(msg: string, meta?: Record<string, any>): void;
  warn(msg: string, meta?: Record<string, any>): void;
  error(msg: string, meta?: Record<string, any>): void;
}
