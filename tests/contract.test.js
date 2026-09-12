"use strict";

const assert = require("node:assert/strict");
const ganache = require("ganache");
const { BrowserProvider, ContractFactory, id, parseEther } = require("ethers");
const { compileContract } = require("./compile-helper");

const DAY = 86_400n;
const PRICE_SCALE = 100_000_000n;

function encounterId(label) {
  return id(`gameover-v4-test:${label}`);
}

async function movePastSunrise(rpc) {
  const block = await rpc.request({ method: "eth_getBlockByNumber", params: ["latest", false] });
  const timestamp = BigInt(block.timestamp);
  const nextEpoch = ((timestamp / DAY) + 1n) * DAY + 1n;
  await rpc.request({ method: "evm_increaseTime", params: [Number(nextEpoch - timestamp)] });
  await rpc.request({ method: "evm_mine", params: [] });
}

async function expectRevert(action, label) {
  await assert.rejects(action, undefined, label);
}

async function main() {
  const compiled = compileContract();
  const rpc = ganache.provider({
    chain: { chainId: 11155111 },
    logging: { quiet: true },
    wallet: { totalAccounts: 8, defaultBalance: 100 }
  });
  const provider = new BrowserProvider(rpc);
  const [operator, alice, bob, carol, dave, erin] = await Promise.all(
    Array.from({ length: 6 }, (_, index) => provider.getSigner(index))
  );
  const [operatorAddress, aliceAddress, bobAddress, carolAddress, daveAddress, erinAddress] = await Promise.all(
    [operator, alice, bob, carol, dave, erin].map(signer => signer.getAddress())
  );

  const factory = new ContractFactory(compiled.abi, compiled.bytecode, operator);
  const contract = await factory.deploy({ value: parseEther("0.01") });
  await contract.waitForDeployment();
  assert.equal(await contract.demoOperator(), operatorAddress);
  assert.equal(await contract.permanentPrincipal(), parseEther("0.01"));
  assert.equal(await contract.accountingInvariantHolds(), true);

  await (await contract.connect(erin).contributeToGenesis({ value: parseEther("0.005") })).wait();
  await (await contract.connect(operator).seedPayoutPool({ value: parseEther("1") })).wait();
  assert.equal(await contract.permanentPrincipal(), parseEther("0.015"));
  assert.equal(await contract.availablePool(), parseEther("1"));

  const epoch = await contract.currentEpoch();
  assert.equal(await contract.nextEpochToFinalize(), epoch);
  const budget = parseEther("0.6");
  await (await contract.setEpochBudget(epoch, budget)).wait();
  assert.equal(await contract.totalReservedBudgets(), budget);
  assert.equal(await contract.availablePool(), parseEther("0.4"));
  await expectRevert(
    () => contract.connect(alice).setEpochBudget(epoch, parseEther("0.1")),
    "non-operator budget input must fail"
  );

  const first = encounterId("alice-bob");
  await (await contract.connect(alice).proposeEncounter(first, bobAddress, id("fixed chair"))).wait();
  const proposed = await contract.encounters(first);
  assert.equal(proposed.contributor, aliceAddress);
  assert.equal(proposed.receiver, bobAddress);
  assert.equal(proposed.epoch, epoch);
  assert.equal(proposed.status, 1n);
  await expectRevert(() => contract.connect(carol).confirmEncounter(first), "only named receiver may confirm");
  await (await contract.connect(bob).confirmEncounter(first)).wait();
  assert.equal(await contract.dailyContributions(aliceAddress), 1n);
  assert.equal(await contract.lifetimeContributed(aliceAddress), 1n);
  assert.equal(await contract.lifetimeReceived(bobAddress), 1n);
  assert.equal(await contract.dailyContributions(bobAddress), 0n, "receiving never creates a point");
  assert.equal(await contract.commonsDebt(), 1n);

  await expectRevert(
    () => contract.connect(alice).proposeEncounter(encounterId("duplicate-pair"), bobAddress, id("duplicate")),
    "only one credited A-to-B encounter is allowed per UTC epoch"
  );

  const reverse = encounterId("bob-alice-reverse");
  await (await contract.connect(bob).proposeEncounter(reverse, aliceAddress, id("reverse contribution"))).wait();
  await (await contract.connect(alice).confirmEncounter(reverse)).wait();
  assert.equal(await contract.dailyContributions(bobAddress), 1n, "B-to-A is allowed only as its own encounter");
  assert.equal(await contract.lifetimeReceived(aliceAddress), 1n);

  const second = encounterId("alice-carol");
  await (await contract.connect(alice).proposeEncounter(second, carolAddress, id("helped calculate"))).wait();
  await (await contract.connect(carol).confirmEncounter(second)).wait();
  assert.equal(await contract.dailyContributions(aliceAddress), 2n);
  assert.equal(await contract.dailyWeight(aliceAddress), 1_414_213_562n);

  const third = encounterId("dave-erin");
  await (await contract.connect(dave).proposeEncounter(third, erinAddress, id("delivered supplies"))).wait();
  await (await contract.connect(erin).confirmEncounter(third)).wait();
  assert.equal(await contract.dailyWeight(daveAddress), 1_000_000_000n);
  assert.equal(await contract.epochContributorCount(epoch), 3n);
  assert.equal(await contract.epochTotalWeight(epoch), 3_414_213_562n);

  const cancelled = encounterId("cancelled");
  await (await contract.connect(alice).proposeEncounter(cancelled, erinAddress, id("cancel me"))).wait();
  await (await contract.connect(alice).cancelEncounter(cancelled)).wait();
  assert.equal(await contract.encounterStatus(cancelled), 4n);
  await expectRevert(() => contract.connect(erin).confirmEncounter(cancelled), "cancelled invite cannot confirm");

  const declined = encounterId("declined");
  await (await contract.connect(alice).proposeEncounter(declined, operatorAddress, id("decline me"))).wait();
  await (await contract.connect(operator).declineEncounter(declined)).wait();
  assert.equal(await contract.encounterStatus(declined), 3n);

  const expiring = encounterId("expiring");
  await (await contract.connect(carol).proposeEncounter(expiring, bobAddress, id("too late"))).wait();
  await movePastSunrise(rpc);
  assert.equal(await contract.encounterStatus(expiring), 5n);
  await expectRevert(() => contract.connect(bob).confirmEncounter(expiring), "invite cannot roll into next epoch");
  await expectRevert(() => contract.connect(carol).finalizeEpoch(epoch - 1n), "epochs cannot finalize out of chronological order");

  await (await contract.setMockEpochClosePrice(epoch, 3_100n * PRICE_SCALE)).wait();
  await (await contract.connect(carol).finalizeEpoch(epoch)).wait();
  assert.equal(await contract.nextEpochToFinalize(), epoch + 1n);
  const settlement = await contract.settlements(epoch);
  assert.equal(settlement.finalized, true);
  assert.equal(settlement.released, true);
  assert.equal(settlement.pool, budget);
  assert.equal(await contract.highWaterMark(), 3_100n * PRICE_SCALE);
  assert.equal(await contract.totalReservedBudgets(), 0n);
  assert.equal(await contract.totalAllocatedUnclaimed(), budget);

  const aliceClaim = await contract.claimable(epoch, aliceAddress);
  const bobClaim = await contract.claimable(epoch, bobAddress);
  const daveClaim = await contract.claimable(epoch, daveAddress);
  assert.ok(aliceClaim > daveClaim, "sqrt weighting should reward two counterparts more than one");
  assert.equal(bobClaim, daveClaim, "equal unique-counterpart counts receive equal weight");
  assert.ok(aliceClaim + bobClaim + daveClaim <= budget, "integer allocations must round down");
  await expectRevert(() => contract.connect(carol).claim(epoch), "receiver-only wallet has no contributor allocation");
  await (await contract.connect(alice).claim(epoch)).wait();
  await (await contract.connect(bob).claim(epoch)).wait();
  await (await contract.connect(dave).claim(epoch)).wait();
  const settledAfterClaims = await contract.settlements(epoch);
  assert.equal(settledAfterClaims.remaining, 0n, "final claimant returns rounding dust to available pool");
  assert.equal(await contract.totalAllocatedUnclaimed(), 0n);
  assert.ok(await contract.availablePool() >= parseEther("0.4"));
  assert.equal(await contract.accountingInvariantHolds(), true);

  const flatEpoch = await contract.currentEpoch();
  await (await contract.setEpochBudget(flatEpoch, parseEther("0.1"))).wait();
  const nextPair = encounterId("alice-bob-next-day");
  await (await contract.connect(alice).proposeEncounter(nextPair, bobAddress, id("new UTC day"))).wait();
  await (await contract.connect(bob).confirmEncounter(nextPair)).wait();
  await movePastSunrise(rpc);
  await (await contract.setMockEpochClosePrice(flatEpoch, 3_050n * PRICE_SCALE)).wait();
  await (await contract.connect(erin).finalizeEpoch(flatEpoch)).wait();
  const flatSettlement = await contract.settlements(flatEpoch);
  assert.equal(flatSettlement.released, false, "no appreciation means no payout");
  assert.equal(flatSettlement.pool, 0n);
  assert.equal(await contract.highWaterMark(), 3_100n * PRICE_SCALE);

  const emptyEpoch = await contract.currentEpoch();
  await (await contract.setEpochBudget(emptyEpoch, parseEther("0.1"))).wait();
  await movePastSunrise(rpc);
  await (await contract.setMockEpochClosePrice(emptyEpoch, 3_200n * PRICE_SCALE)).wait();
  await (await contract.connect(bob).finalizeEpoch(emptyEpoch)).wait();
  const emptySettlement = await contract.settlements(emptyEpoch);
  assert.equal(emptySettlement.released, false, "an empty epoch cannot allocate its budget");
  assert.equal(await contract.highWaterMark(), 3_200n * PRICE_SCALE, "a new market high still advances the benchmark");
  assert.equal(await contract.totalReservedBudgets(), 0n);
  assert.equal(await contract.accountingInvariantHolds(), true);

  assert.equal(compiled.abi.some(item => item.type === "function" && item.name === "balanceOf"), false, "there is no negative or transferable score balance");
  assert.ok((compiled.deployedBytecode.length - 2) / 2 < 24_576, "runtime bytecode stays below the EVM limit");

  const wrongChainRpc = ganache.provider({ chain: { chainId: 1 }, logging: { quiet: true }, wallet: { totalAccounts: 1 } });
  try {
    const wrongChainProvider = new BrowserProvider(wrongChainRpc);
    const wrongChainSigner = await wrongChainProvider.getSigner();
    const wrongChainFactory = new ContractFactory(compiled.abi, compiled.bytecode, wrongChainSigner);
    await expectRevert(() => wrongChainFactory.deploy(), "v4 constructor must reject non-Sepolia deployment");
  } finally {
    await wrongChainRpc.disconnect();
  }
  console.log("Contract behavior passed across directional encounters, expiry, reserve accounting, settlement, sqrt allocation, dust and claims.");
  await rpc.disconnect();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
