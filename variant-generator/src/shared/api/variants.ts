import { apiJson } from "./client";
import type { VariantItem } from "@/shared/types/domain";

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
  prompt = ""
): Promise<VariantItem> {
  const trimmedPrompt = prompt.trim();
  return apiJson<VariantItem>(
    `/api/v1/variants/${variantId}/items/${itemId}/regenerate`,
    {
      method: "POST",
      body: trimmedPrompt ? JSON.stringify({ prompt: trimmedPrompt }) : undefined,
    }
  );
}
