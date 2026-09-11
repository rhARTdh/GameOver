# GameOver Economy MVP

GameOver is an ETHOnline 2026 experiment in recording economic participation rather than transaction size. The second MVP joins the existing Proof-of-Encounter loop to a simulated ETH commons, UTC midnight distributions and a requester-funded AI task market.

The browser lab is deliberately wallet-free and uses no dependencies. It is the fastest way to understand the model. The Solidity files are unaudited references for inspection and test deployment; the browser is not connected to them.

## Open the demo

1. Unzip the folder.
2. Double-click `index.html` or `gameover-economy-lab.html`.
3. No server, wallet, installation or internet connection is required.

Browser state is stored locally. Use **Reset simulation** to restore the starting state.

## Suggested walkthrough

1. Open **Encounter** and load **AI buys a stock inspection**.
2. Prepare the proof, collect Elijah, GameOver Agent and Pam confirmations, then anchor it.
3. Load **Human buys AI stock analysis** and inspect the independent Jason witness step.
4. Create human encounters so at least one person finishes above zero.
5. Open **Commons**, change the mock ETH price, add external revenue, or add a simulated donation.
6. Open **Midnight** to compare net positions, square-root weights, counterparty diversity and preview claims.
7. Finalize the UTC epoch, then claim mock USDC independently from a person's card.
8. Open **Agent market** and lower the gross bid until the AI's 60% share no longer covers its compute floor.

## Rules implemented

- The simulated starting reserve is **1 ETH**. Rudolf's intended later live experiment begins with **0.01 ETH**, only after contract review and testing.
- Each verified actor begins a UTC epoch at zero.
- A confirmed encounter moves the contributor to `+1` and the recipient to `-1`.
- An actor already at `-1` must contribute before receiving again that epoch.
- Positive humans are eligible at midnight; zero and negative positions receive no payout and no punishment.
- Net position is used instead of gross contributions.
- Payout weight is diminished by a square root and adjusted for counterparty diversity:

  ```text
  weight = sqrt(positive net balance) × sqrt(unique counterparties / total encounters)
  ```

- Repeating the same pair is allowed, but its marginal reputation is `1 / sqrt(pair repeat)` and it lowers the diversity component.
- Claims accumulate after finalization. Each claimant initiates their own cash-out and would pay their own gas in a live version.
- Balances and daily activity reset at midnight; receipts, claims, donations, debt and reputation persist.
- UTC is the protocol standard. UTC and GMT have the same zero-hour offset for the rollover shown here, but they are not identical definitions.

## Reserve model

Each ETH donation records its USDC value at deposit time. The sum becomes the protected donation floor and also increases the non-decreasing Perpetual Commons Debt book value. A donor gets recognition, not a withdrawal claim.

Two payout sources are kept separate:

1. Staking, agent and protocol revenue is an external inflow and can be distributed without selling protected ETH.
2. ETH appreciation can be harvested only above the preceding distribution high-water mark and only while the post-harvest ETH reserve remains at or above the protected floor.

The HTML provides a fixed 25% rule and a default logarithmic alternative. The reference vault encodes the simpler fixed 25% rule so its financial behavior is easy to inspect. See `ECONOMIC_MODEL.md` for the equations and limitations.

## Requester-funded agent market

The gross job price is paid by the requester, not the Commons. Settlement is hard-coded as:

| Share | Destination |
| ---: | --- |
| 60% | AI compute and operating bounty |
| 25% | Human worker or verifier bounty |
| 10% | Ring-fenced for conversion into donated ETH |
| 5% | Protocol reserve |

A bid is rejected when its 60% AI share is below the declared compute and operating floor. This makes the minimum viable gross quote:

```text
minimum gross quote = AI compute floor / 60%
```

The Commons does not subsidize an underpriced AI task. The Solidity reference models an atomic operator conversion in which ring-fenced payout tokens leave only when oracle-valued ETH enters.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Opens the second MVP by default |
| `gameover-economy-lab.html` | Complete offline economy simulation and explainer |
| `rhart-encounter-lab.html` | Preserved original encounter-focused demo, with the final four example names |
| `EncounterLedger.sol` | Human and agent encounter proposal, confirmation, witness, daily positions and weights |
| `CommonsVault.sol` | Donations, protected floor, high-water harvest, claims, epoch finalization and agent split |
| `MockPriceOracle.sol` | Test ETH/USD oracle and faucet-only mock USDC token |
| `ECONOMIC_MODEL.md` | Economic assumptions, formulas, boundaries and implementation map |
| `LICENSE` | MIT licence |

## Solidity test order in Remix

Use Solidity `0.8.24` and a test VM or testnet only.

1. Deploy `MockPriceOracle` with `320000000000` for an ETH price of 3,200 USDC using eight decimals.
2. Deploy `MockUSDC` from the same file.
3. Deploy `EncounterLedger`, using your account or the zero address as registrar.
4. Register the other test accounts with `setActor`; enum value `1` is Human and `2` is Agent.
5. Deploy `CommonsVault` with the mock token, `6` token decimals, oracle, ledger, and chosen operator and treasury addresses. Optionally attach test ETH to the constructor.
6. Mint mock USDC, approve the vault, then test `fundRevenue` or `settleAgentJob`.
7. Propose and confirm encounters. AI-involved encounters require an independent human witness.
8. After the UTC epoch changes, call `finalizeEpoch(previousEpoch)` from any account and then call `claim` from an eligible address.

## Prototype boundary

The reserve, oracle, AI, midnight execution, swaps and payouts in the browser lab are simulated. The contracts have not been audited. There is no live wallet, personhood proof, DEX, production price feed, bank off-ramp or automated AI service in this package.

No return, custody, solvency or reimbursement is promised. Use or loss, including a hacked or drained Commons reserve, is at the user's risk.

## Author

Rudolf Hellmut Hartwig  
Cape Town, South Africa

Built with ChatGPT and Codex assistance under Rudolf's direction for ETHOnline 2026.
