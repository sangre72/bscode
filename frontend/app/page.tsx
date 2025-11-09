"use client";

import ChatPanel from "@/components/ChatPanel";
import ProjectSidebar from "@/components/ProjectSidebar";
import ResourceViewer from "@/components/ResourceViewer";
import { useEffect, useRef, useState } from "react";

interface ProjectInfo {
  name: string;
  path: string;
  lastAccessed: string;
}

interface OpenFile {
  path: string;
  name: string;
  content: string;
  language: string;
  fileType: "text" | "image" | "video" | "audio" | "font" | "document" | "binary" | "diff" | "planning";
  encoding?: "text" | "base64";
  mimeType?: string;
  originalContent?: string; // diff 뷰어용
  isDiff?: boolean; // diff 뷰어 여부
}

function getLanguageFromExtension(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
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
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
  };
  return langMap[ext || ""] || "plaintext";
}

function getFileType(
  filePath: string,
  isImage?: boolean,
  isVideo?: boolean,
  isAudio?: boolean,
  isFont?: boolean,
  isDocument?: boolean,
  encoding?: string
): "text" | "image" | "video" | "audio" | "font" | "document" | "binary" {
  if (isImage) return "image";
  if (isVideo) return "video";
  if (isAudio) return "audio";
  if (isFont) return "font";
  if (isDocument) return "document";
  if (encoding === "base64") return "binary";
  return "text";
}

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    // 이미지
    ico: "image/x-icon",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
    // 동영상
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    wmv: "video/x-ms-wmv",
    flv: "video/x-flv",
    webm: "video/webm",
    mkv: "video/x-matroska",
    m4v: "video/x-m4v",
    "3gp": "video/3gpp",
    // 오디오
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    m4a: "audio/mp4",
    wma: "audio/x-ms-wma",
    // 폰트
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2",
    eot: "application/vnd.ms-fontobject",
    // 문서
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odp: "application/vnd.oasis.opendocument.presentation",
    hwp: "application/x-hwp",
    hwt: "application/x-hwt",
  };
  return mimeMap[ext || ""] || "application/octet-stream";
}

