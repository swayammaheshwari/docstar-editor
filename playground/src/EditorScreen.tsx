import { useRef, useState } from "react";
import { DocstarEditor, type DocstarEditorHandle } from "docstar-editor";
import { ImportModal } from "./ImportModal";

interface EditorScreenProps {
  pageId: string;
  wsUrl: string;
  token: string;
  workspaceId: string;
  onChangePage: () => void;
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".md") ? filename : `${filename}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function EditorScreen({
  pageId,
  wsUrl,
  token,
  workspaceId,
  onChangePage,
}: EditorScreenProps) {
  const editorRef = useRef<DocstarEditorHandle>(null);
  const [importOpen, setImportOpen] = useState(false);

  const handleExport = async () => {
    if (!editorRef.current) return;
    const markdown = await editorRef.current.getMarkdown();
    downloadMarkdown(pageId, markdown);
  };

  const handleImport = async (name: string, content: string) => {
    if (!editorRef.current) return;
    await editorRef.current.setMarkdown(`# ${name}\n\n${content}`);
    setImportOpen(false);
  };

  return (
    <div className="pg-screen pg-screen--editor">
      <div className="pg-editor-shell">
        <div className="pg-editor-header">
          <div>
            <div className="pg-badge">docstar-editor · playground</div>
            <h2 className="pg-page-title">{pageId}</h2>
          </div>
          <div className="pg-header-actions">
            <button className="pg-ghost-button" onClick={() => setImportOpen(true)}>
              ↑ Import
            </button>
            <button className="pg-ghost-button" onClick={handleExport}>
              ↓ Export
            </button>
            <button className="pg-ghost-button" onClick={onChangePage}>
              ← Change page
            </button>
          </div>
        </div>

        <div className="pg-editor-card">
          <DocstarEditor
            ref={editorRef}
            theme="dark"
            className="pg-editor-status"
            collab={{
              wsUrl,
              token,
              workspaceId,
              documentId: pageId,
              user: { name: "Playground", color: "#8b5cf6" },
            }}
          />
        </div>

        <div className="pg-footnote pg-footnote--editor">
          Synced in real time via Hocuspocus at{" "}
          <span className="pg-mono">
            {wsUrl}/workspace/{workspaceId}
          </span>{" "}
          · document <span className="pg-mono">{workspaceId}:{pageId}</span>
        </div>
      </div>

      {importOpen ? (
        <ImportModal onCancel={() => setImportOpen(false)} onImport={handleImport} />
      ) : null}
    </div>
  );
}
