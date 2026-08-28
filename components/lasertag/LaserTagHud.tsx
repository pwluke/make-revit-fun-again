"use client";

import { useEffect, useState } from "react";
import {
  BOSS_HITS,
  BOSS_ID,
  BOSS_NAME,
  BOT_COUNT_OPTIONS,
  DIFFICULTIES,
  MAX_HEALTH,
  useLaserTagStore,
  type Difficulty,
  type RoundConfig,
} from "./laserTagStore";

const DIFFICULTY_ORDER: Difficulty[] = ["beginner", "intermediate", "expert"];

function BotPip({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`bot-pip${filled ? " filled" : ""}`}>
      <rect x="6" y="9" width="12" height="11" rx="2" />
      <circle cx="12" cy="6" r="3" />
    </svg>
  );
}

/** The Inspector's pip: the same silhouette under a hard hat, so he reads as
 *  one of the row and as the odd one out at the same time. */
function BossPip({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`bot-pip boss-pip${filled ? " filled" : ""}`}
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <circle cx="12" cy="8" r="3" />
      <path d="M3 6h18a9 9 0 0 0-18 0z" />
    </svg>
  );
}

/**
 * Pre-round options. Lives outside the canvas wrapper, so clicking it can't be
 * swallowed by PointerLockControls — the scene only grabs the mouse when you
 * click the canvas itself.
 */
