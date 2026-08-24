export const CURSUS_HISTORY_RECORD_TYPE = "cursusEffectifSnapshot";
export const CURSUS_HISTORY_DOC_PREFIX = "__cursus_effectif__";

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") return asDate(value.toDate());
  if (typeof value?.seconds === "number") return asDate(new Date(value.seconds * 1000));

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseFrenchDate(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (!match) return null;

  return asDate(new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12));
}

function addDays(value, days) {
  const date = asDate(value);
  if (!date) return null;
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function positiveInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}

function cleanKey(value, fallback = "") {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || fallback;
}

export function getIsoWeekInfo(value = new Date()) {
  const source = asDate(value) || new Date();
  const date = new Date(Date.UTC(source.getFullYear(), source.getMonth(), source.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);

  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);

  return { week, year, label: `S${week}` };
}

export function getCursusHistoryDocumentId(cursusKey) {
  return `${CURSUS_HISTORY_DOC_PREFIX}${cleanKey(cursusKey, "inconnu")}`;
}

export function createCursusSnapshot(cursus = {}, capturedAt = new Date()) {
  const date = asDate(capturedAt) || new Date();
  const isoWeek = getIsoWeekInfo(date);

  return {
    recordType: CURSUS_HISTORY_RECORD_TYPE,
    cursusKey: cleanKey(cursus.key, "cursus_inconnu"),
    label: String(cursus.label || "Cursus en cours").trim() || "Cursus en cours",
    total: positiveInteger(cursus.total),
    weekNumber: isoWeek.week,
    weekYear: isoWeek.year,
    weekLabel: isoWeek.label,
    capturedAtIso: date.toISOString()
  };
}

function getArchiveDate(data = {}) {
  const direct = asDate(data.cursusStartDate || data.startDate)
    || parseFrenchDate(data.cursusStartDisplay || data.startDisplay);
  if (direct) return direct;

  return addDays(data.archivedAt, -13) || asDate(data.createdAt || data.updatedAt);
}

function normalizeSavedSnapshot(row = {}) {
  const data = row.data || {};
  if (data.recordType !== CURSUS_HISTORY_RECORD_TYPE) return null;

  const capturedAt = asDate(data.capturedAtIso || data.capturedAt || data.createdAt);
  const fallbackWeek = getIsoWeekInfo(capturedAt || new Date());
  const weekNumber = positiveInteger(data.weekNumber, fallbackWeek.week);
  const weekYear = positiveInteger(data.weekYear, fallbackWeek.year);

  return {
    key: cleanKey(data.cursusKey, cleanKey(row.id, "cursus_inconnu")),
    label: String(data.label || "Cursus").trim() || "Cursus",
    total: positiveInteger(data.total),
    weekNumber,
    weekYear,
    weekLabel: `S${weekNumber}`,
    capturedAtIso: capturedAt?.toISOString() || "",
    source: "snapshot"
  };
}

function normalizeArchive(row = {}) {
  const data = row.data || {};
  const students = Array.isArray(data.students) ? data.students : [];
  const total = positiveInteger(
    data.summary?.totalStudents ?? data.totalStudents ?? data.total ?? students.length
  );
  if (!total) return null;

  const date = getArchiveDate(data);
  const isoWeek = getIsoWeekInfo(date || new Date());
  const key = cleanKey(data.cursusKey || data.key, `archive_${cleanKey(row.id, "inconnu")}`);
  const label = String(
    data.cursusLabel
      || data.label
      || (data.cursusStartDisplay && data.cursusEndDisplay
        ? `Du ${data.cursusStartDisplay} au ${data.cursusEndDisplay}`
        : `Cursus ${isoWeek.label}`)
  ).trim();

  return {
    key,
    label,
    total,
    weekNumber: isoWeek.week,
    weekYear: isoWeek.year,
    weekLabel: isoWeek.label,
    capturedAtIso: date?.toISOString() || "",
    source: "archive"
  };
}

export function buildCursusHistory({ moduleRows = [], archiveRows = [], currentCursus = null, now = new Date() } = {}) {
  const entries = new Map();

  archiveRows.map(normalizeArchive).filter(Boolean).forEach(entry => entries.set(entry.key, entry));
  moduleRows.map(normalizeSavedSnapshot).filter(Boolean).forEach(entry => entries.set(entry.key, entry));

  if (currentCursus?.key) {
    const currentKey = cleanKey(currentCursus.key);
    const existing = entries.get(currentKey);
    const current = existing || { ...createCursusSnapshot(currentCursus, now), key: currentKey, source: "current" };
    entries.set(currentKey, {
      ...current,
      key: currentKey,
      current: true,
      label: current.label || currentCursus.label || "Cursus en cours"
    });
  }

  return Array.from(entries.values()).sort((left, right) => {
    const weekDelta = ((left.weekYear * 100) + left.weekNumber) - ((right.weekYear * 100) + right.weekNumber);
    if (weekDelta) return weekDelta;
    return String(left.capturedAtIso || left.key).localeCompare(String(right.capturedAtIso || right.key));
  });
}
