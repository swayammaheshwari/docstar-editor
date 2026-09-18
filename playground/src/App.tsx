import { useEffect, useState } from "react";
import "../../src/styles/editor.css";
import "./playground.css";
import { PageIdScreen } from "./PageIdScreen";
import { EditorScreen } from "./EditorScreen";
import { isValidPageId } from "./pageId";

const wsUrl = import.meta.env.VITE_DOCRTC_WS_URL ?? "ws://localhost:1234";
const token = import.meta.env.VITE_WORKSPACE_TOKEN ?? "dev-token";
const workspaceId = import.meta.env.VITE_WORKSPACE_ID ?? "playground";

function getPageIdFromUrl(): string | null {
  const id = new URLSearchParams(window.location.search).get("pageId");
  return id && isValidPageId(id) ? id : null;
}

function setPageIdInUrl(pageId: string | null) {
  const url = new URL(window.location.href);
  if (pageId) {
    url.searchParams.set("pageId", pageId);
  } else {
    url.searchParams.delete("pageId");
  }
  window.history.pushState({}, "", url);
}

export default function App() {
  const [pageId, setPageIdState] = useState<string | null>(() => getPageIdFromUrl());

  useEffect(() => {
    const onPopState = () => setPageIdState(getPageIdFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openPage = (id: string) => {
    setPageIdInUrl(id);
    setPageIdState(id);
  };

  const changePage = () => {
    setPageIdInUrl(null);
    setPageIdState(null);
  };

  if (!pageId) {
    return <PageIdScreen wsUrl={wsUrl} onSubmit={openPage} />;
  }

  return (
    <EditorScreen
      pageId={pageId}
      wsUrl={wsUrl}
      token={token}
      workspaceId={workspaceId}
      onChangePage={changePage}
    />
  );
}
