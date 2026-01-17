import { Connection } from "@solana/web3.js";
import { ProtocolConfig, EpochReport, Logger } from "./types";
import { ConfigManager } from "./config/manager";
import { createLogger } from "./utils/logger";
import { IceHealthEngine, HealthMetricsInput } from "./services/ice-health/engine";
import { Executor } from "./services/executor";
import { ReportGenerator } from "./services/reporting";
import { createSwapEngine, MockSwapEngine } from "./services/dex/engines";
import { FeeTracker } from "./types";

/**
 * Main ICE Protocol Orchestrator
 */
export class IceProtocol {
  private config: ProtocolConfig;
  private logger: Logger;
  private connection: Connection;
  private engine: IceHealthEngine;
  private executor: Executor;
  private reportGenerator: ReportGenerator;
  private feeTracker: FeeTracker;
  private isRunning: boolean = false;

  private constructor(config: ProtocolConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.connection = new Connection(config.solanaRpcUrl, "confirmed");
    this.engine = new IceHealthEngine(config, logger);
    this.reportGenerator = new ReportGenerator(config.reportsDir, logger);

    this.feeTracker = {
      totalFeesCollected: 0,
      lastProcessedSignature: "",
      lastProcessedTimestamp: 0,
      events: [],
    };

    const swapEngine = createSwapEngine(config.dexEngine, logger);

    this.executor = new Executor(
      config,
      logger,
      this.connection,
      swapEngine,
      this.feeTracker
    );
  }

  /**
   * Initialize and create protocol instance
   */
  static async create(): Promise<IceProtocol> {
    const logger = createLogger("info");
    logger.info("Initializing ICE protocol...");

    const configManager = new ConfigManager(logger);
    const config = configManager.load();

    const protocol = new IceProtocol(config, logger);
    logger.info("ICE protocol initialized successfully");

    return protocol;
  }

  /**
   * Start the protocol (main loop)
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn("Protocol already running");
      return;
    }

    this.isRunning = true;
    this.logger.info("Starting ICE protocol main loop");

    let epochNumber = 0;

    try {
      while (this.isRunning) {
        epochNumber++;

        try {
          await this.executeEpoch(epochNumber);
        } catch (error) {
          this.logger.error("Error in epoch execution", {
            error: error instanceof Error ? error.message : String(error),
            epoch: epochNumber,
          });
        }

        // Wait for next epoch
        const sleepMs = this.config.executor.epochIntervalSeconds * 1000;
        this.logger.debug("Sleeping until next epoch", {
          sleepMs,
          nextEpoch: epochNumber + 1,
        });
        await this.sleep(sleepMs);
      }
    } catch (error) {
      this.logger.error("Fatal error in protocol loop", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.isRunning = false;
    }
  }

  /**
   * Stop the protocol
   */
  stop(): void {
    this.logger.info("Stopping ICE protocol");
    this.isRunning = false;
  }

  /**
   * Execute one epoch
   */
  private async executeEpoch(epochNumber: number): Promise<void> {
    this.logger.info("Executing epoch", { epoch: epochNumber });

    // 1. Compute Ice Health
    const iceHealth = this.engine.computeHealth(
      this.getHealthMetricsInput(),
      epochNumber
    );

    // 2. Execute allocation and actions
    const allocation = await this.executor.executeEpoch(iceHealth);

    // 3. Generate report
    const report: EpochReport = {
      epochNumber,
      timestamp: Math.floor(Date.now() / 1000),
      feesDetected: this.feeTracker.totalFeesCollected,
      allocations: allocation
        ? allocation.allocations
        : { buyback: 0, lp: 0, burn: 0, cooling: 0 },
      iceHealth,
      actions: allocation?.actions || [],
      txSignatures: allocation?.actions
        .filter((a) => a.signature)
        .map((a) => a.signature!)
        || [],
      errors: [],
    };

    // Generate and save reports
    this.reportGenerator.generateReport(report);
  }

  /**
   * Simulate multiple epochs (for testing)
   */
  async simulate(numEpochs: number): Promise<void> {
    this.logger.info("Starting simulation", { epochs: numEpochs });

    let epochNumber = 0;

    for (let i = 0; i < numEpochs; i++) {
      epochNumber++;

      try {
        // Simulate fee inflow
        this.feeTracker.totalFeesCollected += Math.random() * 5;

        await this.executeEpoch(epochNumber);

        // Shorter sleep for simulation
        await this.sleep(1000);
      } catch (error) {
        this.logger.error("Error in simulation epoch", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info("Simulation complete", {
      epochsRun: epochNumber,
    });

    // Print summary
    const summary = this.reportGenerator.generateSummary();
    this.logger.info("Simulation summary", summary);
  }

  /**
   * Get current protocol state
   */
  getState() {
    return {
      executor: this.executor.getState(),
      feeTracker: {
        totalCollected: this.feeTracker.totalFeesCollected,
        eventCount: this.feeTracker.events.length,
      },
    };
  }

  /**
   * Get health metrics input (for testing)
   */
  private getHealthMetricsInput(): HealthMetricsInput {
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;

    return {
      buybackCountLast24h: Math.floor(Math.random() * 4),
      buybackVolumeSolLast24h: Math.random() * 10,
      recentSellPressureSol: Math.random() * 5,
      currentLiquidity: Math.random() * 100 + 20,
      volatilityPercent24h: Math.random() * 30,
      lastBuybackTimestampSeconds: oneDayAgo,
      currentTimestampSeconds: now,
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Entry point for main process
 */
async function main() {
  try {
    const protocol = await IceProtocol.create();

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\nShutting down gracefully...");
      protocol.stop();
      process.exit(0);
    });

    // Start the protocol
    if (process.env.SIMULATE_MODE === "true") {
      const epochs = parseInt(process.env.SIMULATION_DURATION_EPOCHS || "24", 10);
      await protocol.simulate(epochs);
    } else {
      await protocol.start();
    }
  } catch (error) {
    console.error("Failed to start protocol", error);
    process.exit(1);
  }
}

// Export for use as library
export { IceProtocol };

// Run main if this is the entry point
if (require.main === module) {
  main().catch(console.error);
}
