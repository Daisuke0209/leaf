/**
 * Leaf stores each page as a plain Markdown file in Google Drive.
 * The title is the file name minus the extension; the body is raw Markdown.
 */
export interface PageDocument {
  title: string;
  markdown: string;
}

export const MARKDOWN_MIME_TYPE = "text/markdown";
export const MARKDOWN_EXTENSION = ".md";

export function createEmptyDocument(): PageDocument {
  return { title: "", markdown: "" };
}
