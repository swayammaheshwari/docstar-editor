import { ChangeEvent, FormEvent, useRef, useState } from "react";

interface ImportModalProps {
  onCancel: () => void;
  onImport: (content: string) => void;
}

export function ImportModal({ onCancel, onImport }: ImportModalProps) {
  const [content, setContent] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onImport(content);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".md")) {
      setFileError("Only .md files are supported.");
      e.target.value = "";
      return;
    }
    setFileError(null);
    const reader = new FileReader();
    reader.onload = () => setContent(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  return (
    <div className="pg-modal-overlay" onClick={onCancel}>
      <div className="pg-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="pg-modal-title">Import Markdown</h2>
        <form onSubmit={handleSubmit} className="pg-modal-form">
          <label className="pg-label">
            Content (Markdown)
            <textarea
              autoFocus
              className="pg-textarea"
              placeholder="# Paste your markdown here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
            />
          </label>

          <div className="pg-import-file-row">
            <button
              type="button"
              className="pg-ghost-button"
              onClick={() => fileInputRef.current?.click()}
            >
              ↑ Import .md file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              className="pg-file-input-hidden"
              onChange={handleFileChange}
            />
            {fileError ? <span className="pg-error-inline">{fileError}</span> : null}
          </div>

          <div className="pg-modal-actions">
            <button type="button" className="pg-ghost-button" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="pg-button" disabled={!content.trim()}>
              Import
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
