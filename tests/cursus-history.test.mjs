import assert from "node:assert/strict";
import test from "node:test";

import {
  CURSUS_HISTORY_RECORD_TYPE,
  buildCursusHistory,
  createCursusSnapshot,
  getCursusHistoryDocumentId,
  getIsoWeekInfo
} from "../assets/js/cursus-history.js";

test("le 24 août 2026 appartient bien à la semaine S35", () => {
  assert.deepEqual(getIsoWeekInfo(new Date("2026-08-24T12:00:00+02:00")), {
    week: 35,
    year: 2026,
    label: "S35"
  });
});

test("un nouveau cursus crée un instantané stable de son effectif", () => {
  const snapshot = createCursusSnapshot(
    { key: "cursus_feuille_123", label: "24/08 - 06/09", total: 44 },
    new Date("2026-08-24T12:00:00+02:00")
  );

  assert.equal(snapshot.recordType, CURSUS_HISTORY_RECORD_TYPE);
  assert.equal(snapshot.total, 44);
  assert.equal(snapshot.weekLabel, "S35");
  assert.equal(getCursusHistoryDocumentId(snapshot.cursusKey), "__cursus_effectif__cursus_feuille_123");
});

test("l'historique réunit les archives et le cursus actuel sans doublon", () => {
  const history = buildCursusHistory({
    archiveRows: [{
      id: "archive-1",
      data: {
        cursusKey: "cursus_s34",
        cursusStartDisplay: "17/08/2026",
        cursusEndDisplay: "23/08/2026",
        summary: { totalStudents: 40 }
      }
    }],
    moduleRows: [{
      id: "__cursus_effectif__cursus_s35",
      data: {
        recordType: CURSUS_HISTORY_RECORD_TYPE,
        cursusKey: "cursus_s35",
        label: "Cursus actuel",
        total: 44,
        weekNumber: 35,
        weekYear: 2026,
        capturedAtIso: "2026-08-24T10:00:00.000Z"
      }
    }],
    currentCursus: { key: "cursus_s35", label: "Cursus actuel", total: 44 },
    now: new Date("2026-08-24T12:00:00+02:00")
  });

  assert.equal(history.length, 2);
  assert.deepEqual(history.map(entry => entry.weekLabel), ["S34", "S35"]);
  assert.deepEqual(history.map(entry => entry.total), [40, 44]);
  assert.equal(history.at(-1).current, true);
});
