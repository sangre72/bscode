"use client";

import { useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { loader } from "@monaco-editor/react";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.Editor),
  { ssr: false }
);

interface TypeScriptViewerProps {
  content: string;
  filePath: string;
  projectPath?: string;
  onContentChange?: (content: string) => void;
  diagnostics?: Array<{
    message: string;
    line: number;
    character: number;
    severity: "error" | "warning" | "info";
  }>;
}

export default function TypeScriptViewer({
  content,
  filePath,
  projectPath,
  onContentChange,
  diagnostics = [],
}: TypeScriptViewerProps) {
  const editorRef = useRef<any>(null);

  // 백엔드에서 받은 진단만 마커로 표시
  useEffect(() => {
    if (editorRef.current) {
      loader.init().then((monaco) => {
        if (diagnostics.length > 0) {
          const markers: any[] = diagnostics.map((error) => ({
            startLineNumber: error.line,
            startColumn: error.character,
            endLineNumber: error.line,
            endColumn: error.character + 1,
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
        } else {
          // 진단이 없으면 마커 제거
          monaco.editor.setModelMarkers(
            editorRef.current.getModel()!,
            "backend-diagnostics",
            []
          );
        }
      });
    }
  }, [diagnostics]);

  // Monaco Editor의 기본 TypeScript 진단 비활성화
  useEffect(() => {
    loader.init().then((monaco) => {
      // TypeScript 언어 서버의 자동 진단 비활성화
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
  }, []);

  return (
    <div className="flex flex-col h-full">
      {diagnostics.length > 0 && (
        <div className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-yellow-800 dark:text-yellow-200">
              {diagnostics.filter((d) => d.severity === "error").length}개 오류,{" "}
              {diagnostics.filter((d) => d.severity === "warning").length}개 경고
            </span>
          </div>
        </div>
      )}
      <MonacoEditor
        height="100%"
        language="typescript"
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
    </div>
  );
}