export default function Home() {
  const [currentProject, setCurrentProject] = useState<ProjectInfo | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  // localStorage에서 저장된 채팅창 너비 복원 (초기값 계산)
  const [chatPanelWidth, setChatPanelWidth] = useState(() => {
    if (typeof window !== "undefined") {
      const savedWidth = localStorage.getItem("chatPanelWidth");
      if (savedWidth) {
        const width = parseInt(savedWidth, 10);
        if (width > 0) {
          return width;
        }
      }
    }
    return 400; // 기본 너비 (px)
  });
  const [isResizingChat, setIsResizingChat] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 채팅창 너비 리사이징 핸들러
  useEffect(() => {
    if (!isResizingChat) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;

      // 최소/최대 너비 제한
      const minWidth = 300;
      const maxWidth = containerRect.width - 300; // 중앙 영역 최소 300px 보장

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setChatPanelWidth(newWidth);
        // 실시간으로 localStorage에 저장
        localStorage.setItem("chatPanelWidth", newWidth.toString());
      }
    };

    const handleMouseUp = () => {
      setIsResizingChat(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingChat]);

  // 코드 변경사항 이벤트 리스너
  useEffect(() => {
    const handleCodeChanges = async (event: Event) => {
      const customEvent = event as CustomEvent<{ codeBlocks: Array<{ filePath?: string; content: string; language?: string }> }>;
      const { codeBlocks } = customEvent.detail;
      
      if (!currentProject || !codeBlocks || codeBlocks.length === 0) return;

      // 각 코드 블록에 대해 처리
      for (const codeBlock of codeBlocks) {
        if (!codeBlock.filePath) continue;

        // 파일 경로 정규화 (상대 경로 처리)
        let filePath = codeBlock.filePath;
        // ./ 제거하고 정규화
        if (filePath.startsWith("./")) {
          filePath = filePath.substring(2);
        }
        // 앞의 / 제거
        if (filePath.startsWith("/")) {
          filePath = filePath.substring(1);
        }

        try {
          // 기존 파일 내용 읽기
          const existingFileResponse = await fetch(
            `/api/files/read?path=${encodeURIComponent(filePath)}&projectPath=${encodeURIComponent(currentProject.path)}`
          );

          let originalContent = "";
          if (existingFileResponse.ok) {
            const existingFileData = await existingFileResponse.json();
            originalContent = existingFileData.content || "";
          }

          // diff 파일로 추가
          const fileName = filePath.split("/").pop() || filePath;
          const diffFile: OpenFile = {
            path: filePath,
            name: `${fileName} (수정됨)`,
            content: codeBlock.content,
            language: codeBlock.language || getLanguageFromExtension(filePath),
            fileType: "diff",
            encoding: "text",
            originalContent: originalContent,
            isDiff: true,
          };

          // 이미 열린 파일인지 확인 (함수형 업데이트 사용)
          setOpenFiles((prev) => {
            const existingIndex = prev.findIndex(
              (f) => f.path === filePath && f.isDiff
            );

            if (existingIndex !== -1) {
              // 기존 diff 파일 업데이트
              const newFiles = prev.map((file, i) => (i === existingIndex ? diffFile : file));
              setActiveFileIndex(existingIndex);
              return newFiles;
            } else {
              // 새 diff 파일 추가
              const newFiles = [...prev, diffFile];
              setActiveFileIndex(newFiles.length - 1);
              return newFiles;
            }
          });
        } catch (error) {
          console.error(`Error processing code block for ${filePath}:`, error);
        }
      }
    };

    window.addEventListener("codeChanges", handleCodeChanges);
    return () => {
      window.removeEventListener("codeChanges", handleCodeChanges);
    };
  }, [currentProject]);

  const handleProjectChange = (project: ProjectInfo) => {
    setCurrentProject(project);
    // 프로젝트 변경 시 열린 파일 초기화 (선택사항)
    // setOpenFiles([]);
  };

  const handleFileSelect = async (filePath: string) => {
    if (!currentProject) return;

    // 이미 열린 파일인지 확인
    const existingIndex = openFiles.findIndex((f) => f.path === filePath);
    if (existingIndex !== -1) {
      setActiveFileIndex(existingIndex);
      return;
    }

    try {
      const response = await fetch(
        `/api/files/read?path=${encodeURIComponent(filePath)}&projectPath=${encodeURIComponent(currentProject.path)}`
      );
      if (response.ok) {
        const data = await response.json();
        const fileName = filePath.split("/").pop() || filePath;
        const fileType = getFileType(
          filePath,
          data.isImage,
          data.isVideo,
          data.isAudio,
          data.isFont,
          data.isDocument,
          data.encoding
        );
        const newFile: OpenFile = {
          path: filePath,
          name: fileName,
          content: data.content || "",
          language: getLanguageFromExtension(filePath),
          fileType,
          encoding: data.encoding,
          mimeType: ["image", "video", "audio", "font", "document"].includes(fileType)
            ? getMimeType(filePath)
            : undefined,
        };
        setOpenFiles((prev) => {
          const newFiles = [...prev, newFile];
          setActiveFileIndex(newFiles.length - 1);
          return newFiles;
        });
      }
    } catch (error) {
      console.error("Error loading file:", error);
    }
  };

  const handleOpenProfile = (profile: string) => {
    if (!currentProject) return;

    // 프로필 파일 생성
    const profileFile: OpenFile = {
      path: `${currentProject.path}/프로젝트 프로필`,
      name: "프로젝트 프로필",
      content: profile,
      language: "markdown",
      fileType: "text",
    };

    // 이미 열린 파일인지 확인
    const existingIndex = openFiles.findIndex(
      (f) => f.path === profileFile.path && f.name === profileFile.name
    );
    
    if (existingIndex !== -1) {
      // 이미 열려있으면 해당 탭으로 이동하고 내용 업데이트
      setOpenFiles((prev) => {
        const newFiles = [...prev];
        newFiles[existingIndex] = profileFile;
        return newFiles;
      });
      setActiveFileIndex(existingIndex);
    } else {
      // 새로 열기
      setOpenFiles((prev) => {
        const newFiles = [...prev, profileFile];
        setActiveFileIndex(newFiles.length - 1);
        return newFiles;
      });
    }
  };

  const handleFileClose = (index: number) => {
    setOpenFiles((prev) => {
      const newFiles = prev.filter((_, i) => i !== index);
      // 활성 파일 인덱스 조정
      if (index <= activeFileIndex) {
        // 닫는 파일이 현재 활성 파일이거나 그 앞에 있으면
        const newActiveIndex = Math.max(0, activeFileIndex - 1);
        setActiveFileIndex(newActiveIndex);
      }
      return newFiles;
    });
  };

  const handleFileChange = (index: number, content: string) => {
    setOpenFiles((prev) =>
      prev.map((file, i) => (i === index ? { ...file, content } : file))
    );
  };

  const handleFileDrag = (filePath: string, fileName: string) => {
    // 드래그 시작 시 시각적 피드백 (필요시)
    console.log("Dragging file:", filePath, fileName);
  };

  // 계획 선택 이벤트 리스너
  useEffect(() => {
    const handlePlanningSelected = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        planningData: { metadata?: { userRequest?: string } }; 
        filename: string;
      }>;
      const { planningData, filename } = customEvent.detail;
      
      // 계획 상세를 JSON 문자열로 변환
      const planningContent = JSON.stringify(planningData, null, 2);
      
      const planningFile: OpenFile = {
        path: `planning/${filename}`,
        name: `계획: ${planningData.metadata?.userRequest || filename}`,
        content: planningContent,
        language: "json",
        fileType: "planning",
        encoding: "text",
      };

      // 이미 열린 파일인지 확인
      setOpenFiles((prev) => {
        const existingIndex = prev.findIndex(
          (f) => f.path === planningFile.path && f.fileType === "planning"
        );

        if (existingIndex !== -1) {
          // 기존 파일 업데이트
          const newFiles = prev.map((file, i) => (i === existingIndex ? planningFile : file));
          setActiveFileIndex(existingIndex);
          return newFiles;
        } else {
          // 새 파일 추가
          const newFiles = [...prev, planningFile];
          setActiveFileIndex(newFiles.length - 1);
          return newFiles;
        }
      });
    };

    window.addEventListener("planningSelected", handlePlanningSelected);
    return () => {
      window.removeEventListener("planningSelected", handlePlanningSelected);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="flex h-screen w-screen overflow-hidden bg-gray-50 dark:bg-gray-900"
    >
      {/* 좌측: 프로젝트 섹션 */}
      <ProjectSidebar
        currentProject={currentProject?.name || null}
        onProjectChange={handleProjectChange}
        onFileSelect={handleFileSelect}
        onFileDrag={handleFileDrag}
      />

      {/* 중앙: 리소스 뷰어 (탭 + 코드 에디터) */}
      <div 
        className="flex flex-col border-x border-gray-200 dark:border-gray-700 overflow-hidden"
        style={{ 
          width: `calc(100% - ${chatPanelWidth}px - 1px)`,
          minWidth: 0 // flexbox에서 오버플로우 방지
        }}
      >
        <ResourceViewer
          openFiles={openFiles}
          activeFileIndex={activeFileIndex}
          onFileChange={handleFileChange}
          onFileClose={handleFileClose}
          onFileSelect={setActiveFileIndex}
          projectPath={currentProject?.path}
        />
      </div>

      {/* 리사이저 바 */}
      <div
        className={`relative w-1 bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 dark:hover:bg-blue-600 cursor-col-resize transition-colors flex-shrink-0 ${
          isResizingChat ? "bg-blue-500 dark:bg-blue-600" : ""
        }`}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizingChat(true);
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-0.5 h-8 bg-gray-400 dark:bg-gray-500 rounded"></div>
        </div>
      </div>

      {/* 우측: LLM 대화 섹션 */}
      <div 
        style={{ width: `${chatPanelWidth}px` }} 
        className="flex-shrink-0 overflow-hidden"
      >
        <ChatPanel 
          codeContext={openFiles[activeFileIndex]?.content || ""} 
          projectPath={currentProject?.path}
          onOpenProfile={handleOpenProfile}
        />
      </div>
    </div>
  );
}
