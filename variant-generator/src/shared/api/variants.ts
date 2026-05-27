import { apiJson } from "./client";
import type { VariantItem } from "@/shared/types/domain";

interface RegenerateVariantItemOptions {
  ignorePreviousVariants?: boolean;
}

export async function editVariantItem(
  variantId: string,
  itemId: string,
  content: string
): Promise<VariantItem> {
  return apiJson<VariantItem>(
    `/api/v1/variants/${variantId}/items/${itemId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }
  );
}

export async function regenerateVariantItem(
  variantId: string,
  itemId: string,
  prompt = "",
  options: RegenerateVariantItemOptions = {}
): Promise<VariantItem> {
  const trimmedPrompt = prompt.trim();
  const body =
    trimmedPrompt || options.ignorePreviousVariants
      ? JSON.stringify({
          ...(trimmedPrompt ? { prompt: trimmedPrompt } : {}),
          ...(options.ignorePreviousVariants
            ? { ignore_previous_variants: true }
            : {}),
        })
      : undefined;
  return apiJson<VariantItem>(
    `/api/v1/variants/${variantId}/items/${itemId}/regenerate`,
    {
      method: "POST",
      body,
    }
  );
}

export async function regenerateTaskItemVariants(
  taskId: string,
  itemId: string
): Promise<VariantItem[]> {
  return apiJson<VariantItem[]>(
    `/api/v1/tasks/${taskId}/items/${itemId}/regenerate-variants`,
    { method: "POST" }
  );
}
