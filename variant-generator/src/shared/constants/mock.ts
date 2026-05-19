import type { Task } from "@/shared/types/domain";

export const MOCK_TASK: Task = {
  id: "mock-task-id",
  user_id: "11111111-1111-1111-1111-111111111111",
  title: "Контрольная работа по алгебре, 8 класс",
  subject: "Математика",
  topic: "Квадратные уравнения",
  task_type: "контрольная работа",
  difficulty: "средняя",
  status: "done",
  original_text:
    "1. Решите уравнение: x² − 5x + 6 = 0.\n2. Найдите корни: 2x² + 3x − 2 = 0.\n3. При каком значении p уравнение x² + px + 9 = 0 имеет один корень?",
  settings: {
    variation_strategies: ["numeric", "synonyms"],
    locked_phrases: [],
  },
  task_items: [
    {
      id: "item-1",
      task_id: "mock-task-id",
      order: 1,
      content: "Решите уравнение: x² − 5x + 6 = 0.",
      created_at: new Date().toISOString(),
    },
    {
      id: "item-2",
      task_id: "mock-task-id",
      order: 2,
      content: "Найдите корни: 2x² + 3x − 2 = 0.",
      created_at: new Date().toISOString(),
    },
    {
      id: "item-3",
      task_id: "mock-task-id",
      order: 3,
      content:
        "При каком значении p уравнение x² + px + 9 = 0 имеет один корень?",
      created_at: new Date().toISOString(),
    },
  ],
  variants: [
    {
      id: "var-1",
      task_id: "mock-task-id",
      variant_number: 1,
      created_at: new Date().toISOString(),
      items: [
        {
          id: "vi-1-1",
          variant_id: "var-1",
          task_item_id: "item-1",
          content: "<p>Решите уравнение: x² − 7x + 12 = 0.</p>",
          is_edited: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "vi-1-2",
          variant_id: "var-1",
          task_item_id: "item-2",
          content: "<p>Найдите корни уравнения: 3x² + 5x − 2 = 0.</p>",
          is_edited: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "vi-1-3",
          variant_id: "var-1",
          task_item_id: "item-3",
          content:
            "<p>При каком значении k уравнение x² + kx + 16 = 0 имеет один корень?</p>",
          is_edited: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    },
    {
      id: "var-2",
      task_id: "mock-task-id",
      variant_number: 2,
      created_at: new Date().toISOString(),
      items: [
        {
          id: "vi-2-1",
          variant_id: "var-2",
          task_item_id: "item-1",
          content: "<p>Решите уравнение: x² − 9x + 20 = 0.</p>",
          is_edited: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "vi-2-2",
          variant_id: "var-2",
          task_item_id: "item-2",
          content: "<p>Найдите корни уравнения: 4x² + 7x − 2 = 0.</p>",
          is_edited: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "vi-2-3",
          variant_id: "var-2",
          task_item_id: "item-3",
          content:
            "<p>При каком значении m уравнение x² + mx + 25 = 0 имеет один корень?</p>",
          is_edited: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    },
    {
      id: "var-3",
      task_id: "mock-task-id",
      variant_number: 3,
      created_at: new Date().toISOString(),
      items: [
        {
          id: "vi-3-1",
          variant_id: "var-3",
          task_item_id: "item-1",
          content: "<p>Решите уравнение: x² − 11x + 30 = 0.</p>",
          is_edited: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "vi-3-2",
          variant_id: "var-3",
          task_item_id: "item-2",
          content: "<p>Найдите корни уравнения: 5x² + 9x − 2 = 0.</p>",
          is_edited: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "vi-3-3",
          variant_id: "var-3",
          task_item_id: "item-3",
          content:
            "<p>При каком значении n уравнение x² + nx + 36 = 0 имеет один корень?</p>",
          is_edited: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    },
  ],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
