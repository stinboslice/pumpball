"use strict";

/**
 * PumpBall
 * Single-table competitive pinball game.
 *
 * Core loop:
 * authorize attempt
 * → consume one play credit
 * → play three balls
 * → submit final score
 * → update leaderboard only when score is higher
 *
 * Required globals:
 * window.PUMPBALL_CONFIG
 * window.PUMPBALL_UTILS
 * window.PumpBallPayments
 * window.PumpBallLeaderboard
 * Phaser 3.90+
 */

(() => {
  const CONFIG = window.PUMPBALL_CONFIG;
  const UTILS = window.PUMPBALL_UTILS;

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

  const WORLD = {
    width: 1024,
    height: 1820
  };

  const DEPTH = {
    playfield: 0,
    staticDecor: 5,
    effectsBehind: 8,
    mechanisms: 10,
    ballTrail: 18,
    ball: 20,
    effectsFront: 30,
    text: 40,
    flash: 100
  };

  const LABELS = {
    ball: "ball",
    drain: "drain",
    wall: "wall",
    bumper: "bumper",
    slingshotLeft: "slingshot-left",
    slingshotRight: "slingshot-right",
    reactor: "reactor",
    launcherSensor: "launcher-sensor"
  };

  const SCORE_VALUES = {
    bumper: 100,
    slingshot: 50,
    reactor: 500,
    passiveRail: 5
  };

  const DEFAULTS = {
    ballsPerGame: 3,

    ball: {
      diameter: 42,
      restitution: 0.64,
      friction: 0.002,
      frictionAir: 0.012,
      density: 0.0022,
      maxSpeed: 34,
      minActiveSpeed: 0.5
    },

    flippers: {
      width: 198,
      height: 58,

      left: {
        x: 338,
        y: 1640,
        restingAngle: -0.52,
        activeAngle: -1.02
      },

      right: {
        x: 686,
        y: 1640,
        restingAngle: 0.52,
        activeAngle: 1.02
      },

      angularSpeed: 0.22,
      returnSpeed: 0.16
    },

    launcher: {
      x: 913,
      y: 1600,
      ballX: 914,
      ballY: 1544,
      minimumForce: 18,
      maximumForce: 43,
      chargeMs: 1200
    },

    drain: {
      x: 512,
      y: 1778,
      width: 285,
      height: 80
    }
  };

  const TABLE = {
    bumpers: [
      { x: 405, y: 455 },
      { x: 618, y: 455 },
      { x: 405, y: 660 },
      { x: 618, y: 660 }
    ],

    slingshots: {
      left: {
        x: 267,
        y: 1382,
        rotation: 0
      },

      right: {
        x: 757,
        y: 1382,
        rotation: 0
      }
    },

    reactor: {
      x: 512,
      y: 1180
    },

    launcherLane: {
      leftX: 864,
      rightX: 958,
      topY: 95,
      bottomY: 1694
    }
  };

  const runtime = {
    phaserGame: null,
    scene: null,
    initialized: false,
    startingAttempt: false,
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
    footerTournamentLabel: null
  };

  function getAssetPath(file) {
    return `${CONFIG.assets?.basePath || "assets/"}${file}`;
  }

  function getRequiredAsset(name, fallback) {
    return (
      CONFIG.assets?.required?.[name] ||
      fallback
    );
  }

  function getBallsPerGame() {
    return (
      CONFIG.gameplay?.ballsPerGame ||
      CONFIG.game?.ballsPerGame ||
      DEFAULTS.ballsPerGame
    );
  }

  function formatScore(value) {
    const score = Math.max(
      0,
      Math.floor(Number(value) || 0)
    );

    if (
      UTILS &&
      typeof UTILS.formatScore === "function"
    ) {
      return UTILS.formatScore(score);
    }

    return score.toLocaleString("en-US");
  }

  function createSessionId() {
    if (
      UTILS &&
      typeof UTILS.createSessionId === "function"
    ) {
      return UTILS.createSessionId();
    }

    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return `pumpball-${window.crypto.randomUUID()}`;
    }

    return [
      "pumpball",
      Date.now().toString(36),
      Math.random().toString(36).slice(2, 10)
    ].join("-");
  }

  function setPlayFeedback(
    message = "",
    type = "neutral"
  ) {
    if (!dom.playFeedback) {
      return;
    }

    dom.playFeedback.textContent = message;
    dom.playFeedback.dataset.type = type;
  }

  function setButtonsBusy(isBusy) {
    const buttons = [
      dom.purchasePlayButton,
      dom.freeTestButton,
      dom.playAgainButton,
      dom.connectWalletButton
    ];

    buttons.forEach((button) => {
      if (!button) {
        return;
      }

      button.disabled = Boolean(isBusy);

      if (isBusy) {
        button.setAttribute("aria-busy", "true");
      } else {
        button.removeAttribute("aria-busy");
      }
    });
  }

  function showStartPanel() {
    if (dom.gameStartPanel) {
      dom.gameStartPanel.hidden = false;
    }

    if (dom.gameOverPanel) {
      dom.gameOverPanel.hidden = true;
    }

    if (dom.gameOverlay) {
      dom.gameOverlay.hidden = false;
      dom.gameOverlay.classList.remove("is-hidden");
    }
  }

  function hideOverlay() {
    if (!dom.gameOverlay) {
      return;
    }

    dom.gameOverlay.classList.add("is-hidden");

    window.setTimeout(() => {
      if (
        runtime.scene &&
        runtime.scene.gameState.playing
      ) {
        dom.gameOverlay.hidden = true;
      }
    }, 220);
  }

  function showGameOverPanel({
    score,
    rank,
    improved,
    previousBest
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

    if (dom.rankFeedback) {
      if (improved && rank) {
        dom.rankFeedback.textContent =
          `New personal best. You are ranked #${rank}.`;
      } else if (improved) {
        dom.rankFeedback.textContent =
          "New personal best recorded.";
      } else {
        dom.rankFeedback.textContent =
          `Attempt recorded. Your best remains ${formatScore(
            previousBest
          )}.`;
      }
    }
  }

  function updateWalletUi() {
    const paymentState =
      window.PumpBallPayments?.getState?.();

    if (!paymentState) {
      return;
    }

    if (dom.walletStatus) {
      dom.walletStatus.textContent =
        paymentState.walletConnected
          ? paymentState.shortenedWalletAddress ||
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
    const tournament = CONFIG.tournament;

    if (!tournament) {
      return;
    }

    if (dom.entryPrice) {
      dom.entryPrice.textContent =
        tournament.entryPriceDisplay ||
        `${tournament.entryPriceSol} SOL`;
    }

    if (dom.prizePool) {
      dom.prizePool.textContent =
        tournament.prizePoolDisplay ||
        `${tournament.prizePoolSol} SOL`;
    }

    if (dom.winnerCount) {
      dom.winnerCount.textContent =
        `Top ${tournament.winnerCount || 2}`;
    }

    if (dom.tournamentLabel) {
      dom.tournamentLabel.textContent = [
        tournament.name,
        tournament.promotionalLabel
      ]
        .filter(Boolean)
        .join(" · ");
    }

    if (dom.footerTournamentLabel) {
      dom.footerTournamentLabel.textContent =
        tournament.name;
    }

    const entryDisplay =
      tournament.entryPriceDisplay ||
      `${tournament.entryPriceSol} SOL`;

    if (dom.purchasePlayButton) {
      dom.purchasePlayButton.textContent =
        `Play for ${entryDisplay}`;
    }

    if (dom.playAgainButton) {
      dom.playAgainButton.textContent =
        `Play Again for ${entryDisplay}`;
    }
  }

  class PumpBallScene extends Phaser.Scene {
    constructor() {
      super({
        key: "PumpBallScene"
      });

      this.gameState = {
        ready: false,
        playing: false,
        paused: false,
        gameOver: false,

        score: 0,
        ballNumber: 0,
        ballsRemaining: getBallsPerGame(),

        sessionId: null,
        credit: null,

        ballInPlay: false,
        ballLaunched: false,
        launcherCharging: false,
        launcherChargeStartedAt: 0,

        leftFlipperPressed: false,
        rightFlipperPressed: false,

        lastBallMotionAt: 0,
        lastBallPosition: null,

        drainLocked: false
      };

      this.ball = null;

      this.playfield = null;
      this.playfieldGlow = null;
      this.tableFlash = null;

      this.leftFlipper = null;
      this.rightFlipper = null;

      this.leftFlipperBody = null;
      this.rightFlipperBody = null;

      this.leftSlingshot = null;
      this.rightSlingshot = null;

      this.bumpers = [];
      this.reactor = null;
      this.reactorGlow = null;

      this.staticBodies = [];
      this.particlePool = [];
      this.trailPool = [];

      this.keys = {};
      this.touchZones = {};

      this.debugGraphics = null;
    }

    preload() {
      this.load.image(
        "playfield",
        getAssetPath(
          getRequiredAsset(
            "playfield",
            "playfield.png"
          )
        )
      );

      this.load.image(
        "ball",
        getAssetPath(
          getRequiredAsset(
            "ball",
            "ball.png"
          )
        )
      );

      this.load.image(
        "flipperLeft",
        getAssetPath(
          getRequiredAsset(
            "flipperLeft",
            "flipper-left.png"
          )
        )
      );

      this.load.image(
        "flipperRight",
        getAssetPath(
          getRequiredAsset(
            "flipperRight",
            "flipper-right.png"
          )
        )
      );

      this.load.image(
        "bumper",
        getAssetPath(
          getRequiredAsset(
            "bumper",
            "bumper.png"
          )
        )
      );

      this.load.image(
        "slingshotLeft",
        getAssetPath(
          getRequiredAsset(
            "slingshotLeft",
            "slingshot-left.png"
          )
        )
      );

      this.load.image(
        "slingshotRight",
        getAssetPath(
          getRequiredAsset(
            "slingshotRight",
            "slingshot-right.png"
          )
        )
      );

      this.load.image(
        "reactorJackpot",
        getAssetPath(
          getRequiredAsset(
            "reactorJackpot",
            "reactor-jackpot.png"
          )
        )
      );

      if (
        CONFIG.app?.debug &&
        CONFIG.assets?.reference?.collisionMap
      ) {
        this.load.image(
          "collisionMap",
          getAssetPath(
            CONFIG.assets.reference.collisionMap
          )
        );
      }

      this.load.on("loaderror", (file) => {
        console.error(
          `[PumpBall] Asset failed to load: ${file.src}`
        );
      });
    }

    create() {
      runtime.scene = this;

      this.matter.world.setGravity(
        0,
        0.92,
        1
      );

      this.matter.world.engine.positionIterations =
        12;

      this.matter.world.engine.velocityIterations =
        10;

      this.matter.world.engine.constraintIterations =
        4;

      this.createBackground();
      this.createStaticTableGeometry();
      this.createMechanisms();
      this.createEffects();
      this.createControls();
      this.bindMatterEvents();

      if (
        CONFIG.app?.debug &&
        this.textures.exists("collisionMap")
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
          .setDepth(DEPTH.effectsFront);
      }

      this.gameState.ready = true;

      this.updateHud();

      window.dispatchEvent(
        new CustomEvent(
          "pumpball:game-ready"
        )
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
        .setDepth(DEPTH.playfield);

      this.playfieldGlow = this.add
        .image(
          WORLD.width / 2,
          WORLD.height / 2,
          "playfield"
        )
        .setDisplaySize(
          WORLD.width,
          WORLD.height
        )
        .setTint(0x7c3cff)
        .setAlpha(0.035)
        .setBlendMode(
          Phaser.BlendModes.ADD
        )
        .setDepth(DEPTH.effectsBehind);

      this.tweens.add({
        targets: this.playfieldGlow,
        alpha: {
          from: 0.025,
          to: 0.075
        },
        duration: 1800,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut"
      });
    }

    addStaticRectangle(
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
            label:
              options.label ||
              LABELS.wall,

            angle:
              options.angle || 0,

            restitution:
              options.restitution ?? 0.42,

            friction:
              options.friction ?? 0.01,

            chamfer:
              options.chamfer
                ? {
                    radius:
                      options.chamfer
                  }
                : undefined
          }
        );

      this.staticBodies.push(body);

      return body;
    }

    addStaticCircle(
      x,
      y,
      radius,
      options = {}
    ) {
      const body =
        this.matter.add.circle(
          x,
          y,
          radius,
          {
            isStatic: true,
            label:
              options.label ||
              LABELS.wall,

            isSensor:
              Boolean(options.isSensor),

            restitution:
              options.restitution ?? 0.5,

            friction:
              options.friction ?? 0.005
          }
        );

      body.gameObjectRef =
        options.gameObject || null;

      body.scoreValue =
        options.scoreValue || 0;

      body.effectType =
        options.effectType || null;

      this.staticBodies.push(body);

      return body;
    }

    addStaticPolygon(
      x,
      y,
      vertices,
      options = {}
    ) {
      const Matter =
        Phaser.Physics.Matter.Matter;

      const body =
        Matter.Bodies.fromVertices(
          x,
          y,
          vertices,
          {
            isStatic: true,
            label:
              options.label ||
              LABELS.wall,

            restitution:
              options.restitution ?? 0.48,

            friction:
              options.friction ?? 0.008
          },
          true
        );

      body.gameObjectRef =
        options.gameObject || null;

      body.scoreValue =
        options.scoreValue || 0;

      body.effectType =
        options.effectType || null;

      this.matter.world.add(body);
      this.staticBodies.push(body);

      return body;
    }

    createStaticTableGeometry() {
      /*
       * Outer table boundaries.
       */
      this.addStaticRectangle(
        29,
        910,
        58,
        1720,
        {
          chamfer: 24
        }
      );

      this.addStaticRectangle(
        995,
        910,
        58,
        1720,
        {
          chamfer: 24
        }
      );

      this.addStaticRectangle(
        512,
        26,
        936,
        52,
        {
          chamfer: 20
        }
      );

      /*
       * Lower apron and drain guides.
       */
      this.addStaticRectangle(
        191,
        1640,
        248,
        24,
        {
          angle: 0.50,
          restitution: 0.38
        }
      );

      this.addStaticRectangle(
        833,
        1640,
        248,
        24,
        {
          angle: -0.50,
          restitution: 0.38
        }
      );

      this.addStaticRectangle(
        112,
        1520,
        236,
        20,
        {
          angle: 0.35
        }
      );

      this.addStaticRectangle(
        912,
        1520,
        236,
        20,
        {
          angle: -0.35
        }
      );

      /*
       * Left and right inlane guides.
       */
      this.addStaticRectangle(
        176,
        1456,
        290,
        18,
        {
          angle: 0.18
        }
      );

      this.addStaticRectangle(
        848,
        1456,
        290,
        18,
        {
          angle: -0.18
        }
      );

      /*
       * Launcher lane.
       */
      this.addStaticRectangle(
        TABLE.launcherLane.leftX,
        931,
        18,
        1515
      );

      this.addStaticRectangle(
        TABLE.launcherLane.rightX,
        931,
        18,
        1515
      );

      /*
       * Upper launcher return curve approximation.
       */
      [
        [909, 150, 115, 18, -0.72],
        [834, 88, 122, 18, -0.20],
        [746, 77, 108, 18, 0.03],
        [650, 76, 112, 18, 0.02]
      ].forEach(
        ([x, y, width, height, angle]) => {
          this.addStaticRectangle(
            x,
            y,
            width,
            height,
            {
              angle
            }
          );
        }
      );

      /*
       * Upper left orbit.
       */
      [
        [125, 170, 160, 18, -0.76],
        [87, 293, 185, 18, -1.15],
        [98, 460, 204, 18, -1.38],
        [111, 640, 218, 18, -1.45],
        [164, 810, 210, 18, -1.10]
      ].forEach(
        ([x, y, width, height, angle]) => {
          this.addStaticRectangle(
            x,
            y,
            width,
            height,
            {
              angle
            }
          );
        }
      );

      /*
       * Upper center separators.
       */
      this.addStaticRectangle(
        341,
        260,
        160,
        18,
        {
          angle: -0.15
        }
      );

      this.addStaticRectangle(
        706,
        299,
        164,
        18,
        {
          angle: 0.78
        }
      );

      /*
       * Mid-table rails.
       */
      this.addStaticRectangle(
        221,
        907,
        245,
        20,
        {
          angle: -0.85
        }
      );

      this.addStaticRectangle(
        775,
        907,
        245,
        20,
        {
          angle: 0.85
        }
      );

      this.addStaticRectangle(
        202,
        1188,
        250,
        20,
        {
          angle: 0.88
        }
      );

      this.addStaticRectangle(
        822,
        1188,
        250,
        20,
        {
          angle: -0.88
        }
      );

      /*
       * Center divider posts.
       */
      [
        [470, 785],
        [554, 785],
        [448, 846],
        [576, 846]
      ].forEach(([x, y]) => {
        this.addStaticCircle(
          x,
          y,
          15,
          {
            restitution: 0.7
          }
        );
      });

      /*
       * Static side posts.
       */
      [
        [104, 1020],
        [164, 1110],
        [164, 1280],
        [920, 1020],
        [860, 1110],
        [860, 1280],
        [250, 1260],
        [774, 1260],
        [325, 1500],
        [699, 1500]
      ].forEach(([x, y]) => {
        this.addStaticCircle(
          x,
          y,
          13,
          {
            restitution: 0.68
          }
        );
      });

      /*
       * Drain sensor.
       */
      this.addStaticRectangle(
        DEFAULTS.drain.x,
        DEFAULTS.drain.y,
        DEFAULTS.drain.width,
        DEFAULTS.drain.height,
        {
          label: LABELS.drain
        }
      ).isSensor = true;
    }

    createMechanisms() {
      this.createBumpers();
      this.createSlingshots();
      this.createReactor();
      this.createFlippers();
      this.createLauncher();
    }

    createBumpers() {
      TABLE.bumpers.forEach(
        (position, index) => {
          const glow = this.add
            .image(
              position.x,
              position.y,
              "bumper"
            )
            .setDisplaySize(154, 154)
            .setTint(
              index % 2 === 0
                ? 0x59ff61
                : 0x9a52ff
            )
            .setAlpha(0.18)
            .setBlendMode(
              Phaser.BlendModes.ADD
            )
            .setDepth(
              DEPTH.effectsBehind
            );

          const sprite = this.add
            .image(
              position.x,
              position.y,
              "bumper"
            )
            .setDisplaySize(138, 138)
            .setDepth(DEPTH.mechanisms);

          sprite.glow = glow;
          sprite.bumperIndex = index;

          const body = this.addStaticCircle(
            position.x,
            position.y,
            58,
            {
              label: LABELS.bumper,
              restitution: 1.18,
              gameObject: sprite,
              scoreValue: SCORE_VALUES.bumper,
              effectType: "bumper"
            }
          );

          body.bumperIndex = index;
          sprite.matterBody = body;

          this.bumpers.push(sprite);

          this.tweens.add({
            targets: glow,
            scaleX: {
              from: 1,
              to: 1.09
            },
            scaleY: {
              from: 1,
              to: 1.09
            },
            alpha: {
              from: 0.12,
              to: 0.28
            },
            duration:
              900 + index * 110,
            yoyo: true,
            repeat: -1,
            ease: "Sine.InOut"
          });
        }
      );
    }

    createSlingshots() {
      this.leftSlingshot = this.add
        .image(
          TABLE.slingshots.left.x,
          TABLE.slingshots.left.y,
          "slingshotLeft"
        )
        .setDisplaySize(196, 196)
        .setDepth(DEPTH.mechanisms);

      this.rightSlingshot = this.add
        .image(
          TABLE.slingshots.right.x,
          TABLE.slingshots.right.y,
          "slingshotRight"
        )
        .setDisplaySize(196, 196)
        .setDepth(DEPTH.mechanisms);

      const leftVertices = [
        { x: -86, y: -61 },
        { x: 82, y: -61 },
        { x: -2, y: 78 }
      ];

      const rightVertices = [
        { x: -82, y: -61 },
        { x: 86, y: -61 },
        { x: 2, y: 78 }
      ];

      const leftBody =
        this.addStaticPolygon(
          TABLE.slingshots.left.x,
          TABLE.slingshots.left.y,
          leftVertices,
          {
            label:
              LABELS.slingshotLeft,

            restitution: 1.04,
            gameObject:
              this.leftSlingshot,

            scoreValue:
              SCORE_VALUES.slingshot,

            effectType:
              "slingshot-left"
          }
        );

      const rightBody =
        this.addStaticPolygon(
          TABLE.slingshots.right.x,
          TABLE.slingshots.right.y,
          rightVertices,
          {
            label:
              LABELS.slingshotRight,

            restitution: 1.04,
            gameObject:
              this.rightSlingshot,

            scoreValue:
              SCORE_VALUES.slingshot,

            effectType:
              "slingshot-right"
          }
        );

      this.leftSlingshot.matterBody =
        leftBody;

      this.rightSlingshot.matterBody =
        rightBody;
    }

    createReactor() {
      this.reactorGlow = this.add
        .image(
          TABLE.reactor.x,
          TABLE.reactor.y,
          "reactorJackpot"
        )
        .setDisplaySize(320, 320)
        .setTint(0x9b4dff)
        .setAlpha(0.25)
        .setBlendMode(
          Phaser.BlendModes.ADD
        )
        .setDepth(DEPTH.effectsBehind);

      this.reactor = this.add
        .image(
          TABLE.reactor.x,
          TABLE.reactor.y,
          "reactorJackpot"
        )
        .setDisplaySize(286, 286)
        .setDepth(DEPTH.mechanisms);

      const body = this.addStaticCircle(
        TABLE.reactor.x,
        TABLE.reactor.y,
        124,
        {
          label: LABELS.reactor,
          restitution: 0.88,
          gameObject: this.reactor,
          scoreValue: SCORE_VALUES.reactor,
          effectType: "reactor"
        }
      );

      this.reactor.matterBody = body;

      this.tweens.add({
        targets: this.reactor,
        angle: 360,
        duration: 16000,
        repeat: -1,
        ease: "Linear"
      });

      this.tweens.add({
        targets: this.reactorGlow,
        scaleX: {
          from: 0.96,
          to: 1.08
        },
        scaleY: {
          from: 0.96,
          to: 1.08
        },
        alpha: {
          from: 0.16,
          to: 0.34
        },
        duration: 820,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut"
      });
    }

    createFlippers() {
      this.leftFlipper =
        this.matter.add.image(
          DEFAULTS.flippers.left.x,
          DEFAULTS.flippers.left.y,
          "flipperLeft",
          null,
          {
            label: "flipper-left",
            friction: 0.001,
            frictionAir: 0.01,
            restitution: 0.12,
            isStatic: true
          }
        );

      this.leftFlipper
        .setDisplaySize(
          DEFAULTS.flippers.width,
          DEFAULTS.flippers.height
        )
        .setOrigin(0.18, 0.5)
        .setDepth(DEPTH.mechanisms)
        .setRotation(
          DEFAULTS.flippers.left
            .restingAngle
        );

      this.rightFlipper =
        this.matter.add.image(
          DEFAULTS.flippers.right.x,
          DEFAULTS.flippers.right.y,
          "flipperRight",
          null,
          {
            label: "flipper-right",
            friction: 0.001,
            frictionAir: 0.01,
            restitution: 0.12,
            isStatic: true
          }
        );

      this.rightFlipper
        .setDisplaySize(
          DEFAULTS.flippers.width,
          DEFAULTS.flippers.height
        )
        .setOrigin(0.82, 0.5)
        .setDepth(DEPTH.mechanisms)
        .setRotation(
          DEFAULTS.flippers.right
            .restingAngle
        );

      this.leftFlipper.body.isFlipper = true;
      this.leftFlipper.body.flipperSide =
        "left";

      this.rightFlipper.body.isFlipper = true;
      this.rightFlipper.body.flipperSide =
        "right";
    }

    createLauncher() {
      this.launcherTrack = this.add
        .rectangle(
          DEFAULTS.launcher.x,
          DEFAULTS.launcher.y,
          40,
          225,
          0x10141a,
          0.7
        )
        .setStrokeStyle(
          3,
          0x9d50ff,
          0.8
        )
        .setDepth(DEPTH.staticDecor);

      this.launcherSpring = this.add
        .rectangle(
          DEFAULTS.launcher.x,
          DEFAULTS.launcher.y + 70,
          28,
          90,
          0x7f42e6,
          0.75
        )
        .setDepth(DEPTH.mechanisms);

      this.launcherCap = this.add
        .circle(
          DEFAULTS.launcher.x,
          DEFAULTS.launcher.y + 18,
          24,
          0x111111,
          1
        )
        .setStrokeStyle(
          5,
          0xd3d7dd,
          1
        )
        .setDepth(DEPTH.mechanisms);

      this.launcherMeter = this.add
        .rectangle(
          DEFAULTS.launcher.x,
          DEFAULTS.launcher.y + 20,
          10,
          0,
          0x64ff6a,
          0.92
        )
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.effectsFront);
    }

    createEffects() {
      this.tableFlash = this.add
        .rectangle(
          WORLD.width / 2,
          WORLD.height / 2,
          WORLD.width,
          WORLD.height,
          0xffffff,
          0
        )
        .setDepth(DEPTH.flash)
        .setBlendMode(
          Phaser.BlendModes.ADD
        );

      this.vignette = this.add
        .rectangle(
          WORLD.width / 2,
          WORLD.height / 2,
          WORLD.width,
          WORLD.height,
          0x000000,
          0
        )
        .setDepth(DEPTH.flash + 1);
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

      this.input.on(
        "pointerdown",
        (pointer) => {
          if (!this.gameState.playing) {
            return;
          }

          const normalizedX =
            pointer.x /
            this.scale.displaySize.width;

          const normalizedY =
            pointer.y /
            this.scale.displaySize.height;

          if (normalizedY < 0.72) {
            this.beginLauncherCharge();
            return;
          }

          if (normalizedX < 0.5) {
            this.gameState.leftFlipperPressed =
              true;
          } else {
            this.gameState.rightFlipperPressed =
              true;
          }
        }
      );

      this.input.on(
        "pointerup",
        () => {
          if (!this.gameState.playing) {
            return;
          }

          this.gameState.leftFlipperPressed =
            false;

          this.gameState.rightFlipperPressed =
            false;

          if (
            this.gameState.launcherCharging
          ) {
            this.releaseLauncher();
          }
        }
      );

      this.keys.launch.on(
        "down",
        () => {
          this.beginLauncherCharge();
        }
      );

      this.keys.launch.on(
        "up",
        () => {
          this.releaseLauncher();
        }
      );

      this.keys.launchAlt.on(
        "down",
        () => {
          this.beginLauncherCharge();
        }
      );

      this.keys.launchAlt.on(
        "up",
        () => {
          this.releaseLauncher();
        }
      );
    }

    bindMatterEvents() {
      this.matter.world.on(
        "collisionstart",
        (event) => {
          event.pairs.forEach((pair) => {
            this.handleCollisionPair(
              pair.bodyA,
              pair.bodyB
            );
          });
        }
      );
    }

    handleCollisionPair(bodyA, bodyB) {
      let ballBody = null;
      let otherBody = null;

      if (bodyA.label === LABELS.ball) {
        ballBody = bodyA;
        otherBody = bodyB;
      } else if (
        bodyB.label === LABELS.ball
      ) {
        ballBody = bodyB;
        otherBody = bodyA;
      }

      if (!ballBody || !otherBody) {
        return;
      }

      if (
        otherBody.label === LABELS.drain
      ) {
        this.handleDrain();
        return;
      }

      if (
        otherBody.label === LABELS.bumper
      ) {
        this.handleBumperHit(otherBody);
        return;
      }

      if (
        otherBody.label ===
          LABELS.slingshotLeft ||
        otherBody.label ===
          LABELS.slingshotRight
      ) {
        this.handleSlingshotHit(
          otherBody
        );
        return;
      }

      if (
        otherBody.label ===
        LABELS.reactor
      ) {
        this.handleReactorHit(otherBody);
        return;
      }

      if (otherBody.isFlipper) {
        this.handleFlipperContact(
          otherBody
        );
      }
    }

    createBall() {
      if (this.ball) {
        this.ball.destroy();
        this.ball = null;
      }

      this.ball = this.matter.add.image(
        DEFAULTS.launcher.ballX,
        DEFAULTS.launcher.ballY,
        "ball",
        null,
        {
          label: LABELS.ball,

          shape: {
            type: "circle",
            radius:
              DEFAULTS.ball.diameter / 2
          },

          restitution:
            DEFAULTS.ball.restitution,

          friction:
            DEFAULTS.ball.friction,

          frictionAir:
            DEFAULTS.ball.frictionAir,

          density:
            DEFAULTS.ball.density
        }
      );

      this.ball
        .setDisplaySize(
          DEFAULTS.ball.diameter,
          DEFAULTS.ball.diameter
        )
        .setDepth(DEPTH.ball)
        .setBounce(
          DEFAULTS.ball.restitution
        );

      this.ball.body.label = LABELS.ball;
      this.ball.body.gameObjectRef =
        this.ball;

      this.gameState.ballInPlay = true;
      this.gameState.ballLaunched = false;
      this.gameState.drainLocked = false;
      this.gameState.lastBallMotionAt =
        this.time.now;

      this.gameState.lastBallPosition = {
        x: this.ball.x,
        y: this.ball.y
      };

      this.createBallSpawnBurst(
        this.ball.x,
        this.ball.y
      );

      this.updateHud();

      window.dispatchEvent(
        new CustomEvent(
          "pumpball:ball-created",
          {
            detail: {
              ballNumber:
                this.gameState.ballNumber
            }
          }
        )
      );
    }

    beginLauncherCharge() {
      if (
        !this.gameState.playing ||
        !this.ball ||
        this.gameState.ballLaunched ||
        this.gameState.launcherCharging
      ) {
        return;
      }

      this.gameState.launcherCharging = true;
      this.gameState.launcherChargeStartedAt =
        this.time.now;

      this.tweens.killTweensOf(
        this.launcherCap
      );

      this.tweens.add({
        targets: this.launcherCap,
        y:
          DEFAULTS.launcher.y + 90,
        duration:
          DEFAULTS.launcher.chargeMs,
        ease: "Sine.Out"
      });

      this.tweens.add({
        targets: this.launcherSpring,
        scaleY: 0.45,
        duration:
          DEFAULTS.launcher.chargeMs,
        ease: "Sine.Out"
      });
    }

    releaseLauncher() {
      if (
        !this.gameState.launcherCharging ||
        !this.ball ||
        this.gameState.ballLaunched
      ) {
        return;
      }

      const heldMs =
        this.time.now -
        this.gameState.launcherChargeStartedAt;

      const ratio = Phaser.Math.Clamp(
        heldMs /
          DEFAULTS.launcher.chargeMs,
        0.08,
        1
      );

      const force =
        Phaser.Math.Linear(
          DEFAULTS.launcher.minimumForce,
          DEFAULTS.launcher.maximumForce,
          ratio
        );

      this.gameState.launcherCharging =
        false;

      this.gameState.ballLaunched = true;

      this.ball.setVelocity(
        Phaser.Math.FloatBetween(-0.25, 0.25),
        -force
      );

      this.ball.setAngularVelocity(
        Phaser.Math.FloatBetween(
          -0.16,
          0.16
        )
      );

      this.tweens.killTweensOf(
        this.launcherCap
      );

      this.tweens.killTweensOf(
        this.launcherSpring
      );

      this.tweens.add({
        targets: this.launcherCap,
        y:
          DEFAULTS.launcher.y + 18,
        duration: 105,
        ease: "Back.Out"
      });

      this.tweens.add({
        targets: this.launcherSpring,
        scaleY: 1,
        duration: 150,
        ease: "Elastic.Out"
      });

      this.launcherMeter.height = 0;

      this.cameras.main.shake(
        90,
        0.002
      );

      this.flashTable(
        0x54ff67,
        0.16,
        90
      );

      this.createImpactParticles(
        this.ball.x,
        this.ball.y,
        0x54ff67,
        16
      );

      this.vibrate(20);

      window.dispatchEvent(
        new CustomEvent(
          "pumpball:ball-launched",
          {
            detail: {
              force,
              chargeRatio: ratio
            }
          }
        )
      );
    }

    handleFlipperContact(flipperBody) {
      if (!this.ball) {
        return;
      }

      const side =
        flipperBody.flipperSide;

      const pressed =
        side === "left"
          ? this.isLeftFlipperActive()
          : this.isRightFlipperActive();

      if (!pressed) {
        return;
      }

      const direction =
        side === "left" ? 1 : -1;

      const velocityX =
        this.ball.body.velocity.x +
        direction *
          Phaser.Math.FloatBetween(
            3.4,
            5.5
          );

      const velocityY = Math.min(
        this.ball.body.velocity.y - 12,
        -13
      );

      this.ball.setVelocity(
        velocityX,
        velocityY
      );

      this.createImpactParticles(
        this.ball.x,
        this.ball.y,
        side === "left"
          ? 0x55ff66
          : 0xa05cff,
        7
      );

      this.cameras.main.shake(
        45,
        0.0015
      );
    }

    handleBumperHit(body) {
      const sprite = body.gameObjectRef;

      if (!sprite) {
        return;
      }

      this.addScore(
        body.scoreValue ||
          SCORE_VALUES.bumper,
        sprite.x,
        sprite.y - 65,
        "bumper"
      );

      this.tweens.killTweensOf(sprite);

      this.tweens.add({
        targets: sprite,
        scaleX: 1.13,
        scaleY: 1.13,
        duration: 65,
        yoyo: true,
        ease: "Quad.Out"
      });

      if (sprite.glow) {
        this.tweens.killTweensOf(
          sprite.glow
        );

        this.tweens.add({
          targets: sprite.glow,
          alpha: 0.58,
          scaleX: 1.25,
          scaleY: 1.25,
          duration: 70,
          yoyo: true,
          ease: "Quad.Out"
        });
      }

      sprite.setTint(0xffffff);

      this.time.delayedCall(80, () => {
        sprite.clearTint();
      });

      this.flashTable(
        sprite.bumperIndex % 2 === 0
          ? 0x5cff6c
          : 0x9854ff,
        0.09,
        70
      );

      this.createImpactParticles(
        sprite.x,
        sprite.y,
        sprite.bumperIndex % 2 === 0
          ? 0x5cff6c
          : 0x9854ff,
        13
      );

      this.cameras.main.shake(
        70,
        0.0027
      );

      this.vibrate(18);

      window.dispatchEvent(
        new CustomEvent(
          "pumpball:bumper-hit",
          {
            detail: {
              index: sprite.bumperIndex,
              score:
                body.scoreValue ||
                SCORE_VALUES.bumper
            }
          }
        )
      );
    }

    handleSlingshotHit(body) {
      const sprite = body.gameObjectRef;

      if (!sprite) {
        return;
      }

      const isLeft =
        body.label ===
        LABELS.slingshotLeft;

      this.addScore(
        body.scoreValue ||
          SCORE_VALUES.slingshot,
        sprite.x,
        sprite.y - 90,
        "slingshot"
      );

      this.tweens.killTweensOf(sprite);

      this.tweens.add({
        targets: sprite,
        scaleX: 1.075,
        scaleY: 0.94,
        duration: 55,
        yoyo: true,
        ease: "Back.Out"
      });

      sprite.setTint(
        isLeft
          ? 0x7dff84
          : 0xa26cff
      );

      this.time.delayedCall(85, () => {
        sprite.clearTint();
      });

      this.createImpactParticles(
        sprite.x,
        sprite.y - 55,
        isLeft
          ? 0x57ff67
          : 0xa05cff,
        11
      );

      this.flashTable(
        isLeft
          ? 0x48ff60
          : 0x8e4fff,
        0.075,
        65
      );

      this.cameras.main.shake(
        58,
        0.002
      );

      this.vibrate(14);

      window.dispatchEvent(
        new CustomEvent(
          "pumpball:slingshot-hit",
          {
            detail: {
              side:
                isLeft
                  ? "left"
                  : "right",

              score:
                body.scoreValue ||
                SCORE_VALUES.slingshot
            }
          }
        )
      );
    }

    handleReactorHit(body) {
      this.addScore(
        body.scoreValue ||
          SCORE_VALUES.reactor,
        this.reactor.x,
        this.reactor.y - 145,
        "reactor"
      );

      this.tweens.killTweensOf(
        this.reactorGlow
      );

      this.tweens.add({
        targets: this.reactorGlow,
        scaleX: 1.34,
        scaleY: 1.34,
        alpha: 0.75,
        duration: 110,
        yoyo: true,
        ease: "Expo.Out",
        onComplete: () => {
          this.startReactorIdleGlow();
        }
      });

      this.tweens.add({
        targets: this.reactor,
        scaleX: 1.08,
        scaleY: 1.08,
        angle:
          this.reactor.angle + 28,
        duration: 95,
        yoyo: true,
        ease: "Back.Out"
      });

      this.flashTable(
        0xa14fff,
        0.22,
        125
      );

      this.createImpactParticles(
        this.reactor.x,
        this.reactor.y,
        0x9b4dff,
        28
      );

      this.createImpactParticles(
        this.reactor.x,
        this.reactor.y,
        0x55ff65,
        18
      );

      this.cameras.main.shake(
        150,
        0.006
      );

      this.vibrate([25, 20, 35]);

      window.dispatchEvent(
        new CustomEvent(
          "pumpball:reactor-hit",
          {
            detail: {
              score:
                body.scoreValue ||
                SCORE_VALUES.reactor
            }
          }
        )
      );
    }

    startReactorIdleGlow() {
      this.tweens.killTweensOf(
        this.reactorGlow
      );

      this.tweens.add({
        targets: this.reactorGlow,
        scaleX: {
          from: 0.96,
          to: 1.08
        },
        scaleY: {
          from: 0.96,
          to: 1.08
        },
        alpha: {
          from: 0.16,
          to: 0.34
        },
        duration: 820,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut"
      });
    }

    addScore(
      amount,
      x,
      y,
      source = "general"
    ) {
      if (!this.gameState.playing) {
        return;
      }

      const points = Math.max(
        0,
        Math.floor(Number(amount) || 0)
      );

      this.gameState.score += points;

      this.updateHud();
      this.createFloatingScore(
        x,
        y,
        points,
        source
      );

      const scoreElement =
        document.getElementById(
          "score-display"
        );

      if (scoreElement) {
        scoreElement.classList.remove(
          "effect-pulse"
        );

        void scoreElement.offsetWidth;

        scoreElement.classList.add(
          "effect-pulse"
        );
      }

      window.dispatchEvent(
        new CustomEvent(
          "pumpball:score-changed",
          {
            detail: {
              score:
                this.gameState.score,

              added: points,
              source
            }
          }
        )
      );
    }

    createFloatingScore(
      x,
      y,
      amount,
      source
    ) {
      const color =
        source === "reactor"
          ? "#c58cff"
          : source === "bumper"
            ? "#79ff83"
            : "#ffffff";

      const text = this.add
        .text(
          x,
          y,
          `+${formatScore(amount)}`,
          {
            fontFamily:
              "Arial, Helvetica, sans-serif",

            fontSize:
              source === "reactor"
                ? "38px"
                : "28px",

            fontStyle: "bold",
            color,

            stroke: "#050505",
            strokeThickness: 6,

            shadow: {
              offsetX: 0,
              offsetY: 0,
              color,
              blur: 14,
              fill: true
            }
          }
        )
        .setOrigin(0.5)
        .setDepth(DEPTH.text)
        .setScale(0.72)
        .setAlpha(0);

      this.tweens.add({
        targets: text,
        y: y - 92,
        scaleX: 1,
        scaleY: 1,
        alpha: {
          from: 0,
          to: 1
        },
        duration: 170,
        ease: "Back.Out",
        onComplete: () => {
          this.tweens.add({
            targets: text,
            y: text.y - 36,
            alpha: 0,
            duration: 520,
            delay: 180,
            ease: "Quad.In",
            onComplete: () => {
              text.destroy();
            }
          });
        }
      });
    }

    createImpactParticles(
      x,
      y,
      color,
      count = 10
    ) {
      for (let i = 0; i < count; i += 1) {
        const radius =
          Phaser.Math.Between(2, 6);

        const particle = this.add
          .circle(
            x,
            y,
            radius,
            color,
            Phaser.Math.FloatBetween(
              0.55,
              1
            )
          )
          .setBlendMode(
            Phaser.BlendModes.ADD
          )
          .setDepth(
            DEPTH.effectsFront
          );

        const angle =
          Phaser.Math.FloatBetween(
            0,
            Math.PI * 2
          );

        const distance =
          Phaser.Math.Between(40, 120);

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
          scaleX: 0.15,
          scaleY: 0.15,

          duration:
            Phaser.Math.Between(
              260,
              520
            ),

          ease: "Quad.Out",

          onComplete: () => {
            particle.destroy();
          }
        });
      }
    }

    createBallSpawnBurst(x, y) {
      const ring = this.add
        .circle(
          x,
          y,
          16,
          0x60ff70,
          0
        )
        .setStrokeStyle(
          5,
          0x60ff70,
          0.9
        )
        .setBlendMode(
          Phaser.BlendModes.ADD
        )
        .setDepth(
          DEPTH.effectsFront
        );

      this.tweens.add({
        targets: ring,
        scaleX: 4.5,
        scaleY: 4.5,
        alpha: 0,
        duration: 360,
        ease: "Expo.Out",
        onComplete: () => {
          ring.destroy();
        }
      });
    }

    createBallTrail() {
      if (
        !this.ball ||
        !this.gameState.ballInPlay
      ) {
        return;
      }

      const speed = Math.hypot(
        this.ball.body.velocity.x,
        this.ball.body.velocity.y
      );

      if (speed < 4) {
        return;
      }

      const trail = this.add
        .circle(
          this.ball.x,
          this.ball.y,
          Phaser.Math.Clamp(
            speed * 0.28,
            3,
            9
          ),
          speed > 18
            ? 0xb05cff
            : 0x5cff70,
          0.28
        )
        .setBlendMode(
          Phaser.BlendModes.ADD
        )
        .setDepth(DEPTH.ballTrail);

      this.tweens.add({
        targets: trail,
        scaleX: 0.1,
        scaleY: 0.1,
        alpha: 0,
        duration: 210,
        ease: "Quad.Out",
        onComplete: () => {
          trail.destroy();
        }
      });
    }

    flashTable(
      color = 0xffffff,
      alpha = 0.15,
      duration = 90
    ) {
      this.tableFlash
        .setFillStyle(color, 1)
        .setAlpha(0);

      this.tweens.killTweensOf(
        this.tableFlash
      );

      this.tweens.add({
        targets: this.tableFlash,
        alpha,
        duration:
          Math.max(30, duration / 2),
        yoyo: true,
        ease: "Quad.Out"
      });
    }

    isLeftFlipperActive() {
      return (
        this.gameState.leftFlipperPressed ||
        this.keys.left.isDown ||
        this.keys.leftAlt.isDown
      );
    }

    isRightFlipperActive() {
      return (
        this.gameState.rightFlipperPressed ||
        this.keys.right.isDown ||
        this.keys.rightAlt.isDown
      );
    }

    updateFlippers() {
      if (
        !this.leftFlipper ||
        !this.rightFlipper
      ) {
        return;
      }

      const leftTarget =
        this.isLeftFlipperActive()
          ? DEFAULTS.flippers.left
              .activeAngle
          : DEFAULTS.flippers.left
              .restingAngle;

      const rightTarget =
        this.isRightFlipperActive()
          ? DEFAULTS.flippers.right
              .activeAngle
          : DEFAULTS.flippers.right
              .restingAngle;

      const leftSpeed =
        this.isLeftFlipperActive()
          ? DEFAULTS.flippers
              .angularSpeed
          : DEFAULTS.flippers
              .returnSpeed;

      const rightSpeed =
        this.isRightFlipperActive()
          ? DEFAULTS.flippers
              .angularSpeed
          : DEFAULTS.flippers
              .returnSpeed;

      this.leftFlipper.setRotation(
        Phaser.Math.Linear(
          this.leftFlipper.rotation,
          leftTarget,
          leftSpeed
        )
      );

      this.rightFlipper.setRotation(
        Phaser.Math.Linear(
          this.rightFlipper.rotation,
          rightTarget,
          rightSpeed
        )
      );

      this.leftFlipper.setTint(
        this.isLeftFlipperActive()
          ? 0xb8ffbc
          : 0xffffff
      );

      this.rightFlipper.setTint(
        this.isRightFlipperActive()
          ? 0xd8b8ff
          : 0xffffff
      );
    }

    updateLauncherMeter() {
      if (
        !this.gameState.launcherCharging
      ) {
        this.launcherMeter.height = 0;
        return;
      }

      const ratio = Phaser.Math.Clamp(
        (
          this.time.now -
          this.gameState
            .launcherChargeStartedAt
        ) /
          DEFAULTS.launcher.chargeMs,
        0,
        1
      );

      this.launcherMeter.height =
        170 * ratio;

      this.launcherMeter.setFillStyle(
        ratio > 0.82
          ? 0xbd5cff
          : ratio > 0.5
            ? 0x79ff65
            : 0x4cd5ff,
        0.95
      );
    }

    clampBallVelocity() {
      if (!this.ball) {
        return;
      }

      const velocity =
        this.ball.body.velocity;

      const speed = Math.hypot(
        velocity.x,
        velocity.y
      );

      if (
        speed >
        DEFAULTS.ball.maxSpeed
      ) {
        const ratio =
          DEFAULTS.ball.maxSpeed /
          speed;

        this.ball.setVelocity(
          velocity.x * ratio,
          velocity.y * ratio
        );
      }
    }

    trackBallMovement() {
      if (
        !this.ball ||
        !this.gameState.ballInPlay
      ) {
        return;
      }

      const previous =
        this.gameState.lastBallPosition;

      if (!previous) {
        this.gameState.lastBallPosition = {
          x: this.ball.x,
          y: this.ball.y
        };

        return;
      }

      const movement =
        Phaser.Math.Distance.Between(
          previous.x,
          previous.y,
          this.ball.x,
          this.ball.y
        );

      if (movement > 3) {
        this.gameState.lastBallMotionAt =
          this.time.now;

        this.gameState.lastBallPosition = {
          x: this.ball.x,
          y: this.ball.y
        };
      }

      const stalledFor =
        this.time.now -
        this.gameState.lastBallMotionAt;

      if (
        stalledFor > 4500 &&
        this.gameState.ballLaunched
      ) {
        this.unstickBall();
      }
    }

    unstickBall() {
      if (!this.ball) {
        return;
      }

      const direction =
        this.ball.x < WORLD.width / 2
          ? 1
          : -1;

      this.ball.setVelocity(
        direction *
          Phaser.Math.FloatBetween(
            2.8,
            5.4
          ),
        Phaser.Math.FloatBetween(
          -8,
          -13
        )
      );

      this.gameState.lastBallMotionAt =
        this.time.now;

      this.createImpactParticles(
        this.ball.x,
        this.ball.y,
        0x72e7ff,
        8
      );
    }

    handleDrain() {
      if (
        this.gameState.drainLocked ||
        !this.gameState.ballInPlay
      ) {
        return;
      }

      this.gameState.drainLocked = true;
      this.gameState.ballInPlay = false;

      this.flashTable(
        0xff335f,
        0.28,
        160
      );

      this.cameras.main.shake(
        180,
        0.006
      );

      this.createImpactParticles(
        DEFAULTS.drain.x,
        DEFAULTS.drain.y - 20,
        0xff355c,
        22
      );

      this.vibrate([40, 35, 55]);

      if (this.ball) {
        this.tweens.add({
          targets: this.ball,
          alpha: 0,
          scaleX: 0.45,
          scaleY: 0.45,
          duration: 170,
          ease: "Quad.In",
          onComplete: () => {
            if (this.ball) {
              this.ball.destroy();
              this.ball = null;
            }
          }
        });
      }

      window.dispatchEvent(
        new CustomEvent(
          "pumpball:ball-drained",
          {
            detail: {
              ballNumber:
                this.gameState.ballNumber,

              ballsRemaining:
                this.gameState.ballsRemaining
            }
          }
        )
      );

      this.time.delayedCall(
        950,
        () => {
          this.advanceAfterDrain();
        }
      );
    }

    advanceAfterDrain() {
      if (!this.gameState.playing) {
        return;
      }

      if (
        this.gameState.ballsRemaining > 0
      ) {
        this.gameState.ballNumber += 1;
        this.gameState.ballsRemaining -= 1;

        this.createBall();
        this.updateHud();

        this.flashTable(
          0x60ff70,
          0.1,
          100
        );
      } else {
        this.finishGame();
      }
    }

    updateHud() {
      if (dom.scoreDisplay) {
        dom.scoreDisplay.textContent =
          formatScore(
            this.gameState.score
          );
      }

      if (dom.ballDisplay) {
        const currentBall =
          this.gameState.playing
            ? Math.min(
                this.gameState.ballNumber,
                getBallsPerGame()
              )
            : 0;

        dom.ballDisplay.textContent =
          `${currentBall} / ${getBallsPerGame()}`;
      }
    }

    async startGame(options = {}) {
      if (
        !this.gameState.ready ||
        this.gameState.playing
      ) {
        return false;
      }

      const sessionId =
        options.sessionId ||
        createSessionId();

      this.resetGameState();

      this.gameState.sessionId =
        sessionId;

      this.gameState.credit =
        options.credit || null;

      this.gameState.playing = true;
      this.gameState.gameOver = false;
      this.gameState.ballNumber = 1;
      this.gameState.ballsRemaining =
        getBallsPerGame() - 1;

      this.createBall();
      this.updateHud();
      hideOverlay();

      this.cameras.main.fadeIn(
        300,
        0,
        0,
        0
      );

      this.flashTable(
        0x8f4fff,
        0.15,
        120
      );

      window.dispatchEvent(
        new CustomEvent(
          "pumpball:game-started",
          {
            detail: {
              sessionId,
              tournamentId:
                CONFIG.tournament.id,
              tournamentSeason:
                CONFIG.tournament.season
            }
          }
        )
      );

      return true;
    }

    resetGameState() {
      if (this.ball) {
        this.ball.destroy();
        this.ball = null;
      }

      this.gameState.score = 0;
      this.gameState.ballNumber = 0;
      this.gameState.ballsRemaining =
        getBallsPerGame();

      this.gameState.ballInPlay = false;
      this.gameState.ballLaunched = false;
      this.gameState.launcherCharging =
        false;

      this.gameState.leftFlipperPressed =
        false;

      this.gameState.rightFlipperPressed =
        false;

      this.gameState.drainLocked = false;

      this.launcherMeter.height = 0;
      this.updateHud();
    }

    async finishGame() {
      if (
        !this.gameState.playing ||
        this.gameState.gameOver
      ) {
        return;
      }

      this.gameState.playing = false;
      this.gameState.gameOver = true;
      this.gameState.ballInPlay = false;

      const finalScore =
        this.gameState.score;

      this.flashTable(
        0x9c52ff,
        0.28,
        220
      );

      this.cameras.main.shake(
        190,
        0.0045
      );

      this.tweens.add({
        targets: this.vignette,
        alpha: 0.45,
        duration: 240,
        yoyo: true,
        ease: "Quad.Out"
      });

      window.dispatchEvent(
        new CustomEvent(
          "pumpball:game-ended",
          {
            detail: {
              score: finalScore,
              sessionId:
                this.gameState.sessionId
            }
          }
        )
      );

      let submission = {
        improved: false,
        rank: null,
        previousBest: 0
      };

      try {
        const paymentState =
          window.PumpBallPayments
            ?.getState?.();

        const walletAddress =
          paymentState?.walletAddress ||
          null;

        const isPaid =
          this.gameState.credit?.type ===
          "paid";

        if (
          window.PumpBallLeaderboard &&
          typeof window
            .PumpBallLeaderboard
            .submitScore === "function"
        ) {
          submission =
            await window.PumpBallLeaderboard
              .submitScore({
                score: finalScore,

                sessionId:
                  this.gameState.sessionId,

                playerId:
                  walletAddress,

                verified: isPaid
              });
        }
      } catch (error) {
        console.error(
          "[PumpBall] Score submission failed:",
          error
        );

        submission = {
          improved: false,
          rank: null,
          previousBest: 0,
          error
        };
      }

      if (submission.improved) {
        this.playNewBestCelebration();
      }

      showGameOverPanel({
        score: finalScore,
        rank: submission.rank,
        improved:
          Boolean(submission.improved),
        previousBest:
          submission.previousBest || 0
      });
    }

    playNewBestCelebration() {
      this.flashTable(
        0x62ff73,
        0.36,
        240
      );

      this.createImpactParticles(
        WORLD.width / 2,
        WORLD.height * 0.42,
        0x62ff73,
        40
      );

      this.createImpactParticles(
        WORLD.width / 2,
        WORLD.height * 0.42,
        0xb15cff,
        40
      );

      this.cameras.main.shake(
        280,
        0.008
      );

      this.vibrate([
        35,
        25,
        35,
        25,
        70
      ]);

      window.dispatchEvent(
        new CustomEvent(
          "pumpball:new-best-celebration"
        )
      );
    }

    pauseGame() {
      if (
        !this.gameState.playing ||
        this.gameState.paused
      ) {
        return;
      }

      this.gameState.paused = true;
      this.matter.world.pause();
      this.scene.pause();
    }

    resumeGame() {
      if (!this.gameState.paused) {
        return;
      }

      this.gameState.paused = false;
      this.matter.world.resume();
      this.scene.resume();
    }

    getPublicState() {
      return {
        ready: this.gameState.ready,
        playing:
          this.gameState.playing,

        paused:
          this.gameState.paused,

        gameOver:
          this.gameState.gameOver,

        score:
          this.gameState.score,

        ballNumber:
          this.gameState.ballNumber,

        ballsRemaining:
          this.gameState.ballsRemaining,

        sessionId:
          this.gameState.sessionId,

        ballInPlay:
          this.gameState.ballInPlay,

        ballLaunched:
          this.gameState.ballLaunched
      };
    }

    vibrate(pattern) {
      if (
        CONFIG.effects?.haptics ===
          false ||
        typeof navigator.vibrate !==
          "function"
      ) {
        return;
      }

      try {
        navigator.vibrate(pattern);
      } catch (error) {
        /*
         * Haptics are optional.
         */
      }
    }

    update() {
      if (!this.gameState.ready) {
        return;
      }

      this.updateFlippers();
      this.updateLauncherMeter();

      if (!this.gameState.playing) {
        return;
      }

      this.clampBallVelocity();
      this.trackBallMovement();

      if (
        this.ball &&
        this.gameState.ballInPlay
      ) {
        this.createBallTrail();

        if (
          this.ball.y >
          WORLD.height + 90
        ) {
          this.handleDrain();
        }
      }
    }
  }

  async function consumeAndStartCredit(
    credit
  ) {
    if (!credit) {
      throw new Error(
        "No valid play credit was created."
      );
    }

    if (
      !window.PumpBallPayments ||
      typeof window.PumpBallPayments
        .consumePlayCredit !== "function"
    ) {
      throw new Error(
        "The payment service is unavailable."
      );
    }

    if (
      !runtime.scene ||
      typeof runtime.scene.startGame !==
        "function"
    ) {
      throw new Error(
        "The game is still loading."
      );
    }

    const sessionId = createSessionId();

    const consumedCredit =
      window.PumpBallPayments
        .consumePlayCredit(sessionId);

    runtime.currentSessionId =
      sessionId;

    runtime.currentCredit =
      consumedCredit;

    await runtime.scene.startGame({
      sessionId,
      credit: consumedCredit
    });

    return {
      sessionId,
      credit: consumedCredit
    };
  }

  async function handlePaidPlay() {
    if (runtime.startingAttempt) {
      return;
    }

    runtime.startingAttempt = true;
    runtime.latestError = null;

    setButtonsBusy(true);

    const entryDisplay =
      CONFIG.tournament
        .entryPriceDisplay ||
      `${CONFIG.tournament.entryPriceSol} SOL`;

    setPlayFeedback(
      `Preparing your ${entryDisplay} attempt…`,
      "loading"
    );

    try {
      if (
        !window.PumpBallPayments ||
        typeof window.PumpBallPayments
          .purchasePlay !== "function"
      ) {
        throw new Error(
          "The payment service is unavailable."
        );
      }

      const credit =
        await window.PumpBallPayments
          .purchasePlay();

      setPlayFeedback(
        "Attempt authorized. Launching PumpBall…",
        "success"
      );

      await consumeAndStartCredit(
        credit
      );

      setPlayFeedback("");
    } catch (error) {
      runtime.latestError = error;

      setPlayFeedback(
        error.message ||
          "The attempt could not be authorized.",
        "error"
      );

      console.error(
        "[PumpBall] Paid play failed:",
        error
      );
    } finally {
      runtime.startingAttempt = false;
      setButtonsBusy(false);
      updateWalletUi();
    }
  }

  async function handleFreeTestPlay() {
    if (runtime.startingAttempt) {
      return;
    }

    runtime.startingAttempt = true;
    runtime.latestError = null;

    setButtonsBusy(true);

    setPlayFeedback(
      "Creating a development play credit…",
      "loading"
    );

    try {
      if (
        !CONFIG.app?.allowFreeTestGame
      ) {
        throw new Error(
          "Free test games are disabled."
        );
      }

      if (
        !window.PumpBallPayments ||
        typeof window.PumpBallPayments
          .createTestPlayCredit !==
          "function"
      ) {
        throw new Error(
          "The test payment service is unavailable."
        );
      }

      const credit =
        window.PumpBallPayments
          .createTestPlayCredit();

      setPlayFeedback(
        "Test credit created. Launching PumpBall…",
        "success"
      );

      await consumeAndStartCredit(
        credit
      );

      setPlayFeedback("");
    } catch (error) {
      runtime.latestError = error;

      setPlayFeedback(
        error.message ||
          "The test game could not be started.",
        "error"
      );

      console.error(
        "[PumpBall] Test play failed:",
        error
      );
    } finally {
      runtime.startingAttempt = false;
      setButtonsBusy(false);
    }
  }

  async function handleConnectWallet() {
    if (
      !window.PumpBallPayments ||
      typeof window.PumpBallPayments
        .connectWallet !== "function"
    ) {
      setPlayFeedback(
        "The wallet service is unavailable.",
        "error"
      );

      return;
    }

    setButtonsBusy(true);

    try {
      await window.PumpBallPayments
        .connectWallet();

      setPlayFeedback(
        "Wallet connected.",
        "success"
      );
    } catch (error) {
      setPlayFeedback(
        error.message ||
          "Wallet connection failed.",
        "error"
      );
    } finally {
      setButtonsBusy(false);
      updateWalletUi();
    }
  }

  function handleViewLeaderboard() {
    const section =
      document.getElementById(
        "leaderboard-section"
      );

    section?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

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
  }

  function bindDomEvents() {
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

    dom.connectWalletButton
      ?.addEventListener(
        "click",
        handleConnectWallet
      );

    dom.returnToLeaderboardButton
      ?.addEventListener(
        "click",
        handleViewLeaderboard
      );

    window.addEventListener(
      "pumpball:wallet-connected",
      updateWalletUi
    );

    window.addEventListener(
      "pumpball:wallet-disconnected",
      updateWalletUi
    );

    document.addEventListener(
      "visibilitychange",
      () => {
        if (!runtime.scene) {
          return;
        }

        if (
          document.visibilityState ===
          "hidden"
        ) {
          if (
            runtime.scene.gameState
              .playing
          ) {
            runtime.scene
              .matter.world.pause();

            runtime.scene.gameState.paused =
              true;
          }
        } else if (
          runtime.scene.gameState.paused
        ) {
          runtime.scene
            .matter.world.resume();

          runtime.scene.gameState.paused =
            false;
        }
      }
    );

    window.addEventListener(
      "blur",
      () => {
        if (
          runtime.scene?.gameState
            .playing
        ) {
          runtime.scene
            .matter.world.pause();

          runtime.scene.gameState.paused =
            true;
        }
      }
    );

    window.addEventListener(
      "focus",
      () => {
        if (
          runtime.scene?.gameState
            .paused
        ) {
          runtime.scene
            .matter.world.resume();

          runtime.scene.gameState.paused =
            false;
        }
      }
    );
  }

  function createPhaserGame() {
    const container =
      document.getElementById(
        "game-container"
      );

    if (!container) {
      throw new Error(
        "The #game-container element is missing."
      );
    }

    runtime.phaserGame =
      new Phaser.Game({
        type: Phaser.AUTO,

        parent: "game-container",

        width: WORLD.width,
        height: WORLD.height,

        transparent: true,

        backgroundColor: "#050505",

        antialias: true,
        roundPixels: false,

        physics: {
          default: "matter",

          matter: {
            gravity: {
              x: 0,
              y: 0.92
            },

            enableSleeping: false,

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
            Phaser.Scale.CENTER_BOTH,

          width: WORLD.width,
          height: WORLD.height
        },

        render: {
          pixelArt: false,
          antialias: true,
          powerPreference:
            "high-performance"
        },

        scene: [PumpBallScene]
      });

    return runtime.phaserGame;
  }

  function getState() {
    return {
      initialized:
        runtime.initialized,

      startingAttempt:
        runtime.startingAttempt,

      currentSessionId:
        runtime.currentSessionId,

      currentCredit:
        runtime.currentCredit,

      game:
        runtime.scene
          ? runtime.scene
              .getPublicState()
          : null,

      latestError:
        runtime.latestError
          ? runtime.latestError.message
          : null
    };
  }

  async function startGame(options = {}) {
    if (!runtime.scene) {
      throw new Error(
        "The PumpBall scene is not ready."
      );
    }

    return runtime.scene.startGame(
      options
    );
  }

  function pauseGame() {
    runtime.scene?.pauseGame();
  }

  function resumeGame() {
    runtime.scene?.resumeGame();
  }

  async function endGame() {
    if (!runtime.scene) {
      return;
    }

    return runtime.scene.finishGame();
  }

  async function submitScore() {
    if (!runtime.scene) {
      throw new Error(
        "The PumpBall scene is not ready."
      );
    }

    if (
      !window.PumpBallLeaderboard ||
      typeof window.PumpBallLeaderboard
        .submitScore !== "function"
    ) {
      throw new Error(
        "The leaderboard service is unavailable."
      );
    }

    return window.PumpBallLeaderboard
      .submitScore({
        score:
          runtime.scene.gameState.score,

        sessionId:
          runtime.scene.gameState
            .sessionId,

        verified:
          runtime.currentCredit?.type ===
          "paid"
      });
  }

  async function initialize() {
    if (runtime.initialized) {
      return getState();
    }

    cacheDom();
    bindDomEvents();

    updateTournamentUi();
    updateWalletUi();
    showStartPanel();

    try {
      window.PumpBallPayments
        ?.initialize?.();

      await window.PumpBallLeaderboard
        ?.initialize?.();
    } catch (error) {
      console.warn(
        "[PumpBall] Supporting service initialization warning:",
        error
      );
    }

    createPhaserGame();

    runtime.initialized = true;

    window.dispatchEvent(
      new CustomEvent(
        "pumpball:application-ready"
      )
    );

    return getState();
  }

  window.PumpBallGame =
    Object.freeze({
      initialize,
      startGame,
      endGame,
      pauseGame,
      resumeGame,
      submitScore,
      getState
    });

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      initialize().catch((error) => {
        runtime.latestError = error;

        console.error(
          "[PumpBall] Initialization failed:",
          error
        );

        setPlayFeedback(
          error.message ||
            "PumpBall could not be initialized.",
          "error"
        );
      });
    },
    {
      once: true
    }
  );
})();
