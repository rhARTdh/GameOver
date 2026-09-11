# GameOver

GameOver is a live two-wallet Proof-of-Encounter experiment for Ethereum Sepolia. One wallet proposes that an exchange occurred, the named beneficiary confirms the same salted statement digest, and the contract records the receipt.

This package deliberately excludes the Economy Lab, agent market, ETH reserve, oracle, payouts, biometric verification, location proof and independent witness. It proves one bounded mechanism first.

## Core rule

- Each wallet begins every UTC day at position `0`.
- A confirmed provider moves `+1`.
- A confirmed beneficiary moves `-1`.
- A wallet already at `-1` must provide before it can receive again that day.
- Pending proposals expire when the UTC day changes.
- Daily positions automatically read as zero after UTC midnight.
- Confirmed receipts and lifetime provided/received totals remain.

There is no reset transaction or reset button. The contract derives the active day from `block.timestamp / 1 days`. The rollover becomes authoritative with the first Sepolia block after 00:00 UTC.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Live two-wallet application |
| `styles.css` | Black, white, red and mint GameOver interface |
| `app.js` | MetaMask connection and on-chain encounter flow |
| `core.js` | Dependency-free hashing, sharing and ABI utilities |
| `config.js` | Sepolia contract address and deployment block |
| `GameOverEncounter.sol` | Ownerless Solidity contract |
| `LICENSE` | MIT licence |

## Wallet preparation

Use two different Sepolia addresses. For a rehearsal, the same person may control both addresses through separate browsers. This demonstrates the two-wallet protocol but not independent human identity.

- The provider/deployer wallet pays contract deployment gas and proposal gas.
- The beneficiary wallet pays confirmation gas.
- Sepolia ETH is valueless test currency.
- Never enter a Secret Recovery Phrase or private key into this app, Remix, GitHub or a faucet.

The contract does not accept ETH. The daily `+1/-1` position is not a token or financial balance.

## Deploy the contract through Remix

1. Ensure the provider MetaMask wallet is selected and its network is **Sepolia**.
2. Open only the current official Remix IDE at `https://app.remix.live/`.
3. In Remix, create `GameOverEncounter.sol` and paste in the supplied contract.
4. Open **Solidity Compiler** and compile with version `0.8.24` and optimization enabled at 200 runs.
5. Open **Deploy & Run Transactions**.
6. Select **Browser Extension** as the environment.
7. Confirm Remix displays the correct provider wallet and Sepolia network.
8. Leave **Value** at `0`. The contract has no constructor arguments.
9. Click **Deploy** and approve the deployment transaction in MetaMask.
10. After confirmation, copy the new contract address.
11. Open the deployment transaction on Sepolia Etherscan and note its block number.

The wallet that deploys the contract receives no owner or administrator power. The contract is ownerless and immutable; a corrected version requires a new deployment.

## Deployed Sepolia instance

This package is preconfigured for the source-verified GameOver contract deployed during the live demo setup:

- Contract: `0xfECeA47A488e2f6e37580781B3BB045A6fbfF9B1`
- Deployment block: `11681142`
- Network: Sepolia (`11155111`)

## Configure the application after a future redeployment

No configuration change is needed for the deployed instance above. If the contract is redeployed later, open `config.js` and replace only these two values:

```javascript
contractAddress: "0xYOUR_NEW_DEPLOYED_CONTRACT_ADDRESS",
deploymentBlock: "YOUR_NEW_DEPLOYMENT_BLOCK_NUMBER",
```

Keep the quotation marks. Do not change the Sepolia chain ID.

## Publish on GitHub Pages

Copy these eight files into the root of the GameOver repository:

```text
index.html
styles.css
app.js
core.js
config.js
GameOverEncounter.sol
README.md
LICENSE
```

`LICENSE` deliberately has no extension. Commit the files to the branch and folder currently selected under **Settings > Pages**. No build command, API key, server or package installation is required.

## Run the two-browser encounter

### Provider browser

1. Open the published GameOver page.
2. Connect the provider MetaMask wallet.
3. MetaMask should show **Sepolia**.
4. Paste the beneficiary address.
5. Describe what was exchanged in 280 characters or fewer.
6. Click **Propose with MetaMask** and approve the transaction.
7. Wait for Sepolia confirmation, then copy the generated confirmation link.

### Beneficiary browser

1. Paste the confirmation link into the second browser.
2. Connect the beneficiary MetaMask wallet.
3. GameOver recalculates the salted digest and checks the participants, digest, status and UTC day against the live contract.
4. Review the statement.
5. Click **Confirm as beneficiary** and approve the transaction.
6. After confirmation, the beneficiary displays `-1`, the provider displays `+1`, and both lifetime histories update.

The provider browser may need **Refresh** to display the confirmation made in the other browser.

## Test the UTC rollover

Complete at least one encounter before 00:00 UTC. Leave both pages open or reopen them after midnight.

The interface counts down to the contract's next UTC boundary and automatically reads the new position. No wallet approval is requested because this is a free read, not a transaction. The daily positions show `0` after the first post-midnight Sepolia block, while the encounter remains in **Confirmed encounters** and lifetime totals remain unchanged.

A proposal created before midnight but not confirmed before midnight expires and must be proposed again.

## Statement privacy

The exact statement and a random salt are placed in the URL fragment after `#confirm=` and stored locally in each participating browser. URL fragments are not sent to the GitHub Pages server. Ethereum stores only the resulting `bytes32` digest.

Anyone who receives the full confirmation link can read its statement. Clearing browser data can remove the readable local copy. The Ethereum receipt will remain, but another browser will show it as a private statement unless it also has the link.

## Security boundary

This is experimental, unaudited hackathon software intended for Sepolia only. Two wallet confirmations prove control of two addresses and agreement with one statement digest. They do not prove that two independent humans met, that the described exchange occurred, or that the statement is objectively true.

## Author and assistance disclosure

GameOver was conceived and directed by Rudolf Hellmut Hartwig as a solo ETHOnline 2026 project. ChatGPT and Codex assisted with protocol scoping, Solidity and frontend implementation, testing and documentation.
