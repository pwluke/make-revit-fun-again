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
  rooms: {},
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
