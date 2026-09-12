"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { compileContract } = require("./compile-helper");

const result = compileContract();
const outputDirectory = path.resolve(__dirname, "..", "build");
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "GameOverEncounter.abi.json"), `${JSON.stringify(result.abi, null, 2)}\n`);
fs.writeFileSync(path.join(outputDirectory, "GameOverEncounter.bin"), `${result.bytecode.slice(2)}\n`);
console.log(`Compiled GameOverEncounter.sol with solc 0.8.24 (${(result.deployedBytecode.length - 2) / 2} deployed bytes).`);
