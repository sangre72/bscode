"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { FileCode } from "lucide-react";

// Monaco Editor를 동적으로 로드 (SSR 방지)
const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.Editor),
  { ssr: false }
);

interface CodeEditorProps {
  selectedFile: string | null;
  fileContent: string;
  onFileChange: (content: string) => void;
}

export default function CodeEditor({
  selectedFile,
  fileContent,
  onFileChange,
}: CodeEditorProps) {
  const [language, setLanguage] = useState("typescript");

  useEffect(() => {
    if (selectedFile) {
      const ext = selectedFile.split(".").pop()?.toLowerCase();
      const langMap: Record<string, string> = {
        ts: "typescript",
        tsx: "typescript",
        js: "javascript",
        jsx: "javascript",
        py: "python",
        java: "java",
        go: "go",
        rs: "rust",
        cpp: "cpp",
        c: "c",
        html: "html",
        css: "css",
        json: "json",
        md: "markdown",
      };
      setLanguage(langMap[ext || ""] || "plaintext");
    }
  }, [selectedFile]);

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {selectedFile || "파일을 선택하세요"}
          </span>
        </div>
      </div>

      {/* 에디터 */}
      <div className="flex-1">
        {selectedFile ? (
          <MonacoEditor
            height="100%"
            language={language}
            value={fileContent}
            onChange={(value) => onFileChange(value || "")}
            theme="vs-dark"
            options={{
              fontSize: 14,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              automaticLayout: true,
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-900">
            <p className="text-gray-500 dark:text-gray-400">
              파일을 선택하여 코드를 편집하세요
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

