import katex from "katex";
import { Fragment, useMemo } from "react";
import { cn } from "@/shared/lib/cn";

interface Props {
  text: string;
  className?: string;
}

type Segment =
  | { type: "text"; value: string }
  | { type: "math"; value: string; html: string };

export function LatexText({ text, className }: Props) {
  const normalizedText = useMemo(() => htmlToText(text), [text]);
  const segments = useMemo(() => parseLatexSegments(normalizedText), [normalizedText]);

  return (
    <div className={cn("latex-text whitespace-pre-wrap", className)}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <Fragment key={index}>{segment.value}</Fragment>;
        }

        return (
          <span
            key={index}
            className="latex-inline"
            dangerouslySetInnerHTML={{ __html: segment.html }}
          />
        );
      })}
    </div>
  );
}

function htmlToText(value: string): string {
  if (!/<[a-z][\s\S]*>/i.test(value)) {
    return value;
  }

  let text = value
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<\s*\/\s*li\s*>/gi, "\n");

  if (typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(text, "text/html");
    text = document.body.textContent || "";
  } else {
    text = text.replace(/<[^>]+>/g, "");
  }

  return decodeHtmlEntities(text).replace(/\n{3,}/g, "\n\n").trim();
}

function decodeHtmlEntities(value: string): string {
  if (typeof document === "undefined") {
    return value;
  }

  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function parseLatexSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /\$([^$\n]+)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    const formula = match[1].trim();
    segments.push(renderMathSegment(formula, match[0]));
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments;
}

function renderMathSegment(formula: string, fallback: string): Segment {
  try {
    return {
      type: "math",
      value: formula,
      html: katex.renderToString(formula, {
        displayMode: false,
        throwOnError: false,
        strict: false,
      }),
    };
  } catch {
    return { type: "text", value: fallback };
  }
}
