// Re-hosts media pasted as `data:` URLs.
//
// BlockNote only calls `uploadFile` when the clipboard holds nothing but
// `Files`. Content copied from Gmail, Google Docs, Notion etc. arrives as
// `text/html`, and BlockNote's image parser keeps each `<img src>` verbatim —
// so base64 images were stored inline in the document (and every saved
// version / markdown export). After a paste we find those blocks, upload the
// decoded file through the host's `uploadFile`, and swap in the hosted URL.

const MEDIA_BLOCK_TYPES = new Set(["image", "video", "audio", "file"]);

// Block ids with an upload already running, so back-to-back pastes don't
// upload the same block twice.
const inFlight = new Set<string>();

const collectDataUrlBlocks = (blocks: readonly any[], out: any[] = []): any[] => {
  for (const block of blocks) {
    if (
      MEDIA_BLOCK_TYPES.has(block.type) &&
      typeof block.props?.url === "string" &&
      block.props.url.startsWith("data:")
    ) {
      out.push(block);
    }
    if (block.children?.length) collectDataUrlBlocks(block.children, out);
  }
  return out;
};

const dataUrlToFile = (dataUrl: string, name?: string): File => {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) throw new Error("Malformed data URL");
  const header = dataUrl.slice(5, comma); // after "data:"
  const payload = dataUrl.slice(comma + 1);
  const mime = header.split(";")[0] || "application/octet-stream";
  const isBase64 = /;base64$/i.test(header);

  let bytes: Uint8Array;
  if (isBase64) {
    const binary = atob(payload.replace(/\s/g, ""));
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(payload));
  }

  const ext = (mime.split("/")[1] || "bin").split("+")[0];
  const fileName = name && /\.[a-z0-9]+$/i.test(name) ? name : `pasted-${Date.now()}.${ext}`;
  return new File([bytes as BlobPart], fileName, { type: mime });
};

export const uploadInlineDataUrls = async (
  editor: any,
  uploadFile: (file: File) => Promise<string>
): Promise<void> => {
  const blocks = collectDataUrlBlocks(editor.document).filter((b) => !inFlight.has(b.id));
  if (!blocks.length) return;

  await Promise.allSettled(
    blocks.map(async (block) => {
      const dataUrl: string = block.props.url;
      inFlight.add(block.id);
      try {
        const url = await uploadFile(dataUrlToFile(dataUrl, block.props.name));
        if (!url) return;
        // The block may have been deleted or edited while the upload ran.
        const current = editor.getBlock(block.id);
        if (!current || current.props?.url !== dataUrl) return;
        editor.updateBlock(block.id, { props: { url } });
      } catch (err) {
        // Keep the inline image rather than losing it (e.g. over the size limit).
        console.warn("[docstar-editor] Failed to upload pasted inline image", err);
      } finally {
        inFlight.delete(block.id);
      }
    })
  );
};
