"use strict";

/**
 * PumpBall global configuration.
 *
 * Keep gameplay constants here rather than scattering magic numbers
 * throughout game.js.
 *
 * game.js will read from:
 * window.PUMPBALL_CONFIG
 * window.PUMPBALL_UTILS
 */

(() => {
  const CONFIG = {
    app: {
      name: "PumpBall",
      version: "0.1.0",
      environment: "development",

      debug: false,
      showPhysicsBodies: false,
      showCollisionLabels: false,
      allowFreeTestGame: true
    },

    tournament: {
      id: "pumpball-tournament-001",
      name: "PumpBall Tournament #001",
      promotionalLabel: "First-Time Promo",

      status: "coming-soon",

      entryPriceUsd: 0.5,
      entryPriceDisplay: "$0.50",

      prizePoolSol: 1,
      prizePoolDisplay: "1 SOL",

      winnerCount: 2,
      payoutPerWinnerSol: 0.5,

      // Replace these before launch.
      startsAt: "2026-08-01T12:00:00-04:00",
      endsAt: "2026-08-08T12:00:00-04:00",

      onlyHighestScoreCounts: true,
      unlimitedPaidAttempts: true,

      tieBreakers: [
        "fewest-attempts",
        "earliest-score",
        "earliest-session-completion"
      ]
    },

    payments: {
  enabled: false,
  network: "mainnet-beta",

  treasuryWallet:
    "7Ut8PPBHyQnnJCmMcVrJx43jT25hK1ugX3uSuyyu6DaC",

  entryPriceSol: 0.015,
entryPriceDisplay: "0.015 SOL",

  verification: {
    required: true,
    minimumConfirmations: 1,
    preventDuplicateTransactions: true,
    requireExactRecipient: true,
    requireValidPlayCredit: true
  },

  testMode: true
},
    game: {
      /**
       * Internal game resolution.
       *
       * Phaser scales this canvas to fit the available screen while
       * preserving the portrait pinball-table proportions.
       */
      width: 720,
      height: 1280,

      backgroundColor: "#050508",

      ballsPerGame: 3,
      startingBallNumber: 1,

      minimumSessionDurationMs: 8_000,
      maximumSessionDurationMs: 20 * 60 * 1000,

      /**
       * A short delay after losing a ball prevents accidental input
       * from immediately launching the next ball.
       */
      nextBallDelayMs: 1_150,
      gameOverDelayMs: 1_400,

      /**
       * Stops balls from becoming permanently trapped or nearly motionless.
       */
      stuckBallCheckIntervalMs: 1_500,
      stuckBallMinimumSpeed: 0.22,
      stuckBallTimeoutMs: 4_500,

      /**
       * A ball moving faster than this will be gently limited.
       * This avoids tunneling through thin colliders.
       */
      maximumBallSpeed: 34,
      maximumLaunchSpeed: 30,

      /**
       * Prevents absurd scores from malformed or manipulated sessions.
       * This can be raised after real playtesting.
       */
      maximumAcceptedScore: 50_000_000
    },

    scale: {
      mode: "FIT",
      autoCenter: "CENTER_BOTH",
      parent: "game-container",

      minWidth: 320,
      minHeight: 480,

      maxWidth: 900,
      maxHeight: 1600
    },

    physics: {
      engine: "matter",

      /**
       * Matter's gravity is intentionally softer than normal platform-game
       * gravity because the table itself represents a tilted surface.
       */
      gravity: {
        x: 0,
        y: 0.92,
        scale: 0.001
      },

      timing: {
        targetFps: 60,
        deltaSmoothingMax: 10,

        /**
         * Matter performs additional solving passes for more stable
         * flippers, ramps, and high-speed collisions.
         */
        positionIterations: 10,
        velocityIterations: 10,
        constraintIterations: 4
      },

      ball: {
        radius: 13,

        density: 0.0052,
        friction: 0.002,
        frictionAir: 0.0065,
        frictionStatic: 0,

        /**
         * Restitution controls rebound.
         * Too high makes the ball feel like rubber.
         */
        restitution: 0.58,

        inertia: 0.00001,
        slop: 0.02,

        collisionCategory: 0x0001,
        collisionMask: 0xffff,

        initialAngularVelocityRange: [-0.035, 0.035],

        trailLength: 9,
        shadowOffsetX: 7,
        shadowOffsetY: 10,

        /**
         * Very small natural variance prevents every launch and rebound
         * from producing an identical path.
         *
         * It should never overpower the actual physics.
         */
        naturalVariance: {
          enabled: true,

          impulseVariance: 0.018,
          angleVarianceDegrees: 0.65,
          restitutionVariance: 0.012,

          maximumVelocityAdjustment: 0.08
        }
      },

      walls: {
        restitution: 0.48,
        friction: 0.008,
        thickness: 28
      },

      rails: {
        restitution: 0.62,
        friction: 0.004
      },

      rubber: {
        restitution: 0.82,
        friction: 0.003
      },

      ramps: {
        restitution: 0.34,
        friction: 0.018,

        /**
         * A ramp is represented with layers and temporary ball-state
         * changes rather than true 3D geometry.
         */
        entrySpeedMinimum: 7.5,
        exitSpeedMultiplier: 0.94,
        exitImpulse: 0.75,

        depthScaleMinimum: 0.76,
        depthScaleMaximum: 1
      },

      sensors: {
        isSensor: true,
        restitution: 0,
        friction: 0
      }
    },

    flippers: {
      left: {
        pivotX: 285,
        pivotY: 1115,

        restAngleDegrees: 24,
        activeAngleDegrees: -32
      },

      right: {
        pivotX: 435,
        pivotY: 1115,

        restAngleDegrees: -24,
        activeAngleDegrees: 32
      },

      length: 112,
      thickness: 24,

      density: 0.02,
      friction: 0.01,
      restitution: 0.34,

      /**
       * Higher stiffness produces a crisp arcade response.
       * Damping prevents ugly oscillation.
       */
      stiffness: 0.98,
      damping: 0.18,

      activationSpeed: 0.19,
      returnSpeed: 0.13,

      maximumAngularSpeed: 0.38,

      /**
       * Adds a controlled upward impulse when the flipper makes contact
       * during its active swing.
       */
      contactBoost: {
        enabled: true,

        baseImpulse: 1.25,
        tipMultiplier: 1.42,
        centerMultiplier: 1,
        baseMultiplier: 0.7,

        maximumImpulse: 2.15
      },

      inputBufferMs: 90,
      releaseBufferMs: 45,

      vibrationDurationMs: 22
    },

    plunger: {
      laneX: 662,

      ballStartX: 662,
      ballStartY: 1122,

      minimumCharge: 0.14,
      maximumCharge: 1,

      chargeRatePerSecond: 0.92,
      releaseDecayPerSecond: 2.8,

      minimumLaunchImpulse: 8.5,
      maximumLaunchImpulse: 25.5,

      /**
       * Slight launch variation makes repeated launches feel physical,
       * while still rewarding the player's charge timing.
       */
      horizontalVariance: 0.18,
      verticalVariance: 0.22,

      automaticReleaseAfterMs: 1_850,

      launchShakeClass: "shake-medium",
      launchFlashClass: "purple-flash"
    },

    nudging: {
      enabled: true,

      /**
       * Nudging should be useful but not allow the player to steer the
       * ball freely.
       */
      horizontalImpulse: 0.42,
      upwardImpulse: 0.12,

      cooldownMs: 420,

      /**
       * Excessive nudging triggers a tilt warning and eventually ends
       * the current ball.
       */
      tiltMeterMaximum: 100,
      tiltPerNudge: 27,
      tiltRecoveryPerSecond: 11,

      warningThreshold: 60,
      dangerThreshold: 82,
      tiltThreshold: 100
    },

    table: {
      bounds: {
        left: 42,
        right: 678,
        top: 42,
        bottom: 1238
      },

      drain: {
        x: 360,
        y: 1246,
        width: 160,
        height: 48
      },

      outlanes: {
        leftEnabled: true,
        rightEnabled: true
      },

      bumpers: [
        {
          id: "bumper-top-left",
          x: 260,
          y: 300,
          radius: 39,
          score: 1_000,
          impulse: 2.55,
          cooldownMs: 90
        },
        {
          id: "bumper-top-center",
          x: 360,
          y: 270,
          radius: 42,
          score: 1_250,
          impulse: 2.75,
          cooldownMs: 90
        },
        {
          id: "bumper-top-right",
          x: 465,
          y: 315,
          radius: 39,
          score: 1_000,
          impulse: 2.55,
          cooldownMs: 90
        },
        {
          id: "bumper-mid-left",
          x: 286,
          y: 470,
          radius: 36,
          score: 1_500,
          impulse: 2.65,
          cooldownMs: 90
        }
      ],

      slingshots: [
        {
          id: "slingshot-left",
          side: "left",
          x: 215,
          y: 960,
          score: 250,
          impulse: 1.65
        },
        {
          id: "slingshot-right",
          side: "right",
          x: 505,
          y: 960,
          score: 250,
          impulse: 1.65
        }
      ],

      rolloverLanes: [
        {
          id: "lane-p",
          letter: "P",
          score: 500
        },
        {
          id: "lane-u",
          letter: "U",
          score: 500
        },
        {
          id: "lane-m",
          letter: "M",
          score: 500
        },
        {
          id: "lane-p-2",
          letter: "P",
          score: 500
        }
      ],

      dropTargets: [
        {
          id: "target-b",
          letter: "B",
          score: 750
        },
        {
          id: "target-a",
          letter: "A",
          score: 750
        },
        {
          id: "target-l1",
          letter: "L",
          score: 750
        },
        {
          id: "target-l2",
          letter: "L",
          score: 750
        }
      ],

      kickers: [
        {
          id: "left-kicker",
          holdDurationMs: 480,
          releaseImpulse: 8.7,
          releaseAngleDegrees: -34,
          score: 2_500
        },
        {
          id: "upper-kicker",
          holdDurationMs: 560,
          releaseImpulse: 9.4,
          releaseAngleDegrees: 138,
          score: 3_000
        }
      ],

      spinners: [
        {
          id: "main-spinner",
          scorePerRotation: 175,
          maximumRotationsPerContact: 18,
          frictionLossPerRotation: 0.035
        }
      ],

      ramps: [
        {
          id: "left-orbit",
          requiredEntrySpeed: 7.5,
          score: 4_000,
          comboWindowMs: 3_000
        },
        {
          id: "right-ramp",
          requiredEntrySpeed: 8,
          score: 5_000,
          comboWindowMs: 3_200
        }
      ]
    },

    scoring: {
      baseMultiplier: 1,
      maximumMultiplier: 10,

      multiplierSteps: [1, 2, 3, 4, 5, 7, 10],

      events: {
        bumperHit: 1_000,
        slingshotHit: 250,
        rollover: 500,
        dropTarget: 750,
        spinnerTick: 175,
        rampComplete: 4_000,
        orbitComplete: 3_500,
        kickerCapture: 2_500,
        skillShot: 7_500,
        superSkillShot: 15_000,
        ballSave: 2_000,
        completePumpLetters: 10_000,
        completeBallLetters: 12_500,
        jackpot: 50_000,
        superJackpot: 125_000
      },

      combos: {
        enabled: true,

        resetAfterMs: 3_400,

        levels: [
          {
            hits: 2,
            multiplier: 1.2,
            label: "COMBO"
          },
          {
            hits: 3,
            multiplier: 1.5,
            label: "DOUBLE COMBO"
          },
          {
            hits: 5,
            multiplier: 2,
            label: "MEGA COMBO"
          },
          {
            hits: 8,
            multiplier: 3,
            label: "PUMP FRENZY"
          }
        ]
      },

      jackpot: {
        startingValue: 25_000,
        increasePerMajorShot: 2_500,
        maximumValue: 250_000,

        superJackpotMultiplier: 2.5
      }
    },

    gameModes: {
      skillShot: {
        enabled: true,

        activeForMs: 7_000,
        targetLaneId: "lane-m",

        normalAward: 7_500,
        perfectAward: 15_000,

        perfectSpeedMinimum: 17,
        perfectSpeedMaximum: 20.5
      },

      ballSave: {
        enabled: true,

        activeAfterLaunchMs: 8_000,
        maximumSavesPerBall: 1
      },

      multiball: {
        enabled: true,

        lockCountRequired: 3,
        ballCount: 3,

        startScore: 20_000,
        jackpotMultiplier: 1.5,

        maximumSimultaneousBalls: 3
      },

      pumpFrenzy: {
        enabled: true,

        requiredComboHits: 8,
        durationMs: 18_000,

        scoringMultiplier: 3,
        bumperImpulseMultiplier: 1.08
      },

      bonusRound: {
        enabled: true,

        durationMs: 15_000,
        targetHitsRequired: 6,
        completionAward: 35_000
      }
    },

    probability: {
      /**
       * Physics remain primary.
       *
       * Probability is used only for secondary events, presentation,
       * controlled mechanical variation, and rare bonuses.
       */
      enabled: true,

      useSeededRandom: true,
      seedSource: "session-id",

      events: {
        bumperSparkBurst: 0.78,
        bumperLargeSparkBurst: 0.18,

        collisionScreenShake: 0.42,
        majorCollisionScreenShake: 0.82,

        bonusLightPulse: 0.68,
        alternateSoundVariation: 0.35,

        mysteryAwardOnQualifiedShot: 0.08,
        extraBallOnMysteryAward: 0.015,

        rareJackpotCelebration: 0.12,
        cameraPunchOnRamp: 0.66,

        tinyNaturalDeflection: 0.24
      },

      mysteryAwards: [
        {
          id: "score-5000",
          weight: 42,
          type: "score",
          value: 5_000
        },
        {
          id: "score-10000",
          weight: 27,
          type: "score",
          value: 10_000
        },
        {
          id: "multiplier-plus-one",
          weight: 17,
          type: "multiplier",
          value: 1
        },
        {
          id: "ball-save",
          weight: 9,
          type: "ball-save",
          value: 1
        },
        {
          id: "light-jackpot",
          weight: 4,
          type: "light-jackpot",
          value: 1
        },
        {
          id: "extra-ball",
          weight: 1,
          type: "extra-ball",
          value: 1
        }
      ]
    },

    effects: {
      enabled: true,
      intensity: "high",

      /**
       * Limits simultaneous DOM and Phaser effects so mobile devices
       * remain smooth during multiball.
       */
      limits: {
        maximumParticles: 180,
        maximumFloatingScores: 12,
        maximumConcurrentTweens: 70,

        minimumShakeIntervalMs: 85,
        minimumFlashIntervalMs: 75,

        maximumHeavyShakesPerSecond: 3
      },

      screenShake: {
        small: {
          durationMs: 85,
          intensity: 0.0023
        },

        medium: {
          durationMs: 145,
          intensity: 0.0045
        },

        heavy: {
          durationMs: 245,
          intensity: 0.008
        },

        jackpot: {
          durationMs: 410,
          intensity: 0.012
        }
      },

      flashes: {
        bumper: {
          durationMs: 80,
          alpha: 0.16
        },

        ramp: {
          durationMs: 120,
          alpha: 0.21
        },

        drain: {
          durationMs: 180,
          alpha: 0.24
        },

        jackpot: {
          durationMs: 310,
          alpha: 0.36
        }
      },

      particles: {
        bumperCount: 10,
        slingshotCount: 7,
        rampCount: 18,
        jackpotCount: 70,
        multiballCount: 90,

        lifespanMinimumMs: 260,
        lifespanMaximumMs: 760
      },

      lighting: {
        ambientPulse: true,
        bumperGlow: true,
        ballGlow: true,
        railGlow: true,
        rampChaseLights: true,

        maximumDynamicLights: 18
      },

      ballTrail: {
        enabled: true,
        length: 9,
        alphaStart: 0.34,
        alphaEnd: 0
      },

      floatingScores: {
        enabled: true,
        durationMs: 720,
        riseDistance: 54,

        scaleStart: 0.76,
        scalePeak: 1.16,
        scaleEnd: 0.92
      },

      haptics: {
        enabled: true,

        flipperMs: 18,
        bumperMs: 28,
        rampMs: 35,
        jackpotPattern: [45, 35, 65, 35, 90]
      }
    },

    audio: {
      enabled: true,
      masterVolume: 0.72,

      musicVolume: 0.38,
      effectsVolume: 0.82,

      maximumSimultaneousSounds: 18,

      pitchVariation: {
        enabled: true,
        minimum: 0.96,
        maximum: 1.045
      }
    },

    controls: {
      keyboard: {
        leftFlipper: ["ArrowLeft", "KeyA"],
        rightFlipper: ["ArrowRight", "KeyD"],

        plunger: ["ArrowDown", "Space"],

        nudgeLeft: ["KeyZ"],
        nudgeRight: ["KeyX"],
        nudgeUp: ["ArrowUp"]
      },

      pointer: {
        leftFlipperScreenRatio: 0.5,
        rightFlipperScreenRatio: 0.5,

        plungerHoldRegionEnabled: true
      },

      preventPageScrollDuringGame: true
    },

    validation: {
      scoreSubmissionEnabled: true,

      rejectImpossibleBallCount: true,
      rejectNegativeScore: true,
      rejectDuplicateSession: true,
      rejectExpiredPlayCredit: true,

      scoreEventRateLimits: {
        bumperHitsPerSecond: 35,
        slingshotHitsPerSecond: 20,
        rampsPerSecond: 4,
        jackpotAwardsPerSecond: 1
      },

      physicsLimits: {
        maximumRecordedBallSpeed: 36,
        maximumRecordedImpulse: 28,
        maximumSimultaneousBalls: 3
      }
    },

    storage: {
      personalBestKey: "pumpball-personal-best",
      settingsKey: "pumpball-settings",
      testHistoryKey: "pumpball-test-history"
    }
  };

  /**
   * Shared utility functions.
   *
   * Probability never replaces collision physics. These helpers are used
   * for tiny bounded variations and secondary event selection.
   */
  const UTILS = {
    clamp(value, minimum, maximum) {
      return Math.min(Math.max(value, minimum), maximum);
    },

    lerp(start, end, amount) {
      const normalizedAmount = this.clamp(amount, 0, 1);
      return start + (end - start) * normalizedAmount;
    },

    inverseLerp(start, end, value) {
      if (start === end) {
        return 0;
      }

      return this.clamp((value - start) / (end - start), 0, 1);
    },

    degreesToRadians(degrees) {
      return degrees * (Math.PI / 180);
    },

    radiansToDegrees(radians) {
      return radians * (180 / Math.PI);
    },

    magnitude(vector) {
      return Math.sqrt(
        (vector.x * vector.x) +
        (vector.y * vector.y)
      );
    },

    normalize(vector) {
      const length = this.magnitude(vector);

      if (length <= Number.EPSILON) {
        return {
          x: 0,
          y: 0
        };
      }

      return {
        x: vector.x / length,
        y: vector.y / length
      };
    },

    limitVector(vector, maximumMagnitude) {
      const currentMagnitude = this.magnitude(vector);

      if (
        currentMagnitude <= maximumMagnitude ||
        currentMagnitude <= Number.EPSILON
      ) {
        return {
          x: vector.x,
          y: vector.y
        };
      }

      const scale = maximumMagnitude / currentMagnitude;

      return {
        x: vector.x * scale,
        y: vector.y * scale
      };
    },

    /**
     * Produces a stable 32-bit number from a string.
     */
    hashString(value) {
      const input = String(value);
      let hash = 2166136261;

      for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }

      return hash >>> 0;
    },

    /**
     * Mulberry32 seeded pseudo-random generator.
     *
     * The same seed produces the same random sequence, which helps
     * debugging and future server-side score verification.
     */
    createSeededRandom(seedValue) {
      let seed = Number.isFinite(seedValue)
        ? seedValue >>> 0
        : this.hashString(seedValue);

      return () => {
        seed += 0x6d2b79f5;

        let result = seed;

        result = Math.imul(
          result ^ (result >>> 15),
          result | 1
        );

        result ^= result + Math.imul(
          result ^ (result >>> 7),
          result | 61
        );

        return (
          (result ^ (result >>> 14)) >>> 0
        ) / 4294967296;
      };
    },

    randomBetween(randomFunction, minimum, maximum) {
      const random = typeof randomFunction === "function"
        ? randomFunction()
        : Math.random();

      return minimum + ((maximum - minimum) * random);
    },

    randomInteger(randomFunction, minimum, maximum) {
      return Math.floor(
        this.randomBetween(
          randomFunction,
          minimum,
          maximum + 1
        )
      );
    },

    chance(randomFunction, probability) {
      const normalizedProbability = this.clamp(
        probability,
        0,
        1
      );

      const random = typeof randomFunction === "function"
        ? randomFunction()
        : Math.random();

      return random < normalizedProbability;
    },

    weightedChoice(randomFunction, entries) {
      if (!Array.isArray(entries) || entries.length === 0) {
        return null;
      }

      const validEntries = entries.filter((entry) => (
        entry &&
        Number.isFinite(entry.weight) &&
        entry.weight > 0
      ));

      if (validEntries.length === 0) {
        return null;
      }

      const totalWeight = validEntries.reduce(
        (total, entry) => total + entry.weight,
        0
      );

      const randomValue = this.randomBetween(
        randomFunction,
        0,
        totalWeight
      );

      let cursor = 0;

      for (const entry of validEntries) {
        cursor += entry.weight;

        if (randomValue <= cursor) {
          return entry;
        }
      }

      return validEntries[validEntries.length - 1];
    },

    /**
     * Adds tiny bounded variance to an impulse.
     *
     * This should only be used after the real collision or launcher
     * calculation has already determined the primary direction.
     */
    varyImpulse(
      randomFunction,
      impulse,
      amount = CONFIG.physics.ball.naturalVariance.impulseVariance
    ) {
      const variance = this.randomBetween(
        randomFunction,
        -amount,
        amount
      );

      return {
        x: impulse.x * (1 + variance),
        y: impulse.y * (1 + variance)
      };
    },

    rotateVector(vector, radians) {
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);

      return {
        x: (vector.x * cosine) - (vector.y * sine),
        y: (vector.x * sine) + (vector.y * cosine)
      };
    },

    /**
     * Produces a launch impulse from a normalized plunger charge.
     */
    calculatePlungerImpulse(
      charge,
      randomFunction = Math.random
    ) {
      const settings = CONFIG.plunger;

      const normalizedCharge = this.clamp(
        charge,
        settings.minimumCharge,
        settings.maximumCharge
      );

      /**
       * The curve gives the player more fine control at low charge while
       * preserving a powerful maximum launch.
       */
      const curvedCharge = Math.pow(normalizedCharge, 1.34);

      const strength = this.lerp(
        settings.minimumLaunchImpulse,
        settings.maximumLaunchImpulse,
        curvedCharge
      );

      const horizontalVariance = this.randomBetween(
        randomFunction,
        -settings.horizontalVariance,
        settings.horizontalVariance
      );

      const verticalVariance = this.randomBetween(
        randomFunction,
        -settings.verticalVariance,
        settings.verticalVariance
      );

      return {
        x: horizontalVariance,
        y: -(strength + verticalVariance)
      };
    },

    /**
     * Calculates additional flipper power based on where the ball hits.
     *
     * A hit near the flipper tip receives more linear velocity because
     * the tip is moving through a larger arc.
     */
    calculateFlipperContactBoost(contactRatio, activationRatio = 1) {
      const boost = CONFIG.flippers.contactBoost;

      const normalizedContact = this.clamp(
        contactRatio,
        0,
        1
      );

      const normalizedActivation = this.clamp(
        activationRatio,
        0,
        1
      );

      let locationMultiplier;

      if (normalizedContact < 0.33) {
        locationMultiplier = boost.baseMultiplier;
      } else if (normalizedContact < 0.72) {
        locationMultiplier = boost.centerMultiplier;
      } else {
        locationMultiplier = boost.tipMultiplier;
      }

      return this.clamp(
        boost.baseImpulse *
          locationMultiplier *
          normalizedActivation,
        0,
        boost.maximumImpulse
      );
    },

    formatScore(score) {
      const safeScore = Number.isFinite(score)
        ? Math.max(0, Math.floor(score))
        : 0;

      return safeScore.toLocaleString("en-US");
    },

    formatWallet(walletAddress) {
      if (
        typeof walletAddress !== "string" ||
        walletAddress.length < 9
      ) {
        return walletAddress || "Unknown";
      }

      return `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`;
    },

    generateSessionId() {
      const timestamp = Date.now().toString(36);

      const randomPart = Math.random()
        .toString(36)
        .slice(2, 10);

      return `pb-${timestamp}-${randomPart}`;
    },

    isTournamentLive(now = new Date()) {
      const startsAt = new Date(CONFIG.tournament.startsAt);
      const endsAt = new Date(CONFIG.tournament.endsAt);

      return now >= startsAt && now < endsAt;
    },

    getTournamentTimeRemaining(now = new Date()) {
      const endTime = new Date(
        CONFIG.tournament.endsAt
      ).getTime();

      const difference = Math.max(
        0,
        endTime - now.getTime()
      );

      return {
        totalMs: difference,
        days: Math.floor(difference / 86_400_000),
        hours: Math.floor(
          (difference % 86_400_000) / 3_600_000
        ),
        minutes: Math.floor(
          (difference % 3_600_000) / 60_000
        ),
        seconds: Math.floor(
          (difference % 60_000) / 1_000
        )
      };
    }
  };

  /**
   * Freeze the top-level objects to discourage accidental replacement.
   * Nested gameplay state must never be stored inside CONFIG.
   */
  Object.freeze(CONFIG.app);
  Object.freeze(CONFIG.tournament);
  Object.freeze(CONFIG.game);
  Object.freeze(CONFIG);
  Object.freeze(UTILS);

  window.PUMPBALL_CONFIG = CONFIG;
  window.PUMPBALL_UTILS = UTILS;

  if (CONFIG.app.debug) {
    console.info(
      `[${CONFIG.app.name}] Configuration loaded`,
      CONFIG
    );
  }
})();
