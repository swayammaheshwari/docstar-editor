import { FormEvent, useState } from "react";

interface PlaygroundModalProps {
  onCancel: () => void;
  onCreate: (name: string) => void;
}

export function PlaygroundModal({ onCancel, onCreate }: PlaygroundModalProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim());
  };

  return (
    <div className="pg-modal-overlay" onClick={onCancel}>
      <div className="pg-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="pg-modal-title">Start a new document</h2>
        <form onSubmit={handleSubmit} className="pg-modal-form">
          <label className="pg-label">
            Document name
            <input
              autoFocus
              className="pg-input"
              placeholder="e.g. Product roadmap"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="pg-modal-actions">
            <button type="button" className="pg-ghost-button" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="pg-button" disabled={!name.trim()}>
              Open editor →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
