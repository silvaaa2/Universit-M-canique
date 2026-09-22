const crypto = require("crypto");
const { ProfAuthError, sendJson } = require("./discord-prof-auth.js");
const { recordAuditEvent } = require("./audit-log.js");
const { assertSameOrigin } = require("./unified-access.js");
const { fetchCsv, resolveSheet } = require("../../api/secure-sheet.js");
const {
  buildCursusKey,
  normalizeEffectifStudents,
  normalizeIdUnique,
  parseCsv
} = require("./cursus-management.js");
const {
  createDocument,
  getDocument,
  getFirestoreAccessToken,
  listDocuments,
  mergeDocument
} = require("./firestore-service-account.js");
const { EXAM_COLLECTION, AUTOMATIC_BONUS_POINTS } = require("./prof-exam-builder.js");

const RESULT_COLLECTION = "examAnswerStatuses";
const AVAILABILITY_COLLECTION = "customAvailability";
const STUDENT_EXAM_ACCESS_ID = "examV2";
const CUSTOM_COLLECTION = "studentAnswerStatuses";
const STAGE_COLLECTION = "stageValidations";
const MODULE_COLLECTION = "studentModules";
const CUSTOM_SHEETS = ["sentinelClassic", "argento2f", "cypher"];
const RESULT_TYPE = "nativeExamSubmissionV2";
const CACHE_MS = 60_000;
let effectifCache = null;
let bonusCache = null;
let bonusRequest = null;

function clean(value, limit = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, limit);
}

