export const MODULE_SEQUENCE = ["module1", "module2", "module3", "module4", "exam"];
export const VERIFICATION_KEYS = ["verif3", "verif4"];
export const ALL_PROGRESS_CHECK_KEYS = [...MODULE_SEQUENCE, "retakeExam", ...VERIFICATION_KEYS];

const CHECK_LABELS = {
  module1: "Module 1",
  module2: "Module 2",
  module3: "Module 3",
  module4: "Module 4",
  exam: "Examen",
  retakeExam: "Rattrapage",
  verif3: "Vérif 3",
  verif4: "Vérif 4"
};

export function getCheckLabel(checkKey) {
  return CHECK_LABELS[checkKey] || "cette étape";
}

export function getPrerequisiteKeys(checkKey) {
  if (checkKey === "verif3") return MODULE_SEQUENCE.slice(0, 3);
  if (checkKey === "verif4" || checkKey === "retakeExam") return MODULE_SEQUENCE.slice(0, 4);

  const position = MODULE_SEQUENCE.indexOf(checkKey);
  return position > 0 ? MODULE_SEQUENCE.slice(0, position) : [];
}

export function getProgressionBlockReason(checks = {}, checkKey, nextChecked) {
  if (nextChecked) {
    const missing = getPrerequisiteKeys(checkKey).find(key => checks[key] !== true);
    return missing
      ? `Valide d’abord ${getCheckLabel(missing)} avant ${getCheckLabel(checkKey)}.`
      : "";
  }

  const dependent = ALL_PROGRESS_CHECK_KEYS.find(key => (
    key !== checkKey
    && checks[key] === true
    && getPrerequisiteKeys(key).includes(checkKey)
  ));

  return dependent
    ? `Décoche d’abord ${getCheckLabel(dependent)} avant ${getCheckLabel(checkKey)}.`
    : "";
}
