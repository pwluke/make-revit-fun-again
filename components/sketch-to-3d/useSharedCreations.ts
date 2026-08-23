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

/**
 * How long to wait after the last transform change before writing it.
 *
 * A corner drag fires setTransform on every pointermove — 60+ times a second.
 * Writing each would flood the socket to say the same thing repeatedly, so only
 * the value the drag settles on is sent.
 */
const TRANSFORM_WRITE_DELAY_MS = 200;

export function useSharedCreations(): void {
  const deviceId = useMemo(() => getDeviceId(), []);
  const { data } = db.useQuery({ creations: {} });

  /**
   * Ids already written to Instant. Without this the publish effect re-writes
   * every creation on every store change — including the ones it just received
   * back from the query, which is a loop.
   */
  const published = useRef(new Set<string>());

  /**
   * Creations with a local transform edit that has not been confirmed by the
   * server yet.
   *
   * Incoming query data is authoritative for everything EXCEPT these — without
   * that exception, the echo of an in-flight write (or simply someone else
   * creating something, which re-pushes the whole query result) would snap the
   * object back mid-drag. Classic local-echo suppression.
   */
  const pendingTransforms = useRef(new Map<string, string>());

  /** Debounce timers per creation, so one settling drag writes once. */
  const writeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

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
    const localById = new Map(state.creations.map((creation) => [creation.id, creation]));

    const reconciled = remote.map((incoming) => {
      // A transform this device is still writing wins over the server's copy.
      // Otherwise a drag fights the echo of its own updates, and any unrelated
      // change to the gallery (someone else creating something re-pushes the
      // whole query result) would snap the object back to where it was.
      if (!pendingTransforms.current.has(incoming.id)) return incoming;
      const local = localById.get(incoming.id);
      return local ? { ...incoming, transform: local.transform } : incoming;
    });

    // Keep locally in-flight jobs: they are not in the gallery yet, and dropping
    // them would make a generation vanish mid-wait.
    const inFlight = state.creations.filter((creation) => creation.state.status !== "ready");
    const merged = [...reconciled, ...inFlight].slice(-GALLERY_LIMIT);

    state.hydrate(merged);
  }, [data]);

  // --- outbound: transform edits sync back ----------------------------------
  useEffect(() => {
    const syncTransforms = (creations: Creation[]) => {
      for (const creation of creations) {
        // Only things already in the gallery; brand-new ones are handled by the
        // publish effect below, which writes the transform along with the row.
        if (!published.current.has(creation.id)) continue;

        const encoded = JSON.stringify(creation.transform);
        if (pendingTransforms.current.get(creation.id) === encoded) continue;
        pendingTransforms.current.set(creation.id, encoded);

        // Restart the timer on every change, so a drag writes once when it
        // stops rather than 60 times a second while it moves.
        clearTimeout(writeTimers.current.get(creation.id));
        writeTimers.current.set(
          creation.id,
          setTimeout(() => {
            writeTimers.current.delete(creation.id);
            db.transact(db.tx.creations[creation.id].update({ transform: encoded }))
              .then(() => {
                // Only stop suppressing the server's copy once ours has landed.
                if (pendingTransforms.current.get(creation.id) === encoded) {
                  pendingTransforms.current.delete(creation.id);
                }
              })
              .catch((err: unknown) => {
                pendingTransforms.current.delete(creation.id);
                console.warn("[sketch-to-3d] could not sync transform", err);
              });
          }, TRANSFORM_WRITE_DELAY_MS),
        );
      }
    };

    syncTransforms(creationStore.getState().creations);
    const unsubscribe = creationStore.subscribe((state) => syncTransforms(state.creations));

    return () => {
      unsubscribe();
      for (const timer of writeTimers.current.values()) clearTimeout(timer);
      writeTimers.current.clear();
    };
  }, []);

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
