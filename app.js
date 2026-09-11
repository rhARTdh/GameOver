(function runGameOver() {
  "use strict";

  const Core = window.GameOverCore;
  const config = window.GAMEOVER_CONFIG;
  const ethereum = window.ethereum;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const SELECTORS = Object.freeze({
    balanceOf: "70a08231",
    canReceive: "90d370ba",
    confirmEncounter: "3db09858",
    confirmedEncounterCount: "4ce145c5",
    currentEpoch: "76671808",
    encounters: "895db358",
    lifetimeProvided: "dce26a47",
    lifetimeReceived: "5a832c59",
    nextResetAt: "ff58dc62",
    proposeEncounter: "4d9a6558"
  });
  const CONFIRMED_EVENT_TOPIC = "0x42fbaf7f30926567a8d54a6e3490cd2005bc6084c9068f81d75f3f1ce375b0cd";

  const state = {
    account: null,
    chainId: null,
    nextResetAt: null,
    currentEpoch: null,
    reviewPayload: null,
    reviewEncounter: null,
    reviewVerified: false,
    busy: false,
    lastRolloverAttempt: 0
  };

  const $ = id => document.getElementById(id);
  const elements = {
    walletChip: $("wallet-chip"),
    connectButton: $("connect-button"),
    liveDot: $("live-dot"),
    networkLabel: $("network-label"),
    networkDetail: $("network-detail"),
    configurationAlert: $("configuration-alert"),
    accountValue: $("account-value"),
    accountRole: $("account-role"),
    positionMetric: $("position-metric"),
    positionValue: $("position-value"),
    positionDetail: $("position-detail"),
    countdownValue: $("countdown-value"),
    resetDetail: $("reset-detail"),
    lifetimeValue: $("lifetime-value"),
    form: $("encounter-form"),
    beneficiary: $("beneficiary-address"),
    statement: $("statement"),
    statementCount: $("statement-count"),
    proposeButton: $("propose-button"),
    proposalResult: $("proposal-result"),
    shareLink: $("share-link"),
    copyLinkButton: $("copy-link-button"),
    proposalTransactionLink: $("proposal-transaction-link"),
    confirmationEmpty: $("confirmation-empty"),
    confirmationCard: $("confirmation-card"),
    reviewProvider: $("review-provider"),
    reviewBeneficiary: $("review-beneficiary"),
    reviewEpoch: $("review-epoch"),
    reviewStatus: $("review-status"),
    reviewStatement: $("review-statement"),
    reviewDigest: $("review-digest"),
    verificationLine: $("verification-line"),
    confirmButton: $("confirm-button"),
    confirmationTransactionLink: $("confirmation-transaction-link"),
    refreshButton: $("refresh-button"),
    ledger: $("encounter-ledger"),
    toast: $("toast")
  };

  function configuredContract() {
    return Core.isAddress(config.contractAddress) && config.contractAddress.toLowerCase() !== ZERO_ADDRESS;
  }

  function contractAddress() {
    if (!configuredContract()) throw new Error("The contract address has not been added to config.js.");
    return Core.normalizeAddress(config.contractAddress);
  }

  function correctNetwork() {
    return String(state.chainId || "").toLowerCase() === config.chainId.toLowerCase();
  }

  function readyForChain() {
    return Boolean(ethereum && state.account && correctNetwork() && configuredContract());
  }

  function friendlyError(error) {
    if (!error) return "Something went wrong.";
    if (error.code === 4001) return "The MetaMask request was rejected.";
    const message = error.shortMessage || error.reason || error.message || String(error);
    if (/DailyReceiveLimitReached/i.test(message)) {
      return "This beneficiary is already at −1 today and must provide an encounter before receiving again.";
    }
    if (/EncounterExpired/i.test(message)) return "This proposal expired at UTC midnight. Create a new encounter.";
    return message.replace(/^execution reverted:?\s*/i, "");
  }

  let toastTimer;
  function showToast(message, isError) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", Boolean(isError));
    elements.toast.classList.add("show");
    toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 4200);
  }

  function setBusy(busy) {
    state.busy = busy;
    updateControls();
  }

  function updateControls() {
    const ready = readyForChain();
    elements.proposeButton.disabled = state.busy || !ready;
    elements.refreshButton.disabled = state.busy || !ready;
    elements.confirmButton.disabled = state.busy || !ready || !state.reviewVerified;

    if (!ethereum) {
      elements.connectButton.textContent = "MetaMask required";
      elements.connectButton.disabled = true;
    } else if (state.account && correctNetwork()) {
      elements.connectButton.textContent = "Connected";
      elements.connectButton.disabled = true;
    } else if (state.account) {
      elements.connectButton.textContent = "Switch to Sepolia";
      elements.connectButton.disabled = state.busy;
    } else {
      elements.connectButton.textContent = "Connect MetaMask";
      elements.connectButton.disabled = state.busy;
    }
  }

  function renderConnection() {
    elements.configurationAlert.hidden = configuredContract();
    elements.accountValue.textContent = Core.shortAddress(state.account);
    elements.walletChip.textContent = state.account ? Core.shortAddress(state.account) : "Wallet disconnected";
    elements.accountRole.textContent = state.account ? "Ready for either encounter role" : "Connect to begin";
    elements.networkLabel.textContent = correctNetwork() ? "Sepolia" : (state.chainId ? "Wrong network" : "Sepolia");

    elements.liveDot.classList.remove("ready", "error");
    if (!ethereum) {
      elements.networkDetail.textContent = "MetaMask not detected";
      elements.liveDot.classList.add("error");
    } else if (!state.account) {
      elements.networkDetail.textContent = "Waiting for wallet";
    } else if (!correctNetwork()) {
      elements.networkDetail.textContent = "Switch required";
      elements.liveDot.classList.add("error");
    } else if (!configuredContract()) {
      elements.networkDetail.textContent = "Contract not configured";
      elements.liveDot.classList.add("error");
    } else {
      elements.networkDetail.textContent = "Live contract connection";
      elements.liveDot.classList.add("ready");
    }
    updateControls();
  }

  function renderPosition(position) {
    const value = Number(position || 0);
    elements.positionValue.textContent = Core.formatPosition(value);
    elements.positionMetric.classList.remove("position-positive", "position-negative", "position-neutral");
    elements.positionMetric.classList.add(value > 0 ? "position-positive" : value < 0 ? "position-negative" : "position-neutral");
    elements.positionDetail.textContent = value <= -1
      ? "Provide before receiving again"
      : value > 0
        ? "Contribution recorded today"
        : "Resets each UTC day";
  }

  async function connectWallet() {
    if (!ethereum) return;
    try {
      setBusy(true);
      if (!state.account) {
        const accounts = await ethereum.request({ method: "eth_requestAccounts" });
        state.account = accounts[0] ? Core.normalizeAddress(accounts[0]) : null;
      }
      state.chainId = await ethereum.request({ method: "eth_chainId" });
      if (!correctNetwork()) {
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: config.chainId }]
        });
        state.chainId = await ethereum.request({ method: "eth_chainId" });
      }
      renderConnection();
      if (readyForChain()) await refreshAll();
    } catch (error) {
      showToast(friendlyError(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function readCall(data) {
    const result = await ethereum.request({
      method: "eth_call",
      params: [{ to: contractAddress(), data }, "latest"]
    });
    return result;
  }

  function decodeSingleUint(value) {
    const words = Core.splitWords(value);
    if (!words.length) throw new Error("Empty contract response. Check the deployed contract address.");
    return Core.decodeUintWord(words[0]);
  }

  function decodeSingleInt(value) {
    const words = Core.splitWords(value);
    if (!words.length) throw new Error("Empty contract response. Check the deployed contract address.");
    return Core.decodeIntWord(words[0]);
  }

  async function sendTransaction(data) {
    if (!readyForChain()) throw new Error("Connect MetaMask to Sepolia first.");
    const transactionHash = await ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: state.account, to: contractAddress(), data }]
    });
    showToast("Transaction submitted. Waiting for Sepolia…");
    const receipt = await waitForReceipt(transactionHash);
    if (receipt.status && receipt.status !== "0x1") throw new Error("The transaction failed on Sepolia.");
    return { transactionHash, receipt };
  }

  async function waitForReceipt(transactionHash) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const receipt = await ethereum.request({
        method: "eth_getTransactionReceipt",
        params: [transactionHash]
      });
      if (receipt) return receipt;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error("Sepolia is taking longer than expected. Check the transaction on Etherscan.");
  }

  function localStorageKey() {
    const suffix = configuredContract() ? contractAddress() : "unconfigured";
    return `gameover:encounters:v1:${suffix}`;
  }

  function readLocalRecords() {
    try {
      return JSON.parse(localStorage.getItem(localStorageKey()) || "{}");
    } catch (_error) {
      return {};
    }
  }

  function saveLocalRecord(payload, transactionHash) {
    const records = readLocalRecords();
    records[payload.id.toLowerCase()] = {
      statement: payload.statement,
      provider: payload.provider,
      beneficiary: payload.beneficiary,
      digest: payload.digest,
      transactionHash: transactionHash || records[payload.id.toLowerCase()]?.transactionHash || ""
    };
    localStorage.setItem(localStorageKey(), JSON.stringify(records));
  }

  function pageWithoutHash() {
    return window.location.href.split("#")[0];
  }

  async function proposeEncounter(event) {
    event.preventDefault();
    try {
      if (!readyForChain()) throw new Error("Connect MetaMask to Sepolia first.");
      const beneficiary = Core.normalizeAddress(elements.beneficiary.value.trim());
      if (beneficiary === state.account) throw new Error("Provider and beneficiary must use different wallet addresses.");
      const statement = elements.statement.value.trim();
      if (!statement) throw new Error("Describe what was exchanged.");
      if (statement.length > 280) throw new Error("Keep the statement within 280 characters.");

      setBusy(true);
      elements.proposeButton.textContent = "Approve in MetaMask…";
      const encounterId = Core.randomHex(32);
      const salt = Core.randomHex(32);
      const digest = await Core.statementDigest(statement, salt);
      const data = Core.encodeCall(SELECTORS.proposeEncounter, [
        Core.encodeBytes32(encounterId),
        Core.encodeAddress(beneficiary),
        Core.encodeBytes32(digest)
      ]);

      const { transactionHash } = await sendTransaction(data);
      const epoch = await readCall(Core.encodeCall(SELECTORS.currentEpoch, []));
      const payload = {
        version: 1,
        chainId: config.chainId,
        contract: contractAddress(),
        id: encounterId,
        provider: state.account,
        beneficiary,
        statement,
        salt,
        digest,
        epoch: decodeSingleUint(epoch).toString()
      };
      const link = `${pageWithoutHash()}#confirm=${Core.encodePayload(payload)}`;
      saveLocalRecord(payload, transactionHash);
      elements.shareLink.value = link;
      elements.proposalTransactionLink.href = `${config.explorerBaseUrl}/tx/${transactionHash}`;
      elements.proposalResult.hidden = false;
      elements.proposalResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
      showToast("Proposal confirmed on Sepolia. Share the link with the beneficiary.");
      await refreshAll();
    } catch (error) {
      showToast(friendlyError(error), true);
    } finally {
      elements.proposeButton.textContent = "Propose with MetaMask";
      setBusy(false);
    }
  }

  async function copyShareLink() {
    if (!elements.shareLink.value) return;
    try {
      await navigator.clipboard.writeText(elements.shareLink.value);
      showToast("Confirmation link copied.");
    } catch (_error) {
      elements.shareLink.focus();
      elements.shareLink.select();
      showToast("Link selected. Press Ctrl+C to copy it.");
    }
  }

  function statusLabel(status) {
    return status === 1 ? "Proposed" : status === 2 ? "Confirmed" : "Not found";
  }

  async function loadReviewPayload() {
    state.reviewPayload = null;
    state.reviewEncounter = null;
    state.reviewVerified = false;
    elements.confirmationEmpty.hidden = false;
    elements.confirmationCard.hidden = true;
    elements.confirmationTransactionLink.hidden = true;

    const match = window.location.hash.match(/^#confirm=(.+)$/);
    if (!match) {
      updateControls();
      return;
    }

    try {
      const payload = Core.decodePayload(match[1]);
      Core.encodeBytes32(payload.id);
      Core.encodeBytes32(payload.salt);
      Core.encodeBytes32(payload.digest);
      payload.provider = Core.normalizeAddress(payload.provider);
      payload.beneficiary = Core.normalizeAddress(payload.beneficiary);
      if (typeof payload.statement !== "string" || !payload.statement.trim() || payload.statement.length > 280) {
        throw new Error("The encounter statement is missing or invalid.");
      }
      if (String(payload.chainId).toLowerCase() !== config.chainId.toLowerCase()) {
        throw new Error("This confirmation link targets a different network.");
      }
      if (configuredContract() && Core.normalizeAddress(payload.contract) !== contractAddress()) {
        throw new Error("This confirmation link targets a different contract.");
      }
      const calculatedDigest = await Core.statementDigest(payload.statement, payload.salt);
      if (calculatedDigest.toLowerCase() !== payload.digest.toLowerCase()) {
        throw new Error("The statement does not match its commitment.");
      }

      state.reviewPayload = payload;
      elements.confirmationEmpty.hidden = true;
      elements.confirmationCard.hidden = false;
      elements.reviewProvider.textContent = Core.shortAddress(payload.provider);
      elements.reviewProvider.title = payload.provider;
      elements.reviewBeneficiary.textContent = Core.shortAddress(payload.beneficiary);
      elements.reviewBeneficiary.title = payload.beneficiary;
      const epochDate = new Date(Number(payload.epoch) * 86400000).toISOString().slice(0, 10);
      elements.reviewEpoch.textContent = `${epochDate} · ${payload.epoch}`;
      elements.reviewStatement.textContent = payload.statement;
      elements.reviewDigest.textContent = payload.digest;
      elements.reviewStatus.textContent = "Link integrity verified";
      elements.verificationLine.className = "verification-line";
      elements.verificationLine.textContent = readyForChain()
        ? "Checking the proposal against Sepolia…"
        : "Connect the beneficiary wallet to verify this proposal on Sepolia.";
      if (readyForChain()) await verifyReviewOnChain();
    } catch (error) {
      elements.confirmationEmpty.hidden = true;
      elements.confirmationCard.hidden = false;
      elements.reviewStatus.textContent = "Invalid link";
      elements.reviewStatement.textContent = "This confirmation link could not be verified.";
      elements.verificationLine.className = "verification-line bad";
      elements.verificationLine.textContent = friendlyError(error);
    }
    updateControls();
  }

  async function verifyReviewOnChain() {
    state.reviewVerified = false;
    const payload = state.reviewPayload;
    if (!payload || !readyForChain()) {
      updateControls();
      return;
    }
    try {
      const encounterData = await readCall(Core.encodeCall(SELECTORS.encounters, [Core.encodeBytes32(payload.id)]));
      const encounter = Core.decodeEncounter(encounterData);
      state.reviewEncounter = encounter;
      elements.reviewStatus.textContent = statusLabel(encounter.status);

      if (encounter.provider !== payload.provider || encounter.beneficiary !== payload.beneficiary) {
        throw new Error("The wallet participants do not match the on-chain proposal.");
      }
      if (encounter.statementDigest.toLowerCase() !== payload.digest.toLowerCase()) {
        throw new Error("The statement digest does not match the on-chain proposal.");
      }
      saveLocalRecord(payload);

      if (encounter.status === 2) {
        elements.verificationLine.className = "verification-line good";
        elements.verificationLine.textContent = "This encounter has already been confirmed on Sepolia.";
        return;
      }
      if (encounter.status !== 1) throw new Error("No active proposal exists for this encounter ID.");
      if (state.currentEpoch !== null && encounter.epoch !== state.currentEpoch) {
        throw new Error("This proposal expired at UTC midnight. Create a new encounter.");
      }
      if (state.account !== payload.beneficiary) {
        throw new Error(`Switch MetaMask to the beneficiary wallet ${Core.shortAddress(payload.beneficiary)}.`);
      }

      const canReceiveData = await readCall(Core.encodeCall(SELECTORS.canReceive, [Core.encodeAddress(state.account)]));
      if (decodeSingleUint(canReceiveData) === 0n) {
        throw new Error("This wallet is already at −1 today and must provide before receiving again.");
      }

      state.reviewVerified = true;
      elements.verificationLine.className = "verification-line good";
      elements.verificationLine.textContent = "Exact statement and both wallet addresses match the live Sepolia proposal.";
    } catch (error) {
      elements.verificationLine.className = "verification-line bad";
      elements.verificationLine.textContent = friendlyError(error);
    } finally {
      updateControls();
    }
  }

  async function confirmEncounter() {
    if (!state.reviewVerified || !state.reviewPayload) return;
    try {
      setBusy(true);
      elements.confirmButton.textContent = "Approve in MetaMask…";
      const data = Core.encodeCall(SELECTORS.confirmEncounter, [Core.encodeBytes32(state.reviewPayload.id)]);
      const { transactionHash } = await sendTransaction(data);
      saveLocalRecord(state.reviewPayload, transactionHash);
      elements.confirmationTransactionLink.href = `${config.explorerBaseUrl}/tx/${transactionHash}`;
      elements.confirmationTransactionLink.hidden = false;
      elements.reviewStatus.textContent = "Confirmed";
      elements.verificationLine.className = "verification-line good";
      elements.verificationLine.textContent = "Both wallets have now confirmed this encounter on Sepolia.";
      state.reviewVerified = false;
      showToast("Encounter confirmed. Daily positions and lifetime history are updated.");
      await refreshAll();
    } catch (error) {
      showToast(friendlyError(error), true);
    } finally {
      elements.confirmButton.textContent = "Confirm as beneficiary";
      setBusy(false);
    }
  }

  async function refreshAccountStats() {
    const addressWord = Core.encodeAddress(state.account);
    const [positionData, providedData, receivedData, epochData, resetData] = await Promise.all([
      readCall(Core.encodeCall(SELECTORS.balanceOf, [addressWord])),
      readCall(Core.encodeCall(SELECTORS.lifetimeProvided, [addressWord])),
      readCall(Core.encodeCall(SELECTORS.lifetimeReceived, [addressWord])),
      readCall(Core.encodeCall(SELECTORS.currentEpoch, [])),
      readCall(Core.encodeCall(SELECTORS.nextResetAt, []))
    ]);
    renderPosition(Number(decodeSingleInt(positionData)));
    elements.lifetimeValue.textContent = `${decodeSingleUint(providedData)} / ${decodeSingleUint(receivedData)}`;
    state.currentEpoch = decodeSingleUint(epochData);
    state.nextResetAt = Number(decodeSingleUint(resetData));
    const resetDate = new Date(state.nextResetAt * 1000);
    elements.resetDetail.textContent = `${resetDate.toISOString().slice(0, 10)} · 00:00 UTC`;
  }

  async function historyFromBlock() {
    const configured = BigInt(config.deploymentBlock || "0");
    if (configured > 0n) return Core.hexQuantity(configured);
    const latestHex = await ethereum.request({ method: "eth_blockNumber" });
    const latest = BigInt(latestHex);
    return Core.hexQuantity(latest > 50000n ? latest - 50000n : 0n);
  }

  function makeLedgerEntry(log, localRecords) {
    if (!log.topics || log.topics.length < 4) return null;
    const id = log.topics[1].toLowerCase();
    const provider = Core.topicToAddress(log.topics[2]);
    const beneficiary = Core.topicToAddress(log.topics[3]);
    if (provider !== state.account && beneficiary !== state.account) return null;
    const decoded = Core.decodeConfirmedEvent(log.data);
    const provided = provider === state.account;
    const counterpart = provided ? beneficiary : provider;
    const local = localRecords[id];

    const entry = document.createElement("article");
    entry.className = "ledger-entry";

    const role = document.createElement("span");
    role.className = `ledger-role${provided ? "" : " received"}`;
    role.textContent = provided ? "Provided +1" : "Received −1";

    const copy = document.createElement("div");
    copy.className = "ledger-copy";
    const statement = document.createElement("p");
    statement.textContent = local?.statement || "Private statement not stored in this browser.";
    const details = document.createElement("small");
    const epochDate = new Date(Number(decoded.epoch) * 86400000).toISOString().slice(0, 10);
    details.textContent = `With ${Core.shortAddress(counterpart)} · ${epochDate} UTC`;
    copy.append(statement, details);

    const time = document.createElement("div");
    time.className = "ledger-time";
    const date = new Date(Number(decoded.confirmedAt) * 1000);
    const timeLink = document.createElement("a");
    timeLink.href = `${config.explorerBaseUrl}/tx/${log.transactionHash}`;
    timeLink.target = "_blank";
    timeLink.rel = "noopener";
    timeLink.textContent = `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
    time.appendChild(timeLink);

    entry.append(role, copy, time);
    return { entry, confirmedAt: decoded.confirmedAt };
  }

  async function refreshHistory() {
    elements.ledger.innerHTML = "";
    const loading = document.createElement("p");
    loading.className = "ledger-empty";
    loading.textContent = "Reading confirmed encounters from Sepolia…";
    elements.ledger.appendChild(loading);
    try {
      const logs = await ethereum.request({
        method: "eth_getLogs",
        params: [{
          address: contractAddress(),
          fromBlock: await historyFromBlock(),
          toBlock: "latest",
          topics: [CONFIRMED_EVENT_TOPIC]
        }]
      });
      const localRecords = readLocalRecords();
      const entries = logs
        .map(log => makeLedgerEntry(log, localRecords))
        .filter(Boolean)
        .sort((left, right) => Number(right.confirmedAt - left.confirmedAt));
      elements.ledger.innerHTML = "";
      if (!entries.length) {
        const empty = document.createElement("p");
        empty.className = "ledger-empty";
        empty.textContent = "No confirmed encounters for this wallet yet.";
        elements.ledger.appendChild(empty);
        return;
      }
      entries.slice(0, 50).forEach(item => elements.ledger.appendChild(item.entry));
    } catch (error) {
      elements.ledger.innerHTML = "";
      const failure = document.createElement("p");
      failure.className = "ledger-empty";
      failure.textContent = `History could not be loaded: ${friendlyError(error)}`;
      elements.ledger.appendChild(failure);
    }
  }

  async function refreshAll() {
    if (!readyForChain()) {
      renderConnection();
      return;
    }
    try {
      await refreshAccountStats();
      await Promise.all([verifyReviewOnChain(), refreshHistory()]);
    } catch (error) {
      showToast(friendlyError(error), true);
    }
  }

  function updateCountdown() {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const fallbackReset = (Math.floor(nowSeconds / 86400) + 1) * 86400;
    const resetAt = state.nextResetAt || fallbackReset;
    const remaining = Math.max(0, resetAt - nowSeconds);
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    elements.countdownValue.textContent = [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");

    if (state.nextResetAt && remaining === 0 && readyForChain() && Date.now() - state.lastRolloverAttempt > 5000) {
      state.lastRolloverAttempt = Date.now();
      refreshAll();
    }
  }

  async function initializeConnection() {
    if (!ethereum) {
      renderConnection();
      return;
    }
    try {
      const [accounts, chainId] = await Promise.all([
        ethereum.request({ method: "eth_accounts" }),
        ethereum.request({ method: "eth_chainId" })
      ]);
      state.account = accounts[0] ? Core.normalizeAddress(accounts[0]) : null;
      state.chainId = chainId;
      renderConnection();
      if (readyForChain()) await refreshAll();
    } catch (error) {
      showToast(friendlyError(error), true);
    }
  }

  function bindEvents() {
    elements.connectButton.addEventListener("click", connectWallet);
    elements.form.addEventListener("submit", proposeEncounter);
    elements.statement.addEventListener("input", () => {
      elements.statementCount.textContent = `${elements.statement.value.length} / 280`;
    });
    elements.copyLinkButton.addEventListener("click", copyShareLink);
    elements.confirmButton.addEventListener("click", confirmEncounter);
    elements.refreshButton.addEventListener("click", refreshAll);
    window.addEventListener("hashchange", loadReviewPayload);

    if (ethereum && typeof ethereum.on === "function") {
      ethereum.on("accountsChanged", async accounts => {
        state.account = accounts[0] ? Core.normalizeAddress(accounts[0]) : null;
        renderPosition(0);
        elements.lifetimeValue.textContent = "0 / 0";
        renderConnection();
        await loadReviewPayload();
        if (readyForChain()) await refreshAll();
      });
      ethereum.on("chainChanged", async chainId => {
        state.chainId = chainId;
        state.nextResetAt = null;
        renderConnection();
        await loadReviewPayload();
        if (readyForChain()) await refreshAll();
      });
    }
  }

  async function boot() {
    bindEvents();
    elements.statementCount.textContent = `${elements.statement.value.length} / 280`;
    renderConnection();
    updateCountdown();
    setInterval(updateCountdown, 1000);
    await loadReviewPayload();
    await initializeConnection();
    if (readyForChain() && state.reviewPayload) await verifyReviewOnChain();
  }

  boot();
})();
