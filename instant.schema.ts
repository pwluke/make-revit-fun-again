// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $streams: i.entity({
      abortReason: i.string().optional(),
      clientId: i.string().unique().indexed(),
      done: i.boolean().optional(),
      size: i.number().optional(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
      type: i.string().optional(),
    }),
    meshes: i.entity({
      color: i.string().optional(),
      faceCount: i.number().optional(),
      facesB64: i.string().optional(),
      guid: i.string().optional().indexed(),
      layer: i.string().optional(),
      name: i.string().optional(),
      normalsB64: i.string().optional(),
      updatedAt: i.number().optional().indexed(),
      vertexCount: i.number().optional(),
      verticesB64: i.string().optional(),
      visible: i.boolean().optional(),
    }),
    /**
     * Things people drew and generated, shared across every machine at the booth.
     *
     * Stores POINTERS, not assets: fal hosts the GLB and sprite files and serves
     * them from stable URLs, so a row is a few hundred bytes. Downloading the
     * binaries into Instant would mean 0.4-13.6 MB per creation for no benefit
     * while fal is up, and fal being down breaks generation anyway.
     *
     * `spawn` and `transform` are stored as JSON strings rather than nested
     * objects because Instant entities are flat — a triple of numbers has no
     * native representation here.
     */
    creations: i.entity({
      /** Client-generated uuid, so a creation keeps its identity across devices. */
      creationId: i.string().unique().indexed(),
      /** "sprite" | "mesh" | "fast" — which pipeline produced it. */
      mode: i.string(),
      /** What the child typed, for display and for a future gallery view. */
      userText: i.string().optional(),
      /** The fal URL of the GLB or the sprite PNG. The thing actually rendered. */
      assetUrl: i.string(),
      /** JSON: { position: [x,y,z], rotationY }. Where it was born. */
      spawn: i.string(),
      /** JSON: { scale, y }. Where the player has since put it. */
      transform: i.string().optional(),
      /** Sort key for "newest first" and for capping the gallery. */
      createdAt: i.number().indexed(),
      /**
       * Which browser made it. Not auth — there are no accounts here — just
       * enough to let a machine clean up after itself without wiping the room.
       */
      deviceId: i.string().optional().indexed(),
    }),
    // Voxel / grid cells streamed from Rhino (or authored here) to seed Cube.tsx.
    points: i.entity({
      x: i.number().indexed(),
      y: i.number().indexed(),
      z: i.number().indexed(),
      occupied: i.boolean().optional(),
      color: i.string().optional(),
      layer: i.string().optional(),
      sourceGuid: i.string().optional().indexed(),
      updatedAt: i.number().optional().indexed(),
    }),
  },
  links: {
    $streams$files: {
      forward: {
        on: "$streams",
        has: "many",
        label: "$files",
      },
      reverse: {
        on: "$files",
        has: "one",
        label: "$stream",
        onDelete: "cascade",
      },
    },
    $usersLinkedPrimaryUser: {
      forward: {
        on: "$users",
        has: "one",
        label: "linkedPrimaryUser",
        onDelete: "cascade",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "linkedGuestUsers",
      },
    },
  },
  rooms: {
    /**
     * Live multiplayer. Everything here is EPHEMERAL — Instant rooms are a
     * pub/sub channel, not a table, so none of this is persisted and none of it
     * needs a rule in instant.perms.ts.
     *
     * The consequence worth knowing: a player who joins late sees the base world
     * from the `_voxels.json` files, not the blocks everyone else has already
     * broken. Durable edits would mean writing an entity and replaying it on
     * join; that is deliberately out of scope here.
     */
    world: {
      /**
       * Where each player is, republished ~10x a second. Presence is
       * last-write-wins per peer and is dropped when they disconnect, which is
       * exactly the lifetime an avatar wants — no explicit "player left" event.
       */
      presence: i.entity({
        /** Avatar tint. Random per tab. */
        color: i.string(),
        x: i.number(),
        y: i.number(),
        z: i.number(),
        /** Camera yaw in radians, so the avatar faces where the player looks. */
        yaw: i.number(),
        /**
         * True while this player is in a live Laser Tag round — i.e. holding a
         * gun and able to take a hit. It gates PvP in both directions: nobody
         * can be shot while they are reading the setup card or building in
         * another mode, and nobody can shoot from there either.
         *
         * On presence rather than in the shot message because the SHOOTER needs
         * it before firing, to decide whether a player-shaped thing in front of
         * them is a target or scenery. Absent on a peer mid-connection, which
         * `decodePresence` reads as "not armed" — the safe default.
         */
        armed: i.boolean().optional(),
        /**
         * Display name chosen in the join modal (lib/player-identity.ts).
         * Optional on the wire: absent for a peer whose first slice has not
         * landed yet, which `decodePresence` reads as "" — draw the avatar,
         * skip the name tag.
         */
        name: i.string().optional(),
      }),
      topics: {
        /**
         * One world edit, broadcast as INTENT ("add at x,y,z") rather than as
         * resulting state. `useCubeStore`'s actions are idempotent and, for
         * disjoint coordinates, commutative, so replaying intent on every client
         * converges without any reconciliation pass.
         */
        edit: i.entity({
          /** "add" | "remove". Validated on receipt — see core/protocol.ts. */
          kind: i.string(),
          /**
           * JSON `[[x,y,z], ...]`. A string for the same reason `creations.spawn`
           * is one: Instant entities are flat, so a list of coordinate triples
           * has no native representation here.
           */
          positions: i.string(),
        }),
        /**
         * One laser bolt, broadcast to everyone so a shot is visible to
         * bystanders and not just to the two players involved.
         *
         * DELIBERATELY CARRIES NO DAMAGE NUMBER. The victim applies the shared
         * `PVP_DAMAGE` constant, so every hit costs the same on every screen.
         * What a shooter asserts here is only where it aimed and who it believes
         * it hit — and nothing checks either claim. See core/protocol.ts for
         * what that does and does not buy.
         */
        shot: i.entity({
          /** Peer id of the player hit, or "" for a shot that hit scenery. */
          targetId: i.string(),
          /** JSON `[x,y,z]` — the muzzle, so the bolt starts at their gun. */
          from: i.string(),
          /** JSON `[x,y,z]` — where the bolt stopped. */
          to: i.string(),
        }),
        /**
         * The victim confirming a hit landed on them. Sent by the player who
         * took the damage, never by the shooter, because health is simulated
         * only on its owner's client — the same rule that keeps positions
         * authoritative locally. It is what turns "I think I hit them" into a
         * scored tag.
         */
        tag: i.entity({
          /** Peer id of the shooter being credited. */
          shooterId: i.string(),
          /**
           * True when that hit was the one that took them to zero health, which
           * is the only case a message is sent for at all — a non-fatal hit is
           * already on the shooter's own hit counter and has nothing to add.
           */
          down: i.boolean(),
        }),
      },
    },
  },
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
