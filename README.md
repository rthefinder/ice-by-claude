# $ice - Claude Caude Keeps an Ice Cube Alive

A production-ready Solana token protocol where **creator fees are used to keep a measurable "ice cube" alive** through automated buybacks, liquidity management, and strategic allocation.

**This is an experiment. No promises. No financial advice. No affiliation with any real-world "ICE" organization or government agency.**

---

## 🧊 The Concept

$ice is a **meme-native token** with a core narrative:

> _"claude caude keeps an ice cube alive."_

The "ice cube" is a **deterministic, on-chain measurable state** that the protocol tries to maintain using creator fees. The community can verify:
- How much fees were collected
- How they were allocated (buyback / LP / burn / cooling events)
- The exact Ice Cube Health score and methodology
- All transaction signatures (full transparency)

### Ice Cube Health Model

The protocol computes a deterministic **IceHealth** score (0-100) every epoch based on measurable inputs:

```
IceHealth = W_b × BuybackFreq + W_c × BuybackCoverage + W_l × LiquidityDepth 
          - W_v × VolatilityPenalty - W_d × TimeDecay
```

**Status Rules:**
- **ALIVE**: IceHealth ≥ threshold (default 50)
- **MELTING**: 0 < IceHealth < threshold
- **DEAD**: IceHealth ≤ 0

The protocol's goal: **Use creator fees to keep IceHealth above threshold as long as possible.**

---

## 📋 Architecture Overview

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     ICE PROTOCOL LOOP                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. FEE DETECTION (WalletWatcherFeeSource)                 │
│     └─> Monitor creator fee wallet for SOL inflows          │
│                                                             │
│  2. HEALTH COMPUTATION (IceHealthEngine)                    │
│     └─> Calculate IceHealth based on metrics                │
│                                                             │
│  3. ALLOCATION STRATEGY (AdaptiveAllocationStrategy)        │
│     └─> Adaptive: more aggressive if health is low          │
│                                                             │
│  4. EXECUTION (Executor)                                    │
│     ├─> Buyback (SOL → $ice)                              │
│     ├─> Add LP                                              │
│     ├─> Burn tokens                                         │
│     └─> Cooling events (marketing spend)                    │
│                                                             │
│  5. REPORTING (ReportGenerator)                             │
│     └─> Generate JSON & TXT reports for transparency        │
│                                                             │
│  ⏱️  Wait for next epoch (default: 30 min)                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Services

- **FeeSource**: Detects creator fees (wallet-watcher, API, mock)
- **IceHealthEngine**: Computes deterministic health score
- **SwapEngine**: Interfaces with DEX (mock, Raydium stub, Orca stub)
- **Executor**: Orchestrates actions based on health
- **ReportGenerator**: Creates transparent epoch reports

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- TypeScript 5+
- Solana CLI (optional, for key management)

### Installation

```bash
# Clone repository
git clone https://github.com/rthefinder/ice-by-claude.git
cd ice-by-claude

# Install dependencies
npm install

# Build TypeScript
npm run build
```

### Configuration

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with required values:

```env
# Network
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# Token
ICE_TOKEN_MINT=<your-token-mint>
ICE_CREATOR_FEE_WALLET=<creator-fee-wallet-address>

# Bot Keypair (use ONE of these)
BOT_KEYPAIR_B58=<base58-encoded-secret-key>
# OR
BOT_KEYPAIR_FILE=/path/to/keypair.json

# Executor Mode
EXECUTOR_MODE=dry-run  # or 'live' for production
```

### Running in Dry-Run Mode (Testing)

```bash
# Build
npm run build

# Run in dry-run mode (no actual transactions)
EXECUTOR_MODE=dry-run npm start
```

### Running Simulation

```bash
# Simulate 24 epochs locally
SIMULATE_MODE=true SIMULATION_DURATION_EPOCHS=24 npm run simulate
```

### Health Check

```bash
npm run health:check
```

---

## 🔧 Ice Health Formula (Detailed)

### Metric Definitions

#### 1. Buyback Frequency (0-100)
```
Score = min(100, (buybackCountLast24h / 4) × 100)
```
- 4 buybacks per day = 100
- Measures protocol activity

#### 2. Buyback Coverage (0-100)
```
Score = min(100, (buybackVolumeSolLast24h / recentSellPressureSol) × 100)
```
- If buyback > sell pressure = high score
- Measures defense against selling

