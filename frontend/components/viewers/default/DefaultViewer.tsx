"use client";

import { useEffect, useRef } from "react";
import { loader } from "@monaco-editor/react";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.Editor),
  { ssr: false }
);

interface DefaultViewerProps {
  content: string;
  language: string;
  onContentChange?: (content: string) => void;
  diagnostics?: Array<{
    message: string;
    line: number;
    character: number;
    severity: "error" | "warning" | "info";
  }>;
}

export default function DefaultViewer({
  content,
  language,
  onContentChange,
  diagnostics = [],
}: DefaultViewerProps) {
  const editorRef = useRef<any>(null);

  // Monaco Editor의 기본 TypeScript/JavaScript 진단 비활성화
  useEffect(() => {
    if (language === "typescript" || language === "javascript") {
      loader.init().then((monaco) => {
        // TypeScript/JavaScript 언어 서버의 자동 진단 비활성화
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: true,
          noSyntaxValidation: true,
          noSuggestionDiagnostics: true,
        });
        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: true,
          noSyntaxValidation: true,
          noSuggestionDiagnostics: true,
        });
      });
    }
  }, [language]);

  // 백엔드에서 받은 진단만 마커로 표시
  useEffect(() => {
    if (editorRef.current && diagnostics.length > 0) {
      loader.init().then((monaco) => {
        const markers: any[] = diagnostics.map((error) => ({
          startLineNumber: error.line,
          startColumn: error.character,
          endLineNumber: error.line,
          endColumn: error.character + (error.length || 1),
          message: error.message,
          severity:
            error.severity === "error"
              ? monaco.MarkerSeverity.Error
              : error.severity === "warning"
              ? monaco.MarkerSeverity.Warning
              : monaco.MarkerSeverity.Info,
        }));
        monaco.editor.setModelMarkers(
          editorRef.current.getModel()!,
          "backend-diagnostics",
          markers
        );
      });
    } else if (editorRef.current) {
      // 진단이 없으면 마커 제거
      loader.init().then((monaco) => {
        monaco.editor.setModelMarkers(
          editorRef.current.getModel()!,
          "backend-diagnostics",
          []
        );
      });
    }
  }, [diagnostics]);

  return (
    <MonacoEditor
      height="100%"
      language={language}
      value={content}
      onChange={(value) => onContentChange?.(value || "")}
      onMount={(editor) => {
        editorRef.current = editor;
      }}
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

