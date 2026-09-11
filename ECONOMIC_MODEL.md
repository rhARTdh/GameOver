# GameOver Economic Model

## Purpose

This document fixes the assumptions used in the second GameOver MVP. It is an experiment, not a claim that the model is solvent, stable or ready for real deposits.

GameOver contains three related ledgers:

1. A daily Proof-of-Encounter position that measures participation.
2. A permanent record of confirmed encounters and reputation.
3. A protected ETH commons whose external revenue and guarded appreciation may create independently claimable payouts.

## Daily encounter accounting

Every actor starts each UTC epoch with balance zero.

```text
confirmed contribution: contributor +1, recipient -1
recipient floor: -1
midnight: current balances reset to zero
```

The `-1` position is a temporary free-rider signal. It does not create a fine, interest charge or future exclusion. A person at `-1` may contribute to return to zero and then receive again.

Only a positive human position is payout-eligible. AI agents can participate under separately registered identities, but do not receive a Commons midnight share through encounter weight. Their service revenue belongs to the task-market layer.

### Net and diminishing weight

Gross contributions are not used. A person who receives once and contributes three times finishes at `+2`, not `+3`.

For a positive human:

```text
diversity factor = sqrt(unique counterparties / total confirmed encounters)
payout weight    = sqrt(net positive balance) × diversity factor
```

This has two intended effects:

- The square root gives diminishing rewards for accumulating many plusses.
- Repeating encounters with one counterparty is worth less than engaging the same number of distinct actors.

The browser also displays marginal reputation for a pair's nth encounter as `1 / sqrt(n)`. Repeated encounters remain possible; they simply lose marginal influence.

## Confirmation and AI roles

A human-to-human encounter requires both parties: the contributor proposes and the recipient confirms. An encounter involving the separately identified GameOver Agent also requires a distinct registered human witness.

The two built-in scenarios are:

- The GameOver Agent commissions Elijah to inspect and photograph a petshop's stock; Pam independently confirms the work.
- Rudolf commissions the GameOver Agent to analyse a petshop's stock and recommend an order; Jason independently verifies delivery of the output.

The raw statement, exact location and biometric evidence stay off-chain. A live implementation would record an evidence digest, a location commitment, actor addresses, confirmation status, epoch and event time.

## The ETH commons

The simulation starts with 1 ETH deposited at a 3,200 USDC reference price. A later real experiment is intended to start with 0.01 ETH, not 1 ETH.

For donation `i`:

```text
deposit value i = ETH donated i × ETH/USDC price at deposit i
protected floor = sum of all deposit values
```

The protected floor never falls because of a distribution or claim. Perpetual Commons Debt is the cumulative donation book value and likewise never decreases. Paying a claim reduces payout liquidity, not that debt record.

Donations are irrevocable in the model. Donors gain recognition but no principal, interest, governance or withdrawal right.

### Important solvency limit

The protected floor is an execution constraint, not a guarantee against ETH depreciation.

If ETH falls below its deposit price, an ETH-only vault can have a market value below the protected floor even when it never sold anything. No pricing algorithm fixes this. A hard guarantee of original USDC value would require some combination of stable collateral, over-collateralisation, insurance, hedging or new external revenue.

Similarly, selling ETH appreciation reduces the pool's ETH quantity. The protocol can preserve the original ETH quantity or spend some appreciation; it cannot do both with the same ETH. This is why external staking and agent revenue is economically cleaner than relying only on price gains.

## High-water appreciation

The high-water mark is the highest gross reserve value already processed by a distribution. New donations increase both the protected floor and high-water mark by their deposit value, so deposits are not misclassified as gains.

```text
reserve value = ETH balance × current ETH/USDC price
new gain      = max(0, reserve value - high-water mark)
buffer        = max(0, reserve value - protected floor)
```

The fixed Solidity reference calculates:

```text
fixed harvest = min(buffer, 25% × new gain)
```

The default browser experiment calculates:

```text
log harvest = min(
  buffer,
  25% × protected floor × ln(1 + new gain / protected floor)
)
```

For small gains the logarithmic result is close to 25% of the gain. As the gain becomes large, the effective percentage falls, keeping a growing fraction in the reserve. This formula is exploratory and has not been economically validated.

The high-water mark advances to the gross pre-harvest reserve value only when appreciation is actually harvested. The same rise therefore cannot be distributed repeatedly.

## Distribution pool

Two sources may enter an epoch's pool:

```text
distribution pool = unallocated external revenue + guarded appreciation harvest
```

External staking or agent revenue remains available even when ETH has not reached a new high. If nobody has positive weight, revenue carries forward and no ETH appreciation is sold.

For eligible participant `i`:

```text
claim i = distribution pool × weight i / sum(all eligible weights)
```

Finalization creates pull-based claims. Each person later claims their own payout and, in a live version, pays their own transaction gas. One failed or inactive claimant does not block anyone else.

The browser can advance epochs manually. The Solidity vault allows any address to call `finalizeEpoch` for a completed UTC epoch.

## Agent bidding and revenue split

AI work is requester-funded. The Commons does not cover compute costs.

The gross task fee has a hard-coded split:

```text
60% AI compute and operating bounty
25% human worker or verifier bounty
10% conversion into donated ETH
 5% protocol reserve
```

To prevent the AI accepting a loss-making job:

```text
AI share ≥ declared compute and operating floor
minimum viable gross bid = compute floor / 60%
```

Agents may compete by quoting above their own floor and within the requester's budget. This makes the bounty an ordinary funded price instead of a promise against the Commons.

The reference vault ring-fences the 10% Commons share in the payout token. A designated market operator may exchange it only by supplying at least equal oracle-valued ETH in the same transaction. The received ETH is recorded as a new irrevocable donation, increasing both protected floor and Perpetual Commons Debt.

## Browser and contract boundary

| Capability | Browser lab | Solidity reference |
| --- | --- | --- |
| 1 ETH starting reserve | Simulated by default | Optional payable deployment or donation |
| ETH/USDC price | Editable mock value | Owner-controlled test oracle |
| Logarithmic harvest | Implemented | Not implemented; fixed 25% is used |
| Encounter signatures | Button simulation | Separate wallet transactions |
| AI witness rule | Implemented | Implemented |
| UTC daily state | Manual advance | `block.timestamp / 1 days` |
| Repeated-pair damping | Implemented | Implemented |
| Counterparty diversity | Implemented | Implemented |
| External revenue | Mock input | Payout-token transfer into vault |
| Claim | Local simulated cash-out | Pull-based token transfer |
| Agent bidding | Interactive check | Minimum bid and hard-coded settlement split |
| ETH conversion | Arithmetic simulation | Atomic operator exchange reference |

## Risks left open

- A secure production oracle and response to stale or manipulated prices.
- Proof of personhood, account recovery and coercion-resistant identity.
- Collusion, circular encounters and false real-world evidence.
- Sybil-resistant AI-agent registration and operator accountability.
- Gas cost and unbounded participant iteration during epoch finalization.
- Stablecoin, bank off-ramp, tax, custody and securities-law treatment.
- ETH staking slashing, smart-contract exploits and reserve loss.
- A formally specified meaning for Perpetual Commons Debt beyond this book-value prototype.
- Economic simulations across adoption growth, price crashes and adversarial behavior.

## Prototype disclosure

The reserve, price oracle, AI, midnight execution, swaps and payouts in the browser are simulated. The Solidity contracts are unaudited reference code. No return, custody, solvency or reimbursement is promised. Use or loss, including a hacked or drained Commons reserve, is at the user's risk.
