# GameOver v4 — locked design specification

This file records the decisions accepted before implementation. It is the product and protocol checklist for the Sepolia v4 deployment.

## Product boundary

- [x] Sepolia is the only v4 network; both browser and constructor enforce chain ID `11155111`.
- [x] Mainnet deployment and real-value rewards are deferred.
- [x] Current Chrome plus MetaMask is the supported browser/wallet combination.
- [x] Desktop and mobile layouts are required.
- [x] Location, permissions, fields, summaries, maps and on-chain commitments are absent. Location remains future/v5 memory only.
- [x] AI-agent participation is deferred.
- [x] v4 explicitly discloses that wallets are not unique humans.

## Encounter mechanics

- [x] Final roles are **Contributor** and **Receiver**.
- [x] One encounter records one direction, `Contributor → Receiver`.
- [x] The contributor’s proposal transaction is their confirmation.
- [x] Only the pre-addressed receiver can confirm or decline.
- [x] Confirmation credits the contributor `+1`; the receiver remains neutral and never receives a negative value.
- [x] A reverse contribution requires a separate encounter.
- [x] Monetary payment itself is not a credited contribution.
- [x] Only one credited `A → B` pair is allowed per UTC epoch.
- [x] A contributor may cancel an active invite.
- [x] State model: `Draft (local) → Invited → Confirmed / Declined / Cancelled / Expired`.
- [x] An active invite expires at Protocol Sunrise and never rolls over.
- [x] Daily points expire/reset; confirmed receipts, lifetime totals and Commons Debt persist.

## Invite and privacy mechanics

- [x] Invites are pre-addressed, never open/bearer-confirmable.
- [x] Actions include Show QR, Scan QR, Copy invite link and Copy receiver address.
- [x] The QR is an HTTPS deep link containing v4 network, contract and encounter context.
- [x] Exact text stays off-chain.
- [x] A salted SHA-256 commitment binds v4, chain, contract, encounter and both participants.
- [x] AES-256-GCM encryption occurs locally.
- [x] The one-time content key travels in the URL fragment as the accepted v4 cross-device compromise.
- [x] The interface warns that anyone with the complete bearer link may potentially read the private description.
- [x] Permanent cross-device encrypted storage remains deferred.

## Commons and payout mechanics

- [x] Payout asset is Sepolia test ETH only.
- [x] `permanentPrincipal` uses a named permanent Genesis deposit route, earns no point and has no withdrawal path.
- [x] Genesis target is displayed as `0.01 ETH` but deposits may exceed it.
- [x] Spendable test payouts use a separate named seed-pool route.
- [x] Appreciation is a release trigger, not an income source.
- [x] Initial simulated ETH/USD high-water mark is `$3,000.00` at 8-decimal precision.
- [x] Epoch budgets are reserved from available test-pool ETH before settlement.
- [x] The demo operator supplies the explicitly simulated budget and close inputs.
- [x] Anyone may call `finalizeEpoch(epoch)` after the epoch closes.
- [x] Finalization is chronological so a later high-water mark cannot retroactively suppress an earlier eligible epoch.
- [x] A strictly higher close advances the high-water mark.
- [x] A higher close plus non-zero budget and eligible weight releases the full budget.
- [x] Otherwise, no payout is released; the budget becomes available again and points expire.
- [x] Eligibility weight is scaled square root of unique counterpart count with no maximum count.
- [x] A sole qualifier receives the full released pool.
- [x] Payouts round down to wei.
- [x] Residual dust returns to the unallocated payout pool after the last contributor claims.
- [x] Claims are pull-based, complete per epoch and paid only to the contributing wallet; claimant pays gas.
- [x] No payout estimate is displayed.
- [x] Protected accounting invariant is `balance >= permanentPrincipal + totalReservedBudgets + totalAllocatedUnclaimed`.

## Visual and content system

- [x] Black/dark foundation remains.
- [x] GameOver mark is larger at top left.
- [x] Mint `#B3FBED` identifies contributor, positive confirmation and claimable value.
- [x] Red `#E30907` identifies receiver components only; it never implies blame or debt.
- [x] Errors, warnings and simulated-risk cues use orange.
- [x] Receiver confirmation is neutral white rather than red.
- [x] Headline is line-broken: **One Encounter.** / **Confirmed by Both.**
- [x] Primary tagline is **All in a day’s work.**
- [x] No motion gimmicks.
- [x] No large simulation panel in the primary encounter flow.
- [x] Inline `Simulated` labels and a separate Build Status view disclose incomplete systems.

## Honest implementation status

| Status | Features |
| --- | --- |
| Implemented in the v4 code | Wallet connect/network guard, proposals, pre-addressed invites, encrypted links, QR create/scan, confirm/decline/cancel/expire, daily credit, pair cap, receipts/history, Genesis and pool deposits, budgets, settlement, allocations and claims |
| Requires one owner action | Deploy the new contract on Sepolia and enter its address/block in `config.js` |
| Simulated | ETH/USD close/appreciation, epoch budget input, future income, AI structuring |
| Deferred/omitted | Mainnet, location, agents, personhood, permanent statement storage, governance, PWA, payout estimates, disputes and bilateral credit |