function normalizedText(value) {
  return clean(value, 300).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function roundScore(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function publicStudentExam(exam) {
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  const questionMaxScore = roundScore(questions.reduce((sum, question) => sum + Number(question.points || 0), 0));
  return {
    id: clean(exam.id, 100),
    title: clean(exam.title, 160),
    description: clean(exam.description, 1800),
    instructions: clean(exam.instructions, 3000),
    durationMinutes: Number(exam.durationMinutes || 0),
    questionMaxScore,
    automaticBonusMax: AUTOMATIC_BONUS_POINTS,
    maxScore: questionMaxScore + AUTOMATIC_BONUS_POINTS,
    questions: questions.map(question => ({
      id: clean(question.id, 80),
      type: clean(question.type, 20),
      title: clean(question.title, 500),
      description: clean(question.description, 1200),
      points: Number(question.points || 0),
      required: question.required !== false,
      options: Array.isArray(question.options) ? question.options.map(option => clean(option, 180)) : [],
      image: String(question.image || "")
    }))
  };
}

function assertPublishedExam(exam) {
  if (!exam || exam.recordType !== "examDefinitionV2" || exam.status !== "published") {
    throw new ProfAuthError("exam", "Cet examen n'est pas disponible.", 404);
  }
}

async function assertStudentExamOpen(readDocument = getDocument) {
  const access = await readDocument(AVAILABILITY_COLLECTION, STUDENT_EXAM_ACCESS_ID);
  if (access?.enabled === false) {
    throw new ProfAuthError("locked", "L'Examen 2 est verrouillé pour les élèves.", 423);
  }
}

async function currentEffectif() {
  if (effectifCache?.expiresAt > Date.now()) return effectifCache.value;
  const token = await getFirestoreAccessToken();
  const settings = await resolveSheet("module-effectif", "current", token);
  const csv = await fetchCsv(settings);
  const students = normalizeEffectifStudents(parseCsv(csv));
  if (!students.length) throw new ProfAuthError("effectif", "L'effectif est temporairement indisponible.", 503);
  const value = { students, cursusKey: buildCursusKey(settings) };
  if (!value.cursusKey) throw new ProfAuthError("cursus", "Le cursus actif est introuvable.", 503);
  effectifCache = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
}

function answerValue(value, type) {
  if (type === "multiple") {
    return [...new Set((Array.isArray(value) ? value : []).map(item => clean(item, 180)).filter(Boolean))].slice(0, 12);
  }
  return clean(value, type === "long" ? 3000 : 500);
}

function isAnswered(value) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function scoreObjective(question, answer) {
  const expected = Array.isArray(question.correctAnswers) ? question.correctAnswers : [];
  if (question.type === "multiple") {
    const actual = new Set(Array.isArray(answer) ? answer : []);
    return actual.size === expected.length && expected.every(item => actual.has(item))
      ? Number(question.points || 0) : 0;
  }
  return expected[0] === answer ? Number(question.points || 0) : 0;
}

function prepareSubmission(exam, identity, rawAnswers) {
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
    throw new ProfAuthError("answers", "Les réponses de l'examen sont invalides.", 400);
  }
  const answers = {};
  const fieldScores = {};
  const questionSnapshots = [];
  for (const question of exam.questions || []) {
    const value = answerValue(rawAnswers[question.id], question.type);
    if (question.required !== false && !isAnswered(value)) {
      throw new ProfAuthError("answers", `Réponds à la question « ${clean(question.title, 80)} » avant d'envoyer.`, 400);
    }
    if (["single", "multiple"].includes(question.type)) {
      const allowed = new Set(question.options || []);
      const selected = Array.isArray(value) ? value : [value];
      if (selected.some(item => item && !allowed.has(item))) {
        throw new ProfAuthError("answers", "Une réponse ne fait pas partie des choix proposés.", 400);
      }
    }
    if (question.type === "true_false" && value && !["true", "false"].includes(value)) {
      throw new ProfAuthError("answers", "Une réponse Vrai/Faux est invalide.", 400);
    }
    answers[question.id] = value;
    questionSnapshots.push({
      id: question.id, type: question.type, title: question.title,
      points: Number(question.points || 0), required: question.required !== false
    });
    if (["single", "multiple", "true_false"].includes(question.type)) {
      fieldScores[question.id] = roundScore(scoreObjective(question, value));
    }
  }
  return { ...identity, answers, fieldScores, questionSnapshots, manualScores: {} };
}

function computeResult(submission, bonus = null) {
  const questions = Array.isArray(submission.questionSnapshots) ? submission.questionSnapshots : [];
  const fieldScores = { ...(submission.fieldScores || {}) };
  const manualScores = submission.manualScores || {};
  let waitingForCorrection = false;
  for (const question of questions) {
    if (!["short", "long"].includes(question.type)) continue;
    if (Object.hasOwn(manualScores, question.id)) {
      const value = Number(manualScores[question.id]);
      fieldScores[question.id] = roundScore(Math.max(0, Math.min(Number(question.points || 0), value)));
    } else if (Number(question.points || 0) > 0) {
      waitingForCorrection = true;
    }
  }
  const questionMaxScore = roundScore(questions.reduce((sum, question) => sum + Number(question.points || 0), 0));
  const baseScore = roundScore(Object.values(fieldScores).reduce((sum, value) => sum + Number(value || 0), 0));
  const customBonus = bonus ? Number(bonus.custom === true) : Number(submission.customBonus || 0);
  const stageBonus = bonus ? Number(bonus.stage === true) : Number(submission.stageBonus || 0);
  const maxScore = questionMaxScore + AUTOMATIC_BONUS_POINTS;
  const totalScore = Math.min(maxScore, roundScore(baseScore + customBonus + stageBonus));
  const passPoints = roundScore(maxScore * 0.8);
  const bonusPending = bonus === null && submission.bonusPending === true;
  return {
    fieldScores, baseScore, customBonus, stageBonus, maxScore, passPoints, totalScore,
    bonusPending,
    status: waitingForCorrection || bonusPending ? "pending" : totalScore >= passPoints ? "approved" : "rejected"
  };
}

function getField(row, names) {
  const entries = Object.entries(row);
  const wanted = new Set(names.map(normalizedText));
  return clean(entries.find(([key]) => wanted.has(normalizedText(key)))?.[1] || "", 300);
}

function currentCustomAnswerKeys(csv, sheetId) {
  const rows = parseCsv(csv);
  if (!rows.length) return new Map();
  const headers = rows[0].map(value => clean(value, 300));
  const results = new Map();
  rows.slice(1).filter(row => row.some(cell => clean(cell))).forEach((row, index) => {
    const answer = Object.fromEntries(headers.map((header, position) => [header, row[position] || ""]));
    const timestamp = getField(answer, ["Horodateur"]);
    const name = getField(answer, ["Prénom - Nom (RP)", "Prénom - Nom", "Nom"]);
    const id = getField(answer, ["ID Unique", "ID"]);
    if (id) results.set(`${sheetId}__${index}__${timestamp}__${name}__${id}`, normalizeIdUnique(id));
  });
  return results;
}

async function loadBonusSets() {
  if (bonusCache?.expiresAt > Date.now()) return bonusCache.value;
  if (bonusRequest) return bonusRequest;
  bonusRequest = (async () => {
    const token = await getFirestoreAccessToken();
    const [customStatuses, stages, ...csvValues] = await Promise.all([
      listDocuments(CUSTOM_COLLECTION),
      listDocuments(STAGE_COLLECTION),
      ...CUSTOM_SHEETS.map(async sheetId => fetchCsv(await resolveSheet("customResponses", sheetId, token)))
    ]);
    const answerIds = new Map();
    csvValues.forEach((csv, index) => {
      for (const [key, id] of currentCustomAnswerKeys(csv, CUSTOM_SHEETS[index])) answerIds.set(key, id);
    });
    const customIds = new Set(customStatuses
      .filter(row => row.status === "approved" && answerIds.has(row.answerKey))
      .map(row => answerIds.get(row.answerKey)));
    const stageIds = new Set(stages
      .filter(row => row.status !== "rejected" && row.archived !== true)
      .map(row => normalizeIdUnique(row.normalizedIdUnique || row.idUnique)).filter(Boolean));
    const value = { customIds, stageIds };
    bonusCache = { value, expiresAt: Date.now() + CACHE_MS };
    return value;
  })().finally(() => { bonusRequest = null; });
  return bonusRequest;
}

function bonusForStudent(sets, studentId) {
  return { custom: sets.customIds.has(studentId), stage: sets.stageIds.has(studentId) };
}

async function refreshNativeExamRows(rows) {
  const values = Array.isArray(rows) ? rows : await listDocuments(RESULT_COLLECTION);
  const nativeRows = values.filter(row => row.recordType === RESULT_TYPE && row.archived !== true);
  if (!nativeRows.length) return values;
  let sets;
  try { sets = await loadBonusSets(); }
  catch (error) {
    console.warn("Actualisation des bonus Examen 2 indisponible :", error?.message || error);
    return values;
  }
  const refreshed = new Map();
  await Promise.all(nativeRows.map(async row => {
    const next = computeResult(row, bonusForStudent(sets, normalizeIdUnique(row.normalizedIdUnique || row.idUnique)));
    const changed = ["customBonus", "stageBonus", "totalScore", "status", "bonusPending"]
      .some(key => next[key] !== row[key]);
    if (!changed) return;
    try {
      await mergeDocument(RESULT_COLLECTION, row.id, { ...next, updatedAt: new Date().toISOString() });
      refreshed.set(row.id, { ...row, ...next });
    } catch (error) {
      console.warn("Bonus Examen 2 non enregistré pour une copie :", error?.message || error);
      refreshed.set(row.id, { ...row, ...next });
    }
  }));
  return values.map(row => refreshed.get(row.id) || row);
}

function resultId(cursusKey, examId, studentId) {
  return `native_${crypto.createHash("sha256").update(`${cursusKey}|${examId}|${studentId}`).digest("hex")}`;
}

function assertExamPermission(access) {
  const permissions = Array.isArray(access?.permissions) ? access.permissions : [];
  const legacyProfessor = access?.role === "prof" && access?.claims?.authProvider !== "discord";
  if (!access?.admin && !legacyProfessor && !permissions.includes("exams")) {
    throw new ProfAuthError("permission", "Accès aux examens refusé.", 403);
  }
}

async function handleStudentExam(request, response) {
  const url = new URL(request.url, `https://${request.headers?.host || "localhost"}`);
  if (request.method === "GET") {
    await assertStudentExamOpen();
    const id = clean(url.searchParams.get("id"), 100);
    if (id) {
      const exam = await getDocument(EXAM_COLLECTION, id);
      assertPublishedExam(exam);
      sendJson(response, 200, { exam: publicStudentExam(exam) });
    } else {
      const exams = (await listDocuments(EXAM_COLLECTION))
        .filter(row => row.recordType === "examDefinitionV2" && row.status === "published")
        .map(exam => {
          const publicValue = publicStudentExam(exam);
          return { ...publicValue, questions: [], questionCount: publicValue.questions.length };
        });
      sendJson(response, 200, { exams });
    }
    return;
  }
  if (request.method !== "POST") return sendJson(response, 405, { error: "Méthode non autorisée." });
  assertSameOrigin(request);
  await assertStudentExamOpen();
  let body;
  try { body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {}; }
  catch { throw new ProfAuthError("json", "Le formulaire envoyé est invalide.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ProfAuthError("json", "Le formulaire envoyé est invalide.", 400);
  }
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 65_000) throw new ProfAuthError("size", "Copie trop volumineuse.", 413);
  const examId = clean(body.examId, 100);
  const firstName = clean(body.firstName, 80);
  const lastName = clean(body.lastName, 80);
  const idUnique = clean(body.idUnique, 80);
  const studentId = normalizeIdUnique(idUnique);
  if (!firstName || !lastName || !/^[a-z0-9_-]{2,80}$/i.test(studentId)) {
    throw new ProfAuthError("identity", "Prénom, nom et ID unique sont obligatoires.", 400);
  }
  const exam = await getDocument(EXAM_COLLECTION, examId);
  assertPublishedExam(exam);
  const { students, cursusKey } = await currentEffectif();
  const student = students.find(item => item.normalizedIdUnique === studentId);
  if (!student) throw new ProfAuthError("identity", "Cet ID n'appartient pas à l'effectif actuel.", 400);
  const suppliedName = normalizedText(`${firstName} ${lastName}`).split(" ").filter(Boolean).sort().join(" ");
  const expectedName = normalizedText(student.studentName).split(" ").filter(Boolean).sort().join(" ");
  if (suppliedName !== expectedName) {
    throw new ProfAuthError("identity", "Le nom et le prénom ne correspondent pas à cet ID dans l'effectif.", 400);
  }
  const progress = await getDocument(MODULE_COLLECTION, `${cursusKey}__${studentId}`);
  if (!["module1", "module2", "module3", "module4"].every(key => progress?.checks?.[key] === true)) {
    throw new ProfAuthError("modules", "Les quatre modules doivent être validés avant l'examen.", 403);
  }
  const prepared = prepareSubmission(exam, {
    recordType: RESULT_TYPE, examId, examTitle: clean(exam.title, 160),
    sheetId: `native:${examId}`, cursusKey, firstName, lastName,
    idUnique: student.idUnique, normalizedIdUnique: studentId,
    studentName: student.studentName, archived: false
  }, body.answers);
  let bonus = null;
  try { bonus = bonusForStudent(await loadBonusSets(), studentId); }
  catch (error) { console.warn("Bonus Examen 2 à recalculer après envoi :", error?.message || error); }
  prepared.bonusPending = bonus === null;
  const grade = computeResult(prepared, bonus);
  const id = resultId(cursusKey, examId, studentId);
  const submittedAt = new Date().toISOString();
  try {
    await createDocument(RESULT_COLLECTION, id, { ...prepared, ...grade, submittedAt, updatedAt: submittedAt });
  } catch (error) {
    if (Number(error?.status) === 409) {
      throw new ProfAuthError("duplicate", "Une copie a déjà été envoyée pour cet examen et ce cursus.", 409);
    }
    throw error;
  }
  sendJson(response, 201, {
    saved: true,
    result: { status: grade.status, totalScore: grade.totalScore, maxScore: grade.maxScore, bonusPending: grade.bonusPending }
  });
}

async function handleProfExamResults(request, response, access) {
  assertExamPermission(access);
  if (request.method === "GET") {
    const rows = await refreshNativeExamRows();
    sendJson(response, 200, { results: rows.filter(row => row.recordType === RESULT_TYPE && row.archived !== true) });
    return;
  }
  if (request.method !== "PATCH") return sendJson(response, 405, { error: "Méthode non autorisée." });
  assertSameOrigin(request);
  let body;
  try { body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {}; }
  catch { throw new ProfAuthError("json", "La correction envoyée est invalide.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ProfAuthError("json", "La correction envoyée est invalide.", 400);
  }
  const id = clean(body.id, 100);
  const row = await getDocument(RESULT_COLLECTION, id);
  if (!row || row.recordType !== RESULT_TYPE || row.archived === true) {
    throw new ProfAuthError("result", "Copie introuvable.", 404);
  }
  const manualScores = { ...(row.manualScores || {}) };
  const question = (row.questionSnapshots || []).find(item => item.id === body.questionId && ["short", "long"].includes(item.type));
  const score = Number(body.score);
  if (!question || !Number.isFinite(score) || score < 0 || score > Number(question.points || 0)) {
    throw new ProfAuthError("score", "Note invalide pour cette question.", 400);
  }
  manualScores[question.id] = roundScore(score);
  let bonus = null;
  try { bonus = bonusForStudent(await loadBonusSets(), normalizeIdUnique(row.normalizedIdUnique || row.idUnique)); }
  catch (error) { console.warn("Bonus conservé pendant la correction :", error?.message || error); }
  const next = { ...row, manualScores };
  const grade = computeResult(next, bonus);
  await mergeDocument(RESULT_COLLECTION, id, {
    manualScores, ...grade, updatedAt: new Date().toISOString(), updatedBy: access.actorId
  });
  await recordAuditEvent({
    actorType: access.admin ? "admin" : "prof",
    actorId: access.actorId,
    actorName: access.displayName,
    category: "examens",
    action: "Correction Examen 2",
    target: `${row.examTitle || "Examen 2"} · ${row.studentName || row.idUnique}`,
    details: `${question.title} : ${manualScores[question.id]} / ${question.points}`
  }).catch(error => console.warn("Journal correction Examen 2 indisponible :", error?.message || error));
  sendJson(response, 200, { result: { ...next, ...grade } });
}

module.exports = {
  RESULT_TYPE,
  computeResult,
  currentCustomAnswerKeys,
  handleProfExamResults,
  handleStudentExam,
  prepareSubmission,
  publicStudentExam,
  refreshNativeExamRows,
  resultId,
  __test: { assertStudentExamOpen }
};
