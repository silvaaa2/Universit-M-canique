const crypto = require("crypto");
const { ProfAuthError, sendJson } = require("./discord-prof-auth.js");
const { deleteDocument, getDocument, listDocuments, upsertDocument } = require("./firestore-service-account.js");
const { recordAuditEvent } = require("./audit-log.js");

// Réutilise la collection déjà protégée pour les professeurs afin de ne pas
// élargir les règles Firestore du site. recordType sépare les formulaires V2.
const EXAM_COLLECTION = "examCorrections";
const ALLOWED_TYPES = new Set(["short", "long", "single", "multiple", "true_false"]);
const ALLOWED_STATUSES = new Set(["draft", "published", "archived"]);
const MAX_QUESTIONS = 60;
const MAX_OPTIONS = 12;
const MAX_IMAGE_LENGTH = 360_000;
const MAX_TOTAL_IMAGE_LENGTH = 760_000;
const MAX_DOCUMENT_BYTES = 900_000;

function cleanText(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function clampNumber(value, minimum, maximum, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function normalizeImage(value) {
  const image = String(value || "").trim();
  if (!image) return "";
  if (!/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(image)) {
    throw new ProfAuthError("image", "Une image du formulaire est invalide.", 400);
  }
  if (image.length > MAX_IMAGE_LENGTH) {
    throw new ProfAuthError("image", "Une image est trop lourde. Choisis une image plus légère.", 413);
  }
  return image;
}

function normalizeOptions(value, type) {
  if (!["single", "multiple"].includes(type)) return [];
  const options = (Array.isArray(value) ? value : [])
    .map(option => cleanText(option, 180))
    .filter(Boolean)
    .slice(0, MAX_OPTIONS);
  if (options.length < 2) {
    throw new ProfAuthError("options", "Chaque question à choix doit contenir au moins deux réponses.", 400);
  }
  return options;
}

function normalizeCorrectAnswers(question, type, options) {
  if (type === "true_false") {
    const answer = cleanText(question.correctAnswer, 12).toLowerCase();
    return answer === "false" ? ["false"] : answer === "true" ? ["true"] : [];
  }
  if (!["single", "multiple"].includes(type)) return [];
  const source = Array.isArray(question.correctAnswers)
    ? question.correctAnswers
    : [question.correctAnswer];
  const allowed = new Set(options);
  const answers = source.map(answer => cleanText(answer, 180)).filter(answer => allowed.has(answer));
  return [...new Set(answers)].slice(0, type === "single" ? 1 : MAX_OPTIONS);
}

function normalizeQuestion(question, index) {
  const type = ALLOWED_TYPES.has(String(question?.type || "")) ? String(question.type) : "short";
  const title = cleanText(question?.title, 500);
  if (!title) throw new ProfAuthError("question", `La question ${index + 1} n'a pas de titre.`, 400);
  const options = normalizeOptions(question?.options, type);
  const image = normalizeImage(question?.image);
  return {
    id: cleanText(question?.id, 80) || `q-${crypto.randomBytes(6).toString("hex")}`,
    type,
    title,
    description: cleanText(question?.description, 1200),
    points: Math.round(clampNumber(question?.points, 0, 200, 1) * 100) / 100,
    required: question?.required !== false,
    options,
    correctAnswers: normalizeCorrectAnswers(question || {}, type, options),
    image
  };
}

function normalizeExamPayload(payload = {}, existing = null) {
  const title = cleanText(payload.title, 160);
  if (!title) throw new ProfAuthError("title", "Donne un titre à l'examen.", 400);
  const sourceQuestions = Array.isArray(payload.questions) ? payload.questions : [];
  if (!sourceQuestions.length) throw new ProfAuthError("questions", "Ajoute au moins une question.", 400);
  if (sourceQuestions.length > MAX_QUESTIONS) {
    throw new ProfAuthError("questions", `Un examen peut contenir au maximum ${MAX_QUESTIONS} questions.`, 400);
  }
  const questions = sourceQuestions.map(normalizeQuestion);
  const imageLength = questions.reduce((total, question) => total + question.image.length, 0);
  if (imageLength > MAX_TOTAL_IMAGE_LENGTH) {
    throw new ProfAuthError("images", "Les images de l'examen sont trop lourdes au total.", 413);
  }
  const status = ALLOWED_STATUSES.has(String(payload.status || "")) ? String(payload.status) : "draft";
  const maxScore = Math.round(questions.reduce((total, question) => total + question.points, 0) * 100) / 100;
  const now = new Date().toISOString();
  const normalized = {
    recordType: "examDefinitionV2",
    title,
    description: cleanText(payload.description, 1800),
    instructions: cleanText(payload.instructions, 3000),
    durationMinutes: Math.round(clampNumber(payload.durationMinutes, 0, 360, 0)),
    status,
    questions,
    questionCount: questions.length,
    maxScore,
    createdAt: cleanText(existing?.createdAt, 80) || now,
    updatedAt: now,
    publishedAt: status === "published"
      ? cleanText(existing?.publishedAt, 80) || now
      : "",
    version: Math.max(1, Number(existing?.version || 0) + 1)
  };
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > MAX_DOCUMENT_BYTES) {
    throw new ProfAuthError("size", "L'examen est trop lourd pour être sauvegardé. Réduis les images.", 413);
  }
  return normalized;
}

function publicExam(exam) {
  return {
    id: cleanText(exam?.id, 100),
    title: cleanText(exam?.title, 160),
    description: cleanText(exam?.description, 1800),
    instructions: cleanText(exam?.instructions, 3000),
    durationMinutes: clampNumber(exam?.durationMinutes, 0, 360, 0),
    status: ALLOWED_STATUSES.has(String(exam?.status || "")) ? String(exam.status) : "draft",
    questions: Array.isArray(exam?.questions) ? exam.questions.slice(0, MAX_QUESTIONS) : [],
    questionCount: clampNumber(exam?.questionCount, 0, MAX_QUESTIONS, 0),
    maxScore: clampNumber(exam?.maxScore, 0, 12_000, 0),
    createdAt: cleanText(exam?.createdAt, 80),
    updatedAt: cleanText(exam?.updatedAt, 80),
    publishedAt: cleanText(exam?.publishedAt, 80),
    createdBy: cleanText(exam?.createdBy, 160),
    createdByName: cleanText(exam?.createdByName, 120),
    updatedBy: cleanText(exam?.updatedBy, 160),
    updatedByName: cleanText(exam?.updatedByName, 120),
    version: Math.max(1, Number(exam?.version || 1))
  };
}

function examSummary(exam) {
  const value = publicExam(exam);
  return { ...value, questions: [] };
}

function assertExamPermission(access) {
  const permissions = Array.isArray(access?.permissions) ? access.permissions : [];
  const legacyEmailProfessor = access?.role === "prof" && access?.claims?.authProvider !== "discord";
  if (access?.admin || legacyEmailProfessor || permissions.includes("exams")) return;
  throw new ProfAuthError("permission", "Tu n'as pas accès à la gestion des examens.", 403);
}

function readBody(request) {
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body || "{}");
    } catch {
      throw new ProfAuthError("json", "Le formulaire envoyé est invalide.", 400);
    }
  }
  return request.body || {};
}

