# GameOver v4

GameOver v4 is a Sepolia-only Proof-of-Encounter experiment. A contributor proposes one directional contribution, the pre-addressed receiver confirms the same private commitment before 00:00 UTC, and the contributor earns that day’s `+1`. The receiver remains neutral.

Both the browser and contract enforce Sepolia chain ID `11155111`; an attempted v4 deployment on another chain reverts.

> **Status:** the v4 code is complete and tested locally, but `config.js` intentionally contains a zero contract address. A new v4 contract must be deployed on Sepolia before the on-chain controls become live. The old v3 address is incompatible with v4.

Headline: **One Encounter. Confirmed by Both.**

Tagline: **All in a day’s work.**

## Locked v4 rules

- Roles are **Contributor** and **Receiver**.
- An encounter is one-way: `A → B`. The contributor proposes and the named receiver confirms. A reverse `B → A` contribution needs a separate encounter.
- Confirmation gives the contributor `+1`; receiving creates no point, debt or negative value.
- A monetary payment does not itself count as a contribution.
- Only one credited `A → B` encounter is permitted per UTC epoch. v4 proves wallets, not unique humans.
- An unconfirmed invitation expires at Protocol Sunrise (`00:00 UTC`). It is rejected after sunrise and never rolls into the next epoch.
- Daily points do not carry over. Confirmed receipts, lifetime counts and Commons Debt remain.
- Location is entirely absent from v4. It is future-version memory only.
- AI agents are deferred.
- No payout estimate is shown. The interface shows only finalized status and ETH that is actually claimable.
- Errors and warnings use orange. Red identifies the receiver role; mint identifies the contributor, positive confirmation and claimable value.

The complete decision record is in [V4_SPEC.md](V4_SPEC.md).

## Working, simulated and deferred

| Classification | v4 scope |
| --- | --- |
| Implemented for Sepolia | MetaMask connection; pre-addressed private links and QR codes; matching two-wallet confirmation; UTC expiry; daily `+1`; cancel/decline; history; permanent Genesis deposits; separate test payout funding; epoch budgets; finalization; allocations; full pull claims |
| Explicitly simulated | ETH/USD closing price and appreciation input; future income represented by manually seeded Sepolia test ETH; AI structuring represented by user-entered text |
| Deferred | Mainnet and real-value rewards; location/H3; AI agents and forwarding; personhood or biometrics; stronger Sybil resistance; permanent encrypted storage; governance; PWA/offline; mass allocation |
| Omitted | Payout estimates; bilateral credit in one encounter; disputes |

## Economic test mechanism

The deployer becomes `demoOperator`. That role may only set test epoch budgets and simulated ETH/USD closes; it has no withdrawal function and cannot remove Genesis principal or claimant allocations.

The initial simulated ETH/USD high-water mark is `$3,000.00` with 8 decimal places. For a closed epoch:

1. The demo operator must have earmarked an `epochBudget` from the funded test payout pool before the epoch closes.
2. The demo operator enters a non-zero simulated close after the epoch ends.
3. Anyone may call `finalizeEpoch(epoch)` after Protocol Sunrise, but closed epochs must be finalized chronologically. This prevents a later market high from changing an earlier epoch’s outcome.
4. If the close is strictly above the prior high-water mark, the close becomes the new benchmark. If the epoch also has eligible contributors and a non-zero budget, the whole budget is released for claims.
5. Otherwise, nothing is allocated and the reserved budget returns to the available test pool. Daily contribution points expire rather than carry over.

For contributor `i`, with `cᵢ` unique credited counterparts in the epoch:

```text
scaledWeightᵢ = floor(1,000,000,000 × sqrt(cᵢ))
claimᵢ = floor(epochPool × scaledWeightᵢ / totalScaledWeight)
```

Claims round down to wei. Once every eligible contributor has claimed, residual rounding dust returns to the unallocated test payout pool. It is not protocol income.

## Reserve accounting

There are two named payable routes:

- `contributeToGenesis()` permanently increases `permanentPrincipal`. It earns no point, has no withdrawal route and cannot fund claims.
- `seedPayoutPool()` adds spendable Sepolia test ETH. It earns no point and does not increase Genesis principal.

The contract continuously preserves the stronger accounting invariant:

```text
contract balance >= permanentPrincipal + totalReservedBudgets + totalAllocatedUnclaimed
```

Only the remaining surplus is returned by `availablePool()` and may be reserved for new test budgets.

## Private bearer invites

The browser creates a random encounter ID and salt, then binds the statement to the chain, v4 contract, encounter ID and both wallet addresses with SHA-256. Only the resulting `bytes32` commitment is sent to Ethereum.

After the proposal is mined, the browser encrypts the exact description and salt with AES-256-GCM. The ciphertext and its one-time content key travel in the URL fragment after `#invite=`. The same complete URL is encoded in the QR.

This is the accepted v4 cross-device compromise:

- URL fragments are normally not sent to the web host.
- The app gates decryption to the named receiver wallet and verifies the decrypted content against Sepolia.
- Anyone who obtains the complete bearer link can nevertheless extract its key and potentially read the description.
- Clearing browser storage may remove the readable local history. The on-chain commitment and receipt remain.
- There is no server-side or permanent encrypted statement store in v4.

Send private invites only through a channel suitable for their content. Do not put secrets, private keys, recovery phrases or highly sensitive personal information in a description.

## Browser and wallet support

v4 targets current desktop and Android Chrome with MetaMask. QR generation is local and works without a camera. QR scanning uses Chrome’s `BarcodeDetector` and camera permission; when unavailable, paste the complete invite link instead.

