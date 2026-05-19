import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading2,
  RotateCcw,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/cn";

interface Props {
  value: string;
  onChange?: (html: string) => void;
  onCommit?: (html: string) => void;
  placeholder?: string;
  className?: string;
  showToolbar?: boolean;
}

export function RichEditor({
  value,
  onChange,
  onCommit,
  placeholder = "Введите текст…",
  className,
  showToolbar = true,
}: Props) {
  const dirtyRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "tiptap min-h-[80px] px-3 py-2.5 text-sm",
      },
    },
    onUpdate({ editor }) {
      dirtyRef.current = true;
      onChange?.(editor.getHTML());
    },
    onBlur({ editor }) {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        onCommit?.(editor.getHTML());
      }
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value && !editor.isFocused) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className={cn("group", className)}>
      {showToolbar && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border-subtle bg-surface-base/50 rounded-t-lg opacity-0 group-focus-within:opacity-100 transition">
          <ToolbarButton
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            label="Жирный"
          >
            <Bold size={14} />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            label="Курсив"
          >
            <Italic size={14} />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            label="Зачёркнутый"
          >
            <UnderlineIcon size={14} />
          </ToolbarButton>
          <div className="w-px h-4 bg-border mx-1" />
          <ToolbarButton
            active={editor.isActive("heading", { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            label="Заголовок"
          >
            <Heading2 size={14} />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            label="Список"
          >
            <List size={14} />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            label="Нумерованный список"
          >
            <ListOrdered size={14} />
          </ToolbarButton>
          <div className="w-px h-4 bg-border mx-1" />
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().unsetAllMarks().clearNodes().run()
            }
            label="Очистить формат"
          >
            <RotateCcw size={14} />
          </ToolbarButton>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "w-7 h-7 inline-flex items-center justify-center rounded-md text-ink-700 transition",
        active
          ? "bg-sber-50 text-sber-700"
          : "hover:bg-surface-subtle hover:text-ink-900"
      )}
    >
      {children}
    </button>
  );
}
