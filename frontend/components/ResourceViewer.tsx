"use client";

import { Download, File, FileCode, FileText, Image as ImageIcon, Music, Type, Video, X } from "lucide-react";
import { useEffect, useState } from "react";
import AudioViewer from "./viewers/audio/AudioViewer";
import DefaultViewer from "./viewers/default/DefaultViewer";
import DiffViewer from "./viewers/diff/DiffViewer";
import DocumentViewer from "./viewers/document/DocumentViewer";
import FontViewer from "./viewers/font/FontViewer";
import ImageViewer from "./viewers/image/ImageViewer";
import JavaScriptViewer from "./viewers/javascript/JavaScriptViewer";
import PlanningViewer from "./viewers/planning/PlanningViewer";
import PythonViewer from "./viewers/python/PythonViewer";
import TypeScriptViewer from "./viewers/typescript/TypeScriptViewer";
import VideoViewer from "./viewers/video/VideoViewer";

interface OpenFile {
  path: string;
  name: string;
  content: string;
  language: string;
  fileType: "text" | "image" | "video" | "audio" | "font" | "document" | "binary" | "diff" | "planning";
  encoding?: "text" | "base64";
  mimeType?: string;
  originalContent?: string;
  isDiff?: boolean;
}

interface ResourceViewerProps {
  openFiles: OpenFile[];
  activeFileIndex: number;
  onFileChange: (index: number, content: string) => void;
  onFileClose: (index: number) => void;
  onFileSelect: (index: number) => void;
  projectPath?: string;
}

function getFileIcon(
  fileType: "text" | "image" | "video" | "audio" | "font" | "document" | "binary" | "diff" | "planning"
) {
  switch (fileType) {
    case "diff":
      return FileCode;
    case "planning":
      return FileText;
    case "image":
      return ImageIcon;
    case "video":
      return Video;
    case "audio":
      return Music;
    case "font":
      return Type;
    case "document":
      return FileText;
    case "text":
      return FileCode;
    default:
      return File;
  }
}

