import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import {
  Bold,
  Columns3,
  Eye,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Plus,
  Rows3,
  Save,
  Sigma,
  Strikethrough,
  Table2,
  Trash2,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { LatexText } from "@/shared/ui/LatexText";

interface Props {
  value: string;
  onChange?: (html: string) => void;
  onCommit?: (html: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  className?: string;
  compact?: boolean;
}

export function RichEditor({
  value,
  onChange,
  onCommit,
  onCancel,
  placeholder = "Введите текст задания...",
  className,
  compact = false,
}: Props) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);
  const lastExternalValue = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: "editor-table",
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          "tiptap min-h-[180px] px-4 py-3 text-sm",
          compact && "min-h-[120px]"
        ),
      },
    },
    onUpdate({ editor }) {
      onChange?.(editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor || lastExternalValue.current === value) return;
    lastExternalValue.current = value;
    if (!editor.isFocused) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;

  const currentHtml = editor.getHTML();
  const inTable = editor.isActive("table");

  const insertFormula = () => {
    const selectedText = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      " "
    );
    const raw = window.prompt("Введите LaTeX без символов $", selectedText || "x^2 + 5x + 6 = 0");
    if (!raw?.trim()) return;

    const formula = raw.trim().replace(/^\$|\$$/g, "");
    editor.chain().focus().insertContent(`$${formula}$`).run();
  };

  const commit = () => {
    onCommit?.(editor.getHTML());
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-white overflow-hidden shadow-card",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-1 px-2 py-2 border-b border-border bg-white/85">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="Жирный"
        >
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label="Курсив"
        >
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          label="Подчеркнутый"
        >
          <UnderlineIcon size={15} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          label="Зачеркнутый"
        >
          <Strikethrough size={15} />
        </ToolbarButton>

        <Separator />

        <ToolbarButton
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          label="Заголовок"
        >
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          label="Маркированный список"
        >
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          label="Нумерованный список"
        >
          <ListOrdered size={15} />
        </ToolbarButton>

        <Separator />

        <ToolbarButton onClick={insertFormula} label="Вставить формулу">
          <Sigma size={15} />
        </ToolbarButton>
        <ToolbarButton
          active={inTable}
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          label="Вставить таблицу"
        >
          <Table2 size={15} />
        </ToolbarButton>
        <ToolbarButton
          disabled={!inTable}
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          label="Добавить колонку"
        >
          <Columns3 size={15} />
          <Plus size={10} className="-ml-1" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!inTable}
          onClick={() => editor.chain().focus().addRowAfter().run()}
          label="Добавить строку"
        >
          <Rows3 size={15} />
          <Plus size={10} className="-ml-1" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!inTable}
          onClick={() => editor.chain().focus().deleteTable().run()}
          label="Удалить таблицу"
        >
          <Trash2 size={15} />
        </ToolbarButton>

        <Separator />

        <ToolbarButton
          active={isPreviewOpen}
          onClick={() => setIsPreviewOpen((value) => !value)}
          label="Предпросмотр"
        >
          <Eye size={15} />
        </ToolbarButton>

        <div className="ml-auto flex items-center gap-1">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="h-8 px-3 rounded-lg text-sm font-semibold text-ink-700 hover:bg-surface-subtle transition inline-flex items-center gap-1.5"
            >
              <X size={14} />
              Отмена
            </button>
          )}
          {onCommit && (
            <button
              type="button"
              onClick={commit}
              className="h-8 px-3 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-ink transition inline-flex items-center gap-1.5"
            >
              <Save size={14} />
              Сохранить
            </button>
          )}
        </div>
      </div>

      <div className={cn("grid", isPreviewOpen && "lg:grid-cols-2 divide-x divide-border")}>
        <div className="min-w-0">
          <EditorContent editor={editor} />
        </div>
        {isPreviewOpen && (
          <div className="min-w-0 bg-surface-base/45 p-4">
            <p className="label-mono text-ink-500 mb-3">Предпросмотр</p>
            <LatexText text={currentHtml} className="text-sm text-ink-900 leading-relaxed" />
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "h-8 min-w-8 px-2 inline-flex items-center justify-center rounded-lg text-ink-700 transition disabled:opacity-35 disabled:cursor-not-allowed",
        active
          ? "bg-accent-soft text-accent-ink"
          : "hover:bg-surface-subtle hover:text-ink-900"
      )}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <div className="w-px h-5 bg-border mx-1" />;
}
