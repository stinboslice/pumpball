"use strict";

/**
 * PumpBall
 * Competitive three-ball browser pinball game.
 *
 * Dependencies loaded before this file:
 *   - Phaser 3.90+
 *   - config.js       -> window.PUMPBALL_CONFIG
 *   - payments.js     -> window.PumpBallPayments
 *   - leaderboard.js  -> window.PumpBallLeaderboard
 */

(() => {
  const CONFIG = window.PUMPBALL_CONFIG;
  const UTILS = window.PUMPBALL_UTILS || {};
  const Payments = window.PumpBallPayments;
  const Leaderboard = window.PumpBallLeaderboard;

  if (!CONFIG) {
    throw new Error(
      "PumpBall could not start because config.js is missing."
    );
  }

  if (!window.Phaser) {
    throw new Error(
      "PumpBall could not start because Phaser is missing."
    );
  }

  const WORLD = Object.freeze({
    width: Number(CONFIG.game?.width) || 720,
    height: Number(CONFIG.game?.height) || 1280
  });

  const DEPTH = Object.freeze({
    playfield: 0,
    decor: 4,
    mechanisms: 12,
    trail: 18,
    ball: 22,
    effects: 30,
    text: 40,
    flash: 100,
    debug: 200
  });

  const LABELS = Object.freeze({
    ball: "ball",
    wall: "wall",
    drain: "drain",
    bumper: "bumper",
    slingshotLeft: "slingshot-left",
    slingshotRight: "slingshot-right",
    reactor: "reactor",
    flipperLeft: "flipper-left",
    flipperRight: "flipper-right",
    launcherSupport: "launcher-support"
  });

  const runtime = {
    initialized: false,
    startingAttempt: false,

    game: null,
    scene: null,

    currentSessionId: null,
    currentCredit: null,

    latestError: null
  };

  const dom = {
    purchasePlayButton: null,
    freeTestButton: null,
    playAgainButton: null,
    returnToLeaderboardButton: null,
    connectWalletButton: null,

    gameOverlay: null,
    gameStartPanel: null,
    gameOverPanel: null,

    scoreDisplay: null,
    ballDisplay: null,
    personalBestDisplay: null,
    finalScoreDisplay: null,
    rankFeedback: null,
    playFeedback: null,

    walletStatus: null,
    tournamentStatus: null,

    entryPrice: null,
    prizePool: null,
    winnerCount: null,

    tournamentLabel: null,
    footerTournamentLabel: null,

    countdownDays: null,
    countdownHours: null,
    countdownMinutes: null,
    countdownSeconds: null
  };

  function cacheDom() {
    dom.purchasePlayButton =
      document.getElementById(
        "purchase-play-button"
      );

    dom.freeTestButton =
      document.getElementById(
        "free-test-button"
      );

    dom.playAgainButton =
      document.getElementById(
        "play-again-button"
      );

    dom.returnToLeaderboardButton =
      document.getElementById(
        "return-to-leaderboard-button"
      );

    dom.connectWalletButton =
      document.getElementById(
        "connect-wallet-button"
      );

    dom.gameOverlay =
      document.getElementById(
        "game-overlay"
      );

    dom.gameStartPanel =
      document.getElementById(
        "game-start-panel"
      );

    dom.gameOverPanel =
      document.getElementById(
        "game-over-panel"
      );

    dom.scoreDisplay =
      document.getElementById(
        "score-display"
      );

    dom.ballDisplay =
      document.getElementById(
        "ball-display"
      );

    dom.personalBestDisplay =
      document.getElementById(
        "personal-best-display"
      );

    dom.finalScoreDisplay =
      document.getElementById(
        "final-score-display"
      );

    dom.rankFeedback =
      document.getElementById(
        "rank-feedback"
      );

    dom.playFeedback =
      document.getElementById(
        "play-feedback"
      );

    dom.walletStatus =
      document.getElementById(
        "wallet-status"
      );

    dom.tournamentStatus =
      document.getElementById(
        "tournament-status"
      );

    dom.entryPrice =
      document.getElementById(
        "entry-price"
      );

    dom.prizePool =
      document.getElementById(
        "prize-pool"
      );

    dom.winnerCount =
      document.getElementById(
        "winner-count"
      );

    dom.tournamentLabel =
      document.getElementById(
        "tournament-label"
      );

    dom.footerTournamentLabel =
      document.getElementById(
        "footer-tournament-label"
      );

    dom.countdownDays =
      document.getElementById(
        "countdown-days"
      );

    dom.countdownHours =
      document.getElementById(
        "countdown-hours"
      );

    dom.countdownMinutes =
      document.getElementById(
        "countdown-minutes"
      );

    dom.countdownSeconds =
      document.getElementById(
        "countdown-seconds"
      );
  }

  function assetPath(file) {
    return `${
      CONFIG.assets?.basePath ||
      "assets/"
    }${file}`;
  }

  function requiredAsset(
    key,
    fallback
  ) {
    return (
      CONFIG.assets?.required?.[key] ||
      fallback
    );
  }

  function formatScore(value) {
    const score = Math.max(
      0,
      Math.floor(
        Number(value) || 0
      )
    );

    return typeof UTILS.formatScore ===
      "function"
      ? UTILS.formatScore(score)
      : score.toLocaleString("en-US");
  }

  function createSessionId() {
    if (
      typeof UTILS.generateSessionId ===
      "function"
    ) {
      return UTILS.generateSessionId();
    }

    if (
      window.crypto &&
      typeof window.crypto.randomUUID ===
        "function"
    ) {
      return `pb-${window.crypto.randomUUID()}`;
    }

    return `pb-${Date.now().toString(
      36
    )}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  function emit(
    name,
    detail = {}
  ) {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail
      })
    );
  }

  function setFeedback(
    message = "",
    type = "neutral"
  ) {
    if (!dom.playFeedback) {
      return;
    }

    dom.playFeedback.textContent =
      message;

    dom.playFeedback.dataset.type =
      type;
  }

  function setButtonsBusy(
    isBusy
  ) {
    [
      dom.purchasePlayButton,
      dom.freeTestButton,
      dom.playAgainButton,
      dom.connectWalletButton
    ].forEach((button) => {
      if (!button) {
        return;
      }

      button.disabled =
        Boolean(isBusy);

      if (isBusy) {
        button.setAttribute(
          "aria-busy",
          "true"
        );
      } else {
        button.removeAttribute(
          "aria-busy"
        );
      }
    });
  }

  function showStartPanel() {
    if (dom.gameStartPanel) {
      dom.gameStartPanel.hidden =
        false;
    }

    if (dom.gameOverPanel) {
      dom.gameOverPanel.hidden =
        true;
    }

    if (dom.gameOverlay) {
      dom.gameOverlay.hidden =
        false;

      dom.gameOverlay.classList.remove(
        "is-hidden"
      );
    }
  }

  function hideOverlay() {
    if (!dom.gameOverlay) {
      return;
    }

    dom.gameOverlay.classList.add(
      "is-hidden"
    );

    window.setTimeout(() => {
      if (
        runtime.scene?.state.playing
      ) {
        dom.gameOverlay.hidden = true;
      }
    }, 220);
  }
  function showGameOverPanel({
    score,
    rank = null,
    improved = false,
    previousBest = 0
  }) {
    if (dom.gameStartPanel) {
      dom.gameStartPanel.hidden = true;
    }

    if (dom.gameOverPanel) {
      dom.gameOverPanel.hidden = false;
    }

    if (dom.gameOverlay) {
      dom.gameOverlay.hidden = false;

      requestAnimationFrame(() => {
        dom.gameOverlay.classList.remove(
          "is-hidden"
        );
      });
    }

    if (dom.finalScoreDisplay) {
      dom.finalScoreDisplay.textContent =
        formatScore(score);
    }

    if (!dom.rankFeedback) {
      return;
    }

    if (improved && rank) {
      dom.rankFeedback.textContent =
        `New personal best. You are ranked #${rank}.`;

      return;
    }

    if (improved) {
      dom.rankFeedback.textContent =
        "New personal best recorded.";

      return;
    }

    dom.rankFeedback.textContent =
      `Attempt recorded. Your best remains ${formatScore(
        previousBest
      )}.`;
  }

  function updateWalletUi() {
    const paymentState =
      Payments?.getState?.();

    if (!paymentState) {
      return;
    }

    if (dom.walletStatus) {
      dom.walletStatus.textContent =
        paymentState.walletConnected
          ? paymentState.shortenedWalletAddress ||
            paymentState.walletAddress ||
            "Wallet connected"
          : "Wallet not connected";
    }

    if (dom.connectWalletButton) {
      dom.connectWalletButton.textContent =
        paymentState.walletConnected
          ? "Wallet Connected"
          : "Connect Wallet";
    }
  }

  function updateTournamentUi() {
    const tournament =
      CONFIG.tournament;

    if (!tournament) {
      return;
    }

    const entryDisplay =
      tournament.entryPriceDisplay ||
      `${tournament.entryPriceSol} SOL`;

    if (dom.entryPrice) {
      dom.entryPrice.textContent =
        entryDisplay;
    }

    if (dom.prizePool) {
      dom.prizePool.textContent =
        tournament.prizePoolDisplay ||
        `${tournament.prizePoolSol} SOL`;
    }

    if (dom.winnerCount) {
      dom.winnerCount.textContent =
        `Top ${
          tournament.winnerCount || 2
        }`;
    }

    if (dom.tournamentLabel) {
      dom.tournamentLabel.textContent =
        [
          tournament.name,
          tournament.promotionalLabel
        ]
          .filter(Boolean)
          .join(" · ");
    }

    if (dom.footerTournamentLabel) {
      dom.footerTournamentLabel.textContent =
        tournament.name || "";
    }

    if (dom.purchasePlayButton) {
      dom.purchasePlayButton.textContent =
        `Play for ${entryDisplay}`;
    }

    if (dom.playAgainButton) {
      dom.playAgainButton.textContent =
        `Play Again for ${entryDisplay}`;
    }
  }

  function updateCountdown() {
    const startsAt = new Date(
      CONFIG.tournament.startsAt
    ).getTime();

    const endsAt = new Date(
      CONFIG.tournament.endsAt
    ).getTime();

    const now = Date.now();

    let targetTime;
    let statusText;

    if (now < startsAt) {
      targetTime = startsAt;
      statusText =
        "Tournament coming soon";
    } else if (now < endsAt) {
      targetTime = endsAt;
      statusText =
        "Tournament is live";
    } else {
      targetTime = now;
      statusText =
        "Tournament has ended";
    }

    const remaining = Math.max(
      0,
      targetTime - now
    );

    const days = Math.floor(
      remaining / 86_400_000
    );

    const hours = Math.floor(
      (remaining % 86_400_000) /
        3_600_000
    );

    const minutes = Math.floor(
      (remaining % 3_600_000) /
        60_000
    );

    const seconds = Math.floor(
      (remaining % 60_000) /
        1_000
    );

    const pad = (value) =>
      String(value).padStart(2, "0");

    if (dom.countdownDays) {
      dom.countdownDays.textContent =
        pad(days);
    }

    if (dom.countdownHours) {
      dom.countdownHours.textContent =
        pad(hours);
    }

    if (dom.countdownMinutes) {
      dom.countdownMinutes.textContent =
        pad(minutes);
    }

    if (dom.countdownSeconds) {
      dom.countdownSeconds.textContent =
        pad(seconds);
    }

    if (dom.tournamentStatus) {
      dom.tournamentStatus.textContent =
        statusText;
    }
  }

  function getPersonalBest() {
    const summary =
      Leaderboard?.getPlayerSummary?.();

    return Math.max(
      0,
      Number(summary?.bestScore) || 0
    );
  }

  function updatePersonalBestUi() {
    if (!dom.personalBestDisplay) {
      return;
    }

    dom.personalBestDisplay.textContent =
      formatScore(getPersonalBest());
  }

  function vibrate(pattern) {
    if (
      !CONFIG.effects?.haptics
        ?.enabled ||
      typeof navigator.vibrate !==
        "function"
    ) {
      return;
    }

    navigator.vibrate(pattern);
  }

  function getMatterBodyLabel(
    body
  ) {
    if (!body) {
      return "";
    }

    return (
      body.label ||
      body.gameObject?.body?.label ||
      ""
    );
  }

  function getCollisionPair(
    event
  ) {
    if (
      !event?.pairs ||
      event.pairs.length === 0
    ) {
      return null;
    }

    return event.pairs[0];
  }

  function pairContainsLabel(
    pair,
    label
  ) {
    if (!pair) {
      return false;
    }

    return (
      getMatterBodyLabel(pair.bodyA) ===
        label ||
      getMatterBodyLabel(pair.bodyB) ===
        label
    );
  }

  function getOtherBody(
    pair,
    knownLabel
  ) {
    if (!pair) {
      return null;
    }

    if (
      getMatterBodyLabel(pair.bodyA) ===
      knownLabel
    ) {
      return pair.bodyB;
    }

    if (
      getMatterBodyLabel(pair.bodyB) ===
      knownLabel
    ) {
      return pair.bodyA;
    }

    return null;
  }

  class PumpBallScene extends Phaser.Scene {
    constructor() {
      super({
        key: "PumpBallScene"
      });

      this.state = {
        ready: false,
        playing: false,
        paused: false,
        gameOver: false,

        score: 0,

        ballNumber: 0,
        ballsRemaining:
          Number(
            CONFIG.game?.ballsPerGame
          ) || 3,

        sessionId: null,
        credit: null,

        ballInPlay: false,
        ballLaunched: false,

        launcherCharging: false,
        launcherChargeStartedAt: 0,
        launcherCharge: 0,

        launchGraceUntil: 0,
        drainLocked: false,

        leftFlipperPressed: false,
        rightFlipperPressed: false,

        lastBallMotionAt: 0,
        lastBallPosition: null,

        ballSaveUsed: false
      };

      this.ball = null;
      this.ballShadow = null;

      this.playfield = null;

      this.leftFlipper = null;
      this.rightFlipper = null;

      this.leftFlipperBody = null;
      this.rightFlipperBody = null;

      this.bumpers = [];

      this.leftSlingshot = null;
      this.rightSlingshot = null;

      this.reactor = null;
      this.reactorGlow = null;

      this.launcherTrack = null;
      this.launcherSpring = null;
      this.launcherCap = null;
      this.launcherMeter = null;

      this.screenFlash = null;
      this.vignette = null;

      this.staticBodies = [];
      this.trailSprites = [];

      this.keys = {};
      this.pointerControls = {
        leftPointerId: null,
        rightPointerId: null,
        launcherPointerId: null
      };

      this.lastTrailAt = 0;
      this.lastNudgeAt = 0;
    }

    preload() {
      this.load.image(
        "playfield",
        assetPath(
          requiredAsset(
            "playfield",
            "playfield.png"
          )
        )
      );

      this.load.image(
        "ball",
        assetPath(
          requiredAsset(
            "ball",
            "ball.png"
          )
        )
      );

      this.load.image(
        "flipperLeft",
        assetPath(
          requiredAsset(
            "flipperLeft",
            "flipper-left.png"
          )
        )
      );

      this.load.image(
        "flipperRight",
        assetPath(
          requiredAsset(
            "flipperRight",
            "flipper-right.png"
          )
        )
      );

      this.load.image(
        "bumper",
        assetPath(
          requiredAsset(
            "bumper",
            "bumper.png"
          )
        )
      );

      this.load.image(
        "slingshotLeft",
        assetPath(
          requiredAsset(
            "slingshotLeft",
            "slingshot-left.png"
          )
        )
      );

      this.load.image(
        "slingshotRight",
        assetPath(
          requiredAsset(
            "slingshotRight",
            "slingshot-right.png"
          )
        )
      );

      this.load.image(
        "reactorJackpot",
        assetPath(
          requiredAsset(
            "reactorJackpot",
            "reactor-jackpot.png"
          )
        )
      );

      if (
        CONFIG.app?.debug &&
        CONFIG.assets?.reference
          ?.collisionMap
      ) {
        this.load.image(
          "collisionMap",
          assetPath(
            CONFIG.assets.reference
              .collisionMap
          )
        );
      }

      this.load.on(
        "loaderror",
        (file) => {
          console.error(
            `[PumpBall] Asset failed to load: ${file.src}`
          );
        }
      );
    }

    create() {
      runtime.scene = this;

      this.matter.world.setGravity(
        0,
        Number(
          CONFIG.physics?.gravity?.y
        ) || 0.92,
        Number(
          CONFIG.physics?.gravity
            ?.scale
        ) || 0.001
      );

      this.matter.world.engine
        .positionIterations =
        Number(
          CONFIG.physics?.timing
            ?.positionIterations
        ) || 10;

      this.matter.world.engine
        .velocityIterations =
        Number(
          CONFIG.physics?.timing
            ?.velocityIterations
        ) || 10;

      this.matter.world.engine
        .constraintIterations =
        Number(
          CONFIG.physics?.timing
            ?.constraintIterations
        ) || 4;

      this.createBackground();
      this.createStaticTableGeometry();
      this.createMechanisms();
      this.createEffects();
      this.createControls();
      this.bindMatterEvents();

      if (
        CONFIG.app?.debug &&
        this.textures.exists(
          "collisionMap"
        )
      ) {
        this.add
          .image(
            WORLD.width / 2,
            WORLD.height / 2,
            "collisionMap"
          )
          .setDisplaySize(
            WORLD.width,
            WORLD.height
          )
          .setAlpha(0.28)
          .setDepth(DEPTH.debug);
      }

      if (
        CONFIG.app
          ?.showPhysicsBodies
      ) {
        this.matter.world
          .createDebugGraphic();

        this.matter.world
          .drawDebug = true;
      }

      this.state.ready = true;

      this.updateHud();

      emit(
        "pumpball:game-ready"
      );
    }

        createBackground() {
      this.playfield = this.add
        .image(
          WORLD.width / 2,
          WORLD.height / 2,
          "playfield"
        )
        .setDisplaySize(
          WORLD.width,
          WORLD.height
        )
        .setDepth(
          DEPTH.playfield
        );

      this.add
        .rectangle(
          WORLD.width / 2,
          WORLD.height / 2,
          WORLD.width,
          WORLD.height,
          0x000000,
          0.04
        )
        .setDepth(
          DEPTH.decor
        );

      this.vignette = this.add
        .graphics()
        .setDepth(
          DEPTH.effects
        );

      this.vignette.fillStyle(
        0x000000,
        0.2
      );

      this.vignette.fillRect(
        0,
        0,
        WORLD.width,
        42
      );

      this.vignette.fillRect(
        0,
        WORLD.height - 62,
        WORLD.width,
        62
      );

      this.vignette.fillRect(
        0,
        0,
        34,
        WORLD.height
      );

      this.vignette.fillRect(
        WORLD.width - 34,
        0,
        34,
        WORLD.height
      );
    }

    createStaticTableGeometry() {
      const wallSettings =
        CONFIG.physics?.walls || {};

      const railSettings =
        CONFIG.physics?.rails || {};

      const tableBounds =
        CONFIG.table?.bounds || {
          left: 42,
          right: 678,
          top: 42,
          bottom: 1238
        };

      const wallThickness =
        Number(
          wallSettings.thickness
        ) || 28;

      const wallOptions = {
        isStatic: true,

        restitution:
          Number(
            wallSettings.restitution
          ) || 0.48,

        friction:
          Number(
            wallSettings.friction
          ) || 0.008,

        label: LABELS.wall
      };

      this.createStaticRectangle(
        tableBounds.left -
          wallThickness / 2,
        WORLD.height / 2,
        wallThickness,
        WORLD.height,
        wallOptions
      );

      this.createStaticRectangle(
        tableBounds.right +
          wallThickness / 2,
        WORLD.height / 2,
        wallThickness,
        WORLD.height,
        wallOptions
      );

      this.createStaticRectangle(
        WORLD.width / 2,
        tableBounds.top -
          wallThickness / 2,
        WORLD.width,
        wallThickness,
        wallOptions
      );

      this.createStaticRectangle(
        120,
        226,
        210,
        24,
        {
          ...wallOptions,
          angle:
            Phaser.Math.DegToRad(
              -28
            )
        }
      );

      this.createStaticRectangle(
        600,
        226,
        210,
        24,
        {
          ...wallOptions,
          angle:
            Phaser.Math.DegToRad(
              28
            )
        }
      );

      this.createStaticRectangle(
        113,
        440,
        190,
        22,
        {
          ...wallOptions,
          angle:
            Phaser.Math.DegToRad(
              8
            )
        }
      );

      this.createStaticRectangle(
        607,
        440,
        190,
        22,
        {
          ...wallOptions,
          angle:
            Phaser.Math.DegToRad(
              -8
            )
        }
      );

      this.createStaticRectangle(
        90,
        735,
        270,
        24,
        {
          ...wallOptions,
          angle:
            Phaser.Math.DegToRad(
              18
            )
        }
      );

      this.createStaticRectangle(
        630,
        735,
        270,
        24,
        {
          ...wallOptions,
          angle:
            Phaser.Math.DegToRad(
              -18
            )
        }
      );

      this.createStaticRectangle(
        118,
        1027,
        206,
        26,
        {
          ...wallOptions,
          angle:
            Phaser.Math.DegToRad(
              56
            )
        }
      );

      this.createStaticRectangle(
        602,
        1027,
        206,
        26,
        {
          ...wallOptions,
          angle:
            Phaser.Math.DegToRad(
              -56
            )
        }
      );

      this.createStaticRectangle(
        216,
        1165,
        214,
        24,
        {
          ...wallOptions,
          angle:
            Phaser.Math.DegToRad(
              24
            )
        }
      );

      this.createStaticRectangle(
        504,
        1165,
        214,
        24,
        {
          ...wallOptions,
          angle:
            Phaser.Math.DegToRad(
              -24
            )
        }
      );

      this.createLauncherLane(
        railSettings,
        wallOptions
      );

      this.createDrainSensor();
    }

    createStaticRectangle(
      x,
      y,
      width,
      height,
      options = {}
    ) {
      const body =
        this.matter.add.rectangle(
          x,
          y,
          width,
          height,
          {
            isStatic: true,
            ...options
          }
        );

      this.staticBodies.push(body);

      return body;
    }

    createLauncherLane(
      railSettings,
      wallOptions
    ) {
      const laneX =
        Number(
          CONFIG.plunger?.laneX
        ) || 662;

      const launcherRestY =
        Number(
          CONFIG.plunger
            ?.ballStartY
        ) || 1122;

      const laneRestitution =
        Number(
          railSettings.restitution
        ) || 0.62;

      const laneFriction =
        Number(
          railSettings.friction
        ) || 0.004;

      const laneOptions = {
        ...wallOptions,
        restitution:
          laneRestitution,
        friction:
          laneFriction
      };

      this.createStaticRectangle(
        laneX - 41,
        882,
        18,
        600,
        laneOptions
      );

      this.createStaticRectangle(
        laneX + 41,
        900,
        18,
        636,
        laneOptions
      );

      this.createStaticRectangle(
        laneX,
        1218,
        92,
        18,
        {
          ...laneOptions,
          label:
            LABELS.launcherSupport
        }
      );

      this.createStaticRectangle(
        608,
        555,
        170,
        20,
        {
          ...laneOptions,
          angle:
            Phaser.Math.DegToRad(
              -30
            )
        }
      );

      this.createStaticRectangle(
        laneX - 30,
        launcherRestY + 28,
        20,
        70,
        {
          ...laneOptions,
          label:
            LABELS.launcherSupport
        }
      );

      this.launcherTrack = this.add
        .rectangle(
          laneX,
          998,
          72,
          436,
          0x151522,
          0.34
        )
        .setStrokeStyle(
          2,
          0x8f54ff,
          0.28
        )
        .setDepth(
          DEPTH.decor
        );

      this.launcherSpring = this.add
        .rectangle(
          laneX,
          1180,
          18,
          74,
          0xa971ff,
          0.55
        )
        .setDepth(
          DEPTH.mechanisms
        );

      this.launcherCap = this.add
        .ellipse(
          laneX,
          1144,
          48,
          20,
          0xc7a7ff,
          0.8
        )
        .setDepth(
          DEPTH.mechanisms
        );

      this.launcherMeter = this.add
        .rectangle(
          laneX + 55,
          1062,
          8,
          0,
          0x9f67ff,
          0.9
        )
        .setOrigin(
          0.5,
          1
        )
        .setDepth(
          DEPTH.mechanisms
        );
    }

    createDrainSensor() {
      const drain =
        CONFIG.table?.drain || {
          x: 360,
          y: 1246,
          width: 160,
          height: 48
        };

      const body =
        this.matter.add.rectangle(
          Number(drain.x) || 360,
          Number(drain.y) || 1246,
          Number(drain.width) ||
            160,
          Number(drain.height) ||
            48,
          {
            isStatic: true,
            isSensor: true,
            label:
              LABELS.drain
          }
        );

      this.staticBodies.push(body);
    }

    createMechanisms() {
      this.createFlippers();
      this.createBumpers();
      this.createSlingshots();
      this.createReactor();
    }

    createFlippers() {
      const settings =
        CONFIG.flippers || {};

      const leftSettings =
        settings.left || {};

      const rightSettings =
        settings.right || {};

      const leftX =
        Number(
          leftSettings.pivotX
        ) || 285;

      const leftY =
        Number(
          leftSettings.pivotY
        ) || 1115;

      const rightX =
        Number(
          rightSettings.pivotX
        ) || 435;

      const rightY =
        Number(
          rightSettings.pivotY
        ) || 1115;

      const leftAngle =
        Phaser.Math.DegToRad(
          Number(
            leftSettings
              .restAngleDegrees
          ) || 24
        );

      const rightAngle =
        Phaser.Math.DegToRad(
          Number(
            rightSettings
              .restAngleDegrees
          ) || -24
        );

      this.leftFlipper = this.matter.add
        .image(
          leftX,
          leftY,
          "flipperLeft",
          null,
          {
            label:
              LABELS.flipperLeft,

            density:
              Number(
                settings.density
              ) || 0.02,

            friction:
              Number(
                settings.friction
              ) || 0.01,

            restitution:
              Number(
                settings.restitution
              ) || 0.34,

            ignoreGravity: true
          }
        )
        .setDepth(
          DEPTH.mechanisms
        )
        .setOrigin(
          0.2,
          0.5
        )
        .setAngle(
          Phaser.Math.RadToDeg(
            leftAngle
          )
        );

      this.rightFlipper = this.matter.add
        .image(
          rightX,
          rightY,
          "flipperRight",
          null,
          {
            label:
              LABELS.flipperRight,

            density:
              Number(
                settings.density
              ) || 0.02,

            friction:
              Number(
                settings.friction
              ) || 0.01,

            restitution:
              Number(
                settings.restitution
              ) || 0.34,

            ignoreGravity: true
          }
        )
        .setDepth(
          DEPTH.mechanisms
        )
        .setOrigin(
          0.8,
          0.5
        )
        .setAngle(
          Phaser.Math.RadToDeg(
            rightAngle
          )
        );

      this.leftFlipper
        .setFixedRotation();

      this.rightFlipper
        .setFixedRotation();

      this.leftFlipperBody =
        this.leftFlipper.body;

      this.rightFlipperBody =
        this.rightFlipper.body;

      this.leftFlipperBody.label =
        LABELS.flipperLeft;

      this.rightFlipperBody.label =
        LABELS.flipperRight;
    }

    createBumpers() {
      const bumperDefinitions =
        Array.isArray(
          CONFIG.table?.bumpers
        )
          ? CONFIG.table.bumpers
          : [];

      bumperDefinitions.forEach(
        (
          definition,
          index
        ) => {
          const radius =
            Number(
              definition.radius
            ) || 38;

          const sprite =
            this.matter.add.image(
              Number(
                definition.x
              ) || 0,
              Number(
                definition.y
              ) || 0,
              "bumper",
              null,
              {
                isStatic: true,

                shape: {
                  type: "circle",
                  radius
                },

                restitution:
                  Number(
                    CONFIG.physics
                      ?.rubber
                      ?.restitution
                  ) || 0.82,

                friction:
                  Number(
                    CONFIG.physics
                      ?.rubber
                      ?.friction
                  ) || 0.003,

                label:
                  LABELS.bumper
              }
            );

          sprite
            .setDisplaySize(
              radius * 2.35,
              radius * 2.35
            )
            .setDepth(
              DEPTH.mechanisms
            );

          sprite.body.label =
            LABELS.bumper;

          sprite.setData(
            "bumper",
            {
              ...definition,
              index,
              lastHitAt: 0
            }
          );

          this.bumpers.push(
            sprite
          );
        }
      );
    }

    createSlingshots() {
      const definitions =
        Array.isArray(
          CONFIG.table
            ?.slingshots
        )
          ? CONFIG.table
              .slingshots
          : [];

      const leftDefinition =
        definitions.find(
          (item) =>
            item.side === "left"
        ) || {
          x: 215,
          y: 960,
          score: 250,
          impulse: 1.65
        };

      const rightDefinition =
        definitions.find(
          (item) =>
            item.side === "right"
        ) || {
          x: 505,
          y: 960,
          score: 250,
          impulse: 1.65
        };

      this.leftSlingshot =
        this.matter.add.image(
          Number(
            leftDefinition.x
          ) || 215,
          Number(
            leftDefinition.y
          ) || 960,
          "slingshotLeft",
          null,
          {
            isStatic: true,
            restitution: 0.88,
            friction: 0.002,
            label:
              LABELS.slingshotLeft
          }
        );

      this.leftSlingshot
        .setDepth(
          DEPTH.mechanisms
        )
        .setData(
          "slingshot",
          {
            ...leftDefinition,
            lastHitAt: 0
          }
        );

      this.leftSlingshot.body.label =
        LABELS.slingshotLeft;

      this.rightSlingshot =
        this.matter.add.image(
          Number(
            rightDefinition.x
          ) || 505,
          Number(
            rightDefinition.y
          ) || 960,
          "slingshotRight",
          null,
          {
            isStatic: true,
            restitution: 0.88,
            friction: 0.002,
            label:
              LABELS.slingshotRight
          }
        );

      this.rightSlingshot
        .setDepth(
          DEPTH.mechanisms
        )
        .setData(
          "slingshot",
          {
            ...rightDefinition,
            lastHitAt: 0
          }
        );

      this.rightSlingshot.body.label =
        LABELS.slingshotRight;
    }

        createReactor() {
      const definition =
        CONFIG.table?.reactor || {
          x: 360,
          y: 760,
          radius: 54,
          score: 2500,
          impulse: 2.15,
          cooldownMs: 280
        };

      const x =
        Number(definition.x) || 360;

      const y =
        Number(definition.y) || 760;

      const radius =
        Number(definition.radius) || 54;

      this.reactorGlow = this.add
        .circle(
          x,
          y,
          radius * 1.24,
          0x8f4dff,
          0.18
        )
        .setDepth(
          DEPTH.decor
        );

      this.reactor = this.matter.add
        .image(
          x,
          y,
          "reactorJackpot",
          null,
          {
            isStatic: true,

            shape: {
              type: "circle",
              radius
            },

            restitution:
              Number(
                CONFIG.physics?.rubber
                  ?.restitution
              ) || 0.82,

            friction:
              Number(
                CONFIG.physics?.rubber
                  ?.friction
              ) || 0.003,

            label: LABELS.reactor
          }
        )
        .setDisplaySize(
          radius * 2.35,
          radius * 2.35
        )
        .setDepth(
          DEPTH.mechanisms
        );

      this.reactor.body.label =
        LABELS.reactor;

      this.reactor.setData(
        "reactor",
        {
          ...definition,
          lastHitAt: 0,
          hitCount: 0
        }
      );

      this.tweens.add({
        targets: this.reactorGlow,
        alpha: {
          from: 0.11,
          to: 0.3
        },
        scale: {
          from: 0.94,
          to: 1.08
        },
        duration: 920,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut"
      });
    }

    createEffects() {
      this.screenFlash = this.add
        .rectangle(
          WORLD.width / 2,
          WORLD.height / 2,
          WORLD.width,
          WORLD.height,
          0xffffff,
          0
        )
        .setDepth(
          DEPTH.flash
        )
        .setScrollFactor(0);

      this.createEffectTextures();
    }

    createEffectTextures() {
      if (
        !this.textures.exists(
          "pumpball-particle"
        )
      ) {
        const particle =
          this.make.graphics({
            x: 0,
            y: 0,
            add: false
          });

        particle.fillStyle(
          0xffffff,
          1
        );

        particle.fillCircle(
          6,
          6,
          6
        );

        particle.generateTexture(
          "pumpball-particle",
          12,
          12
        );

        particle.destroy();
      }

      if (
        !this.textures.exists(
          "pumpball-trail"
        )
      ) {
        const trail =
          this.make.graphics({
            x: 0,
            y: 0,
            add: false
          });

        trail.fillStyle(
          0xb893ff,
          1
        );

        trail.fillCircle(
          8,
          8,
          8
        );

        trail.generateTexture(
          "pumpball-trail",
          16,
          16
        );

        trail.destroy();
      }
    }

    createControls() {
      this.keys.left =
        this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.LEFT
        );

      this.keys.leftAlt =
        this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.A
        );

      this.keys.right =
        this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.RIGHT
        );

      this.keys.rightAlt =
        this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.D
        );

      this.keys.launch =
        this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.SPACE
        );

      this.keys.launchAlt =
        this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.DOWN
        );

      this.keys.nudgeLeft =
        this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.Q
        );

      this.keys.nudgeRight =
        this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.E
        );

      this.input.on(
        "pointerdown",
        (pointer) => {
          this.handlePointerDown(
            pointer
          );
        }
      );

      this.input.on(
        "pointerup",
        (pointer) => {
          this.handlePointerUp(
            pointer
          );
        }
      );

      this.input.on(
        "pointerupoutside",
        (pointer) => {
          this.handlePointerUp(
            pointer
          );
        }
      );

      this.input.on(
        "pointercancel",
        (pointer) => {
          this.handlePointerUp(
            pointer
          );
        }
      );

      this.input.keyboard.on(
        "keydown-Q",
        () => {
          this.nudge(-1);
        }
      );

      this.input.keyboard.on(
        "keydown-E",
        () => {
          this.nudge(1);
        }
      );

      this.events.once(
        Phaser.Scenes.Events.SHUTDOWN,
        () => {
          this.input.removeAllListeners();
        }
      );
    }

    handlePointerDown(pointer) {
      if (
        !this.state.playing ||
        this.state.paused ||
        this.state.gameOver
      ) {
        return;
      }

      const worldPoint =
        this.getPointerWorldPosition(
          pointer
        );

      const launcherZoneStart =
        Number(
          CONFIG.controls?.touch
            ?.launcherZoneStartX
        ) || WORLD.width * 0.82;

      const leftZoneEnd =
        Number(
          CONFIG.controls?.touch
            ?.leftZoneEndX
        ) || WORLD.width * 0.43;

      const rightZoneStart =
        Number(
          CONFIG.controls?.touch
            ?.rightZoneStartX
        ) || WORLD.width * 0.57;

      if (
        !this.state.ballLaunched &&
        worldPoint.x >=
          launcherZoneStart
      ) {
        this.pointerControls
          .launcherPointerId =
          pointer.id;

        this.beginLauncherCharge();

        return;
      }

      if (
        worldPoint.x <= leftZoneEnd
      ) {
        this.pointerControls
          .leftPointerId =
          pointer.id;

        this.state.leftFlipperPressed =
          true;

        vibrate(8);

        return;
      }

      if (
        worldPoint.x >=
        rightZoneStart
      ) {
        this.pointerControls
          .rightPointerId =
          pointer.id;

        this.state.rightFlipperPressed =
          true;

        vibrate(8);
      }
    }

    handlePointerUp(pointer) {
      if (
        this.pointerControls
          .leftPointerId ===
        pointer.id
      ) {
        this.pointerControls
          .leftPointerId = null;

        this.state.leftFlipperPressed =
          false;
      }

      if (
        this.pointerControls
          .rightPointerId ===
        pointer.id
      ) {
        this.pointerControls
          .rightPointerId = null;

        this.state.rightFlipperPressed =
          false;
      }

      if (
        this.pointerControls
          .launcherPointerId ===
        pointer.id
      ) {
        this.pointerControls
          .launcherPointerId = null;

        this.releaseLauncher();
      }
    }

    getPointerWorldPosition(
      pointer
    ) {
      const camera =
        this.cameras.main;

      return camera.getWorldPoint(
        pointer.x,
        pointer.y
      );
    }

    bindMatterEvents() {
      this.matter.world.on(
        "collisionstart",
        (event) => {
          this.handleCollisionStart(
            event
          );
        }
      );

      this.matter.world.on(
        "collisionactive",
        (event) => {
          this.handleCollisionActive(
            event
          );
        }
      );
    }

    handleCollisionStart(event) {
      if (
        !this.state.playing ||
        !this.ball?.body
      ) {
        return;
      }

      event.pairs.forEach(
        (pair) => {
          if (
            !pairContainsLabel(
              pair,
              LABELS.ball
            )
          ) {
            return;
          }

          if (
            pairContainsLabel(
              pair,
              LABELS.drain
            )
          ) {
            this.handleDrain();

            return;
          }

          if (
            pairContainsLabel(
              pair,
              LABELS.bumper
            )
          ) {
            const otherBody =
              getOtherBody(
                pair,
                LABELS.ball
              );

            this.handleBumperHit(
              otherBody
            );

            return;
          }

          if (
            pairContainsLabel(
              pair,
              LABELS.slingshotLeft
            )
          ) {
            this.handleSlingshotHit(
              this.leftSlingshot,
              -1
            );

            return;
          }

          if (
            pairContainsLabel(
              pair,
              LABELS.slingshotRight
            )
          ) {
            this.handleSlingshotHit(
              this.rightSlingshot,
              1
            );

            return;
          }

          if (
            pairContainsLabel(
              pair,
              LABELS.reactor
            )
          ) {
            this.handleReactorHit();

            return;
          }

          if (
            pairContainsLabel(
              pair,
              LABELS.flipperLeft
            ) ||
            pairContainsLabel(
              pair,
              LABELS.flipperRight
            )
          ) {
            this.handleFlipperContact(
              pair
            );
          }
        }
      );
    }

    handleCollisionActive(event) {
      if (
        !this.state.playing ||
        !this.ball?.body ||
        !this.state.ballLaunched
      ) {
        return;
      }

      event.pairs.forEach(
        (pair) => {
          if (
            !pairContainsLabel(
              pair,
              LABELS.ball
            )
          ) {
            return;
          }

          if (
            pairContainsLabel(
              pair,
              LABELS.flipperLeft
            ) ||
            pairContainsLabel(
              pair,
              LABELS.flipperRight
            )
          ) {
            this.limitBallVelocity();
          }
        }
      );
    }

    findGameObjectFromBody(
      body
    ) {
      if (!body) {
        return null;
      }

      if (body.gameObject) {
        return body.gameObject;
      }

      if (body.parent?.gameObject) {
        return body.parent.gameObject;
      }

      return null;
    }

    handleBumperHit(body) {
      const bumper =
        this.findGameObjectFromBody(
          body
        );

      if (!bumper) {
        return;
      }

      const data =
        bumper.getData(
          "bumper"
        ) || {};

      const now =
        this.time.now;

      const cooldown =
        Number(
          data.cooldownMs
        ) || 120;

      if (
        now -
          Number(
            data.lastHitAt
          ) <
        cooldown
      ) {
        return;
      }

      data.lastHitAt = now;

      bumper.setData(
        "bumper",
        data
      );

      const score =
        Number(data.score) ||
        Number(
          CONFIG.scoring?.bumper
        ) ||
        500;

      const impulse =
        Number(data.impulse) ||
        Number(
          CONFIG.physics?.bumpers
            ?.impulse
        ) ||
        1.45;

      this.applyRadialImpulse(
        bumper.x,
        bumper.y,
        impulse
      );

      this.addScore(
        score,
        bumper.x,
        bumper.y - 18,
        "BUMPER"
      );

      this.pulseGameObject(
        bumper,
        1.16,
        105
      );

      this.spawnImpactParticles(
        bumper.x,
        bumper.y,
        12
      );

      this.flashScreen(
        0xffffff,
        0.09,
        65
      );

      this.shakeCamera(
        0.0025,
        65
      );

      vibrate(12);
    }

    handleSlingshotHit(
      slingshot,
      horizontalDirection
    ) {
      if (!slingshot) {
        return;
      }

      const data =
        slingshot.getData(
          "slingshot"
        ) || {};

      const now =
        this.time.now;

      const cooldown =
        Number(
          data.cooldownMs
        ) || 130;

      if (
        now -
          Number(
            data.lastHitAt
          ) <
        cooldown
      ) {
        return;
      }

      data.lastHitAt = now;

      slingshot.setData(
        "slingshot",
        data
      );

      const score =
        Number(data.score) ||
        Number(
          CONFIG.scoring?.slingshot
        ) ||
        250;

      const impulse =
        Number(data.impulse) ||
        1.65;

      this.ball.applyForce({
        x:
          horizontalDirection *
          impulse *
          0.00075,
        y: -impulse * 0.001
      });

      this.addScore(
        score,
        slingshot.x,
        slingshot.y - 28,
        "SLING"
      );

      this.pulseGameObject(
        slingshot,
        1.08,
        90
      );

      this.spawnImpactParticles(
        slingshot.x,
        slingshot.y,
        8
      );

      this.shakeCamera(
        0.0018,
        50
      );

      vibrate(9);
    }

    handleReactorHit() {
      if (!this.reactor) {
        return;
      }

      const data =
        this.reactor.getData(
          "reactor"
        ) || {};

      const now =
        this.time.now;

      const cooldown =
        Number(
          data.cooldownMs
        ) || 280;

      if (
        now -
          Number(
            data.lastHitAt
          ) <
        cooldown
      ) {
        return;
      }

      data.lastHitAt = now;

      data.hitCount =
        Number(data.hitCount) + 1;

      this.reactor.setData(
        "reactor",
        data
      );

      const baseScore =
        Number(data.score) ||
        Number(
          CONFIG.scoring?.reactor
        ) ||
        2500;

      const jackpotEvery =
        Number(
          CONFIG.gameModes?.reactor
            ?.jackpotEveryHits
        ) || 5;

      const jackpotScore =
        Number(
          CONFIG.scoring
            ?.reactorJackpot
        ) || 10000;

      const isJackpot =
        data.hitCount %
          jackpotEvery ===
        0;

      const awardedScore =
        isJackpot
          ? jackpotScore
          : baseScore;

      const impulse =
        Number(data.impulse) ||
        2.15;

      this.applyRadialImpulse(
        this.reactor.x,
        this.reactor.y,
        impulse
      );

      this.addScore(
        awardedScore,
        this.reactor.x,
        this.reactor.y - 44,
        isJackpot
          ? "JACKPOT"
          : "REACTOR"
      );

      this.pulseGameObject(
        this.reactor,
        isJackpot ? 1.22 : 1.1,
        isJackpot ? 180 : 110
      );

      this.tweens.add({
        targets:
          this.reactorGlow,
        alpha:
          isJackpot
            ? 0.72
            : 0.48,
        scale:
          isJackpot
            ? 1.42
            : 1.2,
        duration:
          isJackpot
            ? 180
            : 100,
        yoyo: true,
        ease: "Quad.Out"
      });

      this.spawnImpactParticles(
        this.reactor.x,
        this.reactor.y,
        isJackpot ? 30 : 16
      );

      this.flashScreen(
        isJackpot
          ? 0xd6ff53
          : 0xa36bff,
        isJackpot
          ? 0.28
          : 0.14,
        isJackpot
          ? 170
          : 85
      );

      this.shakeCamera(
        isJackpot
          ? 0.009
          : 0.004,
        isJackpot
          ? 190
          : 90
      );

      vibrate(
        isJackpot
          ? [25, 25, 45]
          : 16
      );
    }

        handleFlipperContact(pair) {
      if (
        !this.ball?.body ||
        !this.state.ballLaunched
      ) {
        return;
      }

      const leftContact =
        pairContainsLabel(
          pair,
          LABELS.flipperLeft
        );

      const rightContact =
        pairContainsLabel(
          pair,
          LABELS.flipperRight
        );

      const flipperPressed =
        leftContact
          ? this.state
              .leftFlipperPressed
          : this.state
              .rightFlipperPressed;

      if (!flipperPressed) {
        return;
      }

      const direction =
        leftContact ? 1 : -1;

      const boost =
        Number(
          CONFIG.flippers
            ?.contactBoost
        ) || 1.18;

      const upwardForce =
        Number(
          CONFIG.flippers
            ?.contactUpwardForce
        ) || 0.00165;

      const horizontalForce =
        Number(
          CONFIG.flippers
            ?.contactHorizontalForce
        ) || 0.00042;

      this.ball.applyForce({
        x:
          direction *
          horizontalForce *
          boost,
        y:
          -upwardForce *
          boost
      });

      this.limitBallVelocity();

      this.spawnImpactParticles(
        this.ball.x,
        this.ball.y,
        5
      );

      vibrate(6);
    }

    applyRadialImpulse(
      sourceX,
      sourceY,
      strength
    ) {
      if (!this.ball?.body) {
        return;
      }

      let deltaX =
        this.ball.x - sourceX;

      let deltaY =
        this.ball.y - sourceY;

      let magnitude =
        Math.hypot(
          deltaX,
          deltaY
        );

      if (magnitude < 0.001) {
        deltaX =
          Phaser.Math.FloatBetween(
            -0.5,
            0.5
          );

        deltaY = -1;

        magnitude =
          Math.hypot(
            deltaX,
            deltaY
          );
      }

      const normalizedX =
        deltaX / magnitude;

      const normalizedY =
        deltaY / magnitude;

      const forceScale =
        Number(
          CONFIG.physics
            ?.impulseScale
        ) || 0.00115;

      this.ball.applyForce({
        x:
          normalizedX *
          strength *
          forceScale,

        y:
          normalizedY *
          strength *
          forceScale
      });

      this.limitBallVelocity();
    }

    addScore(
      amount,
      x = this.ball?.x,
      y = this.ball?.y,
      label = ""
    ) {
      if (
        !this.state.playing ||
        this.state.gameOver
      ) {
        return;
      }

      const awarded =
        Math.max(
          0,
          Math.floor(
            Number(amount) || 0
          )
        );

      if (awarded <= 0) {
        return;
      }

      this.state.score += awarded;

      this.updateHud();

      this.showFloatingScore(
        awarded,
        Number(x) ||
          WORLD.width / 2,
        Number(y) ||
          WORLD.height / 2,
        label
      );

      emit(
        "pumpball:score-changed",
        {
          score:
            this.state.score,
          amount: awarded,
          label
        }
      );
    }

    showFloatingScore(
      amount,
      x,
      y,
      label = ""
    ) {
      const content = label
        ? `${label}\n+${formatScore(
            amount
          )}`
        : `+${formatScore(
            amount
          )}`;

      const text = this.add
        .text(
          x,
          y,
          content,
          {
            fontFamily:
              "Arial, Helvetica, sans-serif",

            fontSize:
              label
                ? "24px"
                : "22px",

            fontStyle: "bold",

            color: "#ffffff",

            align: "center",

            stroke: "#19062f",

            strokeThickness: 6,

            lineSpacing: 2
          }
        )
        .setOrigin(
          0.5,
          0.5
        )
        .setDepth(
          DEPTH.text
        )
        .setScale(0.78)
        .setAlpha(0);

      this.tweens.add({
        targets: text,

        y: y - 58,

        alpha: {
          from: 0,
          to: 1
        },

        scale: {
          from: 0.78,
          to: 1
        },

        duration: 120,

        ease: "Back.Out",

        onComplete: () => {
          this.tweens.add({
            targets: text,

            y: text.y - 30,

            alpha: 0,

            duration: 460,

            delay: 180,

            ease: "Quad.In",

            onComplete: () => {
              text.destroy();
            }
          });
        }
      });
    }

    pulseGameObject(
      target,
      scale,
      duration
    ) {
      if (
        !target ||
        !target.active
      ) {
        return;
      }

      const baseScaleX =
        target.scaleX;

      const baseScaleY =
        target.scaleY;

      this.tweens.killTweensOf(
        target
      );

      this.tweens.add({
        targets: target,

        scaleX:
          baseScaleX * scale,

        scaleY:
          baseScaleY * scale,

        duration:
          Math.max(
            40,
            duration
          ),

        yoyo: true,

        ease: "Quad.Out",

        onComplete: () => {
          if (
            target &&
            target.active
          ) {
            target.setScale(
              baseScaleX,
              baseScaleY
            );
          }
        }
      });
    }

    spawnImpactParticles(
      x,
      y,
      count = 10
    ) {
      const particleCount =
        Phaser.Math.Clamp(
          Math.floor(count),
          1,
          40
        );

      for (
        let index = 0;
        index < particleCount;
        index += 1
      ) {
        const angle =
          Phaser.Math.FloatBetween(
            0,
            Math.PI * 2
          );

        const distance =
          Phaser.Math.FloatBetween(
            34,
            98
          );

        const particle =
          this.add.image(
            x,
            y,
            "pumpball-particle"
          );

        particle
          .setDepth(
            DEPTH.effects
          )
          .setScale(
            Phaser.Math.FloatBetween(
              0.3,
              0.88
            )
          )
          .setAlpha(
            Phaser.Math.FloatBetween(
              0.6,
              1
            )
          )
          .setTint(
            Phaser.Utils.Array.GetRandom(
              [
                0xffffff,
                0xd5b8ff,
                0xa971ff,
                0x77f6ff
              ]
            )
          );

        this.tweens.add({
          targets: particle,

          x:
            x +
            Math.cos(angle) *
              distance,

          y:
            y +
            Math.sin(angle) *
              distance,

          alpha: 0,

          scale: 0,

          duration:
            Phaser.Math.Between(
              230,
              520
            ),

          ease: "Quad.Out",

          onComplete: () => {
            particle.destroy();
          }
        });
      }
    }

    createBallTrail() {
      if (
        !this.ball?.active ||
        !this.state.ballLaunched
      ) {
        return;
      }

      const now =
        this.time.now;

      const interval =
        Number(
          CONFIG.effects?.trail
            ?.intervalMs
        ) || 34;

      if (
        now - this.lastTrailAt <
        interval
      ) {
        return;
      }

      const velocity =
        this.ball.body?.velocity;

      const speed =
        velocity
          ? Math.hypot(
              velocity.x,
              velocity.y
            )
          : 0;

      const minimumSpeed =
        Number(
          CONFIG.effects?.trail
            ?.minimumSpeed
        ) || 4;

      if (speed < minimumSpeed) {
        return;
      }

      this.lastTrailAt = now;

      const trail = this.add
        .image(
          this.ball.x,
          this.ball.y,
          "pumpball-trail"
        )
        .setDepth(
          DEPTH.trail
        )
        .setAlpha(
          Phaser.Math.Clamp(
            speed / 30,
            0.18,
            0.66
          )
        )
        .setScale(
          Phaser.Math.Clamp(
            speed / 28,
            0.3,
            0.72
          )
        );

      this.trailSprites.push(
        trail
      );

      this.tweens.add({
        targets: trail,

        alpha: 0,

        scale: 0.08,

        duration:
          Number(
            CONFIG.effects?.trail
              ?.lifetimeMs
          ) || 280,

        ease: "Quad.Out",

        onComplete: () => {
          const index =
            this.trailSprites.indexOf(
              trail
            );

          if (index >= 0) {
            this.trailSprites.splice(
              index,
              1
            );
          }

          trail.destroy();
        }
      });
    }

    clearBallTrail() {
      this.trailSprites.forEach(
        (trail) => {
          if (trail?.active) {
            trail.destroy();
          }
        }
      );

      this.trailSprites.length = 0;
    }

    flashScreen(
      color = 0xffffff,
      alpha = 0.12,
      duration = 80
    ) {
      if (!this.screenFlash) {
        return;
      }

      this.tweens.killTweensOf(
        this.screenFlash
      );

      this.screenFlash
        .setFillStyle(
          color,
          alpha
        )
        .setAlpha(1);

      this.tweens.add({
        targets:
          this.screenFlash,

        alpha: 0,

        duration,

        ease: "Quad.Out"
      });
    }

    shakeCamera(
      intensity = 0.003,
      duration = 70
    ) {
      if (
        !CONFIG.effects?.cameraShake
          ?.enabled
      ) {
        return;
      }

      this.cameras.main.shake(
        duration,
        intensity
      );
    }

    beginLauncherCharge() {
      if (
        !this.state.playing ||
        !this.state.ballInPlay ||
        this.state.ballLaunched ||
        this.state.launcherCharging
      ) {
        return;
      }

      this.state.launcherCharging =
        true;

      this.state.launcherChargeStartedAt =
        this.time.now;

      this.state.launcherCharge = 0;

      this.tweens.killTweensOf(
        this.launcherSpring
      );

      this.tweens.killTweensOf(
        this.launcherCap
      );
    }

    updateLauncherCharge() {
      if (
        !this.state.launcherCharging
      ) {
        return;
      }

      const maximumChargeMs =
        Number(
          CONFIG.plunger
            ?.maximumChargeMs
        ) || 1250;

      const elapsed =
        this.time.now -
        this.state
          .launcherChargeStartedAt;

      const charge =
        Phaser.Math.Clamp(
          elapsed /
            maximumChargeMs,
          0,
          1
        );

      this.state.launcherCharge =
        charge;

      const springCompression =
        Phaser.Math.Linear(
          1,
          0.42,
          charge
        );

      const capOffset =
        Phaser.Math.Linear(
          0,
          42,
          charge
        );

      this.launcherSpring
        ?.setScale(
          1,
          springCompression
        );

      if (this.launcherCap) {
        this.launcherCap.y =
          1144 + capOffset;
      }

      if (this.launcherMeter) {
        this.launcherMeter.height =
          Phaser.Math.Linear(
            0,
            160,
            charge
          );
      }
    }

    releaseLauncher() {
      if (
        !this.state
          .launcherCharging
      ) {
        return;
      }

      this.state.launcherCharging =
        false;

      if (
        !this.state.playing ||
        !this.state.ballInPlay ||
        this.state.ballLaunched ||
        !this.ball?.body
      ) {
        this.resetLauncherVisuals();

        return;
      }

      const minimumCharge =
        Number(
          CONFIG.plunger
            ?.minimumCharge
        ) || 0.1;

      const charge =
        Math.max(
          minimumCharge,
          this.state
            .launcherCharge
        );

      const minimumImpulse =
        Number(
          CONFIG.plunger
            ?.minimumImpulse
        ) || 0.018;

      const maximumImpulse =
        Number(
          CONFIG.plunger
            ?.maximumImpulse
        ) || 0.046;

      let launchImpulse =
        Phaser.Math.Linear(
          minimumImpulse,
          maximumImpulse,
          charge
        );

      if (
        typeof UTILS
          .calculatePlungerImpulse ===
        "function"
      ) {
        const calculated =
          Number(
            UTILS.calculatePlungerImpulse(
              charge,
              CONFIG.plunger
            )
          );

        if (
          Number.isFinite(
            calculated
          ) &&
          calculated > 0
        ) {
          launchImpulse =
            calculated;
        }
      }

      this.state.ballLaunched =
        true;

      this.state.launchGraceUntil =
        this.time.now +
        (Number(
          CONFIG.plunger
            ?.launchGraceMs
        ) || 900);

      this.ball.setStatic(false);

      this.ball.setIgnoreGravity(
        false
      );

      this.ball.setVelocity(
        Phaser.Math.FloatBetween(
          -0.35,
          0.35
        ),
        0
      );

      this.ball.applyForce({
        x:
          Phaser.Math.FloatBetween(
            -0.00008,
            0.00008
          ),

        y: -launchImpulse
      });

      this.state.lastBallMotionAt =
        this.time.now;

      this.resetLauncherVisuals(
        true
      );

      this.flashScreen(
        0xb27aff,
        0.1,
        70
      );

      this.shakeCamera(
        0.0022,
        65
      );

      vibrate(14);

      emit(
        "pumpball:ball-launched",
        {
          sessionId:
            this.state.sessionId,

          ballNumber:
            this.state.ballNumber,

          charge
        }
      );
    }

    resetLauncherVisuals(
      animate = false
    ) {
      this.state.launcherCharge = 0;

      if (this.launcherMeter) {
        this.launcherMeter.height = 0;
      }

      if (!animate) {
        this.launcherSpring
          ?.setScale(1, 1);

        if (this.launcherCap) {
          this.launcherCap.y = 1144;
        }

        return;
      }

      if (this.launcherSpring) {
        this.tweens.add({
          targets:
            this.launcherSpring,

          scaleY: 1.16,

          duration: 75,

          yoyo: true,

          ease: "Quad.Out",

          onComplete: () => {
            this.launcherSpring
              ?.setScale(1, 1);
          }
        });
      }

      if (this.launcherCap) {
        this.tweens.add({
          targets:
            this.launcherCap,

          y: 1128,

          duration: 65,

          yoyo: true,

          ease: "Quad.Out",

          onComplete: () => {
            if (
              this.launcherCap
            ) {
              this.launcherCap.y =
                1144;
            }
          }
        });
      }
    }

    nudge(direction) {
      if (
        !this.state.playing ||
        !this.state.ballLaunched ||
        !this.ball?.body
      ) {
        return;
      }

      const now =
        this.time.now;

      const cooldown =
        Number(
          CONFIG.nudging
            ?.cooldownMs
        ) || 650;

      if (
        now - this.lastNudgeAt <
        cooldown
      ) {
        return;
      }

      this.lastNudgeAt = now;

      const force =
        Number(
          CONFIG.nudging?.force
        ) || 0.00072;

      this.ball.applyForce({
        x:
          Math.sign(direction) *
          force,

        y: -force * 0.18
      });

      this.cameras.main.shake(
        55,
        0.0024
      );

      this.limitBallVelocity();

      vibrate(10);
    }

        startAttempt({
      sessionId,
      credit
    }) {
      if (
        !this.state.ready ||
        this.state.playing
      ) {
        return false;
      }

      this.resetAttemptState();

      this.state.sessionId =
        sessionId ||
        createSessionId();

      this.state.credit =
        credit || null;

      this.state.playing = true;
      this.state.paused = false;
      this.state.gameOver = false;

      this.state.score = 0;

      this.state.ballNumber = 0;

      this.state.ballsRemaining =
        Number(
          CONFIG.game?.ballsPerGame
        ) || 3;

      this.updateHud();

      this.time.delayedCall(
        Number(
          CONFIG.game
            ?.attemptStartDelayMs
        ) || 240,
        () => {
          if (
            !this.state.playing ||
            this.state.gameOver
          ) {
            return;
          }

          this.serveNextBall();
        }
      );

      emit(
        "pumpball:attempt-started",
        {
          sessionId:
            this.state.sessionId,

          creditId:
            this.state.credit?.id ||
            this.state.credit
              ?.creditId ||
            null
        }
      );

      return true;
    }

    resetAttemptState() {
      this.removeBall();

      this.clearBallTrail();

      this.state.playing = false;
      this.state.paused = false;
      this.state.gameOver = false;

      this.state.score = 0;

      this.state.ballNumber = 0;

      this.state.ballsRemaining =
        Number(
          CONFIG.game?.ballsPerGame
        ) || 3;

      this.state.sessionId = null;
      this.state.credit = null;

      this.state.ballInPlay = false;
      this.state.ballLaunched = false;

      this.state.launcherCharging =
        false;

      this.state.launcherChargeStartedAt =
        0;

      this.state.launcherCharge = 0;

      this.state.launchGraceUntil = 0;
      this.state.drainLocked = false;

      this.state.leftFlipperPressed =
        false;

      this.state.rightFlipperPressed =
        false;

      this.state.lastBallMotionAt = 0;
      this.state.lastBallPosition = null;

      this.state.ballSaveUsed = false;

      this.pointerControls.leftPointerId =
        null;

      this.pointerControls.rightPointerId =
        null;

      this.pointerControls.launcherPointerId =
        null;

      this.lastTrailAt = 0;
      this.lastNudgeAt = 0;

      this.resetLauncherVisuals();
      this.resetFlippersImmediately();
      this.updateHud();
    }

    serveNextBall() {
      if (
        !this.state.playing ||
        this.state.gameOver ||
        this.state.ballInPlay
      ) {
        return;
      }

      if (
        this.state.ballsRemaining <= 0
      ) {
        this.finishAttempt();

        return;
      }

      this.removeBall();

      this.state.ballNumber += 1;
      this.state.ballsRemaining -= 1;

      this.state.ballInPlay = true;
      this.state.ballLaunched = false;

      this.state.launcherCharging =
        false;

      this.state.launcherCharge = 0;

      this.state.launchGraceUntil = 0;
      this.state.drainLocked = false;

      this.state.ballSaveUsed = false;

      this.createBall();

      this.updateHud();

      emit(
        "pumpball:ball-served",
        {
          sessionId:
            this.state.sessionId,

          ballNumber:
            this.state.ballNumber,

          ballsRemaining:
            this.state.ballsRemaining
        }
      );
    }

    createBall() {
      const ballSettings =
        CONFIG.physics?.ball || {};

      const plungerSettings =
        CONFIG.plunger || {};

      const startX =
        Number(
          plungerSettings.laneX
        ) || 662;

      const startY =
        Number(
          plungerSettings.ballStartY
        ) || 1122;

      const radius =
        Number(
          ballSettings.radius
        ) || 15;

      this.ballShadow = this.add
        .ellipse(
          startX + 5,
          startY + 8,
          radius * 2.1,
          radius * 1.15,
          0x000000,
          0.34
        )
        .setDepth(
          DEPTH.ball - 1
        );

      this.ball = this.matter.add
        .image(
          startX,
          startY,
          "ball",
          null,
          {
            shape: {
              type: "circle",
              radius
            },

            density:
              Number(
                ballSettings.density
              ) || 0.0048,

            friction:
              Number(
                ballSettings.friction
              ) || 0.004,

            frictionAir:
              Number(
                ballSettings.frictionAir
              ) || 0.0014,

            frictionStatic:
              Number(
                ballSettings
                  .frictionStatic
              ) || 0,

            restitution:
              Number(
                ballSettings.restitution
              ) || 0.46,

            slop:
              Number(
                ballSettings.slop
              ) || 0.02,

            label: LABELS.ball,

            ignoreGravity: true,

            isStatic: true
          }
        )
        .setDisplaySize(
          radius * 2,
          radius * 2
        )
        .setDepth(
          DEPTH.ball
        );

      this.ball.body.label =
        LABELS.ball;

      this.ball.setFixedRotation();

      this.ball.setVelocity(
        0,
        0
      );

      this.ball.setAngularVelocity(
        0
      );

      this.state.lastBallPosition = {
        x: startX,
        y: startY
      };

      this.state.lastBallMotionAt =
        this.time.now;

      this.resetLauncherVisuals();

      this.flashScreen(
        0xffffff,
        0.055,
        70
      );
    }

    removeBall() {
      if (this.ball?.active) {
        this.ball.destroy();
      }

      if (
        this.ballShadow?.active
      ) {
        this.ballShadow.destroy();
      }

      this.ball = null;
      this.ballShadow = null;

      this.state.ballInPlay = false;
      this.state.ballLaunched = false;

      this.state.launcherCharging =
        false;

      this.state.launcherCharge = 0;

      this.clearBallTrail();
      this.resetLauncherVisuals();
    }

    handleDrain() {
      if (
        !this.state.playing ||
        !this.state.ballInPlay ||
        this.state.drainLocked
      ) {
        return;
      }

      if (
        this.time.now <
        this.state.launchGraceUntil
      ) {
        return;
      }

      this.state.drainLocked = true;

      const drainedBallNumber =
        this.state.ballNumber;

      const ballSaveEnabled =
        Boolean(
          CONFIG.gameModes
            ?.ballSave?.enabled
        );

      const ballSaveWindow =
        Number(
          CONFIG.gameModes
            ?.ballSave?.durationMs
        ) || 0;

      const launchedRecently =
        this.state.ballLaunched &&
        this.time.now -
          this.state
            .launchGraceUntil <
          ballSaveWindow;

      const shouldSaveBall =
        ballSaveEnabled &&
        !this.state.ballSaveUsed &&
        launchedRecently;

      if (shouldSaveBall) {
        this.state.ballSaveUsed = true;

        this.showFloatingScore(
          0,
          WORLD.width / 2,
          WORLD.height - 180,
          "BALL SAVE"
        );

        this.flashScreen(
          0x71e6ff,
          0.2,
          140
        );

        this.shakeCamera(
          0.004,
          110
        );

        this.time.delayedCall(
          320,
          () => {
            if (
              !this.state.playing ||
              this.state.gameOver
            ) {
              return;
            }

            this.removeBall();

            this.state.ballNumber =
              Math.max(
                0,
                this.state.ballNumber -
                  1
              );

            this.state.ballsRemaining +=
              1;

            this.state.drainLocked =
              false;

            this.serveNextBall();
          }
        );

        return;
      }

      this.flashScreen(
        0xff4f73,
        0.13,
        110
      );

      this.shakeCamera(
        0.004,
        115
      );

      vibrate(
        [18, 22, 18]
      );

      emit(
        "pumpball:ball-drained",
        {
          sessionId:
            this.state.sessionId,

          ballNumber:
            drainedBallNumber,

          score:
            this.state.score,

          ballsRemaining:
            this.state.ballsRemaining
        }
      );

      this.time.delayedCall(
        Number(
          CONFIG.game
            ?.ballDrainDelayMs
        ) || 760,
        () => {
          if (
            !this.state.playing ||
            this.state.gameOver
          ) {
            return;
          }

          this.removeBall();

          this.state.drainLocked =
            false;

          if (
            this.state.ballsRemaining >
            0
          ) {
            this.serveNextBall();
          } else {
            this.finishAttempt();
          }
        }
      );
    }

    async finishAttempt() {
      if (
        this.state.gameOver ||
        !this.state.playing
      ) {
        return;
      }

      this.state.gameOver = true;
      this.state.playing = false;

      this.state.launcherCharging =
        false;

      this.state.leftFlipperPressed =
        false;

      this.state.rightFlipperPressed =
        false;

      this.removeBall();
      this.resetFlippersImmediately();

      const finalScore =
        Math.max(
          0,
          Math.floor(
            this.state.score
          )
        );

      emit(
        "pumpball:attempt-ended",
        {
          sessionId:
            this.state.sessionId,

          score: finalScore,

          ballCount:
            this.state.ballNumber
        }
      );

      try {
        await finalizeAttempt({
          score: finalScore,

          sessionId:
            this.state.sessionId,

          credit:
            this.state.credit
        });
      } catch (error) {
        console.error(
          "[PumpBall] Attempt finalization failed.",
          error
        );

        showGameOverPanel({
          score: finalScore,
          rank: null,
          improved: false,
          previousBest:
            getPersonalBest()
        });

        if (dom.rankFeedback) {
          dom.rankFeedback.textContent =
            "Your game ended, but the score could not be recorded. Please refresh before purchasing another attempt.";
        }
      }
    }

    updateHud() {
      if (dom.scoreDisplay) {
        dom.scoreDisplay.textContent =
          formatScore(
            this.state.score
          );
      }

      if (dom.ballDisplay) {
        const totalBalls =
          Number(
            CONFIG.game
              ?.ballsPerGame
          ) || 3;

        const visibleBall =
          this.state.playing
            ? Phaser.Math.Clamp(
                this.state
                  .ballNumber,
                0,
                totalBalls
              )
            : 0;

        dom.ballDisplay.textContent =
          `${visibleBall} / ${totalBalls}`;
      }
    }

    update(
      time,
      delta
    ) {
      if (!this.state.ready) {
        return;
      }

      this.updateInputState();
      this.updateFlippers(delta);
      this.updateLauncherCharge();

      if (
        !this.state.playing ||
        this.state.paused ||
        this.state.gameOver
      ) {
        return;
      }

      if (!this.ball?.body) {
        return;
      }

      this.updateBallShadow();

      if (
        !this.state.ballLaunched
      ) {
        this.lockBallToLauncher();

        return;
      }

      this.createBallTrail();
      this.limitBallVelocity();
      this.trackBallMotion();
      this.handleOutOfBoundsBall();
      this.handleStuckBall();
    }

    updateInputState() {
      const leftPressed =
        Boolean(
          this.keys.left?.isDown ||
          this.keys.leftAlt?.isDown ||
          this.pointerControls
            .leftPointerId !== null
        );

      const rightPressed =
        Boolean(
          this.keys.right?.isDown ||
          this.keys.rightAlt?.isDown ||
          this.pointerControls
            .rightPointerId !== null
        );

      const launcherPressed =
        Boolean(
          this.keys.launch?.isDown ||
          this.keys.launchAlt
            ?.isDown ||
          this.pointerControls
            .launcherPointerId !==
            null
        );

      this.state.leftFlipperPressed =
        leftPressed;

      this.state.rightFlipperPressed =
        rightPressed;

      if (
        launcherPressed &&
        !this.state
          .launcherCharging &&
        !this.state.ballLaunched
      ) {
        this.beginLauncherCharge();
      }

      if (
        !launcherPressed &&
        this.state
          .launcherCharging
      ) {
        this.releaseLauncher();
      }
    }

    updateFlippers(delta) {
      if (
        !this.leftFlipper ||
        !this.rightFlipper
      ) {
        return;
      }

      const settings =
        CONFIG.flippers || {};

      const leftSettings =
        settings.left || {};

      const rightSettings =
        settings.right || {};

      const leftRest =
        Number(
          leftSettings
            .restAngleDegrees
        ) || 24;

      const leftActive =
        Number(
          leftSettings
            .activeAngleDegrees
        ) || -28;

      const rightRest =
        Number(
          rightSettings
            .restAngleDegrees
        ) || -24;

      const rightActive =
        Number(
          rightSettings
            .activeAngleDegrees
        ) || 28;

      const riseSpeed =
        Number(
          settings.riseSpeed
        ) || 0.032;

      const returnSpeed =
        Number(
          settings.returnSpeed
        ) || 0.022;

      const leftTarget =
        this.state
          .leftFlipperPressed
          ? leftActive
          : leftRest;

      const rightTarget =
        this.state
          .rightFlipperPressed
          ? rightActive
          : rightRest;

      const leftSpeed =
        this.state
          .leftFlipperPressed
          ? riseSpeed
          : returnSpeed;

      const rightSpeed =
        this.state
          .rightFlipperPressed
          ? riseSpeed
          : returnSpeed;

      const leftAngle =
        Phaser.Math.Angle.RotateTo(
          Phaser.Math.DegToRad(
            this.leftFlipper.angle
          ),

          Phaser.Math.DegToRad(
            leftTarget
          ),

          leftSpeed *
            Math.max(
              0.5,
              delta / 16.67
            )
        );

      const rightAngle =
        Phaser.Math.Angle.RotateTo(
          Phaser.Math.DegToRad(
            this.rightFlipper.angle
          ),

          Phaser.Math.DegToRad(
            rightTarget
          ),

          rightSpeed *
            Math.max(
              0.5,
              delta / 16.67
            )
        );

      this.leftFlipper.setRotation(
        leftAngle
      );

      this.rightFlipper.setRotation(
        rightAngle
      );

      if (
        this.leftFlipperBody
      ) {
        Phaser.Physics.Matter.Matter.Body.setAngle(
          this.leftFlipperBody,
          leftAngle
        );

        Phaser.Physics.Matter.Matter.Body.setAngularVelocity(
          this.leftFlipperBody,
          0
        );
      }

      if (
        this.rightFlipperBody
      ) {
        Phaser.Physics.Matter.Matter.Body.setAngle(
          this.rightFlipperBody,
          rightAngle
        );

        Phaser.Physics.Matter.Matter.Body.setAngularVelocity(
          this.rightFlipperBody,
          0
        );
      }
    }

    resetFlippersImmediately() {
      if (
        !this.leftFlipper ||
        !this.rightFlipper
      ) {
        return;
      }

      const leftRest =
        Number(
          CONFIG.flippers?.left
            ?.restAngleDegrees
        ) || 24;

      const rightRest =
        Number(
          CONFIG.flippers?.right
            ?.restAngleDegrees
        ) || -24;

      const leftAngle =
        Phaser.Math.DegToRad(
          leftRest
        );

      const rightAngle =
        Phaser.Math.DegToRad(
          rightRest
        );

      this.leftFlipper.setRotation(
        leftAngle
      );

      this.rightFlipper.setRotation(
        rightAngle
      );

      if (
        this.leftFlipperBody
      ) {
        Phaser.Physics.Matter.Matter.Body.setAngle(
          this.leftFlipperBody,
          leftAngle
        );
      }

      if (
        this.rightFlipperBody
      ) {
        Phaser.Physics.Matter.Matter.Body.setAngle(
          this.rightFlipperBody,
          rightAngle
        );
      }
    }

    lockBallToLauncher() {
      if (!this.ball?.body) {
        return;
      }

      const laneX =
        Number(
          CONFIG.plunger?.laneX
        ) || 662;

      const ballStartY =
        Number(
          CONFIG.plunger
            ?.ballStartY
        ) || 1122;

      const chargeOffset =
        Phaser.Math.Linear(
          0,
          38,
          this.state
            .launcherCharge
        );

      const targetY =
        ballStartY +
        chargeOffset;

      this.ball.setPosition(
        laneX,
        targetY
      );

      this.ball.setVelocity(
        0,
        0
      );

      this.ball.setAngularVelocity(
        0
      );
    }

    updateBallShadow() {
      if (
        !this.ball ||
        !this.ballShadow
      ) {
        return;
      }

      this.ballShadow.setPosition(
        this.ball.x + 5,
        this.ball.y + 8
      );

      const velocity =
        this.ball.body?.velocity;

      const speed =
        velocity
          ? Math.hypot(
              velocity.x,
              velocity.y
            )
          : 0;

      this.ballShadow.setAlpha(
        Phaser.Math.Clamp(
          0.35 - speed * 0.006,
          0.12,
          0.34
        )
      );
    }

    limitBallVelocity() {
      if (!this.ball?.body) {
        return;
      }

      const velocity =
        this.ball.body.velocity;

      const speed =
        Math.hypot(
          velocity.x,
          velocity.y
        );

      const maximumSpeed =
        Number(
          CONFIG.physics?.ball
            ?.maximumSpeed
        ) || 34;

      if (
        speed <= maximumSpeed ||
        speed <= 0
      ) {
        return;
      }

      const scale =
        maximumSpeed / speed;

      this.ball.setVelocity(
        velocity.x * scale,
        velocity.y * scale
      );
    }

    trackBallMotion() {
      if (!this.ball?.body) {
        return;
      }

      const currentPosition = {
        x: this.ball.x,
        y: this.ball.y
      };

      const previous =
        this.state
          .lastBallPosition;

      if (!previous) {
        this.state.lastBallPosition =
          currentPosition;

        this.state.lastBallMotionAt =
          this.time.now;

        return;
      }

      const distance =
        Phaser.Math.Distance.Between(
          previous.x,
          previous.y,
          currentPosition.x,
          currentPosition.y
        );

      const minimumMovement =
        Number(
          CONFIG.validation
            ?.minimumMotionDistance
        ) || 2.4;

      if (
        distance >=
        minimumMovement
      ) {
        this.state.lastBallPosition =
          currentPosition;

        this.state.lastBallMotionAt =
          this.time.now;
      }
    }

    handleOutOfBoundsBall() {
      if (
        !this.ball ||
        this.state.drainLocked
      ) {
        return;
      }

      const margin =
        Number(
          CONFIG.validation
            ?.outOfBoundsMargin
        ) || 120;

      const outOfBounds =
        this.ball.x < -margin ||
        this.ball.x >
          WORLD.width + margin ||
        this.ball.y < -margin ||
        this.ball.y >
          WORLD.height + margin;

      if (!outOfBounds) {
        return;
      }

      this.handleDrain();
    }

    handleStuckBall() {
      if (
        !this.ball?.body ||
        !this.state.ballLaunched ||
        this.state.drainLocked
      ) {
        return;
      }

      const timeout =
        Number(
          CONFIG.validation
            ?.stuckBallTimeoutMs
        ) || 9000;

      if (
        this.time.now -
          this.state
            .lastBallMotionAt <
        timeout
      ) {
        return;
      }

      const velocity =
        this.ball.body.velocity;

      const speed =
        Math.hypot(
          velocity.x,
          velocity.y
        );

      const maximumStuckSpeed =
        Number(
          CONFIG.validation
            ?.stuckBallMaximumSpeed
        ) || 0.85;

      if (
        speed >
        maximumStuckSpeed
      ) {
        this.state.lastBallMotionAt =
          this.time.now;

        return;
      }

      const rescueForce =
        Number(
          CONFIG.validation
            ?.stuckBallRescueForce
        ) || 0.00125;

      this.ball.applyForce({
        x:
          Phaser.Math.FloatBetween(
            -rescueForce,
            rescueForce
          ),

        y:
          -Math.abs(
            rescueForce * 1.8
          )
      });

      this.state.lastBallMotionAt =
        this.time.now;

      this.showFloatingScore(
        0,
        this.ball.x,
        this.ball.y - 24,
        "BALL RESCUE"
      );

      this.flashScreen(
        0x76dfff,
        0.08,
        80
      );

      this.limitBallVelocity();
    }

      }

  async function finalizeAttempt({
    score,
    sessionId,
    credit
  }) {
    const previousBest =
      getPersonalBest();

    let submissionResult = null;

    if (
      Leaderboard &&
      typeof Leaderboard.submitScore ===
        "function"
    ) {
      submissionResult =
        await Leaderboard.submitScore({
          score,
          sessionId,
          playerId:
            credit?.playerId ||
            credit?.walletAddress ||
            Payments?.getState?.()
              ?.walletAddress ||
            null,
          verified: true
        });
    }

    if (
      Leaderboard &&
      typeof Leaderboard.refresh ===
        "function"
    ) {
      await Leaderboard.refresh();
    }

    const updatedSummary =
      Leaderboard?.getPlayerSummary?.() ||
      {};

    const updatedBest =
      Math.max(
        Number(
          updatedSummary.bestScore
        ) || 0,
        Number(
          submissionResult?.bestScore
        ) || 0,
        score
      );

    const rank =
      Number(
        submissionResult?.rank
      ) ||
      Number(
        updatedSummary.rank
      ) ||
      null;

    const improved =
      Boolean(
        submissionResult?.improved
      ) ||
      updatedBest >
        previousBest;

    updatePersonalBestUi();

    showGameOverPanel({
      score,
      rank,
      improved,
      previousBest
    });

    runtime.currentCredit = null;

    emit(
      "pumpball:score-submitted",
      {
        score,
        sessionId,
        rank,
        improved,
        bestScore:
          updatedBest
      }
    );
  }

  function getAvailableCredit() {
    if (
      !Payments ||
      typeof Payments
        .getAvailablePlayCredits !==
        "function"
    ) {
      return null;
    }

    const credits =
      Payments.getAvailablePlayCredits();

    if (
      !Array.isArray(credits) ||
      credits.length === 0
    ) {
      return null;
    }

    return credits[0] || null;
  }

  async function consumeCreditForSession(
    credit,
    sessionId
  ) {
    if (!credit) {
      throw new Error(
        "No valid play credit was found."
      );
    }

    if (
      !Payments ||
      typeof Payments
        .consumePlayCredit !==
        "function"
    ) {
      return credit;
    }

    const creditId =
      credit.id ||
      credit.creditId ||
      credit.playCreditId ||
      null;

    const consumed =
      await Payments.consumePlayCredit(
        creditId,
        sessionId
      );

    return consumed || credit;
  }

  async function startAttemptWithCredit(
    credit
  ) {
    if (
      runtime.startingAttempt
    ) {
      return;
    }

    if (
      !runtime.scene ||
      !runtime.scene.state.ready
    ) {
      setFeedback(
        "The game is still loading. Please try again in a moment.",
        "error"
      );

      return;
    }

    if (
      runtime.scene.state.playing
    ) {
      return;
    }

    runtime.startingAttempt = true;

    setButtonsBusy(true);

    try {
      const sessionId =
        createSessionId();

      const consumedCredit =
        await consumeCreditForSession(
          credit,
          sessionId
        );

      runtime.currentSessionId =
        sessionId;

      runtime.currentCredit =
        consumedCredit;

      setFeedback("");

      const started =
        runtime.scene.startAttempt({
          sessionId,
          credit:
            consumedCredit
        });

      if (!started) {
        throw new Error(
          "The game could not begin."
        );
      }

      hideOverlay();
    } catch (error) {
      runtime.latestError = error;

      console.error(
        "[PumpBall] Could not start attempt.",
        error
      );

      setFeedback(
        error?.message ||
          "The attempt could not be started.",
        "error"
      );
    } finally {
      runtime.startingAttempt = false;

      setButtonsBusy(false);
    }
  }

  async function handlePaidPlay() {
    if (
      runtime.startingAttempt
    ) {
      return;
    }

    setFeedback("");

    setButtonsBusy(true);

    try {
      let credit =
        getAvailableCredit();

      if (!credit) {
        if (
          !Payments ||
          typeof Payments.purchasePlay !==
            "function"
        ) {
          throw new Error(
            "Payments are unavailable."
          );
        }

        setFeedback(
          "Preparing your tournament attempt…",
          "neutral"
        );

        credit =
          await Payments.purchasePlay({
            tournamentId:
              CONFIG.tournament.id,

            amountLamports:
              CONFIG.tournament
                .entryPriceLamports,

            amountSol:
              CONFIG.tournament
                .entryPriceSol
          });
      }

      if (!credit) {
        throw new Error(
          "No play credit was issued."
        );
      }

      setButtonsBusy(false);

      await startAttemptWithCredit(
        credit
      );
    } catch (error) {
      runtime.latestError = error;

      console.error(
        "[PumpBall] Paid play failed.",
        error
      );

      setFeedback(
        error?.message ||
          "The payment could not be completed.",
        "error"
      );

      setButtonsBusy(false);
    }
  }

  async function handleFreeTestPlay() {
    if (
      runtime.startingAttempt
    ) {
      return;
    }

    if (
      !CONFIG.app
        ?.allowFreeTestGame
    ) {
      setFeedback(
        "Free test games are disabled.",
        "error"
      );

      return;
    }

    setFeedback("");

    setButtonsBusy(true);

    try {
      if (
        !Payments ||
        typeof Payments
          .createTestPlayCredit !==
          "function"
      ) {
        throw new Error(
          "Test play credits are unavailable."
        );
      }

      const credit =
        await Payments.createTestPlayCredit({
          tournamentId:
            CONFIG.tournament.id,

          metadata: {
            source:
              "free-test-button",

            createdAt:
              new Date().toISOString()
          }
        });

      if (!credit) {
        throw new Error(
          "The test credit could not be created."
        );
      }

      setButtonsBusy(false);

      await startAttemptWithCredit(
        credit
      );
    } catch (error) {
      runtime.latestError = error;

      console.error(
        "[PumpBall] Test game failed.",
        error
      );

      setFeedback(
        error?.message ||
          "The test game could not be started.",
        "error"
      );

      setButtonsBusy(false);
    }
  }

  async function handleWalletConnection() {
    if (
      !Payments ||
      typeof Payments.connectWallet !==
        "function"
    ) {
      setFeedback(
        "Wallet connection is unavailable.",
        "error"
      );

      return;
    }

    setButtonsBusy(true);

    try {
      const paymentState =
        Payments.getState?.();

      if (
        paymentState?.walletConnected &&
        typeof Payments.disconnectWallet ===
          "function"
      ) {
        await Payments.disconnectWallet();
      } else {
        await Payments.connectWallet();
      }

      updateWalletUi();

      if (
        Leaderboard &&
        typeof Leaderboard.refresh ===
          "function"
      ) {
        await Leaderboard.refresh();
      }

      updatePersonalBestUi();
    } catch (error) {
      runtime.latestError = error;

      console.error(
        "[PumpBall] Wallet action failed.",
        error
      );

      setFeedback(
        error?.message ||
          "The wallet action could not be completed.",
        "error"
      );
    } finally {
      setButtonsBusy(false);
    }
  }

  function returnToLeaderboard() {
    const section =
      document.getElementById(
        "leaderboard-section"
      );

    section?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function prepareNextAttempt() {
    if (
      runtime.scene?.state.playing
    ) {
      return;
    }

    showStartPanel();

    if (dom.finalScoreDisplay) {
      dom.finalScoreDisplay.textContent =
        "0";
    }

    if (dom.rankFeedback) {
      dom.rankFeedback.textContent =
        "Your verified rank will appear here.";
    }

    setFeedback("");
  }

  function getDialogElements() {
    return {
      dialog:
        document.getElementById(
          "information-dialog"
        ),

      title:
        document.getElementById(
          "dialog-title"
        ),

      body:
        document.getElementById(
          "dialog-body"
        ),

      closeButton:
        document.getElementById(
          "close-dialog-button"
        )
    };
  }

  function openInformationDialog(
    title,
    content
  ) {
    const elements =
      getDialogElements();

    if (
      !elements.dialog ||
      !elements.title ||
      !elements.body
    ) {
      return;
    }

    elements.title.textContent =
      title;

    elements.body.innerHTML =
      content;

    if (
      typeof elements.dialog
        .showModal === "function"
    ) {
      elements.dialog.showModal();
    } else {
      elements.dialog.setAttribute(
        "open",
        ""
      );
    }
  }

  function closeInformationDialog() {
    const { dialog } =
      getDialogElements();

    if (!dialog) {
      return;
    }

    if (
      typeof dialog.close ===
        "function"
    ) {
      dialog.close();
    } else {
      dialog.removeAttribute(
        "open"
      );
    }
  }

  function bindInformationDialogs() {
    const rulesButton =
      document.getElementById(
        "open-rules-button"
      );

    const fairPlayButton =
      document.getElementById(
        "open-fair-play-button"
      );

    const supportButton =
      document.getElementById(
        "open-support-button"
      );

    const {
      dialog,
      closeButton
    } = getDialogElements();

    rulesButton?.addEventListener(
      "click",
      () => {
        openInformationDialog(
          "Official Rules",
          `
            <p>
              Tournament #001 uses paid individual attempts.
              Each attempt includes three balls.
            </p>

            <p>
              Players may enter an unlimited number of times.
              Only each player’s highest verified score appears
              in the active-season standings.
            </p>

            <p>
              The top two eligible players at the close of the
              tournament each receive 0.5 SOL.
            </p>

            <p>
              Tie breakers are applied in this order:
              fewest attempts, earliest qualifying score, then
              earliest completed session.
            </p>
          `
        );
      }
    );

    fairPlayButton?.addEventListener(
      "click",
      () => {
        openInformationDialog(
          "Fair Play",
          `
            <p>
              Scores must come from a valid PumpBall session and
              a verified play credit.
            </p>

            <p>
              Automated play, altered client code, replayed payment
              proofs, manipulated session data, or any other attempt
              to falsify a score may result in removal.
            </p>

            <p>
              Tournament records are isolated by season so prior
              standings remain available for auditing.
            </p>
          `
        );
      }
    );

    supportButton?.addEventListener(
      "click",
      () => {
        openInformationDialog(
          "Support",
          `
            <p>
              If a payment succeeds but your attempt does not begin,
              do not immediately purchase another play.
            </p>

            <p>
              Save your wallet address, transaction signature,
              approximate payment time, and a screenshot of any
              visible error.
            </p>

            <p>
              Development test credits do not represent an on-chain
              payment and have no cash value.
            </p>
          `
        );
      }
    );

    closeButton?.addEventListener(
      "click",
      closeInformationDialog
    );

    dialog?.addEventListener(
      "click",
      (event) => {
        if (
          event.target === dialog
        ) {
          closeInformationDialog();
        }
      }
    );

    dialog?.addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();

        closeInformationDialog();
      }
    );
  }

  function bindUiEvents() {
    dom.purchasePlayButton
      ?.addEventListener(
        "click",
        handlePaidPlay
      );

    dom.freeTestButton
      ?.addEventListener(
        "click",
        handleFreeTestPlay
      );

    dom.playAgainButton
      ?.addEventListener(
        "click",
        handlePaidPlay
      );

    dom.returnToLeaderboardButton
      ?.addEventListener(
        "click",
        returnToLeaderboard
      );

    dom.connectWalletButton
      ?.addEventListener(
        "click",
        handleWalletConnection
      );

    window.addEventListener(
      "pumpball:wallet-changed",
      () => {
        updateWalletUi();
        updatePersonalBestUi();
      }
    );

    window.addEventListener(
      "pumpball:leaderboard-updated",
      () => {
        updatePersonalBestUi();
      }
    );

    document.addEventListener(
      "visibilitychange",
      () => {
        const scene =
          runtime.scene;

        if (!scene) {
          return;
        }

        scene.state.paused =
          document.hidden;

        if (document.hidden) {
          scene.state.leftFlipperPressed =
            false;

          scene.state.rightFlipperPressed =
            false;

          if (
            scene.state
              .launcherCharging
          ) {
            scene.releaseLauncher();
          }
        }
      }
    );

    bindInformationDialogs();
  }

  async function initializeServices() {
    if (
      Payments &&
      typeof Payments.initialize ===
        "function"
    ) {
      await Payments.initialize();
    }

    updateWalletUi();

    if (
      Leaderboard &&
      typeof Leaderboard.initialize ===
        "function"
    ) {
      await Leaderboard.initialize({
        tournamentId:
          CONFIG.tournament.id,

        season:
          CONFIG.tournament.season
      });
    }

    if (
      Leaderboard &&
      typeof Leaderboard.refresh ===
        "function"
    ) {
      await Leaderboard.refresh();
    }

    updatePersonalBestUi();
  }

    function createPhaserGame() {
    if (runtime.game) {
      return runtime.game;
    }

    const gameContainer =
      document.getElementById(
        "game-container"
      );

    if (!gameContainer) {
      throw new Error(
        "The #game-container element is missing."
      );
    }

    const rendererPreference =
      String(
        CONFIG.game?.renderer ||
        "AUTO"
      ).toUpperCase();

    let rendererType =
      Phaser.AUTO;

    if (
      rendererPreference ===
      "WEBGL"
    ) {
      rendererType =
        Phaser.WEBGL;
    }

    if (
      rendererPreference ===
      "CANVAS"
    ) {
      rendererType =
        Phaser.CANVAS;
    }

    const gameConfig = {
      type: rendererType,

      parent: "game-container",

      width: WORLD.width,
      height: WORLD.height,

      backgroundColor:
        CONFIG.game
          ?.backgroundColor ||
        "#070707",

      transparent: false,

      antialias:
        CONFIG.game?.antialias !==
        false,

      roundPixels:
        Boolean(
          CONFIG.game?.roundPixels
        ),

      pixelArt:
        Boolean(
          CONFIG.game?.pixelArt
        ),

      preserveDrawingBuffer:
        Boolean(
          CONFIG.game
            ?.preserveDrawingBuffer
        ),

      scene: [
        PumpBallScene
      ],

      physics: {
        default: "matter",

        matter: {
          gravity: {
            x: 0,
            y:
              Number(
                CONFIG.physics
                  ?.gravity?.y
              ) || 0.92
          },

          enableSleep: false,

          debug:
            Boolean(
              CONFIG.app
                ?.showPhysicsBodies
            )
        }
      },

      scale: {
        mode:
          Phaser.Scale.FIT,

        autoCenter:
          Phaser.Scale
            .CENTER_BOTH,

        parent:
          "game-container",

        width: WORLD.width,
        height: WORLD.height,

        min: {
          width: 320,
          height: 568
        },

        max: {
          width: WORLD.width,
          height: WORLD.height
        }
      },

      input: {
        activePointers:
          Number(
            CONFIG.controls
              ?.activePointers
          ) || 4,

        touch: {
          capture: true
        },

        mouse: {
          preventDefaultWheel:
            true
        },

        keyboard: {
          capture: [
            Phaser.Input.Keyboard
              .KeyCodes.LEFT,

            Phaser.Input.Keyboard
              .KeyCodes.RIGHT,

            Phaser.Input.Keyboard
              .KeyCodes.DOWN,

            Phaser.Input.Keyboard
              .KeyCodes.SPACE,

            Phaser.Input.Keyboard
              .KeyCodes.A,

            Phaser.Input.Keyboard
              .KeyCodes.D,

            Phaser.Input.Keyboard
              .KeyCodes.Q,

            Phaser.Input.Keyboard
              .KeyCodes.E
          ]
        }
      },

      render: {
        antialias:
          CONFIG.game?.antialias !==
          false,

        roundPixels:
          Boolean(
            CONFIG.game?.roundPixels
          ),

        powerPreference:
          "high-performance"
      },

      callbacks: {
        postBoot: (game) => {
          game.events.emit(
            "pumpball:phaser-booted"
          );
        }
      }
    };

    runtime.game =
      new Phaser.Game(
        gameConfig
      );

    return runtime.game;
  }

  function updateControlLabels() {
    const leftControl =
      document.getElementById(
        "left-control-key"
      );

    const rightControl =
      document.getElementById(
        "right-control-key"
      );

    const launcherControl =
      document.getElementById(
        "launcher-control-key"
      );

    const isTouchDevice =
      window.matchMedia?.(
        "(pointer: coarse)"
      )?.matches ||
      navigator.maxTouchPoints >
        0;

    if (isTouchDevice) {
      if (leftControl) {
        leftControl.textContent =
          "Tap Left";
      }

      if (rightControl) {
        rightControl.textContent =
          "Tap Right";
      }

      if (launcherControl) {
        launcherControl.textContent =
          "Hold Lane";
      }

      return;
    }

    if (leftControl) {
      leftControl.textContent =
        "← / A";
    }

    if (rightControl) {
      rightControl.textContent =
        "→ / D";
    }

    if (launcherControl) {
      launcherControl.textContent =
        "Space";
    }
  }

  function exposeDevelopmentApi() {
    if (!CONFIG.app?.debug) {
      return;
    }

    window.PumpBallDebug = {
      getRuntime() {
        return runtime;
      },

      getScene() {
        return runtime.scene;
      },

      addScore(amount = 1000) {
        runtime.scene?.addScore(
          amount,
          WORLD.width / 2,
          WORLD.height / 2,
          "DEBUG"
        );
      },

      drainBall() {
        runtime.scene?.handleDrain();
      },

      finishAttempt() {
        runtime.scene?.finishAttempt();
      },

      launchBall() {
        const scene =
          runtime.scene;

        if (
          !scene ||
          scene.state.ballLaunched
        ) {
          return;
        }

        scene.state.launcherCharge =
          1;

        scene.state.launcherCharging =
          true;

        scene.releaseLauncher();
      },

      createTestCredit() {
        return Payments
          ?.createTestPlayCredit?.({
            tournamentId:
              CONFIG.tournament.id,

            metadata: {
              source:
                "debug-api"
            }
          });
      },

      clearCredits() {
        return Payments
          ?.clearDevelopmentCredits?.();
      },

      refreshLeaderboard() {
        return Leaderboard
          ?.refresh?.();
      }
    };
  }

  function handleGlobalError(
    event
  ) {
    const error =
      event?.error ||
      new Error(
        event?.message ||
        "Unknown PumpBall error."
      );

    runtime.latestError =
      error;

    console.error(
      "[PumpBall] Unhandled error:",
      error
    );

    if (
      !runtime.initialized
    ) {
      setFeedback(
        "PumpBall could not finish loading. Refresh the page and try again.",
        "error"
      );
    }
  }

  function handleUnhandledRejection(
    event
  ) {
    runtime.latestError =
      event?.reason || null;

    console.error(
      "[PumpBall] Unhandled promise rejection:",
      event?.reason
    );
  }

  function bindGlobalErrorHandling() {
    window.addEventListener(
      "error",
      handleGlobalError
    );

    window.addEventListener(
      "unhandledrejection",
      handleUnhandledRejection
    );
  }

  async function initializePumpBall() {
    if (runtime.initialized) {
      return;
    }

    cacheDom();
    bindGlobalErrorHandling();

    updateTournamentUi();
    updateCountdown();
    updateControlLabels();

    window.setInterval(
      updateCountdown,
      1000
    );

    bindUiEvents();

    setButtonsBusy(true);

    setFeedback(
      "Loading PumpBall…",
      "neutral"
    );

    try {
      await initializeServices();

      createPhaserGame();

      exposeDevelopmentApi();

      runtime.initialized =
        true;

      setFeedback("");

      showStartPanel();

      emit(
        "pumpball:initialized",
        {
          tournamentId:
            CONFIG.tournament.id,

          season:
            CONFIG.tournament
              .season,

          developmentMode:
            Boolean(
              CONFIG.app
                ?.developmentMode
            )
        }
      );
    } catch (error) {
      runtime.latestError =
        error;

      console.error(
        "[PumpBall] Initialization failed.",
        error
      );

      setFeedback(
        error?.message ||
          "PumpBall could not load.",
        "error"
      );

      showStartPanel();
    } finally {
      setButtonsBusy(false);
    }
  }

  window.PumpBallGame = {
    initialize:
      initializePumpBall,

    getState() {
      return {
        initialized:
          runtime.initialized,

        startingAttempt:
          runtime.startingAttempt,

        currentSessionId:
          runtime.currentSessionId,

        currentCredit:
          runtime.currentCredit,

        latestError:
          runtime.latestError,

        sceneState:
          runtime.scene
            ? {
                ...runtime.scene
                  .state
              }
            : null
      };
    },

    startPaidAttempt:
      handlePaidPlay,

    startFreeTestAttempt:
      handleFreeTestPlay,

    showStartPanel:
      prepareNextAttempt,

    scrollToLeaderboard:
      returnToLeaderboard
  };

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initializePumpBall,
      {
        once: true
      }
    );
  } else {
    initializePumpBall();
  }
})();
 