Use distinct Sepolia accounts for the contributor and receiver. One person may control both during a demo, but that proves only two wallet signatures, not two humans.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Responsive encounter, Commons, history, build-status and about views |
| `styles.css` | Dark GameOver visual system and red/mint/orange role semantics |
| `app.js` | MetaMask, raw ABI calls, encounter lifecycle, QR scanning, Commons and claims |
| `core.js` | ABI, SHA-256, AES-GCM, invite and integer-formatting utilities |
| `config.js` | Sepolia-only runtime configuration and legacy v3 reference |
| `GameOverEncounter.sol` | Immutable v4 encounter and test-economy contract |
| `vendor/qrcode.js` | Vendored MIT QR generator used for local invite QR creation |
| `tests/` | Core, static and Ganache contract behavior tests |
| `V4_SPEC.md` | Final design/mechanics decisions and invariants |
| `AI_USAGE.md` | Detailed authorship and AI-assistance disclosure |
| `THIRD_PARTY_NOTICES.md` | Vendored dependency notice |

## Run locally

Static browser use needs no build step:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. The page will remain safely unconfigured until the v4 address is added.

For reproducible tests and compilation:

```bash
npm install
npm test
npm run compile
```

`npm test` covers invite encryption/tamper rejection, maximum-size QR generation, language and scope checks, contract compilation, directional pair caps, wrong-wallet rejection, cancellation, decline, midnight expiry, reserve separation, the accounting invariant, high-water settlement, square-root allocation, full claims and rounding dust.

## Deploy v4 to Sepolia

The deployment is intentionally left for the project owner’s MetaMask confirmation.

1. Type and verify the current stable Remix URL, `https://app.remix.live/`, then create `GameOverEncounter.sol` using the file in this package. Do not use a lookalike domain.
2. In **Solidity Compiler**, choose compiler `0.8.24`, enable optimization and set runs to `200`.
3. Compile `GameOverEncounter.sol` and resolve any error before proceeding.
4. In **Deploy & Run Transactions**, choose the injected browser wallet/MetaMask environment.
5. Verify in both Remix and MetaMask that the chain is **Sepolia (11155111)**.
6. The constructor has no arguments. Recommended: leave deployment **Value** at `0`; make any permanent Genesis deposit later through the named app control so its purpose is explicit. A constructor value is also treated as permanent principal.
7. Deploy and approve the transaction in MetaMask.
8. Record the new contract address, deployment transaction hash and deployment block from Sepolia Etherscan.
9. Do **not** reuse the v3 address `0xfECe…F9B1`; its ABI and negative-score mechanism are incompatible.
10. Update only these fields in `config.js`:

```javascript
contractAddress: "0xYOUR_NEW_V4_CONTRACT_ADDRESS",
deploymentBlock: "YOUR_V4_DEPLOYMENT_BLOCK",
```

11. Reload the page. The orange configuration warning must disappear and the header must report a live v4 contract connection.
12. Before funding anything, confirm that the app reads `0 ETH` Genesis principal, `0 ETH` available pool, `$3,000.00` high-water mark and a holding accounting invariant.
13. Verify the source on Sepolia Etherscan with Solidity `0.8.24`, optimizer enabled and `200` runs. There are no constructor arguments.

The deployed bytecode is below the EVM contract-size limit. The contract is immutable and unaudited; a defect requires a new deployment. Use test ETH only.

## First end-to-end rehearsal

### Encounter

1. Contributor connects Account A on Sepolia, enters Account B, describes the contribution and creates the invite.
2. Contributor shows the QR or copies the private invite link. The separate **Copy receiver address** action is available for verification.
3. Receiver opens/scans it in the second browser and connects exactly Account B.
4. The app decrypts locally, recomputes the commitment and checks contributor, receiver, digest, epoch and status against Sepolia.
5. Receiver confirms with the neutral white button. Account A now reads one more `+1`; Account B remains neutral.
6. Repeat A→B in the same UTC epoch to demonstrate the enforced pair cap. Reverse B→A requires a new encounter.
7. Create another invite and cancel it as A; create another and decline it as its receiver.

### Commons and claims

1. Use **Seed payout pool** to add a small amount of Sepolia test ETH.
2. While connected as the deploying demo operator, reserve a small budget for the current epoch.
3. Complete at least one qualifying encounter in that epoch.
4. After 00:00 UTC, enter a simulated close above the current high-water mark for the closed epoch.
5. Connect any wallet and finalize the next required closed epoch. If days were skipped, enter their simulated closes and settle them in order.
6. Reconnect the contributor. Only the finalized claimable amount appears—never an estimate.
7. Claim the full epoch allocation and inspect the Etherscan transaction.

For a no-release path, repeat with a close at or below the high-water mark. The budget returns to the available pool and the day’s points do not carry forward.

## Publish on GitHub Pages

The production page remains static. Commit the runtime files and `vendor/` directory to the branch/folder selected under **Settings → Pages**. Do not publish `node_modules/` or `build/`. No API key, backend or build command is required.

Because a private invite contains an origin-specific page URL, publish/configure the final URL before recording a submission video or distributing QR codes.

## Security boundary

This is experimental, unaudited Sepolia software. It demonstrates wallet control, mutual agreement with a commitment and deterministic accounting. It does not establish unique human identity, objective truth, contribution quality, physical presence or resistance to coordinated wallets. The demo operator can manipulate the simulated budget and close inputs. Mainnet rewards remain deliberately disabled until those boundaries are materially stronger.

## Author and assistance disclosure

GameOver was conceived and directed by Rudolf Hellmut Hartwig as a solo ETHOnline 2026 project. ChatGPT and Codex assisted with protocol scoping, Solidity and frontend implementation, testing and documentation. The file-by-file disclosure is in [AI_USAGE.md](AI_USAGE.md).
