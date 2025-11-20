"use client";

import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, GripVertical, Plus, FolderPlus, Server, ExternalLink, Play, Square, Loader2, Terminal as TerminalIcon, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import FileTree, { FileTreeRef } from "./FileTree";
import PlanningReview from "./PlanningReview";

interface ProjectInfo {
  name: string;
  path: string;
  lastAccessed: string;
}

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

interface ProjectSidebarProps {
  currentProject: string | null;
  onProjectChange: (project: ProjectInfo) => void;
  onFileSelect?: (filePath: string) => void;
  onFileDrag?: (filePath: string, fileName: string) => void;
}

export default function ProjectSidebar({
  currentProject,
  onProjectChange,
  onFileSelect,
  onFileDrag,
}: ProjectSidebarProps) {
  const [recentProjects, setRecentProjects] = useState<ProjectInfo[]>([]);
  const [currentProjectInfo, setCurrentProjectInfo] = useState<ProjectInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showFileTree, setShowFileTree] = useState(false);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [serverInfo, setServerInfo] = useState<{ command: string; port: number; url: string } | null>(null);
  const [isServerRunning, setIsServerRunning] = useState(false);
  const [isServerLoading, setIsServerLoading] = useState(false);
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const [showServerLogs, setShowServerLogs] = useState(false);
  const [topSectionHeight, setTopSectionHeight] = useState(300); // 기본 높이 (px)
  const [isResizing, setIsResizing] = useState(false);
  // localStorage에서 저장된 탭 상태 불러오기
  const [showPlanningReview, setShowPlanningReview] = useState(() => {
    if (typeof window !== "undefined") {
      const savedTab = localStorage.getItem("projectSidebarActiveTab");
      return savedTab === "planning";
    }
    return false;
  });
  const sidebarRef = useRef<HTMLDivElement>(null);
  const topSectionRef = useRef<HTMLDivElement>(null);
  const fileTreeRef = useRef<FileTreeRef>(null);

  // 프로젝트 목록 로드 및 저장된 높이 복원
  useEffect(() => {
    loadProjects();
    loadCurrentProject();
    // localStorage에서 저장된 높이 불러오기
    const savedHeight = localStorage.getItem("projectSidebarTopHeight");
    if (savedHeight) {
      const height = parseInt(savedHeight, 10);
      if (height > 0) {
        setTopSectionHeight(height);
      }
    }
  }, []);

  // currentProject prop이 변경될 때 currentProjectInfo 업데이트
  useEffect(() => {
    if (currentProject) {
      // recentProjects에서 현재 프로젝트 찾기
      const foundProject = recentProjects.find(p => p.name === currentProject);
      if (foundProject) {
        setCurrentProjectInfo(foundProject);
        // 서버 정보 로드
        loadServerInfo(foundProject.path);
      } else if (recentProjects.length === 0) {
        // recentProjects가 아직 로드되지 않았으면, 프로젝트 목록을 다시 로드
        loadProjects();
      }
    } else {
      // currentProject가 null이면 currentProjectInfo도 null로 설정
      setCurrentProjectInfo(null);
      setServerInfo(null);
    }
  }, [currentProject, recentProjects]);

  // 서버 상태를 주기적으로 확인 (10초마다)
  useEffect(() => {
    if (!serverInfo?.port) return;

    const intervalId = setInterval(() => {
      checkServerStatus(serverInfo.port);
    }, 10000); // 10초마다 확인

    return () => clearInterval(intervalId);
  }, [serverInfo?.port]);

  // 탭 변경 시 localStorage에 저장
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("projectSidebarActiveTab", showPlanningReview ? "planning" : "projects");
    }
  }, [showPlanningReview]);

  // 리사이징 핸들러
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarRef.current || !topSectionRef.current) return;

      const sidebarRect = sidebarRef.current.getBoundingClientRect();
      const newHeight = e.clientY - sidebarRect.top;

      // 최소/최대 높이 제한
      const minHeight = 150;
      const maxHeight = sidebarRect.height - 100; // 하단 영역 최소 100px 보장

      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setTopSectionHeight(newHeight);
        // 실시간으로 localStorage에 저장
        localStorage.setItem("projectSidebarTopHeight", newHeight.toString());
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const loadProjects = async () => {
    try {
      const response = await fetch("/api/projects");
      if (response.ok) {
        const data = await response.json();
        setRecentProjects(data.projects || []);
      }
    } catch (error) {
      console.error("Error loading projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCurrentProject = async () => {
    try {
      const response = await fetch("/api/projects/current");
      if (response.ok) {
        const data = await response.json();
        if (data.project) {
          setCurrentProjectInfo(data.project);
          onProjectChange(data.project);
          // 서버 정보 로드
          loadServerInfo(data.project.path);
        }
      }
    } catch (error) {
      console.error("Error loading current project:", error);
    }
  };

  const loadFileTree = async (projectPath: string) => {
    setIsLoadingTree(true);
    try {
      const response = await fetch(`/api/files/tree?path=${encodeURIComponent(projectPath)}`);
      if (response.ok) {
        const data = await response.json();
        setFileTree(data.tree || []);
      }
    } catch (error) {
      console.error("Error loading file tree:", error);
    } finally {
      setIsLoadingTree(false);
    }
  };

  const loadServerInfo = async (projectPath: string) => {
    try {
      const response = await fetch(`/api/projects/structure?path=${encodeURIComponent(projectPath)}`);
      if (response.ok) {
        const data = await response.json();
        setServerInfo(data.serverInfo || null);

        // 서버 상태 확인
        if (data.serverInfo?.port) {
          checkServerStatus(data.serverInfo.port);
        }
      }
    } catch (error) {
      console.error("Error loading server info:", error);
      setServerInfo(null);
    }
  };

  const checkServerStatus = async (port: number) => {
    try {
      const response = await fetch("/api/dev-server/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port }),
      });

      if (response.ok) {
        const data = await response.json();
        setIsServerRunning(data.running);
      }
    } catch (error) {
      console.error("Error checking server status:", error);
      setIsServerRunning(false);
    }
  };

  const handleStartServer = async () => {
    if (!currentProjectInfo) return;

    setIsServerLoading(true);
    try {
      const response = await fetch("/api/dev-server/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath: currentProjectInfo.path }),
      });

      if (response.ok) {
        setIsServerRunning(true);
        // 2초 후 상태 재확인
        setTimeout(() => {
          if (serverInfo?.port) {
            checkServerStatus(serverInfo.port);
          }
        }, 2000);
      } else {
        const error = await response.json();
        alert(`서버 시작 실패: ${error.error || "알 수 없는 오류"}`);
      }
    } catch (error) {
      console.error("Error starting server:", error);
      alert("서버를 시작할 수 없습니다.");
    } finally {
      setIsServerLoading(false);
    }
  };

  const handleStopServer = async () => {
    if (!currentProjectInfo || !serverInfo?.port) return;

    setIsServerLoading(true);
    try {
      const response = await fetch("/api/dev-server/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath: currentProjectInfo.path,
          port: serverInfo.port,
        }),
      });

      if (response.ok) {
        setIsServerRunning(false);
      } else {
        const error = await response.json();
        alert(`서버 중지 실패: ${error.error || "알 수 없는 오류"}`);
      }
    } catch (error) {
      console.error("Error stopping server:", error);
      alert("서버를 중지할 수 없습니다.");
    } finally {
      setIsServerLoading(false);
    }
  };

  const fetchServerLogs = async () => {
    if (!currentProjectInfo) return;

    try {
      const response = await fetch(
        `/api/dev-server/logs?projectPath=${encodeURIComponent(currentProjectInfo.path)}`
      );

      if (response.ok) {
        const data = await response.json();
        setServerLogs(data.logs || []);
      }
    } catch (error) {
      console.error("Error fetching server logs:", error);
    }
  };

  const clearServerLogs = async () => {
    if (!currentProjectInfo) return;

    try {
      const response = await fetch("/api/dev-server/logs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath: currentProjectInfo.path }),
      });

      if (response.ok) {
        setServerLogs([]);
      }
    } catch (error) {
      console.error("Error clearing server logs:", error);
    }
  };

  // 서버 로그 주기적으로 가져오기 (서버 실행 중일 때만)
  useEffect(() => {
    if (!isServerRunning || !showServerLogs) return;

    fetchServerLogs();
    const intervalId = setInterval(fetchServerLogs, 2000); // 2초마다 로그 갱신

    return () => clearInterval(intervalId);
  }, [isServerRunning, showServerLogs, currentProjectInfo?.path]);

  const handleProjectClick = async (project: ProjectInfo) => {
    setCurrentProjectInfo(project);
    onProjectChange(project);

    // 서버 정보 로드
    loadServerInfo(project.path);

    // 파일 트리 로드
    if (showFileTree) {
      loadFileTree(project.path);
    }

    // 접근 시간 업데이트
    try {
      await fetch("/api/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: project.name }),
      });

      // 현재 프로젝트로 설정
      await fetch("/api/projects/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: project.name,
          projectPath: project.path,
        }),
      });

      // 목록 새로고침
      loadProjects();
    } catch (error) {
      console.error("Error updating project:", error);
    }
  };

  const handleToggleFileTree = () => {
    const newState = !showFileTree;
    setShowFileTree(newState);
    if (newState && currentProjectInfo) {
      loadFileTree(currentProjectInfo.path);
    }
  };

  const handleAddProject = async () => {
    const projectPath = prompt("프로젝트 디렉토리 경로를 입력하세요:");
    if (!projectPath) return;

    // 경로에서 마지막 디렉토리명 추출
    const defaultName = projectPath.split(/[/\\]/).filter(Boolean).pop() || "새 프로젝트";
    const projectName = prompt("프로젝트 이름을 입력하세요:", defaultName);
    if (!projectName) return;

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          projectPath: projectPath,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        handleProjectClick(data.project);
      }
    } catch (error) {
      console.error("Error adding project:", error);
      alert("프로젝트 추가에 실패했습니다.");
    }
  };

  const handleOpenProject = async () => {
    try {
      // File System Access API 사용 (최신 브라우저)
      if ('showDirectoryPicker' in window) {
        const directoryHandle = await (window as any).showDirectoryPicker();
        const directoryName = directoryHandle.name;
        
        // 브라우저 보안상 전체 경로를 얻을 수 없으므로, 
        // 디렉토리명을 기본값으로 사용하고 사용자에게 전체 경로 입력 요청
        const projectPath = prompt(
          `선택한 디렉토리: ${directoryName}\n\n프로젝트의 전체 경로를 입력하세요:`,
          ""
        );
        
        if (!projectPath) return;

        // 경로에서 마지막 디렉토리명 추출
        const defaultName = projectPath.split(/[/\\]/).filter(Boolean).pop() || directoryName || "새 프로젝트";
        const projectName = prompt("프로젝트 이름을 입력하세요:", defaultName);
        if (!projectName) return;

        try {
          const response = await fetch("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: projectName,
              projectPath: projectPath,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            handleProjectClick(data.project);
          } else {
            const errorData = await response.json();
            alert(errorData.error || "프로젝트 추가에 실패했습니다.");
          }
        } catch (error) {
          console.error("Error adding project:", error);
          alert("프로젝트 추가에 실패했습니다.");
        }
      } else {
        // File System Access API를 지원하지 않는 경우 기존 방식 사용
        handleAddProject();
      }
    } catch (error: any) {
      // 사용자가 취소한 경우
      if (error.name === 'AbortError' || error.name === 'NotAllowedError') {
        return;
      }
      console.error("Error opening project:", error);
      // File System Access API가 실패하면 기존 방식으로 fallback
      handleAddProject();
    }
  };

  // 경로 클릭 이벤트 리스너
  useEffect(() => {
    const handlePathClick = async (event: Event) => {
      const customEvent = event as CustomEvent<{ path: string }>;
      const { path: targetPath } = customEvent.detail;

      if (!currentProjectInfo || !fileTreeRef.current) {
        return;
      }

      // 파일 트리가 닫혀있으면 열기
      if (!showFileTree) {
        setShowFileTree(true);
        await loadFileTree(currentProjectInfo.path);
        // 트리 로드 후 약간의 지연을 두고 경로 확장
        setTimeout(() => {
          if (fileTreeRef.current) {
            const result = fileTreeRef.current.expandPath(targetPath);
            // Sonner 알림은 이벤트를 발생시킨 컴포넌트에서 처리
            window.dispatchEvent(
              new CustomEvent("pathExpandResult", {
                detail: { ...result, targetPath },
              })
            );
          }
        }, 100);
      } else {
        const result = fileTreeRef.current.expandPath(targetPath);
        window.dispatchEvent(
          new CustomEvent("pathExpandResult", {
            detail: { ...result, targetPath },
          })
        );
      }
    };

    window.addEventListener("filePathClick", handlePathClick);
    return () => {
      window.removeEventListener("filePathClick", handlePathClick);
    };
  }, [currentProjectInfo, showFileTree]);

  return (
    <div
      ref={sidebarRef}
      className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700"
    >
      {/* 좌측 상단: 현재 진행중인 프로젝트 */}
      <div
        ref={topSectionRef}
        className="overflow-y-auto border-b border-gray-200 dark:border-gray-700"
        style={{ height: `${topSectionHeight}px`, minHeight: "150px" }}
      >
        <div className="p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-blue-500" />
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              현재 프로젝트
            </h2>
          </div>
          <button
            onClick={handleOpenProject}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="프로젝트 열기"
          >
            <FolderPlus className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
        {currentProjectInfo ? (
          <>
            {/* 개발 서버 정보 - 제목 바로 밑에 표시 */}
            {serverInfo && (
              <div className="mb-3 p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">개발 서버</span>
                    {isServerRunning && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                        실행 중
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isServerRunning ? (
                      <button
                        onClick={handleStopServer}
                        disabled={isServerLoading}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="서버 중지"
                      >
                        {isServerLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Square className="w-3 h-3" />
                        )}
                        중지
                      </button>
                    ) : (
                      <button
                        onClick={handleStartServer}
                        disabled={isServerLoading}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="서버 시작"
                      >
                        {isServerLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        시작
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                    <span className="font-mono text-[10px] bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                      {serverInfo.command}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={serverInfo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                      title="서버 열기"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span className="font-mono">{serverInfo.url}</span>
                    </a>
                    <span className="text-gray-500 dark:text-gray-500">(포트 {serverInfo.port})</span>
                  </div>
                </div>
                {/* 서버 로그 토글 버튼 */}
                <div className="mt-2">
                  <button
                    onClick={() => {
                      setShowServerLogs(!showServerLogs);
                      if (!showServerLogs) {
                        fetchServerLogs();
                      }
                    }}
                    className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <TerminalIcon className="w-3 h-3" />
                    {showServerLogs ? "로그 숨기기" : "로그 보기"}
                  </button>
                </div>
                {/* 서버 로그 표시 */}
                {showServerLogs && (
                  <div className="mt-2 bg-black dark:bg-gray-950 rounded border border-gray-300 dark:border-gray-600 overflow-hidden">
                    <div className="flex items-center justify-between px-2 py-1 bg-gray-800 dark:bg-gray-900 border-b border-gray-700">
                      <span className="text-xs font-medium text-gray-300">서버 로그</span>
                      <button
                        onClick={clearServerLogs}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                        title="로그 지우기"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="p-2 h-40 overflow-y-auto font-mono text-[10px] text-green-400 whitespace-pre-wrap">
                      {serverLogs.length === 0 ? (
                        <div className="text-gray-500">로그가 없습니다</div>
                      ) : (
                        serverLogs.map((log, index) => (
                          <div key={index} className="leading-relaxed">
                            {log}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={handleToggleFileTree}
              className="w-full flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            >
              {showFileTree ? (
                <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              )}
              <FolderOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <div className="flex-1 min-w-0 text-left">
                <div className="text-sm font-medium text-blue-700 dark:text-blue-300 truncate">
                  {currentProjectInfo.name}
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-400 truncate">
                  {currentProjectInfo.path}
                </div>
              </div>
            </button>
            {/* 파일 트리 */}
            {showFileTree && (
              <div 
                className="mt-2 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                style={{ 
                  maxHeight: `calc(${topSectionHeight}px - 200px)`,
                  minHeight: "100px"
                }}
              >
                {isLoadingTree ? (
                  <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
                    로딩 중...
                  </div>
                ) : (
                  <FileTree
                    ref={fileTreeRef}
                    tree={fileTree}
                    projectPath={currentProjectInfo.path}
                    onFileSelect={onFileSelect || (() => {})}
                    onFileDrag={onFileDrag || (() => {})}
                  />
                )}
              </div>
            )}
          </>
        ) : (
          <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
            프로젝트를 선택하세요
          </div>
        )}
        </div>
      </div>

      {/* 리사이저 */}
      <div
        className="relative h-1 bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 dark:hover:bg-blue-600 cursor-row-resize transition-colors group flex items-center justify-center"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
        }}
      >
        <GripVertical className="w-3 h-3 text-gray-400 dark:text-gray-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 opacity-50 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* 좌측 하단: 계획 검토 및 최근 프로젝트 목록 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 탭 전환 */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowPlanningReview(true)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              showPlanningReview
                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-b-2 border-blue-500"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <div className="flex items-center justify-center gap-1">
              <FileText className="w-3 h-3" />
              <span>계획 검토</span>
            </div>
          </button>
          <button
            onClick={() => setShowPlanningReview(false)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              !showPlanningReview
                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-b-2 border-blue-500"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <div className="flex items-center justify-center gap-1">
              <Folder className="w-3 h-3" />
              <span>최근 프로젝트</span>
            </div>
          </button>
        </div>
        
        {/* 탭 내용 */}
        {showPlanningReview ? (
          <PlanningReview 
            projectPath={currentProjectInfo?.path || null}
            onPlanningSelect={(planningData) => {
              // 계획 선택 시 처리 (필요시)
              console.log("Planning selected:", planningData);
            }}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                최근 프로젝트
              </h3>
              <button
                onClick={handleAddProject}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="프로젝트 추가"
              >
                <Plus className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            {isLoading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">로딩 중...</div>
            ) : recentProjects.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                프로젝트가 없습니다. + 버튼을 클릭하여 추가하세요.
              </div>
            ) : (
              <div className="space-y-1">
                {recentProjects.map((project) => (
                  <button
                    key={project.name}
                    onClick={() => handleProjectClick(project)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                      currentProjectInfo?.name === project.name
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    <Folder className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{project.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

