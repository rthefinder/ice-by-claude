import * as fs from "fs";
import * as path from "path";
import { EpochReport, IceHealthState, Logger } from "../../types";

/**
 * Report Generator
 * 
 * Generates comprehensive epoch reports in JSON and text formats
 */
export class ReportGenerator {
  private reportsDir: string;

  constructor(reportsDir: string, private logger: Logger) {
    this.reportsDir = path.resolve(reportsDir);

    // Ensure reports directory exists
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
      this.logger.info("Created reports directory", { path: this.reportsDir });
    }
  }

  /**
   * Generate and save epoch report
   */
  generateReport(report: EpochReport): { jsonFile: string; txtFile: string } {
    const timestamp = new Date(report.timestamp * 1000).toISOString().replace(/[:.]/g, "-");
    const basename = `epoch-${report.epochNumber}-${timestamp}`;

    // JSON report
    const jsonFile = path.join(this.reportsDir, `${basename}.json`);
    fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf-8");

    // Text report
    const txtFile = path.join(this.reportsDir, `${basename}.txt`);
    const textContent = this.formatReportAsText(report);
    fs.writeFileSync(txtFile, textContent, "utf-8");

    this.logger.info("Report generated", {
      jsonFile,
      txtFile,
      epoch: report.epochNumber,
    });

    return { jsonFile, txtFile };
  }

  /**
   * Format report as readable text
   */
  private formatReportAsText(report: EpochReport): string {
    const lines: string[] = [];

    lines.push("=" + "=".repeat(79));
    lines.push("ICE PROTOCOL EPOCH REPORT");
    lines.push("=" + "=".repeat(79));
    lines.push("");

    // Metadata
    lines.push("EPOCH METADATA");
    lines.push("-".repeat(40));
    lines.push(`Epoch Number: ${report.epochNumber}`);
    lines.push(`Timestamp: ${new Date(report.timestamp * 1000).toISOString()}`);
    lines.push("");

    // Fee Summary
    lines.push("FEE SUMMARY");
    lines.push("-".repeat(40));
    lines.push(`Total Fees Detected (SOL): ${report.feesDetected.toFixed(4)}`);
    lines.push("");

    // Allocations
    lines.push("ALLOCATIONS");
    lines.push("-".repeat(40));
    lines.push(`Buyback (SOL):  ${report.allocations.buyback.toFixed(4)}`);
    lines.push(`LP Add (SOL):   ${report.allocations.lp.toFixed(4)}`);
    lines.push(`Burn (SOL):     ${report.allocations.burn.toFixed(4)}`);
    lines.push(`Cooling (SOL):  ${report.allocations.cooling.toFixed(4)}`);
    lines.push("");

    // Ice Health
    lines.push("ICE CUBE HEALTH");
    lines.push("-".repeat(40));
    lines.push(`Health Score: ${report.iceHealth.health.toFixed(2)}/100`);
    lines.push(`Status: ${report.iceHealth.status}`);
    lines.push(`Last Action: ${new Date(report.iceHealth.lastActionTime * 1000).toISOString()}`);
    lines.push("");
    lines.push("Health Metrics:");
    lines.push(
      `  Buyback Frequency:   ${report.iceHealth.metrics.buybackFrequency.toFixed(2)}`
    );
    lines.push(
      `  Buyback Coverage:    ${report.iceHealth.metrics.buybackCoverage.toFixed(2)}`
    );
    lines.push(
      `  Liquidity Depth:     ${report.iceHealth.metrics.liquidityDepth.toFixed(2)}`
    );
    lines.push(
      `  Volatility Penalty:  ${report.iceHealth.metrics.volatilityPenalty.toFixed(2)}`
    );
    lines.push(
      `  Time Decay:          ${report.iceHealth.metrics.timeDecay.toFixed(2)}`
    );
    lines.push("");

    // Actions
    lines.push("ACTIONS EXECUTED");
    lines.push("-".repeat(40));
    if (report.actions.length === 0) {
      lines.push("No actions executed this epoch.");
    } else {
      report.actions.forEach((action, idx) => {
        lines.push(`Action ${idx + 1}:`);
        lines.push(`  Type: ${action.type}`);
        lines.push(`  Amount: ${action.amountSol.toFixed(4)} SOL`);
        lines.push(`  Status: ${action.status}`);
        if (action.signature) {
          lines.push(`  Signature: ${action.signature}`);
        }
        if (action.error) {
          lines.push(`  Error: ${action.error}`);
        }
        lines.push("");
      });
    }

    // Transactions
    lines.push("TRANSACTION SIGNATURES");
    lines.push("-".repeat(40));
    if (report.txSignatures.length === 0) {
      lines.push("No transactions.");
    } else {
      report.txSignatures.forEach((sig, idx) => {
        lines.push(`${idx + 1}. ${sig}`);
      });
    }
    lines.push("");

    // Errors
    if (report.errors.length > 0) {
      lines.push("ERRORS");
      lines.push("-".repeat(40));
      report.errors.forEach((error, idx) => {
        lines.push(`${idx + 1}. ${error}`);
      });
      lines.push("");
    }

    lines.push("=" + "=".repeat(79));
    lines.push("END OF REPORT");
    lines.push("=" + "=".repeat(79));

    return lines.join("\n");
  }

  /**
   * Load recent reports
   */
  loadRecentReports(limit: number = 10): EpochReport[] {
    try {
      const files = fs
        .readdirSync(this.reportsDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse()
        .slice(0, limit);

      return files
        .map((file) => {
          try {
            const content = fs.readFileSync(path.join(this.reportsDir, file), "utf-8");
            return JSON.parse(content) as EpochReport;
          } catch (error) {
            this.logger.warn("Error loading report", { file, error });
            return null;
          }
        })
        .filter((r) => r !== null) as EpochReport[];
    } catch (error) {
      this.logger.error("Error loading reports", { error });
      return [];
    }
  }

  /**
   * Generate summary of all reports
   */
  generateSummary(): { totalEpochs: number; totalFees: number; totalActions: number } {
    const reports = this.loadRecentReports(1000);

    let totalFees = 0;
    let totalActions = 0;

    reports.forEach((report) => {
      totalFees += report.feesDetected;
      totalActions += report.actions.length;
    });

    return {
      totalEpochs: reports.length,
      totalFees,
      totalActions,
    };
  }

  /**
   * Export all reports to CSV
   */
  exportToCSV(): string {
    const reports = this.loadRecentReports(1000);
    const rows: string[] = [];

    // Header
    rows.push(
      "EpochNumber,Timestamp,FeesDetected,Buyback,LP,Burn,Cooling,Health,Status,Actions"
    );

    // Data rows
    reports.forEach((report) => {
      rows.push(
        [
          report.epochNumber,
          new Date(report.timestamp * 1000).toISOString(),
          report.feesDetected.toFixed(4),
          report.allocations.buyback.toFixed(4),
          report.allocations.lp.toFixed(4),
          report.allocations.burn.toFixed(4),
          report.allocations.cooling.toFixed(4),
          report.iceHealth.health.toFixed(2),
          report.iceHealth.status,
          report.actions.length,
        ].join(",")
      );
    });

    return rows.join("\n");
  }
}

/**
 * Report Publisher
 * 
 * Optional: publishes reports to external services
 */
export class ReportPublisher {
  constructor(private logger: Logger) {}

  /**
   * Publish to Discord webhook (stub)
   */
  async publishToDiscord(report: EpochReport, webhookUrl: string): Promise<void> {
    // TODO: Implement Discord webhook
    this.logger.info("Discord publish not yet implemented");
  }

  /**
   * Publish to Twitter/X (stub)
   */
  async publishToTwitter(report: EpochReport, _apiKey: string): Promise<void> {
    // TODO: Implement Twitter API
    this.logger.info("Twitter publish not yet implemented");
  }

  /**
   * Publish to on-chain program (stub)
   */
  async publishOnChain(report: EpochReport, _programId: string): Promise<void> {
    // TODO: Implement on-chain publishing
    this.logger.info("On-chain publish not yet implemented");
  }
}
