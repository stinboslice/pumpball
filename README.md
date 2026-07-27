# PumpBall

PumpBall is a browser-based competitive pinball tournament built for Pump.fun communities.

Players authorize an entry, receive one tournament-specific play credit, complete a three-ball pinball attempt, and compete for leaderboard placement. Each completed attempt is recorded, but a player’s leaderboard score only changes when the new score is strictly higher than their existing personal best.

## Tournament #001

| Setting | Value |
|---|---:|
| Tournament ID | `pumpball-tournament-001` |
| Season | `1` |
| Entry price | `0.015 SOL` |
| Balls per attempt | `3` |
| Scoring rule | Highest score only |
| Attempts | Unlimited paid attempts |
| Leaderboard scope | Tournament-specific |
| Historical records | Preserved after season end |

Tournament values are controlled through `config.js`.

Each future tournament receives its own ID and season. Leaderboards reset for new tournaments while prior records remain available for history and auditing.

---

## Current Build Status

The current build is ready for browser testing through GitHub Pages.

Implemented:

- Phaser-powered pinball table
- Matter.js physics
- Three-ball game loop
- Hold-to-charge launcher
- Left and right flipper controls
- Mobile touch controls
- Keyboard controls
- Bumper scoring
- Slingshot scoring
- Reactor scoring
- Ball trails
- Impact particles
- Floating score text
- Camera shake
- Table flashes
- Mechanism glow effects
- Drain handling
- Anti-stuck ball recovery
- Game-over flow
- Tournament-specific local leaderboard
- Attempt tracking
- Personal-best tracking
- Best score replacement only when the new score is higher
- Payment-credit-session architecture
- Development test-credit flow
- Production-ready payment authorization interface

Not yet connected:

- Live SOL transaction authorization
- Server-side transaction verification
- Supabase leaderboard storage
- Server-authoritative score validation
- Production anti-cheat checks

No real SOL should move while payment test mode remains enabled.

---

## Repository Structure

```text
pumpball/
├── index.html
├── style.css
├── config.js
├── payments.js
├── leaderboard.js
├── game.js
├── README.md
└── assets/
    ├── playfield.png
    ├── ball.png
    ├── bumper.png
    ├── flipper-left.png
    ├── flipper-right.png
    ├── reactor-jackpot.png
    ├── slingshot-left.png
    ├── slingshot-right.png
    └── reference/
        └── collision-map.png
