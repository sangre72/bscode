"use client";

import dynamic from "next/dynamic";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.Editor),
  { ssr: false }
);

interface PythonViewerProps {
  content: string;
  onContentChange?: (content: string) => void;
}

export default function PythonViewer({
  content,
  onContentChange,
}: PythonViewerProps) {
  return (
    <MonacoEditor
      height="100%"
      language="python"
      value={content}
      onChange={(value) => onContentChange?.(value || "")}
      theme="vs-dark"
      options={{
        fontSize: 14,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        automaticLayout: true,
      }}
    />
  );
}