function SetupCard() {
  const stored = useLaserTagStore((s) => s.config);
  const startRound = useLaserTagStore((s) => s.startRound);
  const armedPeers = useLaserTagStore((s) => s.armedPeers);
  const [draft, setDraft] = useState<RoundConfig>(stored);

  return (
    <div className="laser-setup">
      <span className="eyebrow">Laser tag scan</span>
      <h3>Set up your hunt</h3>

      <div className="setup-row">
        <span className="setup-label">How many bots?</span>
        <div className="setup-choices">
          {BOT_COUNT_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              className={`setup-chip${draft.botCount === count ? " active" : ""}`}
              aria-pressed={draft.botCount === count}
              onClick={() => setDraft({ ...draft, botCount: count })}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <div className="setup-row">
        <span className="setup-label">Can bots shoot back?</span>
        <div className="setup-choices">
          <button
            type="button"
            className={`setup-chip${draft.returnFire ? "" : " active"}`}
            aria-pressed={!draft.returnFire}
            onClick={() => setDraft({ ...draft, returnFire: false })}
          >
            No
          </button>
          <button
            type="button"
            className={`setup-chip${draft.returnFire ? " active" : ""}`}
            aria-pressed={draft.returnFire}
            onClick={() => setDraft({ ...draft, returnFire: true })}
          >
            Yes
          </button>
        </div>
      </div>

      {/* Only meaningful once they can shoot, so it appears with the answer
          rather than sitting there greyed out. */}
      {draft.returnFire ? (
        <div className="setup-row">
          <span className="setup-label">How tough?</span>
          <div className="setup-choices column">
            {DIFFICULTY_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                className={`setup-chip wide${draft.difficulty === id ? " active" : ""}`}
                aria-pressed={draft.difficulty === id}
                onClick={() => setDraft({ ...draft, difficulty: id })}
              >
                <strong>{DIFFICULTIES[id].label}</strong>
                <small>{DIFFICULTIES[id].blurb}</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <button type="button" className="setup-start" onClick={() => startRound(draft)}>
        Start the hunt
      </button>
      <p className="setup-foot">
        {draft.returnFire
          ? "You have 100 health. Use the walls."
          : "The bots are unarmed — take your time."}
      </p>
      {/* Not an option either: anyone else in the world is in it whatever you
          choose here, so this states the fact rather than offering a toggle. */}
      {armedPeers > 0 ? (
        <p className="setup-pvp">
          {armedPeers} other player{armedPeers === 1 ? " is" : "s are"} hunting
          in here — and you can tag each other.
        </p>
      ) : null}
      {/* Not an option, so it sits below the button as a warning rather than
          above it as a choice. */}
      <p className="setup-boss">
        {BOSS_NAME} is on the roof — {BOSS_HITS} hits to put him down
        {draft.returnFire ? ", and he hits harder than the bots." : "."}
      </p>
    </div>
  );
}

/**
 * The scoreboard. Reads the store per field, so a shot that only moves the
 * counter doesn't re-render the hint and vice versa.
 */
export function LaserTagHud() {
  const phase = useLaserTagStore((s) => s.phase);
  const config = useLaserTagStore((s) => s.config);
  const tagged = useLaserTagStore((s) => s.tagged);
  const total = useLaserTagStore((s) => s.total);
  const shots = useLaserTagStore((s) => s.shots);
  const hits = useLaserTagStore((s) => s.hits);
  const hint = useLaserTagStore((s) => s.hint);
  const health = useLaserTagStore((s) => s.health);
  const bossHits = useLaserTagStore((s) => s.bossHits);
  const bossPresent = useLaserTagStore((s) => s.bossPresent);
  const hurtToken = useLaserTagStore((s) => s.hurtToken);
  const armedPeers = useLaserTagStore((s) => s.armedPeers);
  const peerHits = useLaserTagStore((s) => s.peerHits);
  const peerTags = useLaserTagStore((s) => s.peerTags);
  const lastHitByColor = useLaserTagStore((s) => s.lastHitByColor);
  const downedByPeer = useLaserTagStore((s) => s.downedByPeer);
  const playAgain = useLaserTagStore((s) => s.playAgain);
  const backToSetup = useLaserTagStore((s) => s.backToSetup);

  // Clicking the scene grabs pointer lock, which hides the cursor — and the
  // setup card needs a cursor to be clickable at all. Hand it back for as long
  // as the card is up, rather than leaving the player to discover Esc.
  useEffect(() => {
    if (phase !== "setup") return;
    const release = () => {
      if (document.pointerLockElement) document.exitPointerLock();
    };
    release();
    document.addEventListener("pointerlockchange", release);
    return () => document.removeEventListener("pointerlockchange", release);
  }, [phase]);

  if (phase === "setup") {
    return (
      <div className="laser-hud">
        <SetupCard />
      </div>
    );
  }

  const bossDown = tagged.includes(BOSS_ID);
  // The boss is in `total` and in `tagged`, but he gets his own pip and his own
  // bar — so the scan-bot row counts both without him.
  const botPips = (total || config.botCount) - (bossPresent ? 1 : 0);
  const botsTagged = tagged.filter((id) => id !== BOSS_ID).length;
  const bossLeft = Math.max(0, BOSS_HITS - bossHits);
  /**
   * Whether this round is a PvP one. Either somebody else is out there right
   * now, or somebody was and the score proves it — a player who leaves must not
   * take your tally of them off the HUD with them.
   */
  const pvp = armedPeers > 0 || peerHits > 0 || peerTags > 0;
  /**
   * The health bar is normally the answer to "can the bots shoot back". Another
   * player can shoot back regardless of that setting, so an unarmed-bot round
   * with company in it still needs to show what you have left.
   */
  const showHealth = config.returnFire || pvp;

  return (
    <div className="laser-hud">
      {/* Damage flash. `key` is the hit counter, so each hit remounts the
          element and replays the CSS fade — no state, no timer, and two hits in
          a row still flash twice. */}
      {hurtToken > 0 ? (
        <div className="laser-hurt" key={hurtToken} aria-hidden />
      ) : null}

      <div className="laser-card">
        <div className="laser-score">
          <strong>
            Tagged {tagged.length}/{total || "—"}
          </strong>
          <div className="laser-pips">
            {Array.from({ length: Math.max(0, botPips) }).map((_, i) => (
              <BotPip key={i} filled={i < botsTagged} />
            ))}
            {bossPresent ? <BossPip filled={bossDown} /> : null}
          </div>
        </div>
        <p className="laser-stats">
          Shots {shots} · Hits {hits}
        </p>
        {/* Players, kept on its own line rather than folded into the bot stats:
            they are a different kind of opponent and the counts are not
            comparable — a bot is tagged in one hit, a player takes seven. */}
        {pvp ? (
          <p className="laser-pvp">
            Players {armedPeers} · Tagged {peerTags} · Hits {peerHits}
          </p>
        ) : null}
        {/* The boss track. Only while he is up — once he is down the pip says
            so, and a full-width empty bar would just be noise. */}
        {bossPresent && !bossDown ? (
          <div
            className="laser-boss"
            role="img"
            aria-label={`${BOSS_NAME}, ${bossLeft} hits to go`}
          >
            <span style={{ width: `${(bossLeft / BOSS_HITS) * 100}%` }} />
            <b>{BOSS_NAME.toUpperCase()}</b>
          </div>
        ) : null}
        {showHealth ? (
          <div className="laser-health" role="img" aria-label={`Health ${health}`}>
            <span style={{ width: `${(health / MAX_HEALTH) * 100}%` }} />
            <b>{health}</b>
          </div>
        ) : null}
        {/* Who is shooting at you, in the only terms this game has: nobody has
            a name, so the avatar's colour IS their identity — the same colour
            their bolt was drawn in. The store lapses this a couple of seconds
            after the last hit, which is what keeps the present tense honest. */}
        {phase === "hunting" && lastHitByColor ? (
          <p className="laser-pvp rival">
            <i style={{ background: lastHitByColor }} aria-hidden />
            Taking fire from another player
          </p>
        ) : null}
        {phase === "hunting" && hint ? (
          <p className="laser-hint">Nearest: {hint}</p>
        ) : null}
      </div>

      {phase === "won" || phase === "lost" ? (
        <div className={`laser-win${phase === "lost" ? " lost" : ""}`}>
          <strong>
            {phase === "won"
              ? bossPresent
                ? `${BOSS_NAME} is down!`
                : botPips === 1
                  ? "Bot tagged!"
                  : `All ${botPips} tagged!`
              : "You got scanned!"}
          </strong>
          <p>
            {phase === "won"
              ? `${shots} shot${shots === 1 ? "" : "s"} to clear the school.`
              : // Who got you is the first thing anyone asks, and "a bot did"
                // and "another player did" are very different answers.
                downedByPeer
                ? "Another player tagged you out."
                : bossDown || !bossPresent
                  ? `${tagged.length} of ${total} tagged before you went down.`
                  : `${BOSS_NAME} was still standing when you went down.`}
          </p>
          {peerTags > 0 ? (
            <p className="laser-win-pvp">
              {peerTags} player{peerTags === 1 ? "" : "s"} tagged along the way.
            </p>
          ) : null}
          <div className="laser-win-actions">
            <button type="button" onClick={playAgain}>
              Play again
            </button>
            <button type="button" className="ghost" onClick={backToSetup}>
              Change settings
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
