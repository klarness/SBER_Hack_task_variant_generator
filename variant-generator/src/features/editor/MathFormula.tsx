import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import katex from "katex";
import "mathlive";
import "mathlive/fonts.css";
import "mathlive/static.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MathfieldElement } from "mathlive";
import { Check, Divide, Radical, Superscript, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";

const FORMULA_PATTERN = /\$([^$\n]+)\$/g;

export const MathFormula = TiptapNode.create({
  name: "mathFormula",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-latex") ||
          stripFormulaMarkers(element.textContent || ""),
        renderHTML: (attributes) => ({
          "data-latex": attributes.latex,
        }),
      },
      openOnCreate: {
        default: false,
        parseHTML: () => false,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-math-formula]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const latex = String(node.attrs.latex || "").trim();
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-math-formula": "",
        "data-latex": latex,
      }),
      `$${latex}$`,
    ];
  },

  renderText({ node }) {
    const latex = String(node.attrs.latex || "").trim();
    return `$${latex}$`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathFormulaView, {
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        return Boolean(
          target?.closest(".math-formula-popover") ||
            target?.closest("math-field")
        );
      },
    });
  },
});

export function prepareFormulaContent(value: string): string {
  if (!value || !value.includes("$") || typeof DOMParser === "undefined") {
    return value;
  }

  const parsedDocument = new DOMParser().parseFromString(value, "text/html");
  const textNodes: Text[] = [];
  const walker = parsedDocument.createTreeWalker(
    parsedDocument.body,
    globalThis.NodeFilter.SHOW_TEXT
  );

  let currentNode = walker.nextNode();
  while (currentNode) {
    const parent = currentNode.parentElement;
    if (
      currentNode.textContent?.includes("$") &&
      !parent?.closest("[data-math-formula]")
    ) {
      textNodes.push(currentNode as Text);
    }
    currentNode = walker.nextNode();
  }

  for (const textNode of textNodes) {
    replaceFormulaTextNode(parsedDocument, textNode);
  }

  return parsedDocument.body.innerHTML;
}

export function serializeFormulaContent(value: string): string {
  if (
    !value ||
    !value.includes("data-math-formula") ||
    typeof DOMParser === "undefined"
  ) {
    return value;
  }

  const parsedDocument = new DOMParser().parseFromString(value, "text/html");
  parsedDocument
    .querySelectorAll<HTMLElement>("span[data-math-formula]")
    .forEach((element) => {
      const latex = stripFormulaMarkers(
        element.getAttribute("data-latex") || element.textContent || ""
      ).trim();
      element.replaceWith(parsedDocument.createTextNode(latex ? `$${latex}$` : ""));
    });

  return parsedDocument.body.innerHTML;
}

