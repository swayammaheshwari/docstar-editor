import { useState } from "react";
import "../../src/styles/editor.css";
import "./playground.css";
import { Landing } from "./Landing";
import { PlaygroundModal } from "./PlaygroundModal";
import { ImportModal } from "./ImportModal";
import { EditorScreen } from "./EditorScreen";
import { randomDocumentId, slugifyDocumentName } from "./pageId";

type View =
  | { screen: "landing" }
  | { screen: "playground-modal" }
  | { screen: "import-modal" }
  | { screen: "editor"; pageId: string; initialContent?: string };

export default function App() {
  const [view, setView] = useState<View>({ screen: "landing" });

  const openDoc = (pageId: string, initialContent?: string) => {
    setView({ screen: "editor", pageId, initialContent });
  };

  const handleCreate = (name: string) => {
    openDoc(slugifyDocumentName(name));
  };

  const handleImport = (content: string) => {
    openDoc(randomDocumentId(), content);
  };

  if (view.screen === "editor") {
    return (
      <EditorScreen
        pageId={view.pageId}
        initialContent={view.initialContent}
        onClose={() => setView({ screen: "landing" })}
      />
    );
  }

  return (
    <>
      <Landing
        onOpenPlayground={() => setView({ screen: "playground-modal" })}
        onOpenImport={() => setView({ screen: "import-modal" })}
      />
      {view.screen === "playground-modal" ? (
        <PlaygroundModal onCancel={() => setView({ screen: "landing" })} onCreate={handleCreate} />
      ) : null}
      {view.screen === "import-modal" ? (
        <ImportModal onCancel={() => setView({ screen: "landing" })} onImport={handleImport} />
      ) : null}
    </>
  );
}
