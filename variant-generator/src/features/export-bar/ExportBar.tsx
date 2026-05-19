import { useMutation } from "@tanstack/react-query";
import { Download, BookmarkPlus, FileText, FileType2 } from "lucide-react";
import { Button } from "@/shared/ui/Button";
import { downloadBlob, exportTask } from "@/shared/api/tasks";

interface Props {
  taskId: string;
  title: string;
}

export function ExportBar({ taskId, title }: Props) {
  const pdfMutation = useMutation({
    mutationFn: async () => {
      const res = await exportTask(taskId);
      downloadBlob(res);
    },
  });

  return (
    <div className="flex items-center gap-2">
      <h1
        className="mr-auto text-sm font-medium text-ink-900 truncate max-w-xs"
        title={title}
      >
        {title}
      </h1>

      <Button
        size="sm"
        variant="secondary"
        onClick={() => pdfMutation.mutate()}
        loading={pdfMutation.isPending}
      >
        <FileText size={14} strokeWidth={1.75} />
        Экспорт PDF
      </Button>

      <Button
        size="sm"
        variant="secondary"
        disabled
        title="Скоро"
      >
        <FileType2 size={14} strokeWidth={1.75} />
        Экспорт DOCX
      </Button>

      <Button size="sm" variant="ghost" disabled title="Скоро">
        <BookmarkPlus size={14} strokeWidth={1.75} />
        В библиотеку
      </Button>
    </div>
  );
}
