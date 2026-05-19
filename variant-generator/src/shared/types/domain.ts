export type TaskStatus = "pending" | "processing" | "done" | "failed";

export type VariationStrategy =
  | "numeric" 
  | "synonyms" 
  | "context" 
  | "reorder"; 

export interface TaskSettings {
  variation_strategies: VariationStrategy[];
  locked_phrases: string[]; 
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
