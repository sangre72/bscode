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

  useEffect(() => {
    if (editorRef.current && diagnostics.length > 0) {
      loader.init().then((monaco) => {
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
          "typescript",
          markers
        );
      });
    }
  }, [diagnostics]);

  useEffect(() => {
    if (projectPath && editorRef.current) {
      loader.init().then((monaco) => {
        const model = editorRef.current?.getModel();
        if (model) {
          monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            target: monaco.languages.typescript.ScriptTarget.ES2020,
            allowNonTsExtensions: true,
            moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
            module: monaco.languages.typescript.ModuleKind.ESNext,
            noEmit: true,
            esModuleInterop: true,
            jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
            reactNamespace: "React",
            allowJs: true,
            typeRoots: ["node_modules/@types"],
          });

          monaco.languages.typescript.typescriptDefaults.setExtraLibs([
            {
              content: `declare module "@/*" { const value: any; export = value; }`,
              filePath: "node_modules/@types/custom.d.ts",
            },
            {
              content: `
                declare module "next" {
                  export type Metadata = { title?: string; description?: string; [key: string]: any; };
                  export type { Metadata };
                }
                declare module "next/font/google" {
                  export function Geist(options: { variable: string; subsets: string[] }): { variable: string; className: string; };
                  export function Geist_Mono(options: { variable: string; subsets: string[] }): { variable: string; className: string; };
                }
                declare module "next/dynamic" {
                  import { ComponentType } from "react";
                  export default function dynamic<T extends ComponentType<any>>(
                    loader: () => Promise<{ default: T }>,
                    options?: { ssr?: boolean }
                  ): T;
                }
              `,
              filePath: "node_modules/@types/next.d.ts",
            },
          ]);
        }
      });
    }
  }, [projectPath]);

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

