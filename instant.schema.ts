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
