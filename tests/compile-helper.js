"use strict";

const fs = require("node:fs");
const path = require("node:path");
const solc = require("solc");

function compileContract() {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "GameOverEncounter.sol"), "utf8");
  const input = {
    language: "Solidity",
    sources: { "GameOverEncounter.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const diagnostics = output.errors || [];
  const errors = diagnostics.filter(item => item.severity === "error");
  if (errors.length) throw new Error(errors.map(item => item.formattedMessage).join("\n"));
  const contract = output.contracts["GameOverEncounter.sol"].GameOverEncounter;
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
    diagnostics
  };
}

module.exports = { compileContract };
