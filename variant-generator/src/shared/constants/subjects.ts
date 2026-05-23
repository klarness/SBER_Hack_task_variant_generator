import type { NumberType, TaskSettings, VariationType } from "@/shared/types/domain";

export const SUBJECTS = [
  { value: "russian", label: "Русский язык" },
  { value: "english", label: "Английский язык" },
  { value: "math", label: "Математика" },
  { value: "history", label: "История" },
  { value: "social", label: "Обществознание" },
  { value: "literature", label: "Литература" },
  { value: "biology", label: "Биология" },
  { value: "geography", label: "География" },
  { value: "chemistry", label: "Химия" },
  { value: "informatics", label: "Информатика" },
  { value: "physics", label: "Физика" },
] as const;

export type SubjectValue = (typeof SUBJECTS)[number]["value"];

const SUBJECT_LABELS = Object.fromEntries(
  SUBJECTS.map((subject) => [subject.value, subject.label])
) as Record<SubjectValue, string>;

export function subjectLabel(value: SubjectValue): string {
  return SUBJECT_LABELS[value];
}

export function isSubjectValue(value: string | null): value is SubjectValue {
  return SUBJECTS.some((subject) => subject.value === value);
}

const SUBJECT_VARIATIONS: Record<SubjectValue, VariationType[]> = {
  russian: ["synonymize_non_key_wording", "replace_context", "reorder_enumeration"],
  english: ["synonymize_non_key_wording", "replace_context", "reorder_enumeration"],
  math: ["replace_numbers", "change_names", "change_units"],
  history: ["replace_context", "change_names", "reorder_enumeration"],
  social: ["replace_context", "synonymize_non_key_wording", "change_names"],
  literature: ["replace_context", "change_names", "synonymize_non_key_wording"],
  biology: ["change_names", "replace_context", "reorder_enumeration"],
  geography: ["replace_context", "change_names", "reorder_enumeration"],
  chemistry: ["replace_numbers", "change_units", "change_names"],
  informatics: ["replace_numbers", "change_names", "reorder_steps"],
  physics: ["replace_numbers", "change_units", "replace_context"],
};

const SUBJECT_NUMBER_TYPES: Record<SubjectValue, NumberType[]> = {
  russian: [],
  english: [],
  math: ["integers", "fractions"],
  history: ["integers"],
  social: [],
  literature: [],
  biology: ["integers"],
  geography: ["integers", "decimals"],
  chemistry: ["integers", "decimals"],
  informatics: ["integers"],
  physics: ["integers", "decimals"],
};

export function defaultSettingsForSubject(subject: SubjectValue): TaskSettings {
  return {
    variation_types: SUBJECT_VARIATIONS[subject],
    number_types: SUBJECT_NUMBER_TYPES[subject],
    number_range: "keep comparable to original",
    locked_parts: [],
    preserve_difficulty: true,
    check_answer_uniqueness: true,
  };
}
