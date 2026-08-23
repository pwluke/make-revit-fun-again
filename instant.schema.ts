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
        /** Avatar tint. Random per tab: there are no accounts and no names. */
        color: i.string(),
        x: i.number(),
        y: i.number(),
        z: i.number(),
        /** Camera yaw in radians, so the avatar faces where the player looks. */
        yaw: i.number(),
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
         * One laser bolt, so everyone in the room sees who is shooting at whom.
         *
         * A TOPIC, NOT PRESENCE, and the distinction matters here. Presence is
         * last-write-wins state that survives until the peer disconnects: two
         * shots inside one round-trip would collapse into one, and the last bolt
         * a peer fired would keep being handed to every client that joined
         * afterwards. A shot is an event with a 90ms lifetime, which is exactly
         * what a topic is for — the same reason `edit` is one.
         *
         * Six flat numbers rather than a JSON string: unlike an edit, a bolt is
         * always exactly two points, so there is no variable-length list needing
         * an encoding. No colour field either — `subscribeTopic` hands over the
         * publisher's presence alongside the event, so the bolt is tinted with
         * the shooter's own avatar colour without spending bytes on it.
         */
        shot: i.entity({
          /** Muzzle, world space. */
          fx: i.number(),
          fy: i.number(),
          fz: i.number(),
          /** Where the bolt stopped: an impact point, or the end of its range. */
          tx: i.number(),
          ty: i.number(),
          tz: i.number(),
          /** Whether the shooter's ray landed on something, so receivers know
           *  whether to throw sparks at the far end. */
          hit: i.boolean(),
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
