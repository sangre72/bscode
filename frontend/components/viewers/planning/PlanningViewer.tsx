"use client";

import { Check, CheckCircle2, Code2, Copy, FileCode, FileEdit, FilePlus, Loader2, Package, Play, XCircle } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// Monaco Editor를 동적으로 로드 (SSR 방지)
const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.Editor),
  { ssr: false }
);

interface PlanningViewerProps {
  content: string;
  projectPath?: string | null;
}

// 파일 확장자로 언어 감지
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
    h: "c",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    json: "json",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    sql: "sql",
    vue: "vue",
    svelte: "svelte",
  };
  return langMap[ext || ""] || "plaintext";
}

export default function PlanningViewer({ content, projectPath }: PlanningViewerProps) {
  const [executingSteps, setExecutingSteps] = useState<Set<number>>(new Set());
  const [executedSteps, setExecutedSteps] = useState<Set<number>>(new Set());
  const [stepResults, setStepResults] = useState<Map<number, { success: boolean; message: string }>>(new Map());
  const [analysisResults, setAnalysisResults] = useState<Map<number, string>>(new Map());

  // 디버깅: codeBlocks 확인 (모든 hook은 early return 전에 호출)
  useEffect(() => {
    try {
      const parsed = JSON.parse(content);
      if (parsed?.planning) {
        const p = parsed.planning;
        const cb = p.codeBlocks || [];
        console.log("📋 PlanningViewer - 데이터 확인:", {
          hasPlanning: !!p,
          tasksCount: (p.tasks || []).length,
          codeBlocksCount: cb.length,
          codeBlocks: cb.map((c: { filePath: string; content?: string }) => ({
            filePath: c.filePath,
            contentLength: c.content?.length || 0,
            hasContent: !!(c.content && c.content.trim().length > 10),
          })),
          filesToCreate: p.plan?.filesToCreate?.length || 0,
          filesToModify: p.plan?.filesToModify?.length || 0,
        });
      }
    } catch {
      // 파싱 실패 시 무시
    }
  }, [content]);

  // 경로 확장 결과 리스너
  useEffect(() => {
    const handlePathExpandResult = (event: Event) => {
      const customEvent = event as CustomEvent<{
        found: boolean;
        expandedPath: string | null;
        targetPath: string;
      }>;
      const { found, expandedPath, targetPath } = customEvent.detail;

      if (found) {
        toast.success(`경로를 찾았습니다: ${targetPath}`, {
          description: "파일 트리에서 해당 위치를 열었습니다.",
        });
      } else if (expandedPath) {
        toast.warning(`경로를 찾을 수 없습니다: ${targetPath}`, {
          description: `가장 가까운 상위 경로를 열었습니다: ${expandedPath}`,
        });
      } else {
        toast.error(`경로를 찾을 수 없습니다: ${targetPath}`, {
          description: "해당 경로나 상위 경로가 프로젝트에 존재하지 않습니다.",
        });
      }
    };

    window.addEventListener("pathExpandResult", handlePathExpandResult);
    return () => {
      window.removeEventListener("pathExpandResult", handlePathExpandResult);
    };
  }, []);

  // 경로 클릭 핸들러
  const handlePathClick = (path: string) => {
    window.dispatchEvent(
      new CustomEvent("filePathClick", {
        detail: { path },
      })
    );
  };

  // 마크다운 텍스트 포맷팅 (간단한 버전)
  const formatMarkdownText = (text: string): React.ReactNode => {
    const parts: Array<{ type: string; content: string; language?: string }> = [];
    let lastIndex = 0;

    // 코드 블록 처리
    const codeBlockPattern = /```(\w+)?\n?([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: "text",
          content: text.substring(lastIndex, match.index),
        });
      }
      parts.push({
        type: "codeBlock",
        content: match[2],
        language: match[1] || "",
      });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({
        type: "text",
        content: text.substring(lastIndex),
      });
    }

    return (
      <div className="space-y-2">
        {parts.map((part, idx) => {
          if (part.type === "codeBlock") {
            return (
              <div key={idx} className="my-2 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                {part.language && (
                  <div className="bg-gray-200 dark:bg-gray-700 px-3 py-1 text-xs text-gray-600 dark:text-gray-400">
                    {part.language}
                  </div>
                )}
                <pre className="bg-gray-50 dark:bg-gray-800 p-3 overflow-x-auto">
                  <code className="text-xs font-mono whitespace-pre">{part.content}</code>
                </pre>
              </div>
            );
          }

          // 텍스트 처리: 마크다운 헤더, 리스트, 강조 등
          const lines = part.content.split('\n');
          return (
            <div key={idx} className="space-y-1">
              {lines.map((line, lineIdx) => {
                // 헤더 처리
                if (line.match(/^###\s+/)) {
                  return (
                    <h3 key={lineIdx} className="text-base font-semibold text-gray-900 dark:text-gray-100 mt-3 mb-2">
                      {line.replace(/^###\s+/, '')}
                    </h3>
                  );
                }
                if (line.match(/^##\s+/)) {
                  return (
                    <h2 key={lineIdx} className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-4 mb-2">
                      {line.replace(/^##\s+/, '')}
                    </h2>
                  );
                }
                if (line.match(/^#\s+/)) {
                  return (
                    <h1 key={lineIdx} className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-4 mb-2">
                      {line.replace(/^#\s+/, '')}
                    </h1>
                  );
                }
                // 리스트 처리
                if (line.match(/^[-*]\s+/)) {
                  return (
                    <div key={lineIdx} className="ml-4">
                      <span className="text-gray-700 dark:text-gray-300">• {line.replace(/^[-*]\s+/, '')}</span>
                    </div>
                  );
                }
                if (line.match(/^\d+\.\s+/)) {
                  return (
                    <div key={lineIdx} className="ml-4">
                      <span className="text-gray-700 dark:text-gray-300">{line}</span>
                    </div>
                  );
                }
                // 강조 처리
                let formattedLine = line;
                formattedLine = formattedLine.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');
                formattedLine = formattedLine.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
                formattedLine = formattedLine.replace(/`(.*?)`/g, '<code class="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>');

                if (line.trim() === '') {
                  return <br key={lineIdx} />;
                }

                return (
                  <p key={lineIdx} className="text-gray-700 dark:text-gray-300" dangerouslySetInnerHTML={{ __html: formattedLine }} />
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // 분석 결과 포맷팅 함수
  const formatAnalysisResult = (content: string): React.ReactNode => {
    // JSON 코드 블록 추출 시도
    const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      try {
        const jsonData = JSON.parse(jsonBlockMatch[1]);
        
        return (
          <div className="space-y-4">
            {/* Analysis 섹션 */}
            {jsonData.analysis && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  분석 내용
                </h4>
                <div className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                  {formatMarkdownText(jsonData.analysis)}
                </div>
              </div>
            )}

            {/* Plan 섹션 */}
            {jsonData.plan && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  계획
                </h4>
                <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 space-y-3">
                  {jsonData.plan.architecture && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        아키텍처:
                      </div>
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        {jsonData.plan.architecture}
                      </div>
                    </div>
                  )}
                  
                  {jsonData.plan.subTasks && jsonData.plan.subTasks.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        세부 작업:
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
                        {jsonData.plan.subTasks.map((task: { name?: string; description?: string }, taskIdx: number) => (
                          <li key={taskIdx}>
                            <span className="font-medium">{task.name}:</span> {task.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Questions가 있으면 표시 */}
            {jsonData.questions && jsonData.questions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  질문
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded border border-yellow-200 dark:border-yellow-800">
                  {jsonData.questions.map((q: string, qIdx: number) => (
                    <li key={qIdx}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      } catch (error) {
        // JSON 파싱 실패 시 원본 텍스트 반환
        console.error("JSON 파싱 실패:", error);
      }
    }

    // JSON 블록이 없으면 일반 텍스트로 처리
    return formatMarkdownText(content);
  };

  // planning 데이터 파싱 및 디버깅
  let planningData: {
    metadata?: { userRequest?: string };
    planning?: {
      analysis?: string;
      questions?: string[];
      isClear?: boolean;
      readyToExecute?: boolean;
      plan?: {
        actionType?: string;
        packages?: string[];
        filesToModify?: Array<{ path: string; reason?: string; changes?: string; fileExists?: boolean }>;
        filesToCreate?: Array<{ path: string; reason?: string; purpose?: string; fileExists?: boolean }>;
        executionOrder?: string[];
        serverStatus?: string;
        needsVerification?: string[];
      };
      tasks?: Array<{ type: string; description?: string; target?: string; command?: string; content?: string }>;
      codeBlocks?: Array<{ filePath: string; language?: string; content?: string }>;
    };
  } | null = null;
  
  try {
    planningData = JSON.parse(content);
  } catch {
    return (
      <div className="p-4 text-red-600 dark:text-red-400">
        계획 데이터를 파싱할 수 없습니다.
      </div>
    );
  }

  if (!planningData) {
    return (
      <div className="p-4 text-red-600 dark:text-red-400">
        계획 데이터를 파싱할 수 없습니다.
      </div>
    );
  }

  const metadata = planningData?.metadata || {};
  const planning = planningData?.planning || {};
  const tasks = planning?.tasks || [];
  const codeBlocks = planning?.codeBlocks || [];

  // 단계별 실행 핸들러
  const handleExecuteStep = async (stepIndex: number, stepDescription: string) => {
    if (!projectPath) {
      toast.error("프로젝트 경로가 없습니다.");
      return;
    }

    setExecutingSteps(new Set([...executingSteps, stepIndex]));

    try {
      // stepDescription에서 작업 유형과 대상 추출
      let result: { success: boolean; message: string } | null = null;

      // 1. 패키지 설치 단계인지 확인
      if (stepDescription.toLowerCase().includes("install") || stepDescription.toLowerCase().includes("패키지")) {
        const packages = planning.plan?.packages || [];
        if (packages.length > 0) {
          const installCommand = `npm install ${packages.join(" ")}`;
          const response = await fetch("/api/commands/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              command: installCommand,
              projectPath: projectPath,
            }),
          });
          const data = await response.json();
          result = {
            success: response.ok,
            message: data.message || data.error || "패키지 설치 완료",
          };
        }
      }
      // 2. 파일 생성 단계인지 확인
      else if (stepDescription.toLowerCase().includes("create") || stepDescription.toLowerCase().includes("생성")) {
        const filesToCreate = planning.plan?.filesToCreate || [];
        if (filesToCreate.length > 0) {
          // 해당 단계의 파일 찾기 (간단한 매칭)
          const file = filesToCreate[stepIndex] || filesToCreate[0];
          if (file) {
            // codeBlocks에서 해당 파일의 코드 찾기
            const codeBlock = codeBlocks.find((cb) => cb.filePath === file.path);
            let content = codeBlock?.content || "";
            
            // content가 비어있으면 tasks에서 찾기
            if (!content || content.trim().length < 10) {
              const task = tasks.find((t) => 
                (t.type === "create" || t.type === "modify") && 
                (t.target === file.path || t.target?.endsWith(file.path.split("/").pop() || ""))
              );
              content = task?.content || content;
            }
            
            // content가 여전히 비어있으면 경고
            if (!content || content.trim().length < 10) {
              console.warn("⚠️ 파일 생성 시 content가 비어있음:", {
                filePath: file.path,
                codeBlocks: codeBlocks.length,
                tasks: tasks.length,
                codeBlock: codeBlock,
              });
              
              // 사용자에게 확인 요청
              const shouldProceed = confirm(
                `파일 "${file.path}"을 생성하려고 하는데 내용이 없습니다.\n\n` +
                `계속 진행하시겠습니까? (빈 파일이 생성됩니다)\n\n` +
                `취소를 선택하면 LLM에게 다시 요청할 수 있습니다.`
              );
              
              if (!shouldProceed) {
                result = {
                  success: false,
                  message: "사용자가 취소했습니다. LLM에게 다시 요청해주세요.",
                };
              } else {
                // 기본 템플릿 생성
                const ext = file.path.split(".").pop()?.toLowerCase() || "";
                if (ext === "tsx" || ext === "jsx") {
                  const componentName = file.path.split("/").pop()?.replace(/\.(tsx|jsx)$/, "") || "Component";
                  content = `export default function ${componentName}() {\n  return (\n    <div>\n      <h1>${componentName}</h1>\n    </div>\n  );\n}\n`;
                } else if (ext === "ts" || ext === "js") {
                  content = `// ${file.path.split("/").pop() || "file"}\n`;
                } else {
                  content = `// ${file.path.split("/").pop() || "file"}\n`;
                }
              }
            }

            if (!result || result.success !== false) {
              console.log("📝 파일 생성 요청:", {
                filePath: file.path,
                contentLength: content.length,
                contentPreview: content.substring(0, 100),
              });

              const response = await fetch("/api/files/write", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  filePath: file.path,
                  projectPath: projectPath,
                  content: content,
                }),
              });
              const data = await response.json();
              result = {
                success: response.ok,
                message: data.message || data.error || "파일 생성 완료",
              };
            }
          }
        }
      }
      // 3. 파일 수정 단계인지 확인
      else if (stepDescription.toLowerCase().includes("modify") || stepDescription.toLowerCase().includes("수정") || stepDescription.toLowerCase().includes("update")) {
        const filesToModify = planning.plan?.filesToModify || [];
        if (filesToModify.length > 0) {
          const file = filesToModify[stepIndex] || filesToModify[0];
          if (file) {
            const codeBlock = codeBlocks.find((cb) => cb.filePath === file.path);
            const content = codeBlock?.content || "";

            const response = await fetch("/api/files/write", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                filePath: file.path,
                projectPath: projectPath,
                content: content,
              }),
            });
            const data = await response.json();
            result = {
              success: response.ok,
              message: data.message || data.error || "파일 수정 완료",
            };
          }
        }
      }
      // 4. tasks에서 해당 단계 찾기
      else if (tasks.length > stepIndex) {
        const task = tasks[stepIndex];
        if (task.type === "install" && task.command) {
          const response = await fetch("/api/commands/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              command: task.command,
              projectPath: projectPath,
            }),
          });
          const data = await response.json();
          result = {
            success: response.ok,
            message: data.message || data.error || "명령 실행 완료",
          };
        } else if ((task.type === "create" || task.type === "modify") && task.target) {
          const codeBlock = codeBlocks.find((cb) => cb.filePath === task.target);
          let content = codeBlock?.content || task.content || "";
          
          // content가 비어있으면 경고
          if (!content || content.trim().length < 10) {
            console.warn("⚠️ 작업 실행 시 content가 비어있음:", {
              taskType: task.type,
              target: task.target,
              codeBlocks: codeBlocks.length,
              codeBlock: codeBlock,
            });
            
            // 사용자에게 확인 요청
            const shouldProceed = confirm(
              `${task.type === "create" ? "파일 생성" : "파일 수정"} 작업 "${task.target}"에 내용이 없습니다.\n\n` +
              `계속 진행하시겠습니까? (빈 파일이 생성됩니다)\n\n` +
              `취소를 선택하면 LLM에게 다시 요청할 수 있습니다.`
            );
            
            if (!shouldProceed) {
              result = {
                success: false,
                message: "사용자가 취소했습니다. LLM에게 다시 요청해주세요.",
              };
            } else {
              // 기본 템플릿 생성
              const ext = task.target.split(".").pop()?.toLowerCase() || "";
              if (ext === "tsx" || ext === "jsx") {
                const componentName = task.target.split("/").pop()?.replace(/\.(tsx|jsx)$/, "") || "Component";
                content = `export default function ${componentName}() {\n  return (\n    <div>\n      <h1>${componentName}</h1>\n    </div>\n  );\n}\n`;
              } else if (ext === "ts" || ext === "js") {
                content = `// ${task.target.split("/").pop() || "file"}\n`;
              } else {
                content = `// ${task.target.split("/").pop() || "file"}\n`;
              }
            }
          }

          if (!result || result.success !== false) {
            console.log("📝 파일 작업 요청:", {
              taskType: task.type,
              filePath: task.target,
              contentLength: content.length,
              contentPreview: content.substring(0, 100),
            });

            const response = await fetch("/api/files/write", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                filePath: task.target,
                projectPath: projectPath,
                content: content,
              }),
            });
            const data = await response.json();
            result = {
              success: response.ok,
              message: data.message || data.error || `${task.type === "create" ? "생성" : "수정"} 완료`,
            };
          }
        }
      }

      // 결과가 설정되지 않은 경우
      if (!result) {
        // 정보 제공 단계인지 확인 (분석, 요약, 제시 등)
        const isInfoStep = stepDescription.match(/(분석|요약|제시|제공|확인|검토|리뷰|구조|의존성|개선)/i);
        
        if (isInfoStep) {
          // LLM에게 실제 분석 요청
          try {
            // 프로젝트 구조 정보 가져오기
            let projectContextInfo = "";
            const contextFiles: Array<{ path: string; name: string }> = [];
            
            if (projectPath) {
              try {
                const structureResponse = await fetch(`/api/projects/structure?path=${encodeURIComponent(projectPath)}`);
                if (structureResponse.ok) {
                  const structureData = await structureResponse.json();
                  
                  projectContextInfo += "\n\n## 📁 프로젝트 구조\n\n";
                  projectContextInfo += `**프로젝트 타입:** ${structureData.projectType || "Unknown"}\n\n`;
                  
                  if (structureData.treeText) {
                    projectContextInfo += "**파일 트리 구조:**\n";
                    projectContextInfo += "```\n";
                    projectContextInfo += structureData.treeText;
                    projectContextInfo += "\n```\n\n";
                  }
                  
                  if (structureData.configFiles) {
                    projectContextInfo += "**주요 설정 파일:**\n\n";
                    for (const [fileName, content] of Object.entries(structureData.configFiles)) {
                      projectContextInfo += `### ${fileName}\n`;
                      projectContextInfo += "```json\n";
                      const maxLength = 3000;
                      if (typeof content === 'string' && content.length > maxLength) {
                        projectContextInfo += content.substring(0, maxLength) + "\n... (내용 생략)";
                      } else {
                        projectContextInfo += content;
                      }
                      projectContextInfo += "\n```\n\n";
                      
                      contextFiles.push({ path: fileName, name: fileName });
                    }
                  }
                  
                  projectContextInfo += "\n**중요:** 위 프로젝트 구조와 설정 파일을 참고하여 분석을 수행하세요.\n";
                }
              } catch (error) {
                console.error("프로젝트 구조 가져오기 실패:", error);
              }
            }

            const analysisPrompt = `다음 요청에 대한 분석을 수행해주세요:\n\n` +
              `요청: ${metadata.userRequest || "프로젝트 분석"}\n` +
              `분석 항목: ${stepDescription}\n\n` +
              `프로젝트 경로: ${projectPath}\n\n` +
              `위 항목에 대해 구체적이고 상세한 분석 결과를 제공해주세요. ` +
              `프로젝트 구조, 의존성, 개선 사항 등을 포함하여 자세히 설명해주세요. ` +
              `제공된 프로젝트 구조와 설정 파일 정보를 활용하여 분석하세요. ` +
              `불필요한 질문 없이 바로 분석 결과를 제공하세요.` +
              projectContextInfo;

            const response = await fetch("/api/chat", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                message: analysisPrompt,
                history: [],
                context: "",
                contextFiles: contextFiles,
                projectType: "General",
                model: "grok-code-fast-1",
                provider: "grok",
                simpleMode: false,
              }),
            });

            if (!response.ok) {
              throw new Error("분석 요청 실패");
            }

            // 스트리밍 응답 처리
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
              throw new Error("스트리밍 응답을 읽을 수 없습니다.");
            }

            let fullContent = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.content) {
                      fullContent += data.content;
                    }
                  } catch {
                    // JSON 파싱 실패 무시
                  }
                }
              }
            }

            // 분석 결과 저장
            if (fullContent.trim().length > 0) {
              setAnalysisResults(new Map(analysisResults.set(stepIndex, fullContent)));
              result = {
                success: true,
                message: "분석이 완료되었습니다.",
              };
            } else {
              throw new Error("분석 결과가 비어있습니다.");
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "분석 요청 중 오류가 발생했습니다.";
            result = {
              success: false,
              message: errorMessage,
            };
          }
        } else {
          // 작업을 찾지 못한 경우
          result = {
            success: false,
            message: `이 단계에 대한 실행 가능한 작업을 찾을 수 없습니다. 단계 설명: "${stepDescription}"`,
          };
        }
      }

      setStepResults(new Map(stepResults.set(stepIndex, result)));
      setExecutedSteps(new Set([...executedSteps, stepIndex]));

      if (result.success) {
        toast.success(`단계 ${stepIndex + 1} 실행 완료`, {
          description: result.message,
        });
      } else {
        toast.error(`단계 ${stepIndex + 1} 실행 실패`, {
          description: result.message || "알 수 없는 오류",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류";
      setStepResults(new Map(stepResults.set(stepIndex, { success: false, message: errorMessage })));
      toast.error(`단계 ${stepIndex + 1} 실행 중 오류`, {
        description: errorMessage,
      });
    } finally {
      const newExecuting = new Set(executingSteps);
      newExecuting.delete(stepIndex);
      setExecutingSteps(newExecuting);
    }
  };

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden" style={{
      scrollbarWidth: 'thin',
      scrollbarColor: 'rgb(156 163 175) rgb(229 231 235)',
      paddingLeft: '20px',
      paddingRight: '20px',
      paddingTop: '24px',
      paddingBottom: '24px',
    }}>
      <div className="max-w-4xl mx-auto space-y-4 w-full">
        {/* 요청 내용 */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            요청 내용
          </h2>
          <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
            {metadata.userRequest || "없음"}
          </div>
        </div>

        {/* 분석 */}
        {planning.analysis && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              분석
            </h2>
            <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg whitespace-pre-wrap">
              {planning.analysis}
            </div>
          </div>
        )}

        {/* 질문 */}
        {planning.questions && planning.questions.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              질문
            </h2>
            <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg space-y-1.5">
              {planning.questions.map((q: string, idx: number) => (
                <li key={idx}>{q}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 계획 */}
        {planning.plan && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              작업 계획
            </h2>
            <div className="space-y-3">
              {/* 작업 유형 */}
              {planning.plan.actionType && (
                <div>
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    작업 유형
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded-lg">
                    <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                      {planning.plan.actionType}
                    </span>
                    <span className="text-xs text-gray-600 dark:text-gray-400 ml-2">
                      {planning.plan.actionType === "CREATE" && "(생성)"}
                      {planning.plan.actionType === "MODIFY" && "(수정)"}
                      {planning.plan.actionType === "DELETE" && "(삭제)"}
                      {planning.plan.actionType === "ADD" && "(추가)"}
                      {planning.plan.actionType === "REPLACE" && "(교체)"}
                    </span>
                  </div>
                </div>
              )}

              {/* 확인 필요 사항 */}
              {planning.plan.needsVerification && planning.plan.needsVerification.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    확인 필요 사항
                  </h3>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg">
                    <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                      {planning.plan.needsVerification.map((item: string, idx: number) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* 서버 상태 */}
              {planning.plan.serverStatus && (
                <div>
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    서버 상태
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded-lg">
                    <span className={`text-sm font-medium ${
                      planning.plan.serverStatus === "running" 
                        ? "text-green-600 dark:text-green-400" 
                        : planning.plan.serverStatus === "stopped"
                        ? "text-red-600 dark:text-red-400"
                        : "text-yellow-600 dark:text-yellow-400"
                    }`}>
                      {planning.plan.serverStatus === "running" && "✓ 실행 중"}
                      {planning.plan.serverStatus === "stopped" && "✗ 중지됨"}
                      {planning.plan.serverStatus === "unknown" && "? 확인 필요"}
                    </span>
                  </div>
                </div>
              )}
              {/* 패키지 */}
              {planning.plan.packages && planning.plan.packages.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    설치할 패키지 ({planning.plan.packages.length}개)
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                      {planning.plan.packages.map((pkg: string, idx: number) => (
                        <li key={idx}>
                          <code className="text-blue-600 dark:text-blue-400 font-mono">{pkg}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

                    {/* 수정할 파일 */}
                    {planning.plan.filesToModify && planning.plan.filesToModify.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                          수정할 파일 ({planning.plan.filesToModify.length}개)
                        </h3>
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                          <ul className="space-y-2">
                            {planning.plan.filesToModify.map((file, idx: number) => {
                              const fileName = file.path.split("/").pop() || file.path;
                              const dirPath = file.path.substring(0, file.path.lastIndexOf("/")) || ".";
                              return (
                                <li key={idx} className="text-sm border-b border-gray-200 dark:border-gray-700 pb-2 last:border-0">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <div className="text-gray-900 dark:text-gray-100 font-semibold">
                                        파일명: <code className="text-blue-600 dark:text-blue-400 font-mono">{fileName}</code>
                                      </div>
                                      {file.fileExists !== undefined && (
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                          file.fileExists === true
                                            ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                                            : file.fileExists === false
                                            ? "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                                            : "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400"
                                        }`}>
                                          {file.fileExists === true && "✓ 존재"}
                                          {file.fileExists === false && "✗ 없음"}
                                          {typeof file.fileExists === "string" && file.fileExists === "unknown" && "? 확인 필요"}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-600 dark:text-gray-400">
                                      경로: <code 
                                        onClick={() => handlePathClick(file.path)}
                                        className="text-blue-600 dark:text-blue-400 font-mono cursor-pointer hover:text-blue-800 dark:hover:text-blue-300 hover:underline bg-blue-50 dark:bg-blue-900/20 px-1 rounded"
                                        title="클릭하여 파일 트리에서 열기"
                                      >{file.path}</code>
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-500">
                                      디렉토리: <code 
                                        onClick={() => handlePathClick(dirPath)}
                                        className="text-blue-600 dark:text-blue-400 font-mono cursor-pointer hover:text-blue-800 dark:hover:text-blue-300 hover:underline bg-blue-50 dark:bg-blue-900/20 px-1 rounded"
                                        title="클릭하여 파일 트리에서 열기"
                                      >{dirPath}</code>
                                    </div>
                                    {file.reason && (
                                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                        이유: {file.reason}
                                      </div>
                                    )}
                                    {file.changes && (
                                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 italic">
                                        변경 내용: {file.changes}
                                      </div>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    )}

                    {/* 생성할 파일 */}
                    {planning.plan.filesToCreate && planning.plan.filesToCreate.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                          생성할 파일 ({planning.plan.filesToCreate.length}개)
                        </h3>
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                          <ul className="space-y-2">
                            {planning.plan.filesToCreate.map((file, idx: number) => {
                              const fileName = file.path.split("/").pop() || file.path;
                              const dirPath = file.path.substring(0, file.path.lastIndexOf("/")) || ".";
                              return (
                                <li key={idx} className="text-sm border-b border-gray-200 dark:border-gray-700 pb-2 last:border-0">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <div className="text-gray-900 dark:text-gray-100 font-semibold">
                                        파일명: <code className="text-blue-600 dark:text-blue-400 font-mono">{fileName}</code>
                                      </div>
                                      {file.fileExists !== undefined && (
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                          file.fileExists === false
                                            ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                                            : "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400"
                                        }`}>
                                          {file.fileExists === false && "✓ 새로 생성"}
                                          {typeof file.fileExists === "string" && file.fileExists === "unknown" && "? 확인 필요"}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-600 dark:text-gray-400">
                                      경로: <code 
                                        onClick={() => handlePathClick(file.path)}
                                        className="text-blue-600 dark:text-blue-400 font-mono cursor-pointer hover:text-blue-800 dark:hover:text-blue-300 hover:underline bg-blue-50 dark:bg-blue-900/20 px-1 rounded"
                                        title="클릭하여 파일 트리에서 열기"
                                      >{file.path}</code>
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-500">
                                      디렉토리: <code 
                                        onClick={() => handlePathClick(dirPath)}
                                        className="text-blue-600 dark:text-blue-400 font-mono cursor-pointer hover:text-blue-800 dark:hover:text-blue-300 hover:underline bg-blue-50 dark:bg-blue-900/20 px-1 rounded"
                                        title="클릭하여 파일 트리에서 열기"
                                      >{dirPath}</code>
                                    </div>
                                    {file.purpose && (
                                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                        목적: {file.purpose}
                                      </div>
                                    )}
                                    {file.reason && (
                                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 italic">
                                        이유: {file.reason}
                                      </div>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    )}

              {/* 실행 순서 */}
              {planning.plan.executionOrder && planning.plan.executionOrder.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    실행 순서 ({planning.plan.executionOrder.length}단계)
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <ol className="space-y-2">
                      {planning.plan.executionOrder.map((step: string, idx: number) => {
                        const isExecuting = executingSteps.has(idx);
                        const isExecuted = executedSteps.has(idx);
                        const result = stepResults.get(idx);
                        return (
                          <li key={idx} className="flex items-start gap-3 text-sm">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-gray-700 dark:text-gray-300">{step}</div>
                              {result && (
                                <div className={`mt-1 text-xs flex items-center gap-1 ${
                                  result.success 
                                    ? "text-green-600 dark:text-green-400" 
                                    : "text-red-600 dark:text-red-400"
                                }`}>
                                  {result.success ? (
                                    <CheckCircle2 className="w-3 h-3" />
                                  ) : (
                                    <XCircle className="w-3 h-3" />
                                  )}
                                  <span>{result.message}</span>
                                </div>
                              )}
                              {/* 분석 결과 표시 - 제목 아래로 */}
                              {analysisResults.has(idx) && (
                                <div className="mt-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                  <div className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">
                                    분석 결과:
                                  </div>
                                  <div className="text-sm text-gray-700 dark:text-gray-300">
                                    {formatAnalysisResult(analysisResults.get(idx) || "")}
                                  </div>
                                </div>
                              )}
                            </div>
                            {projectPath && (
                              <button
                                onClick={() => handleExecuteStep(idx, step)}
                                disabled={isExecuting || isExecuted}
                                className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                                  isExecuted
                                    ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 cursor-not-allowed"
                                    : isExecuting
                                    ? "bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 cursor-not-allowed"
                                    : "bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600"
                                }`}
                                title={isExecuted ? "이미 실행됨" : isExecuting ? "실행 중..." : "이 단계 실행"}
                              >
                                {isExecuting ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>실행 중...</span>
                                  </>
                                ) : isExecuted ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>완료</span>
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-3 h-3" />
                                    <span>실행</span>
                                  </>
                                )}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
              )}

              {/* 작업 목록 (Tasks) */}
              {tasks.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    작업 목록 ({tasks.length}개)
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg space-y-2">
                    {tasks.map((task, idx: number) => (
                      <div key={idx} className="border-b border-gray-200 dark:border-gray-700 pb-2 last:border-0 last:pb-0">
                        <div className="flex items-start gap-2">
                          <div className="flex-shrink-0 mt-0.5">
                            {task.type === "install" && <Package className="w-4 h-4 text-blue-500" />}
                            {task.type === "create" && <FilePlus className="w-4 h-4 text-green-500" />}
                            {task.type === "modify" && <FileEdit className="w-4 h-4 text-yellow-500" />}
                            {task.type === "command" && <Code2 className="w-4 h-4 text-purple-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {task.type === "install" && "패키지 설치"}
                              {task.type === "create" && "파일 생성"}
                              {task.type === "modify" && "파일 수정"}
                              {task.type === "command" && "명령 실행"}
                              {task.type === "info" && "정보"}
                            </div>
                            {task.description && (
                              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                {task.description}
                              </div>
                            )}
                            {task.target && (
                              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                대상: <code className="text-blue-600 dark:text-blue-400 font-mono">{task.target}</code>
                              </div>
                            )}
                            {task.command && (
                              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                명령: <code className="text-purple-600 dark:text-purple-400 font-mono">{task.command}</code>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 코드 블록 (Code Blocks) */}
              {codeBlocks.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    소스 코드 ({codeBlocks.length}개)
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg space-y-3">
                    {codeBlocks.map((codeBlock, idx: number) => {
                      return (
                        <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                          <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileCode className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                              <div className="text-xs">
                                <code 
                                  onClick={() => handlePathClick(codeBlock.filePath)}
                                  className="text-blue-600 dark:text-blue-400 font-mono cursor-pointer hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
                                  title="클릭하여 파일 트리에서 열기"
                                >
                                  {codeBlock.filePath}
                                </code>
                              </div>
                              {codeBlock.language && (
                                <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-gray-600 dark:text-gray-400">
                                  {codeBlock.language}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="relative">
                            <div className="bg-white dark:bg-gray-900" style={{
                              maxHeight: '500px',
                              minHeight: '200px',
                            }}>
                              <MonacoEditor
                                height="500px"
                                language={codeBlock.language || getLanguageFromExtension(codeBlock.filePath)}
                                value={codeBlock.content || "(코드 없음)"}
                                theme="vs-dark"
                                options={{
                                  readOnly: true,
                                  fontSize: 12,
                                  minimap: { enabled: false },
                                  scrollBeyondLastLine: false,
                                  wordWrap: "on",
                                  automaticLayout: true,
                                  lineNumbers: "on",
                                  lineNumbersMinChars: 3,
                                  scrollbar: {
                                    vertical: "auto",
                                    horizontal: "auto",
                                  },
                                }}
                              />
                            </div>
                            <div className="absolute top-2 right-2 flex gap-2 z-10">
                              <button
                                onClick={async () => {
                                  if (codeBlock.content && projectPath) {
                                    try {
                                      // 파일 생성/수정 API 호출 (라인 넘버 제외한 순수 코드)
                                      const res = await fetch('/api/files/write', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          projectPath,
                                          filePath: codeBlock.filePath,
                                          content: codeBlock.content, // Monaco Editor의 value는 순수 코드만 포함
                                        }),
                                      });
                                      
                                      const data = await res.json();
                                      
                                      if (data.success) {
                                        toast.success(`파일이 생성/수정되었습니다: ${codeBlock.filePath}`);
                                        // 파일 트리 새로고침 이벤트 발생
                                        window.dispatchEvent(new CustomEvent('fileCreated', { 
                                          detail: { path: codeBlock.filePath } 
                                        }));
                                      } else {
                                        toast.error(`파일 생성/수정 실패: ${data.error || '알 수 없는 오류'}`);
                                      }
                                    } catch (err) {
                                      toast.error(`파일 생성/수정 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
                                    }
                                  } else {
                                    toast.error('코드 내용 또는 프로젝트 경로가 없습니다.');
                                  }
                                }}
                                className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center gap-1.5 shadow-md"
                                title="파일에 코드 적용 (라인 넘버 제외)"
                              >
                                <Check className="w-3.5 h-3.5" />
                                적용
                              </button>
                              <button
                                onClick={async () => {
                                  if (codeBlock.content) {
                                    try {
                                      // Monaco Editor의 value는 이미 순수 코드만 포함하므로 그대로 복사
                                      await navigator.clipboard.writeText(codeBlock.content);
                                      toast.success('코드가 클립보드에 복사되었습니다.');
                                    } catch (err) {
                                      toast.error(`복사 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
                                    }
                                  } else {
                                    toast.error('복사할 코드가 없습니다.');
                                  }
                                }}
                                className="px-3 py-1.5 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors flex items-center gap-1.5 shadow-md"
                                title="코드 복사 (라인 넘버 제외)"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                복사
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 상태 */}
        <div className="flex items-center gap-4 text-sm pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className={`flex items-center gap-2 ${planning.isClear ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400"}`}>
            {planning.isClear ? (
              <>
                <span className="text-lg">✓</span>
                <span>명확함</span>
              </>
            ) : (
              <>
                <span className="text-lg">?</span>
                <span>명확하지 않음</span>
              </>
            )}
          </div>
          {planning.readyToExecute && (
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <span className="text-lg">▶</span>
              <span>실행 준비 완료</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

