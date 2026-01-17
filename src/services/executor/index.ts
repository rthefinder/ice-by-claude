import { PublicKey, Connection } from "@solana/web3.js";
import {
  FeeTracker,
  EpochAllocation,
  AllocationAction,
  AllocationConfig,
  IceHealthState,
  ProtocolConfig,
  Logger,
} from "../../types";
import { SwapEngine } from "../dex/engines";

/**
 * Allocation Strategy
 * 
 * Determines how to split detected fees among:
 * - Buyback (highest priority)
 * - LP adds
 * - Burns
 * - Cooling events (marketing)
 */
export interface AllocationStrategy {
  allocate(
    feeAmount: number,
    iceHealth: IceHealthState,
    config: AllocationConfig
  ): EpochAllocation;
}

/**
 * Fixed Allocation Strategy
 * Uses static percentages from config
 */
export class FixedAllocationStrategy implements AllocationStrategy {
  allocate(
    feeAmount: number,
    _iceHealth: IceHealthState,
    config: AllocationConfig
  ): EpochAllocation {
    const allocations = {
      buyback: (feeAmount * config.buybackPct) / 100,
      lp: (feeAmount * config.lpPct) / 100,
      burn: (feeAmount * config.burnPct) / 100,
      cooling: (feeAmount * config.coolingPct) / 100,
    };

    return {
      totalFeesToAllocate: feeAmount,
      allocations,
      actions: [],
    };
  }
}

/**
 * Adaptive Allocation Strategy
 * 
 * Adjusts allocations based on Ice Health:
 * - Low health: more aggressive buyback (80%+)
 * - Medium health: balanced (70% buyback)
 * - High health: preserve budget (50% buyback)
 */
export class AdaptiveAllocationStrategy implements AllocationStrategy {
  allocate(
    feeAmount: number,
    iceHealth: IceHealthState,
    baseConfig: AllocationConfig
  ): EpochAllocation {
    let buybackPct: number;

    const health = iceHealth.health;

    if (health < 30) {
      // Critical: max buyback
      buybackPct = 85;
    } else if (health < 50) {
      // Low: aggressive buyback
      buybackPct = 80;
    } else if (health < 70) {
      // Medium: balanced (use base config)
      buybackPct = baseConfig.buybackPct;
    } else {
      // High: preserve budget
      buybackPct = 50;
    }

    // Remaining allocation scales proportionally
    const remaining = 100 - buybackPct;
    const lpPct = (baseConfig.lpPct / (100 - baseConfig.buybackPct)) * remaining;
    const burnPct = (baseConfig.burnPct / (100 - baseConfig.buybackPct)) * remaining;
    const coolingPct = (baseConfig.coolingPct / (100 - baseConfig.buybackPct)) * remaining;

    const allocations = {
      buyback: (feeAmount * buybackPct) / 100,
      lp: (feeAmount * lpPct) / 100,
      burn: (feeAmount * burnPct) / 100,
      cooling: (feeAmount * coolingPct) / 100,
    };

    return {
      totalFeesToAllocate: feeAmount,
      allocations,
      actions: [],
    };
  }
}

/**
 * Executor
 * 
 * Main orchestrator that:
 * 1. Detects fees
 * 2. Computes health
 * 3. Allocates budget
 * 4. Executes actions (buyback, LP, burn, etc.)
 */
export class Executor {
  private executorState = {
    lastExecutionTime: 0,
    consecutiveFailures: 0,
    epochNumber: 0,
    circuitBreakerActive: false,
  };

  private allocationStrategy: AllocationStrategy;

  constructor(
    private config: ProtocolConfig,
    private logger: Logger,
    private connection: Connection,
    private swapEngine: SwapEngine,
    private feeTracker: FeeTracker
  ) {
    if (config.allocationMode === "adaptive") {
      this.allocationStrategy = new AdaptiveAllocationStrategy();
    } else {
      this.allocationStrategy = new FixedAllocationStrategy();
    }
  }

