/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Editor history — undo / redo of COMPLETED model changes.

   MaisonHistory.create({ limit }) → {
     record(label, before, after, meta?)   one entry = one completed operation (a whole drag, a
                                    whole resize, one Apply…) — callers never record pointer moves.
                                    meta (optional, e.g. { page }) travels with the entry
     undo() → entry | null          entry.before is the model text to restore
     redo() → entry | null          entry.after  is the model text to restore
     canUndo(), canRedo(), peekUndo(), peekRedo(), clear()
   }
   Entries hold serialized model snapshots (text), so restoring is exact and cannot be affected by
   later mutation. A dashboard is a few KB, so the default limit of 100 entries is cheap.
   The history is editor state only: it is never saved, exported or imported.
   ========================================================================== */
(function (global) {
  'use strict';

  function create({ limit = 100 } = {}) {
    let undoStack = [], redoStack = [];
    return {
      record(label, before, after, meta) {
        if (before === after) return false;
        undoStack.push({ label, before, after, meta: meta || null });
        if (undoStack.length > limit) undoStack.shift();
        redoStack = [];
        return true;
      },
      undo() { const e = undoStack.pop(); if (e) redoStack.push(e); return e || null; },
      redo() { const e = redoStack.pop(); if (e) undoStack.push(e); return e || null; },
      canUndo: () => undoStack.length > 0,
      canRedo: () => redoStack.length > 0,
      peekUndo: () => undoStack[undoStack.length - 1] || null,
      peekRedo: () => redoStack[redoStack.length - 1] || null,
      clear() { undoStack = []; redoStack = []; },
      size: () => ({ undo: undoStack.length, redo: redoStack.length }),
    };
  }

  global.MaisonHistory = { create };
})(window);