export default function ResourceViewer({
  openFiles,
  activeFileIndex,
  onFileChange,
  onFileClose,
  onFileSelect,
  projectPath,
}: ResourceViewerProps) {
  const activeFile = openFiles[activeFileIndex];
  const [diagnostics, setDiagnostics] = useState<Array<{
    message: string;
    line: number;
    character: number;
    severity: "error" | "warning" | "info";
  }>>([]);

  // TypeScript 파일의 경우 진단 정보 가져오기
  useEffect(() => {
    const shouldFetchDiagnostics = 
      activeFile &&
      projectPath &&
      (activeFile.language === "typescript" || activeFile.language === "javascript");

    if (!shouldFetchDiagnostics) {
      return;
    }

    const fetchDiagnostics = async () => {
      if (!activeFile || !projectPath) return;
      
      try {
        const response = await fetch("/api/typescript/diagnostics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filePath: activeFile.path,
            projectPath: projectPath,
            content: activeFile.content,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setDiagnostics(data.errors || []);
        }
      } catch (error) {
        console.error("Error fetching diagnostics:", error);
      }
    };

    const timeoutId = setTimeout(fetchDiagnostics, 500); // 디바운스
    return () => clearTimeout(timeoutId);
  }, [activeFile?.path, activeFile?.content, activeFile?.language, projectPath]);

  const handleDownload = () => {
    if (!activeFile) return;
    const blob = new Blob(
      [Uint8Array.from(atob(activeFile.content), (c) => c.charCodeAt(0))],
      { type: activeFile.mimeType || "application/octet-stream" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderContent = () => {
    if (!activeFile) {
      return (
        <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-900">
          <p className="text-gray-500 dark:text-gray-400">
            파일을 선택하여 내용을 확인하세요
          </p>
        </div>
      );
    }

    switch (activeFile.fileType) {
      case "diff":
        return (
          <DiffViewer
            filePath={activeFile.path}
            originalContent={activeFile.originalContent || ""}
            modifiedContent={activeFile.content}
            language={activeFile.language}
          />
        );

      case "image":
        return (
          <ImageViewer
            content={activeFile.content}
            mimeType={activeFile.mimeType}
            fileName={activeFile.name}
          />
        );

      case "video":
        return (
          <VideoViewer
            content={activeFile.content}
            mimeType={activeFile.mimeType}
            fileName={activeFile.name}
          />
        );

      case "audio":
        return (
          <AudioViewer
            content={activeFile.content}
            mimeType={activeFile.mimeType}
            fileName={activeFile.name}
          />
        );

      case "font":
        return (
          <FontViewer
            content={activeFile.content}
            mimeType={activeFile.mimeType}
            fileName={activeFile.name}
          />
        );

      case "document":
        return (
          <DocumentViewer
            content={activeFile.content}
            mimeType={activeFile.mimeType}
            fileName={activeFile.name}
            onDownload={handleDownload}
          />
        );

      case "binary":
        return (
          <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-900">
            <div className="text-center">
              <File className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400">
                이 파일은 바이너리 형식입니다.
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 mb-4">
                미리보기를 사용할 수 없습니다.
              </p>
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 mx-auto"
              >
                <Download className="w-4 h-4" />
                다운로드
              </button>
            </div>
          </div>
        );

      case "planning":
        return <PlanningViewer content={activeFile.content} projectPath={projectPath} />;

      case "text":
      default:
        // 언어별 뷰어 선택
        if (activeFile.language === "typescript") {
          return (
            <TypeScriptViewer
              content={activeFile.content}
              filePath={activeFile.path}
              projectPath={projectPath}
              onContentChange={(value) => onFileChange(activeFileIndex, value)}
              diagnostics={diagnostics}
            />
          );
        } else if (activeFile.language === "javascript") {
          return (
            <DefaultViewer
              content={activeFile.content}
              language={activeFile.language}
              onContentChange={(value) => onFileChange(activeFileIndex, value)}
              diagnostics={diagnostics}
            />
          );
        } else if (activeFile.language === "python") {
          return (
            <PythonViewer
              content={activeFile.content}
              onContentChange={(value) => onFileChange(activeFileIndex, value)}
            />
          );
        } else {
          return (
            <DefaultViewer
              content={activeFile.content}
              language={activeFile.language}
              onContentChange={(value) => onFileChange(activeFileIndex, value)}
              diagnostics={diagnostics}
            />
          );
        }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 탭 영역 */}
      {openFiles.length > 0 && (
        <div 
          className="flex items-center gap-1 px-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 overflow-x-auto overflow-y-hidden"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgb(156 163 175) rgb(229 231 235)',
          }}
        >
          <div className="flex items-center gap-1 min-w-max">
            {openFiles.map((file, index) => {
              const Icon = getFileIcon(file.fileType);
              return (
                <div
                  key={index}
                  onClick={() => onFileSelect(index)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors border-b-2 flex-shrink-0 cursor-pointer ${
                    index === activeFileIndex
                      ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 border-blue-500"
                      : "text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-200"
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="whitespace-nowrap" title={file.path}>
                    {(() => {
                      // 같은 이름의 파일이 여러 개 열려있는지 확인
                      const sameNameCount = openFiles.filter(f => f.name === file.name).length;
                      if (sameNameCount > 1) {
                        // 디렉토리 경로 표시
                        const dirPath = file.path.substring(0, file.path.lastIndexOf("/")) || ".";
                        const dirName = dirPath.split("/").pop() || dirPath;
                        return `${file.name} (${dirName})`;
                      }
                      return file.name;
                    })()}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFileClose(index);
                    }}
                    className="ml-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded p-0.5 flex-shrink-0"
                    type="button"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 컨텐츠 영역 */}
      <div className="flex-1 overflow-hidden">{renderContent()}</div>
    </div>
  );
}