function MathFormulaView({
  editor,
  getPos,
  node,
  selected,
  updateAttributes,
}: NodeViewProps) {
  const latex = String(node.attrs.latex || "");
  const fieldRef = useRef<MathfieldElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(latex);
  const rendered = useMemo(() => renderFormulaHtml(latex), [latex]);
  const preview = useMemo(() => renderFormulaHtml(draft), [draft]);

  useEffect(() => {
    if (!node.attrs.openOnCreate) return;
    setIsOpen(true);
    updateAttributes({ openOnCreate: false });
  }, [node.attrs.openOnCreate, updateAttributes]);

  useEffect(() => {
    if (isOpen) {
      setDraft(latex);
    }
  }, [isOpen, latex]);

  useEffect(() => {
    if (!isOpen || !fieldRef.current) return;
    fieldRef.current.setValue(stripFormulaMarkers(draft), {
      silenceNotifications: true,
    });
    fieldRef.current.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const save = () => {
    const nextLatex = stripFormulaMarkers(
      fieldRef.current?.getValue("latex") || draft
    ).trim();
    if (nextLatex) {
      const pos = getPos();
      if (typeof pos === "number") {
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              latex: nextLatex,
            });
            return true;
          })
          .run();
      } else {
        updateAttributes({ latex: nextLatex });
      }
      setDraft(nextLatex);
    }
    setIsOpen(false);
  };

  const close = () => {
    if (!latex.trim()) {
      const pos = getPos();
      if (typeof pos === "number") {
        editor
          .chain()
          .focus()
          .deleteRange({ from: pos, to: pos + node.nodeSize })
          .run();
        return;
      }
    }
    setIsOpen(false);
  };

  const insertTemplate = (template: string) => {
    if (fieldRef.current) {
      fieldRef.current.insert(template);
      setDraft(fieldRef.current.getValue("latex"));
      fieldRef.current.focus();
      return;
    }

    setDraft((value) => `${value}${template}`);
  };

  return (
    <NodeViewWrapper
      as="span"
      className="math-formula-node-wrap"
      contentEditable={false}
    >
      <span
        role="button"
        tabIndex={0}
        title="Редактировать формулу"
        className={cn("math-formula-node", selected && "is-selected")}
        onClick={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        dangerouslySetInnerHTML={{ __html: rendered }}
      />

      {isOpen && (
        <>
          <span
            className="math-formula-popover-backdrop"
            onClick={close}
            aria-hidden="true"
          />
          <span
            className="math-formula-popover"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="math-formula-popover-head">
              <span className="label-mono">Формула</span>
              <button
                type="button"
                className="math-formula-icon-button"
                onClick={close}
                aria-label="Закрыть"
              >
                <X size={14} />
              </button>
            </span>

            <span className="math-formula-preview">
              <span dangerouslySetInnerHTML={{ __html: preview }} />
            </span>

            <math-field
              ref={fieldRef}
              class="math-formula-field"
              default-mode="math"
              math-virtual-keyboard-policy="manual"
              smart-fence="true"
              smart-mode="true"
              onInput={(event) => {
                const field = event.currentTarget as MathfieldElement;
                setDraft(field.getValue("latex"));
              }}
            />

            <span className="math-formula-template-row">
              <button type="button" onClick={() => insertTemplate("\\frac{}{}")}>
                <Divide size={13} />
                Дробь
              </button>
              <button type="button" onClick={() => insertTemplate("^{}")}>
                <Superscript size={13} />
                Степень
              </button>
              <button type="button" onClick={() => insertTemplate("\\sqrt{}")}>
                <Radical size={13} />
                Корень
              </button>
              <button type="button" onClick={() => insertTemplate("_{}")}>
                Индекс
              </button>
            </span>

            <span className="math-formula-actions">
              <button
                type="button"
                className="math-formula-secondary"
                onClick={close}
              >
                Отмена
              </button>
              <button
                type="button"
                className="math-formula-primary"
                onClick={save}
              >
                <Check size={14} />
                Готово
              </button>
            </span>
          </span>
        </>
      )}
    </NodeViewWrapper>
  );
}

function replaceFormulaTextNode(
  parsedDocument: Document,
  textNode: Text
): void {
  const source = textNode.textContent || "";
  const fragment = parsedDocument.createDocumentFragment();
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  FORMULA_PATTERN.lastIndex = 0;
  while ((match = FORMULA_PATTERN.exec(source)) !== null) {
    if (match.index > lastIndex) {
      fragment.appendChild(
        parsedDocument.createTextNode(source.slice(lastIndex, match.index))
      );
    }

    const latex = match[1].trim();
    const formulaNode = parsedDocument.createElement("span");
    formulaNode.setAttribute("data-math-formula", "");
    formulaNode.setAttribute("data-latex", latex);
    formulaNode.textContent = `$${latex}$`;
    fragment.appendChild(formulaNode);

    lastIndex = FORMULA_PATTERN.lastIndex;
  }

  if (lastIndex < source.length) {
    fragment.appendChild(parsedDocument.createTextNode(source.slice(lastIndex)));
  }

  textNode.parentNode?.replaceChild(fragment, textNode);
}

function stripFormulaMarkers(value: string): string {
  return value.trim().replace(/^\$+|\$+$/g, "");
}

function renderFormulaHtml(value: string): string {
  const formula = stripFormulaMarkers(value).trim() || "\\square";
  try {
    return katex.renderToString(formula, {
      displayMode: false,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return escapeHtml(formula);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return replacements[char] || char;
  });
}
