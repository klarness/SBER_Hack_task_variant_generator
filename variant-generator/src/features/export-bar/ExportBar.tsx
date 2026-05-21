import { useMutation } from "@tanstack/react-query";
import { BookmarkPlus, FileText, FileType2 } from "lucide-react";
import { Button } from "@/shared/ui/Button";
import { downloadBlob, exportTask } from "@/shared/api/tasks";

interface Props {
  taskId: string;
  title: string;
}

export function ExportBar({ taskId, title }: Props) {
  const docxMutation = useMutation({
    mutationFn: async () => {
      const res = await exportTask(taskId);
      downloadBlob(res);
    },
  });

  return (
    <div className="flex items-center gap-1.5 flex-1">
      <h1
        className="mr-auto text-[15px] font-bold text-ink-900 truncate max-w-sm px-2"
        title={title}
      >
        {title}
      </h1>

      <Button size="sm" variant="ghost" disabled title="Скоро">
        <FileText size={15} strokeWidth={1.75} />
        Экспорт PDF
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={() => docxMutation.mutate()}
        loading={docxMutation.isPending}
      >
        <FileType2 size={15} strokeWidth={1.75} />
        Экспорт DOCX
      </Button>

      <Button size="sm" variant="ghost" disabled title="Скоро">
        <BookmarkPlus size={15} strokeWidth={1.75} />
        В библиотеку
      </Button>
    </div>
  );
}
