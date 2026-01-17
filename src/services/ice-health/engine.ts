import { IceHealthState, IceHealthMetrics, ProtocolConfig, Logger } from "../types";

/**
 * Ice Cube Health Engine
 * 
 * Deterministic health calculation based on measurable on-chain inputs.
 * 
 * FORMULA:
 * --------
 * IceHealth(t) = W_b * BuybackFreq(t) 
 *              + W_c * BuybackCoverage(t) 
 *              + W_l * LiquidityDepth(t) 
 *              - W_v * VolatilityPenalty(t) 
 *              - W_d * TimeDecay(t)
 * 
 * Where:
 *   - W_b, W_c, W_l, W_v, W_d are configurable weights that sum to 1.0
 *   - Each component is normalized to [0, 100]
 *   - Result is clamped to [0, 100]
 * 
 * Status Rules:
 *   - ALIVE: IceHealth >= threshold
 *   - MELTING: 0 < IceHealth < threshold
 *   - DEAD: IceHealth <= 0
 */

export interface HealthMetricsInput {
  // Buyback metrics
  buybackCountLast24h: number;
  buybackVolumeSolLast24h: number;
  
  // Market metrics
  recentSellPressureSol: number; // Estimated from price action
  currentLiquidity: number; // LP liquidity in SOL equivalent
  volatilityPercent24h: number; // 0-100%
  
  // Time metrics
  lastBuybackTimestampSeconds: number;
  currentTimestampSeconds: number;
}

export class IceHealthEngine {
  constructor(
    private config: ProtocolConfig,
    private logger: Logger
  ) {}

  /**
   * Compute Ice Health for the current epoch
   */
  computeHealth(input: HealthMetricsInput, epochNumber: number): IceHealthState {
    const timestamp = Math.floor(Date.now() / 1000);
    
    const metrics = this.computeMetrics(input);
    const health = this.computeHealthScore(metrics);
    const status = this.computeStatus(health);

    const state: IceHealthState = {
      timestamp,
      health: Math.round(health * 100) / 100, // Round to 2 decimals
      metrics,
      status,
      lastActionTime: input.lastBuybackTimestampSeconds,
      epochNumber,
    };

    this.logger.info("Ice Health computed", {
      health: state.health,
      status: state.status,
      metrics: state.metrics,
      epoch: epochNumber,
    });

    return state;
  }

  /**
   * Compute individual health metrics
   */
  private computeMetrics(input: HealthMetricsInput): IceHealthMetrics {
    const weights = this.config.iceHealthWeights;

    // 1. BUYBACK FREQUENCY METRIC
    // Higher frequency = higher score
    // Score based on number of buybacks in last 24h
    // Assumption: 4+ buybacks per day = optimal (100)
    const buybackFrequencyScore = Math.min(
      100,
      (input.buybackCountLast24h / 4) * 100
    );

    // 2. BUYBACK COVERAGE METRIC
    // Coverage = buyback volume / sell pressure
    // If we're buying back more than we're selling, score is high
    const estimatedBuybackCoverage =
      input.recentSellPressureSol > 0
        ? (input.buybackVolumeSolLast24h / input.recentSellPressureSol) * 100
        : 100;
    const buybackCoverageScore = Math.min(100, estimatedBuybackCoverage);

    // 3. LIQUIDITY DEPTH METRIC
    // Deeper liquidity = higher score
    // Baseline: 50 SOL in liquidity = 100 score
    const liquidityDepthScore = Math.min(100, (input.currentLiquidity / 50) * 100);

    // 4. VOLATILITY PENALTY METRIC
    // Higher volatility = lower score (penalty)
    // Baseline: 50% volatility = -50 points
    // Clamped to [0, 100]
    const volatilityPenaltyScore = Math.min(100, input.volatilityPercent24h);

    // 5. TIME DECAY METRIC
    // Decay based on time since last action
    // After 24 hours: -25 points
    // After 48 hours: -50 points
    // After 72 hours: -100 (dead)
    const secondsSinceLastAction =
      input.currentTimestampSeconds - input.lastBuybackTimestampSeconds;
    const hoursSinceLastAction = secondsSinceLastAction / 3600;
    const timeDecayScore = Math.min(100, Math.max(0, (hoursSinceLastAction / 72) * 100));

    const metrics: IceHealthMetrics = {
      buybackFrequency: Math.round(buybackFrequencyScore * 100) / 100,
      buybackCoverage: Math.round(buybackCoverageScore * 100) / 100,
      liquidityDepth: Math.round(liquidityDepthScore * 100) / 100,
      volatilityPenalty: Math.round(volatilityPenaltyScore * 100) / 100,
      timeDecay: Math.round(timeDecayScore * 100) / 100,
    };

    return metrics;
  }

  /**
   * Compute final health score using weighted sum
   */
  private computeHealthScore(metrics: IceHealthMetrics): number {
    const weights = this.config.iceHealthWeights;

    const score =
      weights.buybackFrequency * metrics.buybackFrequency +
      weights.buybackCoverage * metrics.buybackCoverage +
      weights.liquidityDepth * metrics.liquidityDepth -
      weights.volatilityPenalty * metrics.volatilityPenalty -
      weights.timeDecay * metrics.timeDecay;

    // Clamp to [0, 100]
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine status based on health score
   */
  private computeStatus(
    health: number
  ): "ALIVE" | "MELTING" | "DEAD" {
    const threshold = this.config.iceHealthThreshold;

    if (health >= threshold) {
      return "ALIVE";
    } else if (health > 0) {
      return "MELTING";
    } else {
      return "DEAD";
    }
  }

  /**
   * Helper to determine if the cube is alive
   */
  isAlive(state: IceHealthState): boolean {
    return state.status === "ALIVE";
  }

  /**
   * Get the number of minutes until health drops below threshold
   * Returns null if already below threshold
   * Based on current time decay rate
   */
  estimateTimeToThreshold(state: IceHealthState, currentTimestamp: number): number | null {
    if (state.status === "MELTING" || state.status === "DEAD") {
      return 0;
    }

    // Simplified estimation: assume linear decay at 0.25% per hour
    const decayRatePerHour = 0.25;
    const healthDropNeeded = state.health - this.config.iceHealthThreshold;
    const hoursToThreshold = healthDropNeeded / decayRatePerHour;

    return Math.ceil(hoursToThreshold * 60); // Convert to minutes
  }

  /**
   * Parse a saved health state from JSON
   */
  static fromJSON(json: Record<string, any>): IceHealthState {
    return {
      timestamp: json.timestamp,
      health: json.health,
      metrics: json.metrics,
      status: json.status,
      lastActionTime: json.lastActionTime,
      epochNumber: json.epochNumber,
    };
  }

  /**
   * Convert health state to JSON
   */
  static toJSON(state: IceHealthState): Record<string, any> {
    return {
      timestamp: state.timestamp,
      health: state.health,
      metrics: state.metrics,
      status: state.status,
      lastActionTime: state.lastActionTime,
      epochNumber: state.epochNumber,
    };
  }
}