async function handleProfExamBuilder(request, response, access) {
  assertExamPermission(access);
  const requestUrl = new URL(request.url, `https://${request.headers?.host || "localhost"}`);
  const examId = cleanText(requestUrl.searchParams.get("id"), 100);

  if (request.method === "GET") {
    if (examId) {
      const exam = await getDocument(EXAM_COLLECTION, examId);
      if (!exam) throw new ProfAuthError("exam", "Examen introuvable.", 404);
      sendJson(response, 200, { exam: publicExam(exam) });
      return;
    }
    const exams = (await listDocuments(EXAM_COLLECTION))
      .filter(exam => exam.recordType === "examDefinitionV2")
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
      .map(examSummary);
    sendJson(response, 200, { exams });
    return;
  }

  const body = readBody(request);
  if (request.method === "POST") {
    const normalized = normalizeExamPayload(body);
    const id = `exam-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const exam = {
      ...normalized,
      createdBy: access.actorId,
      createdByName: access.displayName,
      updatedBy: access.actorId,
      updatedByName: access.displayName
    };
    await upsertDocument(EXAM_COLLECTION, id, exam);
    await recordAuditEvent({
      actorType: access.admin ? "admin" : "prof",
      actorId: access.actorId,
      actorName: access.displayName,
      category: "examens",
      action: exam.status === "published" ? "Nouvel examen créé et publié" : "Brouillon d'examen créé",
      target: `${exam.title} · ${exam.maxScore} points`,
      details: `${exam.questionCount} question(s)`
    }).catch(error => console.warn("Journal création examen indisponible :", error?.message || error));
    sendJson(response, 201, { saved: true, exam: publicExam({ id, ...exam }) });
    return;
  }

  if (request.method === "PATCH") {
    const id = cleanText(body.id || examId, 100);
    if (!id) throw new ProfAuthError("exam", "Examen à modifier introuvable.", 400);
    const existing = await getDocument(EXAM_COLLECTION, id);
    if (!existing) throw new ProfAuthError("exam", "Examen introuvable.", 404);
    const normalized = normalizeExamPayload(body, existing);
    const exam = {
      ...normalized,
      createdBy: cleanText(existing.createdBy, 160),
      createdByName: cleanText(existing.createdByName, 120),
      updatedBy: access.actorId,
      updatedByName: access.displayName
    };
    await upsertDocument(EXAM_COLLECTION, id, exam);
    await recordAuditEvent({
      actorType: access.admin ? "admin" : "prof",
      actorId: access.actorId,
      actorName: access.displayName,
      category: "examens",
      action: exam.status === "published" ? "Examen modifié et publié" : "Brouillon d'examen modifié",
      target: `${exam.title} · ${exam.maxScore} points`,
      details: `${exam.questionCount} question(s)`
    }).catch(error => console.warn("Journal modification examen indisponible :", error?.message || error));
    sendJson(response, 200, { saved: true, exam: publicExam({ id, ...exam }) });
    return;
  }

  if (request.method === "DELETE") {
    const id = cleanText(body.id || examId, 100);
    if (!id) throw new ProfAuthError("exam", "Examen à supprimer introuvable.", 400);
    const existing = await getDocument(EXAM_COLLECTION, id);
    if (!existing) throw new ProfAuthError("exam", "Examen introuvable.", 404);
    await deleteDocument(EXAM_COLLECTION, id);
    await recordAuditEvent({
      actorType: access.admin ? "admin" : "prof",
      actorId: access.actorId,
      actorName: access.displayName,
      category: "examens",
      action: "Examen supprimé",
      target: cleanText(existing.title, 160)
    }).catch(error => console.warn("Journal suppression examen indisponible :", error?.message || error));
    sendJson(response, 200, { deleted: true, id });
    return;
  }

  sendJson(response, 405, { error: "Méthode non autorisée." });
}

module.exports = {
  ALLOWED_TYPES,
  EXAM_COLLECTION,
  MAX_DOCUMENT_BYTES,
  handleProfExamBuilder,
  normalizeExamPayload,
  publicExam,
  examSummary
};
