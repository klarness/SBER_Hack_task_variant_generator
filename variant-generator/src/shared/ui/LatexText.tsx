import katex from "katex";
import { Fragment, type ReactNode, useMemo } from "react";
import { cn } from "@/shared/lib/cn";

interface Props {
  text: string;
  className?: string;
}

type Segment =
  | { type: "text"; value: string }
  | { type: "math"; value: string; html: string };

export function LatexText({ text, className }: Props) {
  const content = useMemo(() => renderContent(text), [text]);

  return <div className={cn("latex-text", className)}>{content}</div>;
}

function renderContent(value: string): ReactNode {
  if (!/<[a-z][\s\S]*>/i.test(value) || typeof DOMParser === "undefined") {
    return <div className="whitespace-pre-wrap">{renderLatexText(value, "plain")}</div>;
  }

  const document = new DOMParser().parseFromString(value, "text/html");
  return renderChildren(document.body, "html");
}

function renderChildren(parent: Node, keyPrefix: string): ReactNode[] {
  return Array.from(parent.childNodes).map((node, index) =>
    renderNode(node, `${keyPrefix}-${index}`)
  );
}

function renderNode(node: Node, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return <Fragment key={key}>{renderLatexText(node.textContent || "", key)}</Fragment>;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as HTMLElement;
  const children = renderChildren(element, key);
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

function renderLatexText(text: string, keyPrefix: string): ReactNode[] {
  return parseLatexSegments(decodeHtmlEntities(text)).map((segment, index) => {
    if (segment.type === "text") {
      return <Fragment key={`${keyPrefix}-${index}`}>{segment.value}</Fragment>;
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