  /**
   * Execute one epoch of the protocol
   */
  async executeEpoch(iceHealth: IceHealthState): Promise<EpochAllocation | null> {
    this.executorState.epochNumber++;

    try {
      // Check circuit breaker
      if (this.executorState.circuitBreakerActive) {
        this.logger.warn("Circuit breaker active, skipping epoch");
        return null;
      }

      // Check time since last execution
      const now = Math.floor(Date.now() / 1000);
      if (now - this.executorState.lastExecutionTime < this.config.executor.minIntervalSeconds) {
        this.logger.debug("Skipping epoch due to min interval");
        return null;
      }

      // Check bot balance
      const botBalance = await this.checkBotBalance();
      if (botBalance < this.config.executor.minBalanceToOperateSol) {
        this.logger.error("Bot balance too low", { balance: botBalance });
        this.incrementFailureCount();
        return null;
      }

      // Get accumulated fees
      const feesToProcess = this.feeTracker.totalFeesCollected;

      if (feesToProcess < 0.01) {
        this.logger.debug("Insufficient fees to process", { amount: feesToProcess });
        return null;
      }

      // Allocate fees
      const allocation = this.allocationStrategy.allocate(
        feesToProcess,
        iceHealth,
        this.config.allocationConfig
      );

      // Execute actions
      if (this.config.executor.mode === "live") {
        await this.executeActions(allocation);
      } else {
        this.logger.info("Dry-run mode: skipping actual execution", allocation);
      }

      // Reset state
      this.executorState.lastExecutionTime = now;
      this.executorState.consecutiveFailures = 0;
      this.feeTracker.totalFeesCollected = 0; // Reset for next epoch

      this.logger.info("Epoch executed successfully", {
        epoch: this.executorState.epochNumber,
        feesProcessed: feesToProcess,
        iceHealth: iceHealth.health,
      });

      return allocation;
    } catch (error) {
      this.logger.error("Error executing epoch", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.incrementFailureCount();
      return null;
    }
  }

  /**
   * Execute allocation actions
   */
  private async executeActions(allocation: EpochAllocation): Promise<void> {
    const actions: AllocationAction[] = [];

    // 1. Buyback (primary)
    if (allocation.allocations.buyback > 0) {
      const buybackAction = await this.executeBuyback(allocation.allocations.buyback);
      actions.push(buybackAction);
    }

    // 2. Add LP
    if (allocation.allocations.lp > 0) {
      const lpAction = await this.executeAddLP(allocation.allocations.lp);
      actions.push(lpAction);
    }

    // 3. Burn (if configured)
    if (allocation.allocations.burn > 0) {
      const burnAction = await this.executeBurn(allocation.allocations.burn);
      actions.push(burnAction);
    }

    // 4. Cooling events (marketing)
    if (allocation.allocations.cooling > 0) {
      const coolingAction = await this.executeCooling(allocation.allocations.cooling);
      actions.push(coolingAction);
    }

    allocation.actions = actions;
  }

  /**
   * Buyback action: SOL -> $ice
   */
  private async executeBuyback(solAmount: number): Promise<AllocationAction> {
    const action: AllocationAction = {
      type: "buyback",
      amountSol: solAmount,
      status: "pending",
    };

    try {
      // Dry run first
      const quote = await this.swapEngine.dryRun(
        this.getWrappedSolMint(),
        this.config.iceTokenMint,
        solAmount,
        this.config.maxSlippageBps
      );

      if (quote.priceImpactBps > this.config.maxPriceImpactBps) {
        throw new Error(
          `Price impact too high: ${quote.priceImpactBps}bps > ${this.config.maxPriceImpactBps}bps`
        );
      }

      // Execute swap
      const result = await this.swapEngine.swap(
        this.getWrappedSolMint(),
        this.config.iceTokenMint,
        solAmount,
        this.config.maxSlippageBps
      );

      action.status = "executed";
      action.signature = result.signature;

      this.logger.info("Buyback executed", {
        solAmount,
        iceAmount: result.outputAmount,
        signature: result.signature,
      });
    } catch (error) {
      action.status = "failed";
      action.error = error instanceof Error ? error.message : String(error);
      this.logger.error("Buyback failed", action.error);
    }

    return action;
  }

  /**
   * Add LP action: SOL + $ice -> LP tokens
   */
  private async executeAddLP(solAmount: number): Promise<AllocationAction> {
    const action: AllocationAction = {
      type: "add-lp",
      amountSol: solAmount,
      status: "pending",
    };

    try {
      // TODO: Calculate corresponding $ice amount needed
      // For now, use a simple ratio
      const iceAmount = solAmount * 100; // 1 SOL = 100 $ice (simplified)

      this.logger.warn("Add LP not yet fully implemented, skipping");
      action.status = "failed";
      action.error = "Not yet implemented";
    } catch (error) {
      action.status = "failed";
      action.error = error instanceof Error ? error.message : String(error);
    }

    return action;
  }

  /**
   * Burn action: send $ice to null address
   */
  private async executeBurn(iceAmount: number): Promise<AllocationAction> {
    const action: AllocationAction = {
      type: "burn",
      amountSol: iceAmount,
      status: "pending",
    };

    try {
      this.logger.warn("Burn not yet implemented, skipping");
      action.status = "failed";
      action.error = "Not yet implemented";
    } catch (error) {
      action.status = "failed";
      action.error = error instanceof Error ? error.message : String(error);
    }

    return action;
  }

  /**
   * Cooling events action: record on-chain spend (no guarantees)
   */
  private async executeCooling(solAmount: number): Promise<AllocationAction> {
    const action: AllocationAction = {
      type: "cooling-event",
      amountSol: solAmount,
      status: "pending",
    };

    try {
      this.logger.info("Cooling event: recording on-chain spend", { solAmount });
      // In practice, this might create an on-chain memo or event log
      action.status = "executed";
    } catch (error) {
      action.status = "failed";
      action.error = error instanceof Error ? error.message : String(error);
    }

    return action;
  }

  /**
   * Check bot's current SOL balance
   */
  private async checkBotBalance(): Promise<number> {
    try {
      const balance = await this.connection.getBalance(this.config.botKeypair.publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      this.logger.error("Error checking bot balance", {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Increment failure counter and check circuit breaker
   */
  private incrementFailureCount(): void {
    this.executorState.consecutiveFailures++;

    if (
      this.executorState.consecutiveFailures >=
      this.config.executor.maxConsecutiveFailures
    ) {
      this.executorState.circuitBreakerActive = true;
      this.logger.error("Circuit breaker activated due to consecutive failures", {
        failures: this.executorState.consecutiveFailures,
      });
    }
  }

  /**
   * Helper: get Wrapped SOL mint (WSOL)
   */
  private getWrappedSolMint(): PublicKey {
    // Solana Wrapped SOL mint
    return new PublicKey("So11111111111111111111111111111111111111112");
  }

  /**
   * Reset circuit breaker (manual intervention)
   */
  resetCircuitBreaker(): void {
    this.executorState.circuitBreakerActive = false;
    this.executorState.consecutiveFailures = 0;
    this.logger.info("Circuit breaker reset");
  }

  /**
   * Get executor state for debugging
   */
  getState() {
    return { ...this.executorState };
  }
}
