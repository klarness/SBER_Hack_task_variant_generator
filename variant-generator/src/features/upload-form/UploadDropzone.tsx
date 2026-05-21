import { useDropzone } from "react-dropzone";
import { UploadCloud, FileText, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface Props {
  files: File[];
  onChange: (next: File[]) => void;
}

const ACCEPT = {
  "text/plain": [".txt"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

export function UploadDropzone({ files, onChange }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    multiple: true,
    onDrop: (accepted) => onChange([...files, ...accepted]),
  });

  const remove = (idx: number) =>
    onChange(files.filter((_, i) => i !== idx));

  return (
    <div className="flex flex-col gap-3">
      <div
        {...getRootProps()}
        className={cn(
          "relative cursor-pointer rounded-2xl border-2 border-dashed transition",
          "px-6 py-10 text-center backdrop-blur-sm",
          isDragActive
            ? "border-accent bg-accent-soft/40"
            : "border-border hover:border-accent/60 bg-glass-drop"
        )}
      >
        <input {...getInputProps()} />
        <div className="mx-auto w-12 h-12 grid place-items-center text-accent">
          <UploadCloud size={26} strokeWidth={2} />
        </div>
        <p className="mt-3 text-[15px] font-semibold text-ink-900">
          {isDragActive
            ? "Отпустите файлы здесь"
            : "Перетащите файлы или нажмите"}
        </p>
        <p className="mt-1.5 text-[12.5px] text-ink-500 tracking-[0.04em]">
          PDF, DOCX, PNG, JPG
        </p>
      </div>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((file, idx) => (
            <li
              key={`${file.name}-${idx}`}
              className="flex items-center gap-2 px-3 py-2 bg-white/70 backdrop-blur-sm border border-border-subtle rounded-xl"
            >
              {file.type.startsWith("image/") ? (
                <ImageIcon
                  size={16}
                  strokeWidth={1.75}
                  className="text-ink-500 shrink-0"
                />
              ) : (
                <FileText
                  size={16}
                  strokeWidth={1.75}
                  className="text-ink-500 shrink-0"
                />
              )}
              <span className="flex-1 text-sm text-ink-900 truncate">
                {file.name}
              </span>
              <span className="text-xs text-ink-500 tabular-nums">
                {(file.size / 1024).toFixed(0)} КБ
              </span>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="w-7 h-7 inline-flex items-center justify-center rounded-full text-ink-500 hover:bg-white hover:text-danger transition"
                aria-label="Удалить файл"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
