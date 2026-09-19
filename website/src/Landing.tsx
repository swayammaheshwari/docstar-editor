interface LandingProps {
  onOpenPlayground: () => void;
  onOpenImport: () => void;
}

export function Landing({ onOpenPlayground, onOpenImport }: LandingProps) {
  return (
    <div className="pg-site">
      <header className="pg-site-header">
        <div className="pg-site-brand">
          <span className="pg-site-logo">◆</span> docstar-editor
        </div>
        <nav className="pg-site-nav">
          <button className="pg-ghost-button" onClick={onOpenImport}>
            Import
          </button>
          <button className="pg-button" onClick={onOpenPlayground}>
            Playground
          </button>
        </nav>
      </header>

      <main className="pg-hero">
        <div className="pg-badge">docstar-editor</div>
        <h1 className="pg-hero-title">
          A beautiful <span className="pg-hero-accent">AI context editor</span>
        </h1>
        <p className="pg-hero-subtitle">
          A minimal, block-based Markdown editor for React — with real-time collaboration
          available as an opt-in when you wire up your own server. Drop it into any React
          app, or try the standalone editor live right here.
        </p>
        <div className="pg-hero-actions">
          <button className="pg-button pg-button--large" onClick={onOpenPlayground}>
            Start writing →
          </button>
          <button className="pg-ghost-button pg-button--large" onClick={onOpenImport}>
            Import a Markdown file
          </button>
        </div>

        <div className="pg-features">
          <div className="pg-feature-card">
            <div className="pg-feature-title">Minimal by default</div>
            <div className="pg-feature-desc">
              A clean block editor with the formatting people actually use — no clutter,
              no heavy toolbars.
            </div>
          </div>
          <div className="pg-feature-card">
            <div className="pg-feature-title">Collaboration-ready</div>
            <div className="pg-feature-desc">
              Built on Yjs — connect it to any Hocuspocus-compatible server to sync
              documents live and persist them automatically.
            </div>
          </div>
          <div className="pg-feature-card">
            <div className="pg-feature-title">Markdown native</div>
            <div className="pg-feature-desc">
              Import and export Markdown directly — your content stays portable.
            </div>
          </div>
        </div>
      </main>

      <footer className="pg-site-footer">
        <span className="pg-mono">npm i docstar-editor</span>
      </footer>
    </div>
  );
}
