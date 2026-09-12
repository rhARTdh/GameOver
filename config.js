/* GameOver v4 is Sepolia-only. Add the new v4 deployment after Remix confirms it. */
window.GAMEOVER_CONFIG = Object.freeze({
  chainId: "0xaa36a7",
  chainIdDecimal: 11155111,
  networkName: "Sepolia testnet",
  contractAddress: "0xE3dD8AC72e37Cfc562c35A70B0c4946084EF9A14",
  deploymentBlock: "11691819",
  explorerBaseUrl: "https://sepolia.etherscan.io",
  protocolVersion: 4,
  initialHighWaterMarkUsd: 3000,
  legacyV3: Object.freeze({
    contractAddress: "0xfECeA47A488e2f6e37580781B3BB045A6fbfF9B1",
    deploymentBlock: "11681142"
  })
});
