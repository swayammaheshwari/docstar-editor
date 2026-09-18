import { FormEvent, useState } from "react";

interface ImportModalProps {
  onCancel: () => void;
  onImport: (name: string, content: string) => void;
}

export function ImportModal({ onCancel, onImport }: ImportModalProps) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;
    onImport(name.trim(), content);
  };

  return (
    <div className="pg-modal-overlay" onClick={onCancel}>
      <div className="pg-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="pg-modal-title">Import Markdown</h2>
        <form onSubmit={handleSubmit} className="pg-modal-form">
          <label className="pg-label">
            Name
            <input
              autoFocus
              className="pg-input"
              placeholder="e.g. Meeting notes"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="pg-label">
            Content (Markdown)
            <textarea
              className="pg-textarea"
              placeholder="# Paste your markdown here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
            />
          </label>

          <div className="pg-modal-actions">
            <button type="button" className="pg-ghost-button" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="submit"
              className="pg-button"
              disabled={!name.trim() || !content.trim()}
            >
              Import
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
