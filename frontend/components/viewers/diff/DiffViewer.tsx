"use client";

import { DiffEditor } from "@monaco-editor/react";
import { FileCode, X } from "lucide-react";
import { useEffect, useState } from "react";

interface DiffViewerProps {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  language: string;
  onClose?: () => void;
}

export default function DiffViewer({
  filePath,
  originalContent,
  modifiedContent,
  language,
  onClose,
}: DiffViewerProps) {
  // 초기 테마를 계산하여 설정 (useEffect 내에서 setState 호출 방지)
  const [editorTheme, setEditorTheme] = useState<"light" | "vs-dark">(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "vs-dark"
        : "light";
    }
    return "vs-dark";
  });

  useEffect(() => {
    // 다크 모드 변경 감지
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      setEditorTheme(e.matches ? "vs-dark" : "light");
    };

    // 이벤트 리스너 등록
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {filePath}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Diff 에디터 */}
      <div className="flex-1">
        <DiffEditor
          height="100%"
          language={language}
          theme={editorTheme}
          options={{
            readOnly: true,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            renderSideBySide: true,
          }}
          original={originalContent}
          modified={modifiedContent}
        />
      </div>
    </div>
  );
}