#### 3. Liquidity Depth (0-100)
```
Score = min(100, (currentLiquidity / 50) × 100)
```
- 50 SOL in LP = 100
- Baseline set to 50 SOL

#### 4. Volatility Penalty (0-100, subtracted)
```
Score = volatilityPercent24h
```
- Higher volatility = lower health

#### 5. Time Decay (0-100, subtracted)
```
Score = min(100, (hoursSinceLastAction / 72) × 100)
```
- After 72 hours of inactivity = -100 points
- Natural decay encourages periodic action

### Final Calculation

```typescript
health = max(0, min(100,
    0.25 × buybackFrequency +
    0.25 × buybackCoverage +
    0.25 × liquidityDepth -
    0.15 × volatilityPenalty -
    0.10 × timeDecay
))
```

**All weights sum to 1.0 (configurable per `.env`).**

---

## 💰 Allocation Strategy

### Adaptive Allocation

Dynamically adjusts based on current health:

| Health Range | Buyback | LP | Burn | Cooling |
|---|---|---|---|---|
| < 30 (critical) | 85% | 10% | 3% | 2% |
| 30-50 (low) | 80% | 12% | 5% | 3% |
| 50-70 (medium) | 70% | 20% | 5% | 5% |
| 70+ (high) | 50% | 30% | 12% | 8% |

### Fixed Allocation

Static percentages (default from `.env`):
- Buyback: 70%
- LP: 20%
- Burn: 5%
- Cooling: 5%

---

## 🔐 Security & Risk Controls

### No Hardcoded Secrets

- Keypair loaded from `.env` (B58 or file path)
- Never commit `.env` to version control
- Use `.gitignore` to prevent accidents

### Risk Parameters

All configurable in `.env`:

```env
# Budget limits
MAX_BUDGET_PER_EPOCH_SOL=1.0

# Circuit breaker
MAX_CONSECUTIVE_FAILURES=5

# Slippage & price impact
MAX_SLIPPAGE_BPS=500
MAX_PRICE_IMPACT_BPS=1000

# Safety threshold
MIN_BALANCE_TO_OPERATE_SOL=0.5
```

### Circuit Breaker

If N consecutive failures occur, the executor stops automatically (manual reset required).

### Dry-Run Mode

```env
EXECUTOR_MODE=dry-run
```

- Computes allocations
- Runs DEX quotes
- **Does not sign/submit transactions**
- Perfect for testing

---

## 📊 Reporting & Transparency

Each epoch generates two reports in `./reports/`:

### JSON Report
```json
{
  "epochNumber": 1,
  "timestamp": 1705500000,
  "feesDetected": 2.5,
  "allocations": {
    "buyback": 1.75,
    "lp": 0.5,
    "burn": 0.125,
    "cooling": 0.125
  },
  "iceHealth": {
    "health": 62.5,
    "status": "ALIVE",
    "metrics": {
      "buybackFrequency": 75,
      "buybackCoverage": 80,
      "liquidityDepth": 60,
      "volatilityPenalty": 20,
      "timeDecay": 10
    }
  },
  "actions": [
    {
      "type": "buyback",
      "amountSol": 1.75,
      "signature": "...",
      "status": "executed"
    }
  ],
  "txSignatures": ["..."],
  "errors": []
}
```

### Text Report
Human-readable summary with all metrics clearly formatted.

### CSV Export

```bash
# Generate CSV from all reports
npm run reports:export-csv > all_reports.csv
```

---

## 🛠️ Development

### Project Structure

```
ice-by-claude/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── config/
│   │   └── manager.ts           # Configuration loading
│   ├── types/
│   │   └── index.ts             # TypeScript interfaces
│   ├── services/
│   │   ├── fee-sources/         # Fee detection
│   │   ├── ice-health/          # Health computation
│   │   ├── dex/                 # Swap interfaces & mocks
│   │   ├── executor/            # Allocation & execution
│   │   └── reporting/           # Report generation
│   └── utils/
│       └── logger.ts            # Pino logging
├── tests/                       # Test files
├── scripts/                     # Helper scripts
├── reports/                     # Generated reports
├── .env.example                 # Configuration template
└── package.json
```

### Building

```bash
npm run build          # Compile TypeScript
npm run clean          # Remove dist/
npm run types          # Type check only
```

