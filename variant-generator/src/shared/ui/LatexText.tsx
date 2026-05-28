import katex from "katex";
import { Fragment, type ReactNode, useMemo } from "react";
import { cn } from "@/shared/lib/cn";

interface Props {
  text: string;
  className?: string;
  highlightAgainst?: string;
}

type Segment =
  | { type: "text"; value: string }
  | { type: "math"; value: string; html: string };

export function LatexText({ text, className, highlightAgainst }: Props) {
  const diffContext = useMemo(
    () => createDiffContext(highlightAgainst),
    [highlightAgainst]
  );
  const content = useMemo(() => renderContent(text, diffContext), [text, diffContext]);

  return <div className={cn("latex-text", className)}>{content}</div>;
}

function renderContent(value: string, diffContext?: DiffContext): ReactNode {
  if (!/<[a-z][\s\S]*>/i.test(value) || typeof DOMParser === "undefined") {
    return <div className="whitespace-pre-wrap">{renderLatexText(value, "plain", diffContext)}</div>;
  }

  const document = new DOMParser().parseFromString(value, "text/html");
  return renderChildren(document.body, "html", diffContext);
}

function renderChildren(parent: Node, keyPrefix: string, diffContext?: DiffContext): ReactNode[] {
  return Array.from(parent.childNodes).map((node, index) =>
    renderNode(node, `${keyPrefix}-${index}`, diffContext)
  );
}

function renderNode(node: Node, key: string, diffContext?: DiffContext): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return <Fragment key={key}>{renderLatexText(node.textContent || "", key, diffContext)}</Fragment>;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as HTMLElement;
  const children = renderChildren(element, key, diffContext);
  const tag = element.tagName.toLowerCase();

  switch (tag) {
    case "p":
      return (
        <p key={key} className="my-2">
          {children}
        </p>
      );
    case "br":
      return <br key={key} />;
    case "strong":
    case "b":
      return <strong key={key}>{children}</strong>;
    case "em":
    case "i":
      return <em key={key}>{children}</em>;
    case "u":
      return <u key={key}>{children}</u>;
    case "s":
    case "strike":
      return <s key={key}>{children}</s>;
    case "h2":
      return (
        <h2 key={key} className="text-lg font-bold font-display my-3">
          {children}
        </h2>
      );
    case "h3":
      return (
        <h3 key={key} className="text-base font-bold font-display my-2">
          {children}
        </h3>
      );
    case "ul":
      return (
        <ul key={key} className="list-disc pl-5 my-2 space-y-1">
          {children}
        </ul>
      );
    case "ol":
      return (
        <ol key={key} className="list-decimal pl-5 my-2 space-y-1">
          {children}
        </ol>
      );
    case "li":
      return <li key={key}>{children}</li>;
    case "table":
      return (
        <div key={key} className="my-3 overflow-x-auto">
          <table className="latex-rendered-table">{children}</table>
        </div>
      );
    case "thead":
      return <thead key={key}>{children}</thead>;
    case "tbody":
      return <tbody key={key}>{children}</tbody>;
    case "tr":
      return <tr key={key}>{children}</tr>;
    case "th":
      return <th key={key}>{children}</th>;
    case "td":
      return <td key={key}>{children}</td>;
    case "div":
    case "span":
      return <Fragment key={key}>{children}</Fragment>;
    default:
      return <Fragment key={key}>{children}</Fragment>;
  }
}

function renderLatexText(text: string, keyPrefix: string, diffContext?: DiffContext): ReactNode[] {
  return parseLatexSegments(decodeHtmlEntities(text)).map((segment, index) => {
    if (segment.type === "text") {
      return (
        <Fragment key={`${keyPrefix}-${index}`}>
          {renderDiffText(segment.value, `${keyPrefix}-${index}`, diffContext)}
        </Fragment>
      );
    }

    const mathNode = (
      <span
        className="latex-inline"
        dangerouslySetInnerHTML={{ __html: segment.html }}
      />
    );
    if (shouldHighlightMath(segment.value, diffContext)) {
      return (
        <mark
          key={`${keyPrefix}-${index}`}
          className="rounded-md bg-amber-200/80 px-1 py-0.5 text-amber-950 ring-1 ring-amber-300/70"
        >
          {mathNode}
        </mark>
      );
    }

    return (
      <span
        key={`${keyPrefix}-${index}`}
        className="latex-inline"
        dangerouslySetInnerHTML={{ __html: segment.html }}
      />
    );
  });
}

type DiffContext = {
  tokens: Set<string>;
  formulas: Set<string>;
};

function createDiffContext(source?: string): DiffContext | undefined {
  if (!source?.trim()) return undefined;
  const plain = htmlToText(source);
  return {
    tokens: new Set(tokenizeComparableText(plain).map(normalizeDiffToken).filter(Boolean)),
    formulas: new Set(parseLatexSegments(plain).filter((segment) => segment.type === "math").map((segment) => normalizeFormula(segment.value))),
  };
}

function renderDiffText(text: string, keyPrefix: string, diffContext?: DiffContext): ReactNode[] {
  if (!diffContext) return [text];

  const parts = text.split(/([\p{L}\p{N}]+(?:[-–—][\p{L}\p{N}]+)?)/gu);
  return parts.map((part, index) => {
    const normalized = normalizeDiffToken(part);
    if (!normalized || normalized.length < 2 || diffContext.tokens.has(normalized)) {
      return <Fragment key={`${keyPrefix}-diff-${index}`}>{part}</Fragment>;
    }

    return (
      <mark
        key={`${keyPrefix}-diff-${index}`}
        className="rounded bg-amber-200/80 px-0.5 text-amber-950 ring-1 ring-amber-300/60"
      >
        {part}
      </mark>
    );
  });
}

function shouldHighlightMath(formula: string, diffContext?: DiffContext): boolean {
  if (!diffContext) return false;
  const normalized = normalizeFormula(formula);
  return !!normalized && !diffContext.formulas.has(normalized);
}

function htmlToText(value: string): string {
  if (typeof DOMParser === "undefined" || !/<[a-z][\s\S]*>/i.test(value)) {
    return decodeHtmlEntities(value);
  }
  const document = new DOMParser().parseFromString(value, "text/html");
  return document.body.textContent || "";
}

function tokenizeComparableText(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+(?:[-–—][\p{L}\p{N}]+)?/gu) ?? [];
}

function normalizeDiffToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .trim();
}

function normalizeFormula(value: string): string {
  return value.replace(/\s+/g, "").replace(/\\left|\\right/g, "").trim();
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
