export type TaskStatus = "pending" | "processing" | "done" | "failed";

export type VariationType =
  | "replace_numbers"
  | "reorder_enumeration"
  | "synonymize_non_key_wording"
  | "replace_context"
  | "change_names"
  | "change_units"
  | "reorder_steps";

export type NumberType = "integers" | "decimals" | "fractions";

export interface TaskSettings {
  variation_types: VariationType[];
  number_types: NumberType[];
  number_range: string;
  locked_parts: string[];
  preserve_difficulty: boolean;
  check_answer_uniqueness: boolean;
}

export interface TaskItem {
  id: string;
  task_id: string;
  order: number;
  context?: string;
  content: string;
  created_at: string;
}

/** Вариант одного исходного вопроса (Q1-V1 и т.п.) */
export interface VariantItem {
  id: string;
  variant_id: string;
  task_item_id: string; // ссылка на исходный TaskItem
  content: string;
  status?: "ready" | "failed";
  error_message?: string;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
}

/** Целый вариант — набор переписанных вопросов */
export interface Variant {
  id: string;
  task_id: string;
  variant_number: number; // 1, 2, 3...
  items: VariantItem[];
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  subject?: string;
  topic?: string;
  task_type?: string;
  difficulty?: string;
  original_text: string;
  settings?: TaskSettings | null; // на сервере json.RawMessage — приходит распарсенным
  status: TaskStatus;
  error_message?: string;
  task_items?: TaskItem[];
  variants?: Variant[];
  created_at: string;
  updated_at: string;
}

export interface ExportResult {
  filename: string;
  blob: Blob;
}
