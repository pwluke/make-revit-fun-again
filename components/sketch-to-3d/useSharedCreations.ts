"use client";

/**
 * Syncs creations through InstantDB so every machine at the booth sees every
 * drawing.
 *
 * Replaces the localStorage layer rather than sitting beside it: two sources of
 * truth for the same list means deciding which wins on every reload, and the
 * shared gallery is strictly more useful than a private one. localStorage
 * remains only for the device id.
 *
 * What gets stored is a POINTER, not an asset — fal hosts the GLB and sprite
 * files. See core/remoteCreations.ts for the row shape and the reasoning.
 */

import { useEffect, useMemo, useRef } from "react";
import { db } from "@/lib/db";
import { creationStore } from "./core/creationStore";
import { assetUrlOf, fromRow, getDeviceId, toRow } from "./core/remoteCreations";
import type { Creation } from "./core/types";

/**
 * How many of the newest creations to show. The store caps the scene at 8 for
 * GPU-memory reasons; pulling the whole day's gallery would blow past that
 * within an hour of a busy booth.
 */
const GALLERY_LIMIT = 8;

export function useSharedCreations(): void {
  const deviceId = useMemo(() => getDeviceId(), []);
  const { data } = db.useQuery({ creations: {} });

  /**
   * Ids already written to Instant. Without this the publish effect re-writes
   * every creation on every store change — including the ones it just received
   * back from the query, which is a loop.
   */
  const published = useRef(new Set<string>());

  // --- inbound: the gallery becomes the scene ------------------------------
  useEffect(() => {
    const rows = data?.creations;
    if (!rows) return;

    const remote = rows
      .map(fromRow)
      .filter((creation): creation is Creation => creation !== null)
      // Newest last, matching the store's insertion order, then capped.
      .sort((a, b) => (a.id > b.id ? 1 : -1))
      .slice(-GALLERY_LIMIT);

    // Anything already in Instant must not be re-published when it arrives.
    for (const creation of remote) published.current.add(creation.id);

    const state = creationStore.getState();
    // Keep locally in-flight jobs: they are not in the gallery yet, and dropping
    // them would make a generation vanish mid-wait.
    const inFlight = state.creations.filter((creation) => creation.state.status !== "ready");
    const merged = [...remote, ...inFlight].slice(-GALLERY_LIMIT);

    state.hydrate(merged);
  }, [data]);

  // --- outbound: finished creations join the gallery ------------------------
  useEffect(() => {
    const publish = (creations: Creation[]) => {
      for (const creation of creations) {
        if (published.current.has(creation.id)) continue;
        // Only finished work is worth sharing — another machine cannot resume
        // someone else's in-flight generation.
        if (!assetUrlOf(creation)) continue;

        const row = toRow(creation, deviceId, Date.now());
        if (!row) continue;

        // Marked before awaiting, so a burst of store updates cannot each fire
        // their own write for the same creation.
        published.current.add(creation.id);
        db.transact(db.tx.creations[creation.id].update(row)).catch((err: unknown) => {
          // Let it retry on the next store change rather than losing the
          // creation. It still exists locally either way.
          published.current.delete(creation.id);
          console.warn("[sketch-to-3d] could not publish creation", err);
        });
      }
    };

    publish(creationStore.getState().creations);
    return creationStore.subscribe((state) => publish(state.creations));
  }, [deviceId]);

  // --- deletes propagate ----------------------------------------------------
  useEffect(() => {
    let handled = creationStore.getState().lastDeletedId;

    return creationStore.subscribe((state) => {
      const { lastDeletedId } = state;
      if (!lastDeletedId || lastDeletedId === handled) return;
      handled = lastDeletedId;

      // Driven by lastDeletedId, NOT by diffing the creations array. The
      // eviction cap drops creations from the scene constantly, and a diff
      // cannot tell that apart from someone pressing the X — which would let a
      // busy machine silently delete everyone else's work from the gallery.
      // Only removeCreation sets this field.
      published.current.delete(lastDeletedId);
      db.transact(db.tx.creations[lastDeletedId].delete()).catch((err: unknown) => {
        console.warn("[sketch-to-3d] could not delete creation", err);
      });
    });
  }, []);
}
