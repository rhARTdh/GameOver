(function runGameOverV4() {
  "use strict";

  const Core = window.GameOverCore;
  const config = window.GAMEOVER_CONFIG;
  const ethereum = window.ethereum;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const SECONDS_PER_EPOCH = 86_400n;
  const MAX_HISTORY_EPOCHS = 50;

  const SELECTORS = Object.freeze({
    accountingInvariantHolds: "b6ad264f",
    availablePool: "2af674dd",
    cancelEncounter: "ad81f834",
    claim: "aab8ab0c",
    claimable: "88d8b2a7",
    commonsDebt: "f201a152",
    confirmEncounter: "3db09858",
    contributeToGenesis: "3427fe63",
    contributorEpochAt: "c2ce0fe0",
    contributorEpochCount: "3bda6266",
    currentEpoch: "76671808",
    dailyContributions: "d855c510",
    declineEncounter: "2e260ac5",
    demoOperator: "7b3ecd0c",
    encounters: "895db358",
    encounterStatus: "6bd8ac86",
    epochBudget: "62678ff7",
    finalizeEpoch: "4f6ec99b",
    GENESIS_TARGET: "352fbb87",
    highWaterMark: "1e8410da",
    lifetimeContributed: "db3efe8a",
    lifetimeReceived: "5a832c59",
    mockEpochClosePrice: "d6493e22",
    nextEpochToFinalize: "81674f35",
    nextSunriseAt: "7dc8e570",
    payoutClaimed: "05355edb",
    permanentPrincipal: "7c1d1fe0",
    proposeEncounter: "4d9a6558",
    seedPayoutPool: "096ba4fc",
    setEpochBudget: "443408ea",
    setMockEpochClosePrice: "5e162be4",
    settlements: "7ab9b6c6",
    totalAllocatedUnclaimed: "12c21562",
    totalReservedBudgets: "4347e60d"
  });

  const CONFIRMED_EVENT_TOPIC = "0xd6b9701fb8fd40f67f5269b140fb27dec84a3161689ea778335f537c6d08a1ee";
  const STATUS_NAMES = Object.freeze(["None", "Invited", "Confirmed", "Declined", "Cancelled", "Expired"]);
  const ERROR_MESSAGES = Object.freeze({
    "646cf558": "That epoch allocation has already been claimed.",
    "054cefac": "That budget exceeds the currently available test payout pool.",
    "95b66fe9": "Enter an amount greater than zero.",
    "90463a35": "The encounter ID cannot be empty.",
    "72e3a075": "The statement commitment cannot be empty.",
    "ffae465d": "That encounter already exists.",
    "3262e317": "This invite expired at Protocol Sunrise. Create a new encounter.",
    "478d8969": "This encounter is no longer awaiting a response.",
    "9de7c265": "A budget cannot be changed after its epoch has closed.",
    "3366263c": "That epoch has already been finalized.",
    "aafac234": "Epochs must be finalized in chronological order. Use the next required epoch shown in the Commons.",
    "a993769a": "This epoch is still open. Finalize it after Protocol Sunrise.",
    "6d963f88": "The test ETH transfer failed. The allocation remains protected.",
    "4e23d035": "That contribution-history index does not exist.",
    "1e4ec46b": "Enter a valid receiver wallet.",
    "70614846": "Set a simulated closing price before finalizing this epoch.",
    "49248f77": "The payout arithmetic exceeded its supported range.",
    "969bf728": "This wallet has no allocation to claim for that epoch.",
    "5dd9d427": "Only the contributor can cancel this invite.",
    "5fae125f": "Only the v4 demo operator can set simulated budgets or prices.",
    "0d1ca202": "Connect the receiver wallet named in this invite.",
    "c80c9592": "This contributor has already received credit for this A→B pair today.",
    "290aba20": "A claim is already in progress.",
    "4df58749": "Contributor and receiver must be different wallets.",
    "915b886d": "That epoch did not release a payout.",
    "a82a4bcf": "Choose either the Genesis deposit or test payout-pool route."
  });

  const state = {
    account: null,
    chainId: null,
    contractVerified: false,
    currentEpoch: null,
    nextSunriseAt: null,
    nextEpochToFinalize: null,
    demoOperator: null,
    lastInvite: null,
    reviewToken: null,
    reviewHeader: null,
    reviewPrivate: null,
    reviewEncounter: null,
    reviewVerified: false,
    activeRoute: "encounter",
    busy: false,
    scannerStream: null,
    scannerTimer: null,
    scannerDetecting: false,
    lastSunriseRefresh: 0
  };

  const $ = id => document.getElementById(id);
  const elements = {
    connectButton: $("connect-button"),
    liveDot: $("live-dot"),
    networkLabel: $("network-label"),
    networkDetail: $("network-detail"),
    configurationAlert: $("configuration-alert"),
    accountValue: $("account-value"),
    accountRole: $("account-role"),
    dailyValue: $("daily-value"),
    countdownValue: $("countdown-value"),
    sunriseDetail: $("sunrise-detail"),
    claimableValue: $("claimable-value"),
    claimableDetail: $("claimable-detail"),
    encounterForm: $("encounter-form"),
    receiverAddress: $("receiver-address"),
    pasteAddressButton: $("paste-address-button"),
    statement: $("statement"),
    statementCount: $("statement-count"),
    proposeButton: $("propose-button"),
    proposalResult: $("proposal-result"),
    proposalExpiry: $("proposal-expiry"),
    showQrButton: $("show-qr-button"),
    copyLinkButton: $("copy-link-button"),
    copyAddressButton: $("copy-address-button"),
    proposalTransactionLink: $("proposal-transaction-link"),
    cancelButton: $("cancel-button"),
    confirmationEmpty: $("confirmation-empty"),
    confirmationCard: $("confirmation-card"),
    openInviteForm: $("open-invite-form"),
    inviteLinkInput: $("invite-link-input"),
    reviewContributor: $("review-contributor"),
    reviewReceiver: $("review-receiver"),
    reviewEpoch: $("review-epoch"),
    reviewStatus: $("review-status"),
    reviewStatement: $("review-statement"),
    reviewDigest: $("review-digest"),
    verificationLine: $("verification-line"),
    confirmButton: $("confirm-button"),
    declineButton: $("decline-button"),
    confirmationTransactionLink: $("confirmation-transaction-link"),
    scanQrButton: $("scan-qr-button"),
    qrDialog: $("qr-dialog"),
    qrCode: $("qr-code"),
    modalCopyLinkButton: $("modal-copy-link-button"),
    scannerDialog: $("scanner-dialog"),
    scannerVideo: $("scanner-video"),
    scannerStatus: $("scanner-status"),
    stopScannerButton: $("stop-scanner-button"),
    genesisValue: $("genesis-value"),
    genesisTargetDetail: $("genesis-target-detail"),
    poolValue: $("pool-value"),
    reservedValue: $("reserved-value"),
    allocatedValue: $("allocated-value"),
    debtValue: $("debt-value"),
    hwmValue: $("hwm-value"),
    invariantLine: $("invariant-line"),
    genesisForm: $("genesis-form"),
    genesisAmount: $("genesis-amount"),
    poolForm: $("pool-form"),
    poolAmount: $("pool-amount"),
    operatorLine: $("operator-line"),
    settlementSummary: $("settlement-summary"),
    budgetForm: $("budget-form"),
    budgetEpoch: $("budget-epoch"),
    budgetAmount: $("budget-amount"),
    closeForm: $("close-form"),
    closeEpoch: $("close-epoch"),
    closePrice: $("close-price"),
    finalizeButton: $("finalize-button"),
    claimList: $("claim-list"),
    refreshClaimsButton: $("refresh-claims-button"),
    ledger: $("encounter-ledger"),
    refreshHistoryButton: $("refresh-history-button"),
    liveBuildLabel: $("live-build-label"),
    liveBuildHeading: $("live-build-heading"),
    toast: $("toast")
  };

  function configuredContract() {
    return Core.isAddress(config.contractAddress) && Core.normalizeAddress(config.contractAddress) !== ZERO_ADDRESS;
  }

  function contractAddress() {
    if (!configuredContract()) throw new Error("The v4 contract address has not been added to config.js.");
    return Core.normalizeAddress(config.contractAddress);
  }

  function correctNetwork() {
    return String(state.chainId || "").toLowerCase() === String(config.chainId).toLowerCase();
  }

  function readyForRead() {
    return Boolean(ethereum && correctNetwork() && configuredContract());
  }

  function readyForWrite() {
    return Boolean(readyForRead() && state.contractVerified && state.account);
  }

  function isDemoOperator() {
    return Boolean(state.account && state.demoOperator && state.account === state.demoOperator);
  }

  function callData(selectorName, words) {
    return Core.encodeCall(SELECTORS[selectorName], words || []);
  }

  function txUrl(hash) {
    return `${config.explorerBaseUrl}/tx/${hash}`;
  }

  function addressTopic(address) {
    return `0x${Core.strip0x(Core.normalizeAddress(address)).padStart(64, "0")}`;
  }

  function friendlyError(error) {
    if (!error) return "Something went wrong.";
    if (error.code === 4001) return "The MetaMask request was rejected.";
    const fragments = [];
    const seen = new WeakSet();
    const collect = value => {
      if (!value || fragments.length > 30) return;
      if (typeof value === "string") fragments.push(value);
      else if (typeof value === "object") {
        if (seen.has(value)) return;
        seen.add(value);
        ["message", "shortMessage", "reason", "data", "error", "cause", "originalError"].forEach(key => collect(value[key]));
      }
    };
    collect(error);
    const combined = fragments.join(" ");
    for (const [selector, message] of Object.entries(ERROR_MESSAGES)) {
      if (combined.toLowerCase().includes(selector)) return message;
    }
    if (/user rejected|user denied/i.test(combined)) return "The MetaMask request was rejected.";
    if (/insufficient funds/i.test(combined)) return "This wallet does not have enough Sepolia ETH for the amount and gas.";
    if (/failed to fetch|network error/i.test(combined)) return "The Sepolia connection failed. Check MetaMask and try again.";
    const message = error.shortMessage || error.reason || error.message || fragments[0] || String(error);
    return String(message)
      .replace(/^execution reverted:?\s*/i, "")
      .replace(/^Internal JSON-RPC error\.?\s*/i, "")
      .slice(0, 360);
  }

  let toastTimer;
  function showToast(message, warning) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("warning", Boolean(warning));
    elements.toast.classList.add("show");
    toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 4800);
  }

  function setBusy(busy) {
    state.busy = busy;
    updateControls();
  }

  function updateControls() {
    const writeReady = readyForWrite();
    elements.proposeButton.disabled = state.busy || !writeReady;
    elements.confirmButton.disabled = state.busy || !writeReady || !state.reviewVerified;
    elements.declineButton.disabled = state.busy || !writeReady || !state.reviewVerified;
    elements.cancelButton.disabled = state.busy || !writeReady || !state.lastInvite || state.lastInvite.status !== 1;
    elements.genesisForm.querySelector("button[type='submit']").disabled = state.busy || !writeReady;
    elements.poolForm.querySelector("button[type='submit']").disabled = state.busy || !writeReady;
    elements.budgetForm.querySelector("button[type='submit']").disabled = state.busy || !writeReady || !isDemoOperator();
    const closedEpochReady = state.nextEpochToFinalize !== null
      && state.currentEpoch !== null
      && state.nextEpochToFinalize < state.currentEpoch;
    elements.closeForm.querySelector("button[type='submit']").disabled = state.busy || !writeReady || !isDemoOperator() || !closedEpochReady;
    elements.finalizeButton.disabled = state.busy || !writeReady || !closedEpochReady;
    elements.refreshClaimsButton.disabled = state.busy || !readyForRead() || !state.account;
    elements.refreshHistoryButton.disabled = state.busy || !readyForRead() || !state.account;

    if (!ethereum) {
      elements.connectButton.textContent = "MetaMask required";
      elements.connectButton.disabled = true;
    } else if (state.account && correctNetwork()) {
      elements.connectButton.textContent = Core.shortAddress(state.account);
      elements.connectButton.disabled = state.busy;
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
    elements.liveBuildLabel.textContent = state.contractVerified ? "Live on Sepolia" : "Built for Sepolia";
    elements.liveBuildHeading.textContent = state.contractVerified ? "Implemented end to end" : "Enabled after v4 deployment";
    elements.accountValue.textContent = Core.shortAddress(state.account);
    elements.accountRole.textContent = state.account ? "Ready as contributor or receiver" : "Connect to begin";
    elements.networkLabel.textContent = correctNetwork() ? "Sepolia" : (state.chainId ? "Wrong network" : "Sepolia");
    elements.liveDot.classList.remove("ready", "warning");

    if (!ethereum) {
      elements.networkDetail.textContent = "MetaMask was not detected in this browser.";
      elements.liveDot.classList.add("warning");
    } else if (!correctNetwork()) {
      elements.networkDetail.textContent = state.account ? "Switch MetaMask to Sepolia." : "Connect MetaMask on Sepolia.";
      elements.liveDot.classList.add("warning");
    } else if (!configuredContract()) {
      elements.networkDetail.textContent = "Browser ready; new v4 deployment not configured.";
      elements.liveDot.classList.add("warning");
    } else if (!state.contractVerified) {
      elements.networkDetail.textContent = "Checking the configured v4 contract…";
      elements.liveDot.classList.add("warning");
    } else {
      elements.networkDetail.textContent = state.account ? "Live v4 contract connection." : "Live v4 contract available; wallet disconnected.";
      elements.liveDot.classList.add("ready");
    }
    updateControls();
  }

  function setRoute(route, updateHash) {
    const next = ["encounter", "commons", "history", "build", "about"].includes(route) ? route : "encounter";
    state.activeRoute = next;
    document.querySelectorAll("[data-view]").forEach(view => {
      const active = view.dataset.view === next;
      view.hidden = !active;
      view.classList.toggle("active", active);
    });
    document.querySelectorAll(".nav-link[data-route]").forEach(button => {
      const active = button.dataset.route === next;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (updateHash) window.history.replaceState(null, "", `#${next}`);
    if (updateHash) window.scrollTo({ top: 0, behavior: "auto" });
    if (next === "history" && readyForRead() && state.account) refreshHistory().catch(reportError);
    if (next === "commons" && readyForRead()) refreshCommons().catch(reportError);
  }

  function reportError(error) {
    showToast(friendlyError(error), true);
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
        await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: config.chainId }] });
        state.chainId = await ethereum.request({ method: "eth_chainId" });
      }
      renderConnection();
      await refreshAll();
      if (state.reviewHeader) await verifyReview();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  async function readCall(data) {
    if (!readyForRead()) throw new Error("Connect MetaMask to Sepolia and configure the v4 contract first.");
    return ethereum.request({ method: "eth_call", params: [{ to: contractAddress(), data }, "latest"] });
  }

  async function readUint(selectorName, words) {
    const response = await readCall(callData(selectorName, words));
    const decoded = Core.splitWords(response);
    if (!decoded.length) throw new Error("The contract returned an empty response. Check config.js.");
    return Core.decodeUintWord(decoded[0]);
  }

  async function readBool(selectorName, words) {
    const response = await readCall(callData(selectorName, words));
    const decoded = Core.splitWords(response);
    if (!decoded.length) throw new Error("The contract returned an empty response. Check config.js.");
    return Core.decodeBoolWord(decoded[0]);
  }

  async function readAddress(selectorName, words) {
    const response = await readCall(callData(selectorName, words));
    const decoded = Core.splitWords(response);
    if (!decoded.length) throw new Error("The contract returned an empty response. Check config.js.");
    return Core.decodeAddressWord(decoded[0]);
  }

  async function readEncounter(id) {
    const response = await readCall(callData("encounters", [Core.encodeBytes32(id)]));
    return Core.decodeEncounter(response);
  }

  async function readSettlement(epoch) {
    const response = await readCall(callData("settlements", [Core.encodeUint(epoch)]));
    return Core.decodeSettlement(response);
  }

  async function waitForReceipt(transactionHash) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      const receipt = await ethereum.request({ method: "eth_getTransactionReceipt", params: [transactionHash] });
      if (receipt) return receipt;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error("Sepolia is taking longer than expected. Check the transaction on Etherscan.");
  }

  async function sendTransaction(data, value) {
    if (!readyForWrite()) throw new Error("Connect MetaMask to Sepolia first.");
    const transaction = { from: state.account, to: contractAddress(), data };
    if (typeof value === "bigint") transaction.value = Core.hexQuantity(value);
    const transactionHash = await ethereum.request({ method: "eth_sendTransaction", params: [transaction] });
    showToast("Transaction submitted. Waiting for Sepolia…");
    const receipt = await waitForReceipt(transactionHash);
    if (receipt.status && receipt.status !== "0x1") throw new Error("The transaction failed on Sepolia.");
    return { transactionHash, receipt };
  }

  function storageKey() {
    return `gameover:encounters:v4:${configuredContract() ? contractAddress() : "unconfigured"}`;
  }

  function readLocalRecords() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey()) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  function saveLocalRecord(record) {
    const records = readLocalRecords();
    const key = String(record.id).toLowerCase();
    records[key] = { ...(records[key] || {}), ...record, id: key };
    try {
      localStorage.setItem(storageKey(), JSON.stringify(records));
    } catch (_error) {
      // The active encounter still works when storage is blocked; readable
      // private history will then last only for this browser session.
    }
    return records[key];
  }

  function pageWithoutHash() {
    return window.location.href.split("#")[0];
  }

  function inviteLink(token) {
    return `${pageWithoutHash()}#invite=${token}`;
  }

  async function copyText(value, successMessage) {
    if (!value) throw new Error("There is nothing to copy yet.");
    try {
      await navigator.clipboard.writeText(value);
    } catch (_error) {
      const field = document.createElement("textarea");
      field.value = value;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      if (!copied) throw new Error("Copying is unavailable. Select and copy the value manually.");
    }
    showToast(successMessage || "Copied.");
  }

  function epochDate(epoch) {
    const start = new Date(Number(BigInt(epoch) * SECONDS_PER_EPOCH) * 1000);
    return start.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
  }

  function sunriseLabel(epoch) {
    const sunrise = new Date(Number((BigInt(epoch) + 1n) * SECONDS_PER_EPOCH) * 1000);
    return `${sunrise.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short" })}, 00:00 UTC`;
  }

  function statusName(status) {
    return STATUS_NAMES[Number(status)] || "Unknown";
  }

  function setStatusText(element, text, kind) {
    element.textContent = text;
    element.classList.remove("verified", "warning");
    if (kind) element.classList.add(kind);
  }

  async function refreshProtocol() {
    if (!readyForRead()) {
      state.contractVerified = false;
      state.currentEpoch = BigInt(Math.floor(Date.now() / 86_400_000));
      state.nextSunriseAt = (state.currentEpoch + 1n) * SECONDS_PER_EPOCH;
      state.nextEpochToFinalize = null;
      elements.dailyValue.textContent = "0";
      elements.claimableValue.textContent = "0 ETH";
      tickCountdown();
      return;
    }

    const commonCalls = [readUint("currentEpoch"), readUint("nextSunriseAt"), readAddress("demoOperator"), readUint("nextEpochToFinalize")];
    const accountCalls = state.account
      ? [
          readUint("dailyContributions", [Core.encodeAddress(state.account)]),
          readUint("lifetimeContributed", [Core.encodeAddress(state.account)]),
          readUint("lifetimeReceived", [Core.encodeAddress(state.account)])
        ]
      : [Promise.resolve(0n), Promise.resolve(0n), Promise.resolve(0n)];
    const [epoch, sunrise, operator, nextEpochToFinalize, daily, lifetimeContributed, lifetimeReceived] = await Promise.all([...commonCalls, ...accountCalls]);
    state.currentEpoch = epoch;
    state.nextSunriseAt = sunrise;
    state.demoOperator = operator;
    state.nextEpochToFinalize = nextEpochToFinalize;
    state.contractVerified = true;
    elements.dailyValue.textContent = daily.toString();
    elements.accountRole.textContent = state.account
      ? `${lifetimeContributed} contributed · ${lifetimeReceived} received, lifetime`
      : "Connect to begin";
    if (!elements.budgetEpoch.value) elements.budgetEpoch.value = epoch.toString();
    elements.closeEpoch.value = nextEpochToFinalize.toString();
    tickCountdown();
    renderConnection();
  }

  function tickCountdown() {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const fallback = ((now / SECONDS_PER_EPOCH) + 1n) * SECONDS_PER_EPOCH;
    const target = state.nextSunriseAt || fallback;
    const remaining = target > now ? target - now : 0n;
    const hours = String(remaining / 3600n).padStart(2, "0");
    const minutes = String((remaining % 3600n) / 60n).padStart(2, "0");
    const seconds = String(remaining % 60n).padStart(2, "0");
    elements.countdownValue.textContent = `${hours}:${minutes}:${seconds}`;
    elements.sunriseDetail.textContent = `${new Date(Number(target) * 1000).toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short" })} · 00:00 UTC · no rollover`;
    if (remaining === 0n && Date.now() - state.lastSunriseRefresh > 30_000) {
      state.lastSunriseRefresh = Date.now();
      refreshAll().catch(reportError);
    }
  }

  async function refreshCommons() {
    if (!readyForRead()) return;
    if (state.currentEpoch === null) await refreshProtocol();
    const [principal, target, pool, reserved, allocated, debt, hwm, invariant] = await Promise.all([
      readUint("permanentPrincipal"),
      readUint("GENESIS_TARGET"),
      readUint("availablePool"),
      readUint("totalReservedBudgets"),
      readUint("totalAllocatedUnclaimed"),
      readUint("commonsDebt"),
      readUint("highWaterMark"),
      readBool("accountingInvariantHolds")
    ]);
    elements.genesisValue.textContent = `${Core.formatEth(principal, 6)} ETH`;
    const remaining = target > principal ? target - principal : 0n;
    elements.genesisTargetDetail.textContent = remaining > 0n ? `${Core.formatEth(remaining, 6)} ETH to 0.01 target` : "0.01 ETH target reached";
    elements.poolValue.textContent = `${Core.formatEth(pool, 6)} ETH`;
    elements.reservedValue.textContent = `${Core.formatEth(reserved, 6)} ETH`;
    elements.allocatedValue.textContent = `${Core.formatEth(allocated, 6)} ETH`;
    elements.debtValue.textContent = `Ω ${debt}`;
    elements.hwmValue.textContent = `$${Core.formatUsdPrice(hwm)}`;
    setStatusText(elements.invariantLine, invariant
      ? "Accounting invariant holds: protected ETH is fully backed."
      : "Accounting invariant failed. Do not transact with this deployment.", invariant ? "verified" : "warning");
    elements.operatorLine.textContent = isDemoOperator()
      ? "This wallet is the demo operator: it may enter simulated budgets and ETH/USD closes. Any wallet may finalize."
      : `Demo operator ${Core.shortAddress(state.demoOperator)} controls only simulated budgets and closes. Any wallet may finalize.`;
    await refreshSettlementSummary();
    if (state.account) await refreshClaims();
    updateControls();
  }

  async function refreshSettlementSummary() {
    if (!readyForRead() || state.currentEpoch === null || state.nextEpochToFinalize === null) return;
    const epoch = state.nextEpochToFinalize;
    if (epoch >= state.currentEpoch) {
      elements.settlementSummary.innerHTML = [
        `<div><span>Next required epoch</span><strong>${epoch} · ${epochDate(epoch)}</strong></div>`,
        '<div><span>State</span><strong>Still open</strong></div>',
        '<div><span>Available after</span><strong>Protocol Sunrise</strong></div>'
      ].join("");
      return;
    }
    const [settlement, mockClose, pendingBudget] = await Promise.all([
      readSettlement(epoch),
      readUint("mockEpochClosePrice", [Core.encodeUint(epoch)]),
      readUint("epochBudget", [Core.encodeUint(epoch)])
    ]);
    const close = settlement.finalized ? settlement.closePrice : mockClose;
    const outcome = !settlement.finalized ? "Awaiting finalization" : settlement.released ? "Budget released" : "No release";
    const outcomeClass = settlement.released ? "mint-text" : (!settlement.finalized ? "" : "danger-text");
    elements.settlementSummary.innerHTML = [
      `<div><span>Next required epoch</span><strong>${epoch} · ${epochDate(epoch)}</strong></div>`,
      `<div><span>Simulated close</span><strong>${close > 0n ? `$${Core.formatUsdPrice(close)}` : "Not entered"}</strong></div>`,
      `<div><span>Outcome</span><strong class="${outcomeClass}">${outcome}</strong></div>`,
      `<div><span>Reserved budget</span><strong>${Core.formatEth(pendingBudget, 6)} test ETH</strong></div>`,
      `<div><span>Released pool</span><strong>${Core.formatEth(settlement.pool, 6)} test ETH</strong></div>`,
      `<div><span>Remaining claims</span><strong>${Core.formatEth(settlement.remaining, 6)} test ETH</strong></div>`
    ].join("");
  }

  async function refreshClaims() {
    if (!readyForRead() || !state.account) {
      elements.claimableValue.textContent = "0 ETH";
      elements.claimList.innerHTML = '<p class="ledger-empty">Connect a wallet to load allocations.</p>';
      return;
    }
    const count = await readUint("contributorEpochCount", [Core.encodeAddress(state.account)]);
    const numericCount = Number(count);
    const start = Math.max(0, numericCount - MAX_HISTORY_EPOCHS);
    const epochCalls = [];
    for (let index = start; index < numericCount; index += 1) {
      epochCalls.push(readUint("contributorEpochAt", [Core.encodeAddress(state.account), Core.encodeUint(index)]));
    }
    const epochs = (await Promise.all(epochCalls)).reverse();
    const entries = await Promise.all(epochs.map(async epoch => {
      const [settlement, amount, claimed] = await Promise.all([
        readSettlement(epoch),
        readUint("claimable", [Core.encodeUint(epoch), Core.encodeAddress(state.account)]),
        readBool("payoutClaimed", [Core.encodeUint(epoch), Core.encodeAddress(state.account)])
      ]);
      return { epoch, settlement, amount, claimed };
    }));
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0n);
    elements.claimableValue.textContent = `${Core.formatEth(total, 6)} ETH`;
    elements.claimableDetail.textContent = total > 0n ? `${entries.filter(entry => entry.amount > 0n).length} epoch allocation(s)` : "No released allocation";
    renderClaims(entries);
  }

  function renderClaims(entries) {
    elements.claimList.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "ledger-empty";
      empty.textContent = "No credited contribution epochs for this wallet yet.";
      elements.claimList.appendChild(empty);
      return;
    }
    entries.forEach(entry => {
      const row = document.createElement("article");
      row.className = "claim-row";
      const copy = document.createElement("div");
      const title = document.createElement("h4");
      title.textContent = `Epoch ${entry.epoch} · ${epochDate(entry.epoch)}`;
      const detail = document.createElement("p");
      if (!entry.settlement.finalized) detail.textContent = "Awaiting permissionless finalization";
      else if (entry.claimed) detail.textContent = "Allocation claimed";
      else if (!entry.settlement.released) detail.textContent = "No appreciation release; daily points expired";
      else detail.textContent = "Released allocation · full claim only";
      copy.append(title, detail);
      if (entry.amount > 0n) {
        const button = document.createElement("button");
        button.className = "button button-mint button-small";
        button.type = "button";
        button.dataset.claimEpoch = entry.epoch.toString();
        button.textContent = `Claim ${Core.formatEth(entry.amount, 6)} ETH`;
        button.disabled = state.busy || !readyForWrite();
        row.append(copy, button);
      } else {
        const amount = document.createElement("span");
        amount.className = "claim-amount";
        amount.textContent = entry.claimed ? "Claimed" : "0 ETH";
        row.append(copy, amount);
      }
      elements.claimList.appendChild(row);
    });
  }

  async function refreshAll() {
    renderConnection();
    await refreshProtocol();
    if (!readyForRead()) return;
    await Promise.all([
      refreshCommons(),
      state.account ? refreshHistory() : Promise.resolve(),
      state.account ? restorePendingInvite() : Promise.resolve()
    ]);
  }

  async function proposeEncounter(event) {
    event.preventDefault();
    try {
      if (!readyForWrite()) throw new Error("Connect MetaMask to Sepolia first.");
      const receiver = Core.normalizeAddress(elements.receiverAddress.value.trim());
      if (receiver === state.account) throw new Error("Contributor and receiver must use different wallet addresses.");
      const statement = elements.statement.value.trim();
      if (!statement) throw new Error("Describe the contribution.");
      if (statement.length > 280) throw new Error("Keep the description within 280 characters.");

      setBusy(true);
      const id = Core.randomHex(32);
      const salt = Core.randomHex(32);
      const digest = await Core.statementDigest(statement, salt, {
        chainId: config.chainIdDecimal,
        contract: contractAddress(),
        id,
        contributor: state.account,
        receiver
      });
      saveLocalRecord({ id, statement, salt, contributor: state.account, receiver, digest, status: "Submitting", createdAt: Date.now() });

      const data = callData("proposeEncounter", [Core.encodeBytes32(id), Core.encodeAddress(receiver), Core.encodeBytes32(digest)]);
      const { transactionHash } = await sendTransaction(data);
      const encounter = await readEncounter(id);
      const header = {
        chainId: config.chainIdDecimal,
        contract: contractAddress(),
        id,
        contributor: state.account,
        receiver,
        digest,
        epoch: encounter.epoch.toString()
      };
      const token = await Core.encryptInvite(header, { statement, salt });
      const link = inviteLink(token);
      const record = saveLocalRecord({
        id,
        statement,
        salt,
        contributor: state.account,
        receiver,
        digest,
        epoch: encounter.epoch.toString(),
        proposedAt: encounter.proposedAt.toString(),
        status: "Invited",
        invite: token,
        transactionHash
      });
      state.lastInvite = { ...record, link, status: 1 };
      renderProposal();
      elements.encounterForm.reset();
      elements.statementCount.textContent = "0 / 280";
      showToast("Invite recorded on Sepolia. Send the private link before Protocol Sunrise.");
      await refreshProtocol();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  function renderProposal() {
    const invite = state.lastInvite;
    elements.proposalResult.hidden = !invite;
    if (!invite) return;
    elements.proposalExpiry.textContent = sunriseLabel(invite.epoch);
    elements.proposalTransactionLink.href = invite.transactionHash ? txUrl(invite.transactionHash) : "#";
    elements.proposalTransactionLink.hidden = !invite.transactionHash;
    elements.cancelButton.hidden = invite.status !== 1;
    elements.showQrButton.disabled = invite.status !== 1;
    elements.copyLinkButton.disabled = invite.status !== 1;
    elements.copyAddressButton.disabled = false;
    updateControls();
  }

  async function restorePendingInvite() {
    if (!readyForRead() || !state.account || state.lastInvite) return;
    const records = Object.values(readLocalRecords())
      .filter(record => record.contributor === state.account && record.statement && record.salt)
      .sort((a, b) => Number(b.proposedAt || b.createdAt || 0) - Number(a.proposedAt || a.createdAt || 0));
    for (const record of records.slice(0, 8)) {
      try {
        const encounter = await readEncounter(record.id);
        const effectiveStatus = Number(await readUint("encounterStatus", [Core.encodeBytes32(record.id)]));
        if (effectiveStatus !== 1) continue;
        let token = record.invite;
        if (!token) {
          token = await Core.encryptInvite({
            chainId: config.chainIdDecimal,
            contract: contractAddress(),
            id: record.id,
            contributor: encounter.contributor,
            receiver: encounter.receiver,
            digest: encounter.statementDigest,
            epoch: encounter.epoch.toString()
          }, { statement: record.statement, salt: record.salt });
          saveLocalRecord({ id: record.id, invite: token, epoch: encounter.epoch.toString(), status: "Invited" });
        }
        state.lastInvite = { ...record, invite: token, link: inviteLink(token), epoch: encounter.epoch.toString(), status: 1 };
        renderProposal();
        return;
      } catch (_error) {
        // A stale local record must not prevent the rest of the app from loading.
      }
    }
  }

  async function cancelInvite() {
    if (!state.lastInvite) return;
    try {
      setBusy(true);
      const { transactionHash } = await sendTransaction(callData("cancelEncounter", [Core.encodeBytes32(state.lastInvite.id)]));
      state.lastInvite.status = 4;
      saveLocalRecord({ id: state.lastInvite.id, status: "Cancelled", cancellationTransactionHash: transactionHash });
      renderProposal();
      showToast("Invite cancelled on Sepolia.");
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  function extractInviteToken(value) {
    const text = String(value || "").trim();
    if (!text) throw new Error("Paste a complete GameOver invite link.");
    if (text.length > 8_192) throw new Error("That invite link is larger than the v4 safety limit.");
    try {
      const url = new URL(text, window.location.href);
      const token = new URLSearchParams(url.hash.replace(/^#/, "")).get("invite");
      if (token) return token;
    } catch (_error) {
      // Continue and allow the raw bearer token form.
    }
    if (text.startsWith("#invite=")) return decodeURIComponent(text.slice(8));
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text)) return text;
    throw new Error("That is not a complete GameOver v4 invite link.");
  }

  async function loadInvite(value, keepInAddressBar) {
    try {
      const token = extractInviteToken(value);
      const header = Core.inviteHeader(token);
      state.reviewToken = token;
      state.reviewHeader = header;
      state.reviewPrivate = null;
      state.reviewEncounter = null;
      state.reviewVerified = false;
      setRoute("encounter", false);
      elements.confirmationEmpty.hidden = true;
      elements.confirmationCard.hidden = false;
      elements.reviewContributor.textContent = Core.shortAddress(header.contributor);
      elements.reviewContributor.title = header.contributor;
      elements.reviewReceiver.textContent = Core.shortAddress(header.receiver);
      elements.reviewReceiver.title = header.receiver;
      elements.reviewEpoch.textContent = `${header.epoch} · ${epochDate(header.epoch)}`;
      elements.reviewStatus.textContent = "Awaiting verification";
      elements.reviewDigest.textContent = header.digest;
      elements.reviewStatement.textContent = "Connect the named receiver wallet to decrypt.";
      setStatusText(elements.verificationLine, "Connect the named receiver wallet to verify this invite.");
      elements.confirmationTransactionLink.hidden = true;
      updateControls();
      if (keepInAddressBar) window.history.replaceState(null, "", `#invite=${token}`);
      window.requestAnimationFrame(() => {
        elements.confirmationCard.closest(".receiver-panel")?.scrollIntoView({ block: "start", behavior: "auto" });
      });
      if (state.account && readyForRead()) await verifyReview();
    } catch (error) {
      reportError(error);
    }
  }

  async function verifyReview() {
    const header = state.reviewHeader;
    state.reviewVerified = false;
    updateControls();
    if (!header) return;
    if (String(header.chainId) !== String(config.chainIdDecimal)) {
      setStatusText(elements.verificationLine, "This invite targets a different network, not Sepolia v4.", "warning");
      return;
    }
    if (!configuredContract()) {
      setStatusText(elements.verificationLine, "The v4 contract has not been configured in this build.", "warning");
      return;
    }
    if (header.contract !== contractAddress()) {
      setStatusText(elements.verificationLine, "This invite belongs to a different GameOver contract.", "warning");
      return;
    }
    if (!state.account) {
      setStatusText(elements.verificationLine, "Connect the named receiver wallet to verify this invite.");
      return;
    }
    if (!correctNetwork()) {
      setStatusText(elements.verificationLine, "Switch MetaMask to Sepolia to verify this invite.", "warning");
      return;
    }
    if (state.account !== header.receiver) {
      elements.reviewStatement.textContent = "Private description hidden: this is not the named receiver wallet.";
      setStatusText(elements.verificationLine, `Wrong wallet. Connect receiver ${Core.shortAddress(header.receiver)}.`, "warning");
      return;
    }

    try {
      setStatusText(elements.verificationLine, "Decrypting locally and matching the Sepolia commitment…");
      const decrypted = await Core.decryptInvite(state.reviewToken);
      const statement = String(decrypted.privatePayload.statement || "");
      if (!statement.trim() || statement.length > 280) throw new Error("The private description is outside the v4 size limit.");
      const salt = decrypted.privatePayload.salt;
      const digest = await Core.statementDigest(statement, salt, {
        chainId: config.chainIdDecimal,
        contract: contractAddress(),
        id: header.id,
        contributor: header.contributor,
        receiver: header.receiver
      });
      if (digest !== header.digest) throw new Error("The private description does not match the invite commitment.");

      const [encounter, effectiveStatus, epoch] = await Promise.all([
        readEncounter(header.id),
        readUint("encounterStatus", [Core.encodeBytes32(header.id)]),
        readUint("currentEpoch")
      ]);
      const matches = encounter.contributor === header.contributor
        && encounter.receiver === header.receiver
        && encounter.statementDigest === header.digest
        && encounter.epoch.toString() === String(header.epoch);
      if (!matches) throw new Error("This private invite does not match its Sepolia proposal.");

      const status = Number(effectiveStatus);
      state.reviewPrivate = { statement, salt };
      state.reviewEncounter = { ...encounter, status };
      elements.reviewStatement.textContent = statement;
      elements.reviewStatus.textContent = statusName(status);
      saveLocalRecord({
        id: header.id,
        statement,
        salt,
        contributor: header.contributor,
        receiver: header.receiver,
        digest: header.digest,
        epoch: header.epoch,
        status: statusName(status),
        invite: state.reviewToken,
        proposedAt: encounter.proposedAt.toString(),
        confirmedAt: encounter.confirmedAt.toString()
      });

      if (status === 1 && epoch.toString() === String(header.epoch)) {
        state.reviewVerified = true;
        setStatusText(elements.verificationLine, "Verified: wallet, private description and on-chain commitment all match.", "verified");
      } else if (status === 5 || epoch > BigInt(header.epoch)) {
        elements.reviewStatus.textContent = "Expired";
        setStatusText(elements.verificationLine, "This invite expired at Protocol Sunrise and cannot roll over.", "warning");
      } else if (status === 2) {
        setStatusText(elements.verificationLine, "This encounter is already confirmed on Sepolia.", "verified");
      } else {
        setStatusText(elements.verificationLine, `This encounter is ${statusName(status).toLowerCase()} and cannot be confirmed.`, "warning");
      }
    } catch (error) {
      elements.reviewStatus.textContent = "Verification failed";
      setStatusText(elements.verificationLine, friendlyError(error), "warning");
    }
    updateControls();
  }

  async function respondToInvite(confirming) {
    if (!state.reviewHeader || !state.reviewVerified) return;
    try {
      setBusy(true);
      const selector = confirming ? "confirmEncounter" : "declineEncounter";
      const { transactionHash } = await sendTransaction(callData(selector, [Core.encodeBytes32(state.reviewHeader.id)]));
      const nextStatus = confirming ? "Confirmed" : "Declined";
      saveLocalRecord({
        id: state.reviewHeader.id,
        status: nextStatus,
        ...(confirming ? { confirmationTransactionHash: transactionHash } : { declineTransactionHash: transactionHash })
      });
      state.reviewVerified = false;
      if (state.reviewEncounter) state.reviewEncounter.status = confirming ? 2 : 3;
      elements.reviewStatus.textContent = nextStatus;
      setStatusText(elements.verificationLine, confirming
        ? "Confirmed on Sepolia. The contributor earned today’s +1. Your receiver score remains neutral."
        : "Declined on Sepolia. No contribution credit was created.", confirming ? "verified" : "warning");
      if (confirming) {
        elements.confirmationTransactionLink.href = txUrl(transactionHash);
        elements.confirmationTransactionLink.hidden = false;
      }
      window.history.replaceState(null, "", "#encounter");
      showToast(confirming ? "Encounter confirmed. Contributor +1; receiver remains neutral." : "Invite declined on Sepolia.", !confirming);
      await refreshAll();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  function renderQrCode() {
    if (!state.lastInvite || !state.lastInvite.link) throw new Error("Create an invite before showing its QR.");
    if (typeof window.qrcode !== "function") throw new Error("The QR generator did not load.");
    const qr = window.qrcode(0, "L");
    qr.addData(state.lastInvite.link);
    qr.make();
    elements.qrCode.innerHTML = qr.createSvgTag(5, 0);
    elements.qrDialog.showModal();
  }

  async function startScanner() {
    if (!("BarcodeDetector" in window)) {
      showToast("QR scanning is unavailable in this Chrome build. Paste the invite link instead.", true);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast("Camera access requires HTTPS or localhost. Paste the invite link instead.", true);
      return;
    }
    try {
      stopScanner(false);
      elements.scannerStatus.textContent = "Point the camera at the complete GameOver invite QR.";
      elements.scannerDialog.showModal();
      state.scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      elements.scannerVideo.srcObject = state.scannerStream;
      await elements.scannerVideo.play();
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      state.scannerTimer = window.setInterval(async () => {
        if (state.scannerDetecting || !state.scannerStream) return;
        state.scannerDetecting = true;
        try {
          const codes = await detector.detect(elements.scannerVideo);
          if (codes.length && codes[0].rawValue) {
            const value = codes[0].rawValue;
            stopScanner();
            await loadInvite(value, true);
            showToast("Private invite QR scanned.");
          }
        } catch (error) {
          elements.scannerStatus.textContent = friendlyError(error);
        } finally {
          state.scannerDetecting = false;
        }
      }, 350);
    } catch (error) {
      stopScanner();
      reportError(error);
    }
  }

  function stopScanner(closeDialog = true) {
    if (state.scannerTimer) window.clearInterval(state.scannerTimer);
    state.scannerTimer = null;
    if (state.scannerStream) state.scannerStream.getTracks().forEach(track => track.stop());
    state.scannerStream = null;
    elements.scannerVideo.srcObject = null;
    if (closeDialog && elements.scannerDialog.open) elements.scannerDialog.close();
  }

  async function depositGenesis(event) {
    event.preventDefault();
    try {
      const value = Core.weiFromEth(elements.genesisAmount.value);
      setBusy(true);
      await sendTransaction(callData("contributeToGenesis"), value);
      elements.genesisForm.reset();
      showToast("Sepolia test ETH added permanently to Genesis principal.");
      await refreshCommons();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  async function seedPool(event) {
    event.preventDefault();
    try {
      const value = Core.weiFromEth(elements.poolAmount.value);
      setBusy(true);
      await sendTransaction(callData("seedPayoutPool"), value);
      elements.poolForm.reset();
      showToast("Sepolia test ETH added to the spendable payout pool.");
      await refreshCommons();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  async function setBudget(event) {
    event.preventDefault();
    try {
      const epoch = BigInt(elements.budgetEpoch.value);
      const amount = Core.parseDecimal(elements.budgetAmount.value, 18, "test ETH budget");
      setBusy(true);
      await sendTransaction(callData("setEpochBudget", [Core.encodeUint(epoch), Core.encodeUint(amount)]));
      showToast(`Budget set for epoch ${epoch}. This is an explicit test input.`);
      await refreshCommons();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  async function setClose(event) {
    event.preventDefault();
    try {
      const epoch = BigInt(elements.closeEpoch.value);
      const price = Core.priceToScaled(elements.closePrice.value);
      setBusy(true);
      await sendTransaction(callData("setMockEpochClosePrice", [Core.encodeUint(epoch), Core.encodeUint(price)]));
      showToast(`Simulated ETH/USD close stored for epoch ${epoch}.`);
      await refreshCommons();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  async function finalizeEpoch() {
    try {
      const epoch = BigInt(elements.closeEpoch.value);
      setBusy(true);
      await sendTransaction(callData("finalizeEpoch", [Core.encodeUint(epoch)]));
      showToast(`Epoch ${epoch} finalized. Claims, if released, are now pull-based.`);
      await refreshProtocol();
      await refreshCommons();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  async function claimEpoch(epoch) {
    try {
      setBusy(true);
      await sendTransaction(callData("claim", [Core.encodeUint(epoch)]));
      showToast(`Full allocation for epoch ${epoch} claimed.`);
      await refreshCommons();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  async function refreshHistory() {
    if (!readyForRead() || !state.account) {
      elements.ledger.innerHTML = '<p class="ledger-empty">Connect a wallet to read its Sepolia history.</p>';
      return;
    }
    const baseFilter = {
      address: contractAddress(),
      fromBlock: Core.hexQuantity(BigInt(config.deploymentBlock || "0")),
      toBlock: "latest"
    };
    const accountTopic = addressTopic(state.account);
    const [asContributor, asReceiver] = await Promise.all([
      ethereum.request({ method: "eth_getLogs", params: [{ ...baseFilter, topics: [CONFIRMED_EVENT_TOPIC, null, accountTopic] }] }),
      ethereum.request({ method: "eth_getLogs", params: [{ ...baseFilter, topics: [CONFIRMED_EVENT_TOPIC, null, null, accountTopic] }] })
    ]);
    const seen = new Set();
    const logs = [...asContributor, ...asReceiver]
      .filter(log => {
        const key = `${log.transactionHash}:${log.logIndex}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(log => {
        const decoded = Core.decodeConfirmedEvent(log.data);
        return {
          id: String(log.topics[1]).toLowerCase(),
          contributor: Core.topicToAddress(log.topics[2]),
          receiver: Core.topicToAddress(log.topics[3]),
          epoch: decoded.epoch,
          confirmedAt: decoded.confirmedAt,
          transactionHash: log.transactionHash
        };
      })
      .sort((a, b) => Number(b.confirmedAt - a.confirmedAt));
    renderHistory(logs);
  }

  function renderHistory(logs) {
    elements.ledger.replaceChildren();
    if (!logs.length) {
      const empty = document.createElement("p");
      empty.className = "ledger-empty";
      empty.textContent = "No confirmed encounters involving this wallet yet.";
      elements.ledger.appendChild(empty);
      return;
    }
    const records = readLocalRecords();
    logs.forEach(log => {
      const record = records[log.id];
      const contributed = log.contributor === state.account;
      const row = document.createElement("article");
      row.className = "ledger-row";

      const role = document.createElement("span");
      role.className = `ledger-role ${contributed ? "contributor" : "receiver"}`;
      role.textContent = contributed ? "+1" : "R";
      role.title = contributed ? "Contributor +1" : "Receiver (neutral)";

      const copy = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = record?.statement || (contributed
        ? `Contribution confirmed by ${Core.shortAddress(log.receiver)}`
        : `Contribution from ${Core.shortAddress(log.contributor)}`);
      const detail = document.createElement("p");
      const counterpart = contributed ? log.receiver : log.contributor;
      detail.textContent = `${contributed ? "To" : "From"} ${Core.shortAddress(counterpart)} · ${contributed ? "credited +1" : "receiver stayed neutral"}`;
      copy.append(title, detail);

      const meta = document.createElement("div");
      meta.className = "ledger-meta";
      const date = document.createElement("strong");
      date.textContent = new Date(Number(log.confirmedAt) * 1000).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC";
      const link = document.createElement("a");
      link.className = "text-link";
      link.href = txUrl(log.transactionHash);
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Etherscan";
      meta.append(date, link);
      row.append(role, copy, meta);
      elements.ledger.appendChild(row);
    });
  }

  async function initializeWallet() {
    if (!ethereum) {
      renderConnection();
      return;
    }
    try {
      const [chainId, accounts] = await Promise.all([
        ethereum.request({ method: "eth_chainId" }),
        ethereum.request({ method: "eth_accounts" })
      ]);
      state.chainId = chainId;
      state.account = accounts[0] ? Core.normalizeAddress(accounts[0]) : null;
    } catch (error) {
      reportError(error);
    }
    renderConnection();
  }

  function handleHash() {
    const hash = window.location.hash.replace(/^#/, "");
    const invite = new URLSearchParams(hash).get("invite");
    if (invite) {
      if (invite !== state.reviewToken) loadInvite(invite, false);
      else setRoute("encounter", false);
      return;
    }
    setRoute(hash || "encounter", false);
  }

  function bindEvents() {
    document.querySelectorAll("[data-route]").forEach(control => {
      control.addEventListener("click", event => {
        event.preventDefault();
        setRoute(control.dataset.route, true);
      });
    });
    document.querySelectorAll("[data-close-dialog]").forEach(button => {
      button.addEventListener("click", () => {
        const dialog = $(button.dataset.closeDialog);
        if (dialog === elements.scannerDialog) stopScanner();
        else if (dialog?.open) dialog.close();
      });
    });
    elements.connectButton.addEventListener("click", connectWallet);
    elements.encounterForm.addEventListener("submit", proposeEncounter);
    elements.statement.addEventListener("input", () => {
      elements.statementCount.textContent = `${elements.statement.value.length} / 280`;
    });
    elements.pasteAddressButton.addEventListener("click", async () => {
      try {
        elements.receiverAddress.value = (await navigator.clipboard.readText()).trim();
      } catch (_error) {
        showToast("Clipboard reading was blocked. Paste the address into the field manually.", true);
      }
    });
    elements.copyLinkButton.addEventListener("click", () => copyText(state.lastInvite?.link, "Private invite link copied.").catch(reportError));
    elements.modalCopyLinkButton.addEventListener("click", () => copyText(state.lastInvite?.link, "Private invite link copied.").catch(reportError));
    elements.copyAddressButton.addEventListener("click", () => copyText(state.lastInvite?.receiver, "Receiver address copied.").catch(reportError));
    elements.showQrButton.addEventListener("click", () => {
      try { renderQrCode(); } catch (error) { reportError(error); }
    });
    elements.cancelButton.addEventListener("click", cancelInvite);
    elements.openInviteForm.addEventListener("submit", event => {
      event.preventDefault();
      loadInvite(elements.inviteLinkInput.value, true);
    });
    elements.confirmButton.addEventListener("click", () => respondToInvite(true));
    elements.declineButton.addEventListener("click", () => respondToInvite(false));
    elements.scanQrButton.addEventListener("click", startScanner);
    elements.stopScannerButton.addEventListener("click", () => stopScanner());
    elements.scannerDialog.addEventListener("close", () => stopScanner(false));
    elements.genesisForm.addEventListener("submit", depositGenesis);
    elements.poolForm.addEventListener("submit", seedPool);
    elements.budgetForm.addEventListener("submit", setBudget);
    elements.closeForm.addEventListener("submit", setClose);
    elements.finalizeButton.addEventListener("click", finalizeEpoch);
    elements.refreshClaimsButton.addEventListener("click", () => refreshClaims().catch(reportError));
    elements.refreshHistoryButton.addEventListener("click", () => refreshHistory().catch(reportError));
    elements.claimList.addEventListener("click", event => {
      const button = event.target.closest("[data-claim-epoch]");
      if (button) claimEpoch(BigInt(button.dataset.claimEpoch));
    });
    window.addEventListener("hashchange", handleHash);

    if (ethereum?.on) {
      ethereum.on("accountsChanged", async accounts => {
        state.account = accounts[0] ? Core.normalizeAddress(accounts[0]) : null;
        state.lastInvite = null;
        renderConnection();
        await refreshAll().catch(reportError);
        if (state.reviewHeader) await verifyReview();
      });
      ethereum.on("chainChanged", async chainId => {
        state.chainId = chainId;
        state.contractVerified = false;
        renderConnection();
        await refreshAll().catch(reportError);
        if (state.reviewHeader) await verifyReview();
      });
    }
  }

  async function initialize() {
    if (!Core || !config) throw new Error("GameOver configuration failed to load.");
    bindEvents();
    handleHash();
    await initializeWallet();
    await refreshAll();
    if (state.reviewHeader) await verifyReview();
    window.setInterval(tickCountdown, 1000);
    updateControls();
  }

  initialize().catch(reportError);
})();
