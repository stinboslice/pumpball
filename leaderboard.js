"use strict";

/**
 * PumpBall leaderboard service.
 *
 * Current implementation:
 * - Uses localStorage for development.
 * - Separates all records by tournament ID and season.
 * - Preserves historical tournament records.
 * - Counts every completed attempt.
 * - Replaces a player's leaderboard score only when the new score is higher.
 *
 * Future database connection:
 * - Replace LocalLeaderboardAdapter with a Supabase adapter.
 * - The public PumpBallLeaderboard API can remain unchanged.
 */

(() => {
  const CONFIG = window.PUMPBALL_CONFIG;
  const UTILS = window.PUMPBALL_UTILS;

  if (!CONFIG) {
    throw new Error(
      "PumpBall leaderboard could not load because config.js is missing."
    );
  }

  const STORAGE_KEYS = {
    leaderboardData: "pumpball-leaderboard-data-v1",
    developmentPlayerId: "pumpball-development-player-id",
    developmentPlayerName: "pumpball-development-player-name"
  };

  const state = {
    initialized: false,
    loading: false,
    adapter: null,

    activeTournamentKey: null,
    currentPlayerId: null,
    currentPlayerName: null,

    entries: [],
    latestError: null
  };

  const dom = {
    body: null,
    feedback: null,
    refreshButton: null,

    playerRank: null,
    playerBestScore: null,
    playerAttemptCount: null,

    personalBestDisplay: null,
    leaderboardSeasonLabel: null
  };

  /**
   * Create the permanent storage key for one tournament season.
   *
   * Historical seasons remain stored under their own keys.
   */
  function getTournamentKey() {
    const tournament = CONFIG.tournament;

    return [
      tournament.id,
      `season-${tournament.season}`
    ].join("::");
  }

  function getActiveTournamentMetadata() {
    return {
      id: CONFIG.tournament.id,
      season: CONFIG.tournament.season,
      slug: CONFIG.tournament.slug,
      name: CONFIG.tournament.name
    };
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createId(prefix = "id") {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }

    return [
      prefix,
      Date.now().toString(36),
      Math.random().toString(36).slice(2, 10)
    ].join("-");
  }

  function safeJsonParse(value, fallback) {
    if (!value) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(value);

      return parsed ?? fallback;
    } catch (error) {
      console.warn(
        "[PumpBall Leaderboard] Stored data could not be parsed:",
        error
      );

      return fallback;
    }
  }

  function readStorage() {
    const raw = localStorage.getItem(
      STORAGE_KEYS.leaderboardData
    );

    const parsed = safeJsonParse(raw, {
      version: 1,
      tournaments: {}
    });

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.tournaments ||
      typeof parsed.tournaments !== "object"
    ) {
      return {
        version: 1,
        tournaments: {}
      };
    }

    return parsed;
  }

  function writeStorage(storage) {
    localStorage.setItem(
      STORAGE_KEYS.leaderboardData,
      JSON.stringify(storage)
    );
  }

  function normalizeScore(value) {
    const score = Number(value);

    if (!Number.isFinite(score)) {
      return 0;
    }

    return Math.max(0, Math.floor(score));
  }

  function normalizeAttempts(value) {
    const attempts = Number(value);

    if (!Number.isFinite(attempts)) {
      return 0;
    }

    return Math.max(0, Math.floor(attempts));
  }

  function normalizeEntry(rawEntry) {
    if (!rawEntry || typeof rawEntry !== "object") {
      return null;
    }

    const playerId = String(
      rawEntry.playerId || ""
    ).trim();

    if (!playerId) {
      return null;
    }

    return {
      playerId,

      playerName:
        String(
          rawEntry.playerName ||
          formatPlayerName(playerId)
        ).trim(),

      bestScore: normalizeScore(
        rawEntry.bestScore
      ),

      attemptCount: normalizeAttempts(
        rawEntry.attemptCount
      ),

      bestScoreAchievedAt:
        typeof rawEntry.bestScoreAchievedAt === "string"
          ? rawEntry.bestScoreAchievedAt
          : null,

      lastAttemptAt:
        typeof rawEntry.lastAttemptAt === "string"
          ? rawEntry.lastAttemptAt
          : null,

      firstAttemptAt:
        typeof rawEntry.firstAttemptAt === "string"
          ? rawEntry.firstAttemptAt
          : null,

      bestSessionId:
        typeof rawEntry.bestSessionId === "string"
          ? rawEntry.bestSessionId
          : null,

      lastSessionId:
        typeof rawEntry.lastSessionId === "string"
          ? rawEntry.lastSessionId
          : null,

      verified: Boolean(rawEntry.verified),

      tournamentId:
        String(
          rawEntry.tournamentId ||
          CONFIG.tournament.id
        ),

      tournamentSeason:
        Number(
          rawEntry.tournamentSeason ||
          CONFIG.tournament.season
        )
    };
  }

  function sortEntries(entries) {
    return [...entries].sort((a, b) => {
      /*
       * Primary ranking:
       * Highest score first.
       */
      if (b.bestScore !== a.bestScore) {
        return b.bestScore - a.bestScore;
      }

      /*
       * First configured tie breaker:
       * Fewer attempts.
       */
      if (a.attemptCount !== b.attemptCount) {
        return a.attemptCount - b.attemptCount;
      }

      /*
       * Second configured tie breaker:
       * Earlier time that the best score was achieved.
       */
      const aBestTime = a.bestScoreAchievedAt
        ? new Date(a.bestScoreAchievedAt).getTime()
        : Number.MAX_SAFE_INTEGER;

      const bBestTime = b.bestScoreAchievedAt
        ? new Date(b.bestScoreAchievedAt).getTime()
        : Number.MAX_SAFE_INTEGER;

      if (aBestTime !== bBestTime) {
        return aBestTime - bBestTime;
      }

      /*
       * Final deterministic fallback.
       */
      return a.playerId.localeCompare(
        b.playerId
      );
    });
  }

  function formatScore(score) {
    const normalized = normalizeScore(score);

    if (
      UTILS &&
      typeof UTILS.formatScore === "function"
    ) {
      return UTILS.formatScore(normalized);
    }

    return normalized.toLocaleString("en-US");
  }

  function shortenWallet(address) {
    const value = String(address || "");

    if (
      UTILS &&
      typeof UTILS.formatWallet === "function"
    ) {
      return UTILS.formatWallet(value);
    }

    if (value.length <= 12) {
      return value;
    }

    return `${value.slice(0, 4)}…${value.slice(-4)}`;
  }

  function formatPlayerName(playerId) {
    if (!playerId) {
      return "Anonymous";
    }

    if (playerId.startsWith("local-player-")) {
      return "Test Player";
    }

    return shortenWallet(playerId);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function emit(name, detail = {}) {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail
      })
    );
  }

  function resolveCurrentPlayer() {
    const paymentState =
      window.PumpBallPayments &&
      typeof window.PumpBallPayments.getState === "function"
        ? window.PumpBallPayments.getState()
        : null;

    if (paymentState?.walletAddress) {
      state.currentPlayerId =
        paymentState.walletAddress;

      state.currentPlayerName =
        shortenWallet(paymentState.walletAddress);

      return;
    }

    let developmentPlayerId =
      localStorage.getItem(
        STORAGE_KEYS.developmentPlayerId
      );

    if (!developmentPlayerId) {
      developmentPlayerId =
        createId("local-player");

      localStorage.setItem(
        STORAGE_KEYS.developmentPlayerId,
        developmentPlayerId
      );
    }

    const storedName =
      localStorage.getItem(
        STORAGE_KEYS.developmentPlayerName
      );

    state.currentPlayerId =
      developmentPlayerId;

    state.currentPlayerName =
      storedName || "Test Player";
  }

  /**
   * Local development adapter.
   *
   * A future Supabase adapter should expose the same methods:
   *
   * loadTournament()
   * submitAttempt()
   * getTournamentHistory()
   */
  class LocalLeaderboardAdapter {
    async loadTournament(tournamentKey) {
      const storage = readStorage();

      const tournament =
        storage.tournaments[tournamentKey];

      if (!tournament) {
        return [];
      }

      return Array.isArray(tournament.entries)
        ? tournament.entries
            .map(normalizeEntry)
            .filter(Boolean)
        : [];
    }

    async submitAttempt({
      tournamentKey,
      tournament,
      playerId,
      playerName,
      score,
      sessionId,
      verified
    }) {
      const storage = readStorage();
      const timestamp = nowIso();

      if (!storage.tournaments[tournamentKey]) {
        storage.tournaments[tournamentKey] = {
          tournament,
          createdAt: timestamp,
          updatedAt: timestamp,
          entries: []
        };
      }

      const tournamentRecord =
        storage.tournaments[tournamentKey];

      const entries = Array.isArray(
        tournamentRecord.entries
      )
        ? tournamentRecord.entries
            .map(normalizeEntry)
            .filter(Boolean)
        : [];

      const existingIndex =
        entries.findIndex(
          (entry) => entry.playerId === playerId
        );

      const normalizedScore =
        normalizeScore(score);

      let improved = false;
      let entry;

      if (existingIndex === -1) {
        entry = {
          playerId,
          playerName:
            playerName || formatPlayerName(playerId),

          bestScore: normalizedScore,
          attemptCount: 1,

          firstAttemptAt: timestamp,
          lastAttemptAt: timestamp,

          bestScoreAchievedAt: timestamp,

          bestSessionId: sessionId || null,
          lastSessionId: sessionId || null,

          verified: Boolean(verified),

          tournamentId: tournament.id,
          tournamentSeason: tournament.season
        };

        entries.push(entry);

        improved = normalizedScore > 0;
      } else {
        const previous = entries[existingIndex];

        entry = {
          ...previous,

          playerName:
            playerName ||
            previous.playerName ||
            formatPlayerName(playerId),

          /*
           * Every valid completed game increases attempts.
           */
          attemptCount:
            normalizeAttempts(
              previous.attemptCount
            ) + 1,

          lastAttemptAt: timestamp,
          lastSessionId: sessionId || null,

          /*
           * Once a record is verified, do not downgrade it.
           */
          verified:
            Boolean(previous.verified) ||
            Boolean(verified)
        };

        /*
         * Only replace leaderboard score when strictly higher.
         *
         * An equal or lower score:
         * - does not replace bestScore
         * - does not replace bestSessionId
         * - does not replace bestScoreAchievedAt
         */
        if (
          normalizedScore >
          normalizeScore(previous.bestScore)
        ) {
          entry.bestScore = normalizedScore;
          entry.bestSessionId =
            sessionId || null;
          entry.bestScoreAchievedAt =
            timestamp;

          improved = true;
        }

        entries[existingIndex] = entry;
      }

      tournamentRecord.entries =
        sortEntries(entries);

      tournamentRecord.updatedAt =
        timestamp;

      storage.tournaments[tournamentKey] =
        tournamentRecord;

      writeStorage(storage);

      return {
        entry,
        improved,
        previousBest:
          existingIndex === -1
            ? 0
            : normalizeScore(
                entries.find(
                  (item) =>
                    item.playerId === playerId
                )?.bestScore
              ),
        entries:
          tournamentRecord.entries
      };
    }

    async getTournamentHistory() {
      const storage = readStorage();

      return Object.entries(
        storage.tournaments
      ).map(([key, value]) => ({
        key,
        ...value
      }));
    }
  }

  function cacheDom() {
    dom.body =
      document.getElementById(
        "leaderboard-body"
      );

    dom.feedback =
      document.getElementById(
        "leaderboard-feedback"
      );

    dom.refreshButton =
      document.getElementById(
        "refresh-leaderboard-button"
      );

    dom.playerRank =
      document.getElementById(
        "player-rank"
      );

    dom.playerBestScore =
      document.getElementById(
        "player-best-score"
      );

    dom.playerAttemptCount =
      document.getElementById(
        "player-attempt-count"
      );

    dom.personalBestDisplay =
      document.getElementById(
        "personal-best-display"
      );

    dom.leaderboardSeasonLabel =
      document.getElementById(
        "leaderboard-season-label"
      );
  }

  function setFeedback(
    message = "",
    type = "neutral"
  ) {
    if (!dom.feedback) {
      return;
    }

    dom.feedback.textContent = message;
    dom.feedback.dataset.type = type;
  }

  function getCurrentPlayerEntry() {
    return (
      state.entries.find(
        (entry) =>
          entry.playerId ===
          state.currentPlayerId
      ) || null
    );
  }

  function getCurrentPlayerRank() {
    const index = state.entries.findIndex(
      (entry) =>
        entry.playerId ===
        state.currentPlayerId
    );

    return index === -1
      ? null
      : index + 1;
  }

  function renderPlayerSummary() {
    const entry = getCurrentPlayerEntry();
    const rank = getCurrentPlayerRank();

    const bestScore =
      entry?.bestScore || 0;

    const attemptCount =
      entry?.attemptCount || 0;

    if (dom.playerRank) {
      dom.playerRank.textContent =
        rank ? `#${rank}` : "—";
    }

    if (dom.playerBestScore) {
      dom.playerBestScore.textContent =
        formatScore(bestScore);
    }

    if (dom.playerAttemptCount) {
      dom.playerAttemptCount.textContent =
        String(attemptCount);
    }

    if (dom.personalBestDisplay) {
      dom.personalBestDisplay.textContent =
        formatScore(bestScore);
    }
  }

  function renderLeaderboard() {
    if (!dom.body) {
      return;
    }

    const entries = sortEntries(
      state.entries
    );

    if (entries.length === 0) {
      dom.body.innerHTML = `
        <tr class="leaderboard-empty-row">
          <td colspan="3">
            No verified scores for
            ${escapeHtml(CONFIG.tournament.name)}
            yet.
          </td>
        </tr>
      `;

      renderPlayerSummary();
      return;
    }

    dom.body.innerHTML =
      entries
        .map((entry, index) => {
          const rank = index + 1;

          const isCurrentPlayer =
            entry.playerId ===
            state.currentPlayerId;

          const rowClass =
            isCurrentPlayer
              ? "leaderboard-row is-current-player"
              : "leaderboard-row";

          return `
            <tr class="${rowClass}">
              <td class="leaderboard-rank">
                ${rank}
              </td>

              <td class="leaderboard-player">
                <span class="leaderboard-player-name">
                  ${escapeHtml(
                    entry.playerName ||
                    formatPlayerName(
                      entry.playerId
                    )
                  )}
                </span>

                ${
                  isCurrentPlayer
                    ? `
                      <span
                        class="leaderboard-you-label"
                      >
                        You
                      </span>
                    `
                    : ""
                }
              </td>

              <td class="leaderboard-score">
                ${escapeHtml(
                  formatScore(entry.bestScore)
                )}
              </td>
            </tr>
          `;
        })
        .join("");

    renderPlayerSummary();
  }

  async function refresh() {
    if (state.loading) {
      return state.entries;
    }

    state.loading = true;
    state.latestError = null;

    if (dom.refreshButton) {
      dom.refreshButton.disabled = true;
      dom.refreshButton.setAttribute(
        "aria-busy",
        "true"
      );
    }

    setFeedback(
      "Refreshing standings…",
      "loading"
    );

    try {
      resolveCurrentPlayer();

      const entries =
        await state.adapter.loadTournament(
          state.activeTournamentKey
        );

      state.entries =
        sortEntries(entries);

      renderLeaderboard();

      setFeedback(
        state.entries.length
          ? "Standings updated."
          : "",
        "success"
      );

      emit(
        "pumpball:leaderboard-refreshed",
        {
          entries: [...state.entries],
          tournament:
            getActiveTournamentMetadata()
        }
      );

      return [...state.entries];
    } catch (error) {
      state.latestError = error;

      setFeedback(
        "The leaderboard could not be refreshed.",
        "error"
      );

      emit(
        "pumpball:leaderboard-error",
        {
          message: error.message
        }
      );

      throw error;
    } finally {
      state.loading = false;

      if (dom.refreshButton) {
        dom.refreshButton.disabled = false;
        dom.refreshButton.removeAttribute(
          "aria-busy"
        );
      }
    }
  }

  /**
   * Submit one completed game.
   *
   * Every accepted submission increments attempts.
   * The visible leaderboard score changes only if the score is higher.
   */
  async function submitScore({
    score,
    sessionId,
    playerId = null,
    playerName = null,
    verified = false
  } = {}) {
    if (!state.initialized) {
      await initialize();
    }

    const normalizedScore =
      normalizeScore(score);

    if (
      typeof sessionId !== "string" ||
      sessionId.trim().length < 5
    ) {
      throw new Error(
        "A valid game session ID is required."
      );
    }

    resolveCurrentPlayer();

    const resolvedPlayerId =
      playerId ||
      state.currentPlayerId;

    const resolvedPlayerName =
      playerName ||
      state.currentPlayerName ||
      formatPlayerName(resolvedPlayerId);

    if (!resolvedPlayerId) {
      throw new Error(
        "A player ID is required to submit a score."
      );
    }

    const existingEntry =
      state.entries.find(
        (entry) =>
          entry.playerId ===
          resolvedPlayerId
      );

    const previousBest =
      existingEntry?.bestScore || 0;

    setFeedback(
      "Recording attempt…",
      "loading"
    );

    try {
      const result =
        await state.adapter.submitAttempt({
          tournamentKey:
            state.activeTournamentKey,

          tournament:
            getActiveTournamentMetadata(),

          playerId:
            resolvedPlayerId,

          playerName:
            resolvedPlayerName,

          score:
            normalizedScore,

          sessionId:
            sessionId.trim(),

          verified:
            Boolean(verified)
        });

      state.entries =
        sortEntries(result.entries);

      renderLeaderboard();

      const rank =
        state.entries.findIndex(
          (entry) =>
            entry.playerId ===
            resolvedPlayerId
        ) + 1;

      if (result.improved) {
        setFeedback(
          `New personal best: ${formatScore(
            normalizedScore
          )}`,
          "success"
        );

        emit(
          "pumpball:personal-best",
          {
            score: normalizedScore,
            previousBest,
            rank,
            sessionId,
            tournament:
              getActiveTournamentMetadata()
          }
        );
      } else {
        setFeedback(
          `Attempt recorded. Best remains ${formatScore(
            previousBest
          )}.`,
          "neutral"
        );
      }

      emit(
        "pumpball:score-submitted",
        {
          score: normalizedScore,
          previousBest,
          improved: result.improved,
          rank,
          entry: result.entry,
          sessionId,
          tournament:
            getActiveTournamentMetadata()
        }
      );

      return {
        score: normalizedScore,
        previousBest,
        improved: result.improved,
        rank,
        entry: result.entry
      };
    } catch (error) {
      state.latestError = error;

      setFeedback(
        "The score could not be recorded.",
        "error"
      );

      emit(
        "pumpball:leaderboard-error",
        {
          message: error.message
        }
      );

      throw error;
    }
  }

  function getLeaderboard({
    limit = null
  } = {}) {
    const entries =
      sortEntries(state.entries);

    if (
      Number.isInteger(limit) &&
      limit > 0
    ) {
      return entries.slice(0, limit);
    }

    return entries;
  }

  function getPlayerSummary(
    playerId = state.currentPlayerId
  ) {
    const entries =
      sortEntries(state.entries);

    const index =
      entries.findIndex(
        (entry) =>
          entry.playerId === playerId
      );

    const entry =
      index >= 0
        ? entries[index]
        : null;

    return {
      playerId,
      rank:
        index >= 0
          ? index + 1
          : null,

      bestScore:
        entry?.bestScore || 0,

      attemptCount:
        entry?.attemptCount || 0,

      entry
    };
  }

  function setDevelopmentPlayerName(name) {
    const normalizedName =
      String(name || "")
        .trim()
        .slice(0, 24);

    if (!normalizedName) {
      throw new Error(
        "Player name cannot be empty."
      );
    }

    localStorage.setItem(
      STORAGE_KEYS.developmentPlayerName,
      normalizedName
    );

    state.currentPlayerName =
      normalizedName;

    return normalizedName;
  }

  async function getTournamentHistory() {
    return state.adapter
      .getTournamentHistory();
  }

  function getState() {
    return {
      initialized:
        state.initialized,

      loading:
        state.loading,

      tournamentKey:
        state.activeTournamentKey,

      tournament:
        getActiveTournamentMetadata(),

      currentPlayerId:
        state.currentPlayerId,

      currentPlayerName:
        state.currentPlayerName,

      leaderboard:
        getLeaderboard(),

      player:
        getPlayerSummary(),

      latestError:
        state.latestError
          ? state.latestError.message
          : null,

      storageMode:
        "local"
    };
  }

  function bindEvents() {
    dom.refreshButton?.addEventListener(
      "click",
      () => {
        refresh().catch((error) => {
          console.error(
            "[PumpBall Leaderboard]",
            error
          );
        });
      }
    );

    window.addEventListener(
      "pumpball:wallet-connected",
      () => {
        resolveCurrentPlayer();

        refresh().catch((error) => {
          console.error(
            "[PumpBall Leaderboard]",
            error
          );
        });
      }
    );

    window.addEventListener(
      "pumpball:wallet-disconnected",
      () => {
        resolveCurrentPlayer();

        refresh().catch((error) => {
          console.error(
            "[PumpBall Leaderboard]",
            error
          );
        });
      }
    );
  }

  async function initialize() {
    if (state.initialized) {
      return getState();
    }

    cacheDom();

    state.activeTournamentKey =
      getTournamentKey();

    state.adapter =
      new LocalLeaderboardAdapter();

    resolveCurrentPlayer();
    bindEvents();

    if (dom.leaderboardSeasonLabel) {
      dom.leaderboardSeasonLabel.textContent =
        `${CONFIG.tournament.name} standings`;
    }

    state.initialized = true;

    await refresh();

    emit(
      "pumpball:leaderboard-ready",
      {
        state: getState()
      }
    );

    return getState();
  }

  window.PumpBallLeaderboard =
    Object.freeze({
      initialize,
      refresh,
      submitScore,

      getLeaderboard,
      getPlayerSummary,
      getTournamentHistory,
      getState,

      setDevelopmentPlayerName
    });

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      initialize().catch((error) => {
        console.error(
          "[PumpBall Leaderboard] Initialization failed:",
          error
        );
      });
    },
    {
      once: true
    }
  );
})();