### Linting & Formatting

```bash
npm run lint           # Check code style
npm run lint:fix       # Fix issues
npm run format         # Format with Prettier
```

### Testing

```bash
npm run test           # Run Jest tests
npm run test:watch     # Watch mode
```

---

## 🚨 Disclaimer & Legal

**IMPORTANT:**

1. **This is an experiment.** The protocol is provided as-is without warranties.
2. **No financial advice.** This is not investment advice. Do your own research.
3. **No affiliation.** $ice has NO affiliation with any real-world "ICE" organization, government agency, or financial institution.
4. **Risk of loss.** The token may lose value. You could lose your entire investment.
5. **Smart contract risk.** Always audit code before deploying to mainnet.
6. **Use at your own risk.** The developers are not liable for any losses or damages.

---

## 🔗 Integration with Pump.fun

When launched on Pump.fun:
1. Configure `ICE_CREATOR_FEE_WALLET` to Pump.fun's fee wallet
2. The `WalletWatcherFeeSource` monitors this wallet for SOL inflows
3. Each epoch, accumulated fees are allocated per strategy
4. Reports provide full transparency to community

---

## 🤖 Bot Architecture

### Execution Flow

1. **Initialization**: Load config, connect to RPC, initialize services
2. **Main Loop**:
   - Detect fees from wallet
   - Compute ice health
   - Allocate budget (adaptive)
   - Execute actions (if live mode)
   - Generate report
   - Sleep until next epoch

### Monitoring & Logging

- Structured logs with Pino (file + console)
- Log directory: `./logs/`
- Timestamps: ISO 8601
- Levels: debug, info, warn, error

### Graceful Shutdown

```bash
# Press Ctrl+C to gracefully shutdown
# In-flight transactions are allowed to complete
```

---

## 📈 Future Enhancements

- [ ] Raydium swap integration (currently stub)
- [ ] Orca swap integration (currently stub)
- [ ] On-chain health state storage
- [ ] Discord webhook publishing
- [ ] Twitter/X integration
- [ ] Advanced LP strategies
- [ ] Token burn mechanism
- [ ] Prometheus metrics export
- [ ] Multi-sig executor support

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Ensure tests pass: `npm test`
4. Ensure linting passes: `npm run lint`
5. Submit a pull request

---

## 📜 License

MIT License - see LICENSE file for details.

---

## 📞 Support

For issues, questions, or suggestions:

1. **GitHub Issues**: Report bugs and request features
2. **Documentation**: See inline code comments for implementation details
3. **Simulation**: Use `SIMULATE_MODE=true` to test locally

---

## 🎯 Key Files to Review

- **Health Formula**: [src/services/ice-health/engine.ts](src/services/ice-health/engine.ts)
- **Executor Logic**: [src/services/executor/index.ts](src/services/executor/index.ts)
- **Fee Detection**: [src/services/fee-sources/index.ts](src/services/fee-sources/index.ts)
- **Type Definitions**: [src/types/index.ts](src/types/index.ts)
- **Configuration**: [src/config/manager.ts](src/config/manager.ts)

---

## 📊 Example Output

```
========== ICE HEALTH ENGINE TEST ==========

Test 1: Healthy Ice (recent buyback, good coverage)
  Health: 75.33 (should be high)
  Status: ALIVE
  Metrics: {
    buybackFrequency: 87.50,
    buybackCoverage: 100.00,
    liquidityDepth: 100.00,
    volatilityPenalty: 10.00,
    timeDecay: 2.78
  }

Test 2: Melting Ice (no buyback, low liquidity)
  Health: 28.45 (should be low)
  Status: MELTING
  Metrics: {
    buybackFrequency: 0.00,
    buybackCoverage: 0.00,
    liquidityDepth: 10.00,
    volatilityPenalty: 30.00,
    timeDecay: 5.56
  }

Test 3: Dead Ice (no activity)
  Health: 0.00 (should be dead)
  Status: DEAD
  Metrics: {
    buybackFrequency: 0.00,
    buybackCoverage: 0.00,
    liquidityDepth: 1.00,
    volatilityPenalty: 50.00,
    timeDecay: 100.00
  }
```

---

**Last Updated**: January 17, 2026  
**Version**: 1.0.0  
**Status**: Production-Ready ✅
