// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/react";

const rules = {
  /**
   * `creations` is deliberately world-readable and world-writable.
   *
   * This is a DECISION, not an oversight. The app has no accounts and no auth,
   * the Instant app id ships in the client bundle (so it is public by
   * definition), and the whole point of the shared gallery is that a drawing
   * made on one booth laptop appears on all of them. Requiring an owner would
   * mean requiring sign-in, which is the wrong trade for a children's booth.
   *
   * What that accepts: anyone who reads the bundle can add or remove rows. For
   * a one-day event with a spend-capped fal key and no personal data in these
   * records, that is a reasonable risk. It would NOT be reasonable for anything
   * that outlives the event — if this app is ever hosted permanently, this rule
   * is the first thing that needs revisiting.
   *
   * `update` is omitted intentionally: a creation is written once and then
   * deleted or left alone. Nothing edits someone else's row.
   */
  creations: {
    allow: {
      view: "true",
      create: "true",
      delete: "true",
      update: "false",
    },
  },
} satisfies InstantRules;

export default rules;
