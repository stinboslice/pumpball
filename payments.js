"use strict";

/**
 * PumpBall payment and play-credit service.
 *
 * Development mode:
 * - Creates local test credits.
 * - Does not request or transfer real SOL.
 *
 * Production mode:
 * - Will create a Solana transfer transaction.
 * - Will verify the transaction before issuing a play credit.
 *
 * Public interface:
 *
 * window.PumpBallPayments.initialize()
 * window.PumpBallPayments.connectWallet()
 * window.PumpBallPayments.disconnectWallet()
 * window.PumpBallPayments.purchasePlay()
 * window.PumpBallPayments.createTestPlayCredit()
 * window.PumpBallPayments.consumePlayCredit()
 * window.PumpBallPayments.getAvailablePlayCredits()
 * window.PumpBallPayments.getState()
 */

(() => {
  const CONFIG = window.PUMPBALL_CONFIG;
  const UTILS = window.PUMPBALL_UTILS;

  if (!CONFIG || !UTILS) {
    throw new Error(
      "PumpBall payments could not load because config.js is missing."
    );
  }

  const STORAGE_KEYS = {
    testCredits: "pumpball-test-play-credits",
    consumedCredits: "pumpball-consumed-play-credits",
    usedTransactions: "pumpball-used-transactions",
    walletAddress: "pumpball-wallet-address"
  };

  const state = {
    initialized: false,
    busy: false,

    walletConnected: false,
    walletAddress: null,
    walletProvider: null,

    availableCredits: [],
    consumedCredits: [],
    usedTransactions: [],

    latestTransactionSignature: null,
    latestError: null
  };

  function getTournament() {
    return CONFIG.tournament;
  }

  function getPaymentSettings() {
    return CONFIG.payments;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function safeJsonParse(value, fallback) {
    try {
      const parsed = JSON.parse(value);
      return parsed ?? fallback;
    } catch (error) {
      console.warn(
        "[PumpBall Payments] Invalid stored JSON:",
        error
      );

      return fallback;
    }
  }

  function loadArrayFromStorage(key) {
    const value = localStorage.getItem(key);

    if (!value) {
      return [];
    }

    const parsed = safeJsonParse(value, []);

    return Array.isArray(parsed) ? parsed : [];
  }

  function saveArrayToStorage(key, value) {
    localStorage.setItem(
      key,
      JSON.stringify(Array.isArray(value) ? value : [])
    );
  }

  function emit(name, detail = {}) {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail
      })
    );
  }

  function createId(prefix) {
    const randomPart = Math.random()
      .toString(36)
      .slice(2, 10);

    const timestampPart = Date.now().toString(36);

    return `${prefix}-${timestampPart}-${randomPart}`;
  }

  function createTournamentReference() {
    const tournament = getTournament();

    return [
      "pumpball",
      tournament.id,
      tournament.season,
      Date.now().toString(36)
    ].join(":");
  }

  function getExpectedPayment() {
    const tournament = getTournament();
    const paymentSettings = getPaymentSettings();

    return {
      tournamentId: tournament.id,
      tournamentSeason: tournament.season,

      treasuryWallet: paymentSettings.treasuryWallet,

      amountSol: tournament.entryPriceSol,
      amountLamports: tournament.entryPriceLamports,

      currency: paymentSettings.currency,
      network: paymentSettings.network
    };
  }

  function normalizeCredit(rawCredit) {
    if (!rawCredit || typeof rawCredit !== "object") {
      return null;
    }

    return {
      id: String(rawCredit.id || ""),
      tournamentId: String(rawCredit.tournamentId || ""),
      tournamentSeason: Number(rawCredit.tournamentSeason || 0),

      walletAddress:
        typeof rawCredit.walletAddress === "string"
          ? rawCredit.walletAddress
          : null,

      transactionSignature:
        typeof rawCredit.transactionSignature === "string"
          ? rawCredit.transactionSignature
          : null,

      tournamentReference:
        typeof rawCredit.tournamentReference === "string"
          ? rawCredit.tournamentReference
          : null,

      amountSol: Number(rawCredit.amountSol || 0),
      amountLamports: Number(rawCredit.amountLamports || 0),

      type: rawCredit.type === "paid" ? "paid" : "test",

      createdAt:
        typeof rawCredit.createdAt === "string"
          ? rawCredit.createdAt
          : nowIso(),

      expiresAt:
        typeof rawCredit.expiresAt === "string"
          ? rawCredit.expiresAt
          : null,

      consumedAt:
        typeof rawCredit.consumedAt === "string"
          ? rawCredit.consumedAt
          : null,

      sessionId:
        typeof rawCredit.sessionId === "string"
          ? rawCredit.sessionId
          : null,

      consumed: Boolean(rawCredit.consumed)
    };
  }

  function loadState() {
    state.availableCredits = loadArrayFromStorage(
      STORAGE_KEYS.testCredits
    )
      .map(normalizeCredit)
      .filter(Boolean);

    state.consumedCredits = loadArrayFromStorage(
      STORAGE_KEYS.consumedCredits
    )
      .map(normalizeCredit)
      .filter(Boolean);

    state.usedTransactions = loadArrayFromStorage(
      STORAGE_KEYS.usedTransactions
    ).filter((value) => typeof value === "string");

    const storedWallet = localStorage.getItem(
      STORAGE_KEYS.walletAddress
    );

    if (storedWallet) {
      state.walletAddress = storedWallet;
    }

    removeExpiredCredits();
  }

  function saveState() {
    saveArrayToStorage(
      STORAGE_KEYS.testCredits,
      state.availableCredits
    );

    saveArrayToStorage(
      STORAGE_KEYS.consumedCredits,
      state.consumedCredits
    );

    saveArrayToStorage(
      STORAGE_KEYS.usedTransactions,
      state.usedTransactions
    );

    if (state.walletAddress) {
      localStorage.setItem(
        STORAGE_KEYS.walletAddress,
        state.walletAddress
      );
    } else {
      localStorage.removeItem(
        STORAGE_KEYS.walletAddress
      );
    }
  }

  function isCreditForCurrentTournament(credit) {
    const tournament = getTournament();

    return (
      credit.tournamentId === tournament.id &&
      credit.tournamentSeason === tournament.season
    );
  }

  function isCreditExpired(credit) {
    if (!credit.expiresAt) {
      return false;
    }

    return (
      new Date(credit.expiresAt).getTime() <= Date.now()
    );
  }

  function removeExpiredCredits() {
    const beforeCount = state.availableCredits.length;

    state.availableCredits = state.availableCredits.filter(
      (credit) => (
        !credit.consumed &&
        !isCreditExpired(credit)
      )
    );

    if (state.availableCredits.length !== beforeCount) {
      saveState();
    }
  }

  function getAvailablePlayCredits() {
    removeExpiredCredits();

    return state.availableCredits.filter(
      (credit) => (
        !credit.consumed &&
        isCreditForCurrentTournament(credit)
      )
    );
  }

  function getAvailablePlayCreditCount() {
    return getAvailablePlayCredits().length;
  }

  function findWalletProvider() {
    const candidates = [
      window.phantom?.solana,
      window.solflare,
      window.solana
    ];

    return candidates.find(
      (provider) => (
        provider &&
        typeof provider.connect === "function"
      )
    ) || null;
  }

  async function connectWallet() {
    if (state.busy) {
      return null;
    }

    state.busy = true;
    state.latestError = null;

    emit("pumpball:wallet-connecting");

    try {
      const provider = findWalletProvider();

      if (!provider) {
        throw new Error(
          "No compatible Solana wallet was found. Install Phantom or Solflare."
        );
      }

      const response = await provider.connect();

      const publicKey =
        response?.publicKey ||
        provider.publicKey;

      if (!publicKey) {
        throw new Error(
          "The wallet connected but did not return a public address."
        );
      }

      state.walletProvider = provider;
      state.walletAddress = publicKey.toString();
      state.walletConnected = true;

      saveState();

      emit("pumpball:wallet-connected", {
        walletAddress: state.walletAddress,
        shortenedAddress: UTILS.formatWallet(
          state.walletAddress
        )
      });

      return state.walletAddress;
    } catch (error) {
      state.walletConnected = false;
      state.walletProvider = null;
      state.latestError = error;

      emit("pumpball:wallet-error", {
        message: error.message
      });

      throw error;
    } finally {
      state.busy = false;
    }
  }

  async function disconnectWallet() {
    if (
      state.walletProvider &&
      typeof state.walletProvider.disconnect === "function"
    ) {
      try {
        await state.walletProvider.disconnect();
      } catch (error) {
        console.warn(
          "[PumpBall Payments] Wallet disconnect warning:",
          error
        );
      }
    }

    state.walletConnected = false;
    state.walletProvider = null;
    state.walletAddress = null;

    saveState();

    emit("pumpball:wallet-disconnected");
  }

  function buildCredit({
    type,
    walletAddress,
    transactionSignature = null,
    tournamentReference = null
  }) {
    const tournament = getTournament();
    const expectedPayment = getExpectedPayment();

    const expirationDuration =
      CONFIG.payments.verification
        .transactionExpirationMs;

    return {
      id: createId("credit"),

      tournamentId: tournament.id,
      tournamentSeason: tournament.season,

      walletAddress,

      transactionSignature,
      tournamentReference,

      amountSol: expectedPayment.amountSol,
      amountLamports: expectedPayment.amountLamports,

      type,

      createdAt: nowIso(),
      expiresAt: new Date(
        Date.now() + expirationDuration
      ).toISOString(),

      consumedAt: null,
      sessionId: null,
      consumed: false
    };
  }

  function createTestPlayCredit() {
    if (!CONFIG.app.allowFreeTestGame) {
      throw new Error(
        "Free test games are currently disabled."
      );
    }

    if (!CONFIG.payments.testMode) {
      throw new Error(
        "Test payment mode is disabled."
      );
    }

    const credit = buildCredit({
      type: "test",
      walletAddress:
        state.walletAddress ||
        "development-test-player",
      tournamentReference:
        createTournamentReference()
    });

    state.availableCredits.push(credit);

    saveState();

    emit("pumpball:play-credit-created", {
      credit,
      availableCredits:
        getAvailablePlayCreditCount()
    });

    return credit;
  }

  function transactionHasBeenUsed(signature) {
    return state.usedTransactions.includes(signature);
  }

  function markTransactionUsed(signature) {
    if (!signature) {
      return;
    }

    if (!state.usedTransactions.includes(signature)) {
      state.usedTransactions.push(signature);
      saveState();
    }
  }

  function validatePaymentRecord(paymentRecord) {
    const expected = getExpectedPayment();

    if (!paymentRecord) {
      throw new Error(
        "No payment record was provided."
      );
    }

    if (
      CONFIG.payments.verification
        .preventDuplicateTransactions &&
      transactionHasBeenUsed(
        paymentRecord.transactionSignature
      )
    ) {
      throw new Error(
        "This transaction has already been used."
      );
    }

    if (
      CONFIG.payments.verification
        .requireExactRecipient &&
      paymentRecord.recipient !==
        expected.treasuryWallet
    ) {
      throw new Error(
        "The payment was sent to the wrong treasury wallet."
      );
    }

    if (
      CONFIG.payments.verification
        .requireExactAmount &&
      paymentRecord.amountLamports !==
        expected.amountLamports
    ) {
      throw new Error(
        `The payment must be exactly ${expected.amountSol} SOL.`
      );
    }

    if (
      CONFIG.payments.verification
        .requireTournamentReference &&
      paymentRecord.tournamentId !==
        expected.tournamentId
    ) {
      throw new Error(
        "The payment does not belong to the active tournament."
      );
    }

    if (
      paymentRecord.tournamentSeason !==
      expected.tournamentSeason
    ) {
      throw new Error(
        "The payment belongs to a different tournament season."
      );
    }

    if (!paymentRecord.confirmed) {
      throw new Error(
        "The payment has not been confirmed yet."
      );
    }

    return true;
  }

  async function createProductionTransaction() {
    /**
     * The actual Solana transaction will be implemented after we add
     * the Solana Web3 browser library.
     *
     * It will:
     *
     * 1. Request the active wallet.
     * 2. Create a SystemProgram.transfer instruction.
     * 3. Send exactly tournament.entryPriceLamports.
     * 4. Transfer to payments.treasuryWallet.
     * 5. Add a tournament reference.
     * 6. Ask the wallet to sign.
     * 7. Submit the transaction.
     * 8. Wait for confirmation.
     * 9. Verify the transaction independently.
     * 10. Issue one play credit.
     */

    throw new Error(
      "Real SOL payments are not enabled during development."
    );
  }

  async function purchasePlay() {
    if (state.busy) {
      throw new Error(
        "A payment request is already in progress."
      );
    }

    state.busy = true;
    state.latestError = null;

    emit("pumpball:payment-started", {
      expectedPayment: getExpectedPayment()
    });

    try {
      if (CONFIG.payments.testMode) {
        const credit = createTestPlayCredit();

        emit("pumpball:payment-completed", {
          testMode: true,
          credit
        });

        return credit;
      }

      if (!CONFIG.payments.enabled) {
        throw new Error(
          "Real payments are not currently enabled."
        );
      }

      if (!state.walletConnected) {
        await connectWallet();
      }

      const paymentRecord =
        await createProductionTransaction();

      validatePaymentRecord(paymentRecord);

      markTransactionUsed(
        paymentRecord.transactionSignature
      );

      const credit = buildCredit({
        type: "paid",
        walletAddress: state.walletAddress,
        transactionSignature:
          paymentRecord.transactionSignature,
        tournamentReference:
          paymentRecord.tournamentReference
      });

      state.availableCredits.push(credit);
      state.latestTransactionSignature =
        paymentRecord.transactionSignature;

      saveState();

      emit("pumpball:payment-completed", {
        testMode: false,
        credit,
        transactionSignature:
          paymentRecord.transactionSignature
      });

      return credit;
    } catch (error) {
      state.latestError = error;

      emit("pumpball:payment-error", {
        message: error.message
      });

      throw error;
    } finally {
      state.busy = false;
    }
  }

  function consumePlayCredit(sessionId) {
    if (
      typeof sessionId !== "string" ||
      sessionId.length < 5
    ) {
      throw new Error(
        "A valid game session ID is required."
      );
    }

    removeExpiredCredits();

    const creditIndex =
      state.availableCredits.findIndex(
        (credit) => (
          !credit.consumed &&
          isCreditForCurrentTournament(credit)
        )
      );

    if (creditIndex === -1) {
      throw new Error(
        "No valid play credit is available."
      );
    }

    const credit = {
      ...state.availableCredits[creditIndex],
      consumed: true,
      consumedAt: nowIso(),
      sessionId
    };

    state.availableCredits.splice(
      creditIndex,
      1
    );

    state.consumedCredits.push(credit);

    saveState();

    emit("pumpball:play-credit-consumed", {
      credit,
      availableCredits:
        getAvailablePlayCreditCount()
    });

    return credit;
  }

  function getCreditForSession(sessionId) {
    return (
      state.consumedCredits.find(
        (credit) => (
          credit.sessionId === sessionId &&
          isCreditForCurrentTournament(credit)
        )
      ) || null
    );
  }

  function hasValidCreditForSession(sessionId) {
    const credit = getCreditForSession(sessionId);

    return Boolean(
      credit &&
      credit.consumed &&
      !isCreditExpired(credit)
    );
  }

  function clearDevelopmentCredits() {
    if (!CONFIG.payments.testMode) {
      throw new Error(
        "Development credits cannot be cleared in production mode."
      );
    }

    state.availableCredits = state.availableCredits.filter(
      (credit) => credit.type !== "test"
    );

    state.consumedCredits = state.consumedCredits.filter(
      (credit) => credit.type !== "test"
    );

    saveState();

    emit("pumpball:test-credits-cleared");
  }

  function getState() {
    return {
      initialized: state.initialized,
      busy: state.busy,

      walletConnected: state.walletConnected,
      walletAddress: state.walletAddress,
      shortenedWalletAddress:
        state.walletAddress
          ? UTILS.formatWallet(state.walletAddress)
          : null,

      availablePlayCredits:
        getAvailablePlayCreditCount(),

      latestTransactionSignature:
        state.latestTransactionSignature,

      testMode: CONFIG.payments.testMode,
      paymentsEnabled:
        CONFIG.payments.enabled,

      expectedPayment:
        getExpectedPayment(),

      activeTournament: {
        id: CONFIG.tournament.id,
        season: CONFIG.tournament.season,
        name: CONFIG.tournament.name
      },

      latestError:
        state.latestError
          ? state.latestError.message
          : null
    };
  }

  function initialize() {
    if (state.initialized) {
      return getState();
    }

    loadState();

    state.initialized = true;

    emit("pumpball:payments-ready", {
      state: getState()
    });

    return getState();
  }

  window.PumpBallPayments = Object.freeze({
    initialize,

    connectWallet,
    disconnectWallet,

    purchasePlay,
    createTestPlayCredit,

    consumePlayCredit,
    getCreditForSession,
    hasValidCreditForSession,

    getAvailablePlayCredits,
    getAvailablePlayCreditCount,

    getExpectedPayment,
    getState,

    clearDevelopmentCredits
  });

  document.addEventListener(
    "DOMContentLoaded",
    initialize,
    {
      once: true
    }
  );
})();
