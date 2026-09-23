import { createCodeBlockSpec } from "@blocknote/core";

export const codeBlock = createCodeBlockSpec({
  defaultLanguage: "text",
  supportedLanguages: {
    text: { name: "Plain Text", aliases: ["text", "plain"] },
    javascript: { name: "JavaScript", aliases: ["js"] },
    typescript: { name: "TypeScript", aliases: ["ts"] },
    python: { name: "Python", aliases: ["py"] },
    json: { name: "JSON", aliases: ["json"] },
    html: { name: "HTML", aliases: ["html"] },
    css: { name: "CSS", aliases: ["css"] },
    bash: { name: "Bash / Shell", aliases: ["sh", "shell"] },
    sql: { name: "SQL", aliases: ["sql"] },
    markdown: { name: "Markdown", aliases: ["md"] },
    yaml: { name: "YAML", aliases: ["yml"] },
    java: { name: "Java", aliases: ["java"] },
    go: { name: "Go", aliases: ["golang"] },
    rust: { name: "Rust", aliases: ["rs"] },
    c: { name: "C", aliases: ["c"] },
    cpp: { name: "C++", aliases: ["c++", "cxx"] },
  },
});
