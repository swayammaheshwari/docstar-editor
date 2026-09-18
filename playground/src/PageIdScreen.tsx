import { ChangeEvent, FormEvent, useState } from "react";
import { isValidPageId } from "./pageId";

interface PageIdScreenProps {
  onSubmit: (pageId: string) => void;
  wsUrl: string;
}

export function PageIdScreen({ onSubmit, wsUrl }: PageIdScreenProps) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  const trimmed = value.trim();
  const valid = trimmed.length > 0 && isValidPageId(trimmed);
  const showError = touched && trimmed.length > 0 && !valid;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    if (!touched) setTouched(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSubmit(trimmed);
  };

  return (
    <div className="pg-screen">
      <div className="pg-card">
        <div className="pg-badge">docstar-editor · playground</div>
        <h1 className="pg-title">Open a page</h1>
        <p className="pg-subtitle">
          Enter a page ID to start editing. Content syncs in real time to a
          Hocuspocus document with this ID on{" "}
          <code className="pg-code">doc-rtc</code>.
        </p>

        <form onSubmit={handleSubmit} className="pg-form">
          <input
            autoFocus
            className={`pg-input${showError ? " pg-input--error" : ""}`}
            placeholder="e.g. swayam-test"
            value={value}
            onChange={handleChange}
          />
          <button className="pg-button" type="submit" disabled={!valid}>
            Open editor →
          </button>
        </form>

        {showError ? (
          <div className="pg-error">
            Only lowercase letters, numbers, <span className="pg-mono">-</span>{" "}
            and <span className="pg-mono">_</span> are allowed — no spaces or
            capital letters (e.g. <span className="pg-mono">swayam-test</span>).
          </div>
        ) : (
          <div className="pg-footnote">
            Connecting to <span className="pg-mono">{wsUrl}</span> · requires{" "}
            <span className="pg-mono">doc-rtc</span> running locally (see{" "}
            <span className="pg-mono">doc-rtc/README.md</span>)
          </div>
        )}
      </div>
    </div>
  );
}
