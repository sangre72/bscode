"use client";

import {
  TaskType,
  WorkflowContext,
  WorkflowStage,
  createWorkflowContext
} from "@/utils/workflowEngine";
import { Check, ChevronDown, ChevronRight, Loader2, Play, X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * 파일 경로 없이 코드 블록 추출
 */
function extractCodeBlocksWithoutPath(content: string): Array<{ language: string; content: string }> {
  const blocks: Array<{ language: string; content: string }> = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || "text";
    const codeContent = match[2]?.trim() || "";
    
    // 실제 코드인지 확인 (너무 짧거나 설명만 있는 경우 제외)
    if (codeContent.length > 20 && !codeContent.startsWith("//") && !codeContent.startsWith("#")) {
      blocks.push({
        language,
        content: codeContent,
      });
    }
  }
  
  return blocks;
}

/**
 * 요청에서 파일명 패턴 추출 (현재 사용되지 않음)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function extractFileNamesFromRequest(request: string): string[] {
  const patterns: string[] = [];
  
  // 코드 블록에서 파일 경로 추출
  const codeBlockRegex = /```\w*:?([^\n]+)?\n[\s\S]*?```/g;
  let match;
  while ((match = codeBlockRegex.exec(request)) !== null) {
    const filePath = match[1]?.trim();
    if (filePath) {
      const fileName = filePath.split(/[/\\]/).pop();
      if (fileName) {
        patterns.push(fileName);
        // 확장자 제거한 이름도 추가
        const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
        if (nameWithoutExt !== fileName) {
          patterns.push(nameWithoutExt);
        }
      }
    }
  }
  
  // 일반적인 파일명 패턴 추출
  const fileNamePatterns = [
    /(?:파일|file|생성|create|수정|modify).*?([A-Z][a-zA-Z0-9]+\.(ts|tsx|js|jsx|css|json))/gi,
    /([A-Z][a-zA-Z0-9]+(?:Editor|Component|Page|View|Container))\.(ts|tsx|js|jsx)/gi,
  ];
  
  for (const pattern of fileNamePatterns) {
    let match;
    while ((match = pattern.exec(request)) !== null) {
      const fileName = match[1];
      if (fileName && !patterns.includes(fileName)) {
        patterns.push(fileName);
      }
    }
  }
  
  return patterns;
}

interface TaskResult {
  success: boolean;
  message: string;
  data?: unknown;
}

interface WorkflowExecutorProps {
  request: string;
  projectPath: string;
  contextFiles: Array<{ path: string; name: string }>;
  projectType?: string;
  onTaskComplete?: (taskId: string, result: TaskResult) => void;
}

export default function WorkflowExecutor({
  request,
  projectPath,
  contextFiles,
  projectType,
  onTaskComplete,
}: WorkflowExecutorProps) {
  const [workflow, setWorkflow] = useState<WorkflowContext | null>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [expandedStages, setExpandedStages] = useState<Set<WorkflowStage>>(
    new Set([WorkflowStage.ANALYSIS, WorkflowStage.DESIGN])
  );

  // 워크플로우 초기화
  useEffect(() => {
    if (request && projectPath) {
      const context = createWorkflowContext(request, projectPath, contextFiles, projectType);
      setWorkflow(context);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, projectPath, projectType]);

  // 작업 실행
  const executeTask = async (taskId: string) => {
    if (!workflow || isExecuting) return;

    const task = workflow.tasks.find((t) => t.id === taskId);
    if (!task || task.status === "completed") return;

    setIsExecuting(true);

    // 작업 상태 업데이트
    setWorkflow((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === taskId ? { ...t, status: "running" as const } : t
        ),
      };
    });

    try {
      let result: TaskResult;

      switch (task.type) {
        case TaskType.INSTALL:
          // 패키지 설치 - Phase 1 계획에서 패키지명 추출
          let packagesToInstall: string[] = [];
          let installCommand = "";
          
          // 1. Phase 1 계획에서 패키지명 추출
          try {
            const planningMatch = request.match(/```json\s*([\s\S]*?)```/);
            if (planningMatch) {
              const planningData = JSON.parse(planningMatch[1]);
              if (planningData.phase === "planning" && planningData.plan?.packages) {
                packagesToInstall = planningData.plan.packages.filter((pkg: string) => pkg && pkg !== "undefined");
              }
            }
          } catch {
            // JSON 파싱 실패 시 무시
          }
          
          // 2. 구조화된 응답에서 패키지명 추출
          if (packagesToInstall.length === 0) {
            try {
              const { parseStructuredResponse } = await import("@/utils/promptBuilder");
              const structuredResponse = parseStructuredResponse(request);
              if (structuredResponse?.tasks) {
                const installTasks = structuredResponse.tasks.filter(t => t.type === "install");
                installTasks.forEach(t => {
                  if (t.target && t.target !== "undefined") {
                    packagesToInstall.push(t.target);
                  }
                  if (t.command && t.command.includes("install")) {
                    // 명령어에서 패키지명 추출
                    const pkgMatch = t.command.match(/(?:npm|yarn)\s+(?:install|add)\s+(.+)/);
                    if (pkgMatch) {
                      const pkgs = pkgMatch[1].trim().split(/\s+/).filter(p => p && p !== "undefined");
                      packagesToInstall.push(...pkgs);
                    }
                  }
                });
              }
            } catch {
              // 파싱 실패 시 무시
            }
          }
          
          // 3. task.target이나 task.command에서 추출
          if (packagesToInstall.length === 0) {
            if (task.target && task.target !== "undefined") {
              packagesToInstall = [task.target];
            } else if (task.command) {
              const pkgMatch = task.command.match(/(?:npm|yarn)\s+(?:install|add)\s+(.+)/);
              if (pkgMatch) {
                packagesToInstall = pkgMatch[1].trim().split(/\s+/).filter(p => p && p !== "undefined");
              }
            }
          }
          
          // 4. LLM 응답에서 직접 추출 (최후의 수단)
          if (packagesToInstall.length === 0) {
            const installPatterns = [
              /npm install (.+?)(?:\n|$)/g,
              /yarn add (.+?)(?:\n|$)/g,
              /@tiptap\/[\w-]+/g,
              /tiptap[\w-]*/g,
            ];
            
            for (const pattern of installPatterns) {
              let match;
              while ((match = pattern.exec(request)) !== null) {
                const pkg = match[1] || match[0];
                if (pkg && pkg !== "undefined" && !packagesToInstall.includes(pkg)) {
                  packagesToInstall.push(pkg);
                }
              }
            }
          }
          
          // 패키지명이 없으면 오류
          if (packagesToInstall.length === 0) {
            result = {
              success: false,
              message: "**오류:** 설치할 패키지명을 찾을 수 없습니다.\n\nLLM이 Phase 1 계획에서 정확한 패키지명을 제공해야 합니다.\n예: `\"packages\": [\"@tiptap/react\", \"@tiptap/starter-kit\"]`",
            };
            break;
          }
          
          // 중복 제거
          packagesToInstall = Array.from(new Set(packagesToInstall));
          installCommand = `npm install ${packagesToInstall.join(" ")}`;
          
          const installResponse = await fetch("/api/commands/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              command: installCommand,
              projectPath: projectPath,
            }),
          });
          const installData = await installResponse.json();
          const installOutput = installData.output || installData.message || "";
          result = {
            success: installResponse.ok,
            message: installResponse.ok 
              ? `**실행 명령어:**\n\`\`\`bash\n${installCommand}\n\`\`\`\n\n**설치할 패키지:**\n${packagesToInstall.map((p, i) => `${i + 1}. \`${p}\``).join("\n")}\n\n**결과:**\n${installOutput || "설치 완료"}`
              : `**실행 명령어:**\n\`\`\`bash\n${installCommand}\n\`\`\`\n\n**오류:**\n${installData.error || installData.message || "설치 실패"}`,
            data: installData,
          };
          break;

        case TaskType.FIND_FILES:
          // 파일 찾기 - LLM의 Phase 1 계획에서 명시된 파일만 찾기
          try {
            const { parseStructuredResponse } = await import("@/utils/promptBuilder");
            parseStructuredResponse(request); // 타입 체크용
            
            let targetFiles: Array<{ path: string; name: string }> = [];
            
            // Phase 1 (Planning) 응답에서 파일 목록 추출
            try {
              const planningMatch = request.match(/```json\s*([\s\S]*?)```/);
              if (planningMatch) {
                const planningData = JSON.parse(planningMatch[1]);
                if (planningData.phase === "planning" && planningData.plan) {
                  const plan = planningData.plan;
                  
                  // 계획에 명시된 파일 경로 수집
                  const plannedFiles: string[] = [];
                  
                  interface PlanFile {
                    path: string;
                    reason?: string;
                    changes?: string;
                    purpose?: string;
                  }
                  
                  if (plan.filesToModify && Array.isArray(plan.filesToModify)) {
                    plan.filesToModify.forEach((f: PlanFile) => {
                      if (f.path) plannedFiles.push(f.path);
                    });
                  }
                  
                  if (plan.filesToCreate && Array.isArray(plan.filesToCreate)) {
                    plan.filesToCreate.forEach((f: PlanFile) => {
                      if (f.path) plannedFiles.push(f.path);
                    });
                  }
                  
                  // 명시된 파일 경로가 있으면 해당 파일들만 찾기
                  if (plannedFiles.length > 0) {
                    for (const filePath of plannedFiles) {
                      // 경로 정규화
                      let normalizedPath = filePath;
                      if (normalizedPath.startsWith("./")) {
                        normalizedPath = normalizedPath.substring(2);
                      }
                      if (normalizedPath.startsWith("/")) {
                        normalizedPath = normalizedPath.substring(1);
                      }
                      
                      // 파일이 존재하는지 확인
                      try {
                        const fileResponse = await fetch(
                          `/api/files/read?path=${encodeURIComponent(normalizedPath)}&projectPath=${encodeURIComponent(projectPath)}`
                        );
                        if (fileResponse.ok) {
                          const fileName = normalizedPath.split("/").pop() || normalizedPath;
                          targetFiles.push({
                            path: normalizedPath,
                            name: fileName,
                          });
                        }
                      } catch {
                        // 파일이 없으면 생성할 파일로 간주
                        const fileName = normalizedPath.split("/").pop() || normalizedPath;
                        targetFiles.push({
                          path: normalizedPath,
                          name: fileName,
                        });
                      }
                    }
                  }
                }
              }
            } catch {
              // JSON 파싱 실패 시 무시
            }
            
            // Phase 1 계획이 없거나 파일이 명시되지 않은 경우에만 코드 블록에서 추출
            if (targetFiles.length === 0) {
              // 코드 블록에서 파일 경로 추출
              const { parseCodeBlocks } = await import("@/utils/codeParser");
              const codeBlocks = parseCodeBlocks(request, contextFiles.map(f => f.path));
              
              codeBlocks.forEach((block) => {
                if (block.filePath) {
                  let normalizedPath = block.filePath;
                  if (normalizedPath.startsWith("./")) {
                    normalizedPath = normalizedPath.substring(2);
                  }
                  if (normalizedPath.startsWith("/")) {
                    normalizedPath = normalizedPath.substring(1);
                  }
                  
                  const fileName = normalizedPath.split("/").pop() || normalizedPath;
                  if (!targetFiles.find(f => f.path === normalizedPath)) {
                    targetFiles.push({
                      path: normalizedPath,
                      name: fileName,
                    });
                  }
                }
              });
            }
            
            // 여전히 파일이 없으면 컨텍스트 파일 사용 (최후의 수단)
            if (targetFiles.length === 0 && contextFiles.length > 0) {
              targetFiles = contextFiles.slice(0, 3); // 최대 3개만
            }
            
            const filesList = targetFiles.length > 0
              ? targetFiles.map((f, idx) => `${idx + 1}. \`${f.path}\``).join("\n")
              : "파일을 찾을 수 없습니다.";
            
            result = {
              success: true,
              message: `**찾은 파일 (${targetFiles.length}개):**\n${filesList}`,
              data: { files: targetFiles },
            };
            
            // 워크플로우 컨텍스트에 파일 목록 저장
            setWorkflow((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                results: new Map(prev.results.set(taskId, { files: targetFiles })),
              };
            });
          } catch (error) {
            result = {
              success: false,
              message: `파일 찾기 오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
            };
          }
          break;

        case TaskType.ANALYZE_SOURCE:
          // 소스 분석 - 찾은 파일들의 내용 읽기
          try {
            const findFilesResult = workflow?.results.get(
              workflow.tasks.find((t) => t.type === TaskType.FIND_FILES)?.id || ""
            ) as { files?: Array<{ path: string }> } | undefined;
            const filesToAnalyze = findFilesResult?.files || contextFiles;
            
            const analyzedFiles: Array<{ path: string; content: string }> = [];
            
            for (const file of filesToAnalyze.slice(0, 10)) {
              try {
                const fileResponse = await fetch(
                  `/api/files/read?path=${encodeURIComponent(file.path)}&projectPath=${encodeURIComponent(projectPath)}`
                );
                if (fileResponse.ok) {
                  const fileData = await fileResponse.json();
                  if (fileData.encoding === "text" || !fileData.encoding) {
                    analyzedFiles.push({
                      path: file.path,
                      content: fileData.content || "",
                    });
                  }
                }
              } catch (error) {
                console.error(`Error reading ${file.path}:`, error);
              }
            }
            
            const analyzedFilesList = analyzedFiles.length > 0
              ? analyzedFiles.map((f, idx) => `${idx + 1}. \`${f.path}\` (${f.content.length} bytes)`).join("\n")
              : "분석할 파일이 없습니다.";
            
            result = {
              success: true,
              message: `**분석한 파일 (${analyzedFiles.length}개):**\n${analyzedFilesList}`,
              data: { analyzedFiles },
            };
            
            setWorkflow((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                results: new Map(prev.results.set(taskId, { analyzedFiles })),
              };
            });
          } catch (error) {
            result = {
              success: false,
              message: `소스 분석 오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
            };
          }
          break;

        case TaskType.MODIFY_SOURCE:
          // 소스 수정 - LLM 응답에서 코드 블록 추출
          try {
            // LLM 응답에서 코드 블록과 파일 경로 추출
            // 1. 먼저 구조화된 응답에서 codeBlocks 추출 (우선순위)
            const { parseStructuredResponse } = await import("@/utils/promptBuilder");
            const structuredResponse = parseStructuredResponse(request);
            let codeBlocks: Array<{ filePath: string; language: string; content: string }> = [];
            
            if (structuredResponse?.codeBlocks && structuredResponse.codeBlocks.length > 0) {
              // 구조화된 응답의 codeBlocks 사용 (가장 신뢰할 수 있음)
              codeBlocks = structuredResponse.codeBlocks.map((cb) => ({
                filePath: cb.filePath,
                language: cb.language || "text",
                content: cb.content || "",
              }));
              console.log("✅ 구조화된 응답에서 codeBlocks 추출:", codeBlocks.length, "개");
            } else {
              // 2. 텍스트에서 코드 블록 추출 (대체 방법)
              const { parseCodeBlocks } = await import("@/utils/codeParser");
              codeBlocks = parseCodeBlocks(request, contextFiles.map(f => f.path));
              console.log("✅ 텍스트에서 코드 블록 추출:", codeBlocks.length, "개");
            }
            
            // 코드 블록이 없으면 대체 방법 시도
            if (codeBlocks.length === 0) {
              
              // 2. 일반 코드 블록에서 추출 (파일 경로 없이)
              if (codeBlocks.length === 0) {
                const fallbackBlocks = extractCodeBlocksWithoutPath(request);
                if (fallbackBlocks.length > 0) {
                  // 컨텍스트 파일이나 분석된 파일 사용
                  const analyzeResult = workflow?.results.get(
                    workflow.tasks.find((t) => t.type === TaskType.ANALYZE_SOURCE)?.id || ""
                  ) as { analyzedFiles?: Array<{ path: string; content: string }> } | undefined;
                  const analyzedFiles = analyzeResult?.analyzedFiles || [];
                  
                  if (analyzedFiles.length > 0) {
                    codeBlocks = fallbackBlocks.map((block, idx) => ({
                      filePath: analyzedFiles[idx]?.path || `components/NewFile${idx + 1}.tsx`,
                      language: block.language,
                      content: block.content,
                    }));
                  } else if (contextFiles.length > 0) {
                    codeBlocks = fallbackBlocks.map((block, idx) => ({
                      filePath: contextFiles[idx]?.path || `components/NewFile${idx + 1}.tsx`,
                      language: block.language,
                      content: block.content,
                    }));
                  }
                }
              }
            }
            
            // 코드 블록이 없으면 Phase 1 계획에서 정보 추출하여 파일 수정 시도
            if (codeBlocks.length === 0) {
              try {
                const planningMatch = request.match(/```json\s*([\s\S]*?)```/);
                if (planningMatch) {
                  const planningData = JSON.parse(planningMatch[1]);
                  if (planningData.phase === "planning" && planningData.plan) {
                    const plan = planningData.plan;
                    
                    // package.json 수정 처리
                    interface PlanFileInfo {
                      path: string;
                      reason?: string;
                      changes?: string;
                    }
                    const packageJsonFiles: PlanFileInfo[] = [];
                    if (plan.filesToModify && Array.isArray(plan.filesToModify)) {
                      plan.filesToModify.forEach((f: PlanFileInfo) => {
                        if (f.path && (f.path.includes("package.json") || f.path.endsWith("package.json"))) {
                          packageJsonFiles.push(f);
                        }
                      });
                    }
                    
                    // package.json이 있고 packages가 있으면 자동으로 수정
                    if (packageJsonFiles.length > 0 && plan.packages && Array.isArray(plan.packages) && plan.packages.length > 0) {
                      for (const fileInfo of packageJsonFiles) {
                        const filePath = fileInfo.path;
                        let normalizedPath = filePath;
                        if (normalizedPath.startsWith("./")) {
                          normalizedPath = normalizedPath.substring(2);
                        }
                        if (normalizedPath.startsWith("/")) {
                          normalizedPath = normalizedPath.substring(1);
                        }
                        normalizedPath = normalizedPath.replace(/\\/g, "/");
                        
                        try {
                          // 기존 package.json 읽기
                          const readResponse = await fetch(
                            `/api/files/read?path=${encodeURIComponent(normalizedPath)}&projectPath=${encodeURIComponent(projectPath)}`
                          );
                          
                          if (readResponse.ok) {
                            const fileData = await readResponse.json();
                            interface PackageJson {
                              dependencies?: Record<string, string>;
                              [key: string]: unknown;
                            }
                            let packageJson: PackageJson;
                            
                            try {
                              packageJson = JSON.parse(fileData.content) as PackageJson;
                            } catch {
                              // package.json 파싱 실패는 다음 파일로
                              continue;
                            }
                            
                            // dependencies에 패키지 추가
                            if (!packageJson.dependencies) {
                              packageJson.dependencies = {};
                            }
                            
                            const addedPackages: string[] = [];
                            plan.packages.forEach((pkg: string) => {
                              if (pkg && pkg !== "undefined" && packageJson.dependencies && !packageJson.dependencies[pkg]) {
                                // 버전 없으면 최신 버전으로 추가
                                packageJson.dependencies[pkg] = "^latest";
                                addedPackages.push(pkg);
                              }
                            });
                            
                            if (addedPackages.length > 0) {
                              // 수정된 package.json 저장
                              const writeResponse = await fetch("/api/files/write", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  filePath: normalizedPath,
                                  projectPath: projectPath,
                                  content: JSON.stringify(packageJson, null, 2),
                              }),
                            });
                              
                              if (writeResponse.ok) {
                                codeBlocks.push({
                                  filePath: normalizedPath,
                                  language: "json",
                                  content: JSON.stringify(packageJson, null, 2),
                                });
                              }
                            }
                          }
                        } catch (error) {
                          // 개별 파일 오류는 무시하고 계속 진행
                          console.error(`Error processing package.json ${normalizedPath}:`, error);
                        }
                      }
                      
                      // package.json 수정이 성공했으면 계속 진행
                      if (codeBlocks.length === 0) {
                        result = {
                          success: false,
                          message: `**계획된 파일:**\n${packageJsonFiles.map((f, idx) => `${idx + 1}. \`${f.path}\``).join("\n")}\n\n⚠️ package.json 수정에 실패했습니다. 패키지가 이미 설치되어 있거나 오류가 발생했습니다.`,
                        };
                        break;
                      }
                    } else {
                      // package.json이 아니거나 코드 블록이 필요한 경우
                      const plannedFiles: string[] = [];
                      
                      interface PlanFile {
                        path: string;
                        reason?: string;
                        changes?: string;
                        purpose?: string;
                      }
                      
                      if (plan.filesToCreate && Array.isArray(plan.filesToCreate)) {
                        plan.filesToCreate.forEach((f: PlanFile) => {
                          if (f.path) plannedFiles.push(f.path);
                        });
                      }
                      
                      if (plan.filesToModify && Array.isArray(plan.filesToModify)) {
                        plan.filesToModify.forEach((f: PlanFile) => {
                          if (f.path && !plannedFiles.includes(f.path)) {
                            plannedFiles.push(f.path);
                          }
                        });
                      }
                      
                      // 계획에 명시된 파일이 있으면 기본 템플릿으로 파일 생성
                      if (plannedFiles.length > 0) {
                        // 파일 타입에 따라 기본 템플릿 생성
                        for (const filePath of plannedFiles) {
                          const ext = filePath.split(".").pop()?.toLowerCase() || "";
                          let defaultContent = "";
                          
                          // Next.js 페이지 파일 (app 디렉토리)
                          if (filePath.includes("/app/") && (ext === "tsx" || ext === "jsx")) {
                            const componentName = filePath.split("/").pop()?.replace(/\.(tsx|jsx)$/, "") || "Page";
                            const capitalizedName = componentName.split("-").map(word => 
                              word.charAt(0).toUpperCase() + word.slice(1)
                            ).join("");
                            defaultContent = `export default function ${capitalizedName}() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Hello World
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Welcome to the ${componentName} page!
        </p>
      </div>
    </div>
  );
}
`;
                          }
                          // React 컴포넌트 파일
                          else if ((ext === "tsx" || ext === "jsx") && !filePath.includes("/app/")) {
                            const componentName = filePath.split("/").pop()?.replace(/\.(tsx|jsx)$/, "") || "Component";
                            defaultContent = `"use client";

export default function ${componentName}() {
  return (
    <div>
      <h1>${componentName}</h1>
    </div>
  );
}
`;
                          }
                          // TypeScript 파일
                          else if (ext === "ts") {
                            defaultContent = `// ${filePath.split("/").pop() || "file"}
`;
                          }
                          // JavaScript 파일
                          else if (ext === "js") {
                            defaultContent = `// ${filePath.split("/").pop() || "file"}
`;
                          }
                          // CSS 파일
                          else if (ext === "css") {
                            defaultContent = `/* ${filePath.split("/").pop() || "file"} */
`;
                          }
                          // 기본 템플릿
                          else {
                            defaultContent = `// ${filePath.split("/").pop() || "file"}
`;
                          }
                          
                          codeBlocks.push({
                            filePath: filePath,
                            language: ext === "tsx" || ext === "jsx" ? "typescript" : ext === "ts" ? "typescript" : ext === "js" ? "javascript" : ext === "css" ? "css" : "text",
                            content: defaultContent,
                          });
                        }
                      }
                    }
                  }
                }
              } catch {
                // JSON 파싱 실패 시 무시
              }
              
              // 여전히 코드 블록이 없으면 오류
              if (codeBlocks.length === 0) {
                result = {
                  success: false,
                  message: "**오류:** 수정할 코드 블록을 찾을 수 없습니다.\n\nLLM 응답에 다음 형식의 코드 블록이 포함되어 있어야 합니다:\n```typescript:path/to/file.ts\n// 코드 내용\n```",
                };
                break;
              }
            }
            
            const modifyResults: Array<{ path: string; success: boolean; message: string }> = [];
            
            // 실행 전 작업 목록 표시
            if (codeBlocks.length > 0) {
              const operationSummary: string[] = [];
              operationSummary.push(`**📋 실행할 작업 목록 (${codeBlocks.length}개 파일):**\n`);
              
              codeBlocks.forEach((block, idx) => {
                const fileName = block.filePath.split("/").pop() || block.filePath;
                const dirPath = block.filePath.substring(0, block.filePath.lastIndexOf("/")) || ".";
                operationSummary.push(`${idx + 1}. **파일명:** \`${fileName}\``);
                operationSummary.push(`   **경로:** \`${block.filePath}\``);
                operationSummary.push(`   **디렉토리:** \`${dirPath}\``);
                operationSummary.push(`   **언어:** ${block.language || "unknown"}`);
                operationSummary.push(``);
              });
              
              // 작업 목록을 메시지로 표시
              const summaryMessage = operationSummary.join("\n");
              if (onTaskComplete) {
                onTaskComplete("", {
                  success: true,
                  message: summaryMessage,
                });
              }
            }
            
            for (const codeBlock of codeBlocks) {
              if (!codeBlock.filePath) {
                modifyResults.push({
                  path: "unknown",
                  success: false,
                  message: "파일 경로가 없습니다",
                });
                continue;
              }
              
              // 내용이 없거나 너무 짧으면 기본 템플릿 생성
              let content = codeBlock.content || "";
              if (!content || content.trim().length < 10) {
                const ext = codeBlock.filePath.split(".").pop()?.toLowerCase() || "";
                const fileName = codeBlock.filePath.split("/").pop() || "file";
                
                // Next.js 페이지 파일 (app 디렉토리)
                if (codeBlock.filePath.includes("/app/") && (ext === "tsx" || ext === "jsx")) {
                  const componentName = fileName.replace(/\.(tsx|jsx)$/, "");
                  const capitalizedName = componentName.split("-").map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1)
                  ).join("");
                  content = `export default function ${capitalizedName}() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Hello World
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Welcome to the ${componentName} page!
        </p>
      </div>
    </div>
  );
}
`;
                }
                // React 컴포넌트 파일
                else if ((ext === "tsx" || ext === "jsx") && !codeBlock.filePath.includes("/app/")) {
                  const componentName = fileName.replace(/\.(tsx|jsx)$/, "");
                  content = `"use client";

export default function ${componentName}() {
  return (
    <div>
      <h1>${componentName}</h1>
    </div>
  );
}
`;
                }
                // TypeScript/JavaScript 파일
                else if (ext === "ts" || ext === "js") {
                  content = `// ${fileName}\n`;
                }
                // CSS 파일
                else if (ext === "css") {
                  content = `/* ${fileName} */\n`;
                }
                // 기본 템플릿
                else {
                  content = `// ${fileName}\n`;
                }
              }
              
              // 파일 경로 정규화 (OS 호환)
              let filePath = codeBlock.filePath;
              // ./ 제거
              if (filePath.startsWith("./")) {
                filePath = filePath.substring(2);
              }
              // 앞의 / 제거
              if (filePath.startsWith("/")) {
                filePath = filePath.substring(1);
              }
              // 백슬래시를 슬래시로 변환 (Windows 호환)
              filePath = filePath.replace(/\\/g, "/");
              
              // 파일 존재 여부 확인
              let fileExists = false;
              try {
                const checkResponse = await fetch(
                  `/api/files/read?path=${encodeURIComponent(filePath)}&projectPath=${encodeURIComponent(projectPath)}`
                );
                fileExists = checkResponse.ok;
              } catch {
                // 파일 확인 실패 시 무시하고 계속 진행
              }
              
              // Phase 1 계획에서 작업 유형 확인
              let isCreateOperation = false;
              try {
                const { parseStructuredResponse } = await import("@/utils/promptBuilder");
                const structuredResponse = parseStructuredResponse(request);
                if (structuredResponse?.plan?.filesToCreate) {
                  // filesToCreate에 포함되어 있으면 CREATE 작업
                  const filesToCreate = structuredResponse.plan.filesToCreate;
                  if (Array.isArray(filesToCreate)) {
                    interface PlanFile {
                      path: string;
                      reason?: string;
                      purpose?: string;
                    }
                    isCreateOperation = filesToCreate.some((f: PlanFile) => f.path === filePath);
                  }
                }
              } catch {
                // 파싱 실패 시 무시
              }
              
              // CREATE 작업인데 파일이 이미 존재하면 경고 및 재질문 요청
              if (isCreateOperation && fileExists) {
                // 기존 파일 내용 일부 읽기 (경로 제안에 사용)
                let existingFileContent = "";
                try {
                  const existingFileResponse = await fetch(
                    `/api/files/read?path=${encodeURIComponent(filePath)}&projectPath=${encodeURIComponent(projectPath)}`
                  );
                  if (existingFileResponse.ok) {
                    const existingFileData = await existingFileResponse.json();
                    existingFileContent = existingFileData.content || "";
                  }
                } catch {
                  // 파일 읽기 실패 시 무시
                }
                
                // 재질문 프롬프트 생성
                const clarificationPrompt = `⚠️ **파일 충돌 감지**

**문제:** \`${filePath}\` 파일이 이미 존재합니다. CREATE 작업은 기존 파일을 덮어쓰지 않습니다.

**기존 파일 정보:**
- 경로: \`${filePath}\`
- 크기: ${existingFileContent.length} bytes
${existingFileContent.length > 0 ? `- 내용 미리보기: ${existingFileContent.substring(0, 100)}...` : ""}

**해결 방법을 선택해주세요:**

1. **다른 경로에 생성** (권장)
   - 예: \`app/hello-world/page.tsx\` (새 페이지)
   - 예: \`app/${filePath.split("/").pop()?.replace(/\.(tsx?|jsx?)$/, "")}-new/page.tsx\` (변형된 경로)

2. **기존 파일 수정 (MODIFY 작업)**
   - 기존 파일을 수정하려면 MODIFY 작업으로 변경해야 합니다.

3. **기존 파일 백업 후 생성**
   - 기존 파일을 다른 이름으로 백업한 후 새로 생성할 수 있습니다.

**질문:** 어떤 방법으로 진행하시겠습니까? 원하는 경로를 알려주세요.`;

                modifyResults.push({
                  path: filePath,
                  success: false,
                  message: clarificationPrompt,
                });
                
                // 재질문 이벤트 발생 (ChatPanel에서 처리)
                window.dispatchEvent(
                  new CustomEvent("workflowClarificationNeeded", {
                    detail: {
                      filePath: filePath,
                      clarificationPrompt: clarificationPrompt,
                      originalRequest: request,
                    },
                  })
                );
                
                continue;
              }
              
              // MODIFY 작업인데 파일이 없으면 경고
              if (!isCreateOperation && !fileExists) {
                modifyResults.push({
                  path: filePath,
                  success: false,
                  message: `⚠️ **경고:** 파일이 존재하지 않습니다. MODIFY 작업은 기존 파일이 필요합니다.\n\n**해결 방법:**\n1. CREATE 작업으로 변경하세요\n2. 올바른 파일 경로를 확인하세요`,
                });
                continue;
              }
              
              const fileResponse = await fetch("/api/files/write", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  filePath: filePath,
                  projectPath: projectPath,
                  content: content,
                }),
              });
              
              const fileData = await fileResponse.json();
              
              if (!fileResponse.ok) {
                // 파일 생성/수정 실패 시 대안 제안
                const errorMessage = fileData.error || fileData.message || "알 수 없는 오류";
                const errorType = fileData.errorType || "unknown";
                const suggestions = fileData.suggestions || [];
                
                // API에서 제공한 대안 제안 사용
                let alternativeMessage = "";
                if (suggestions.length > 0) {
                  alternativeMessage = `\n\n**대안 제안:**\n`;
                  suggestions.forEach((suggestion: string, index: number) => {
                    alternativeMessage += `${index + 1}. ${suggestion}\n`;
                  });
                } else {
                  // API에서 제안이 없으면 기본 제안
                  alternativeMessage = `\n\n**대안 제안:**\n`;
                  alternativeMessage += `1. 파일 경로를 확인하세요 (오타, 특수문자 등)\n`;
                  alternativeMessage += `2. 다른 경로를 사용하세요\n`;
                  if (isCreateOperation) {
                    alternativeMessage += `3. 기존 파일을 수정(MODIFY)하는 방법을 고려하세요\n`;
                  } else {
                    alternativeMessage += `3. 새 파일로 생성(CREATE)하는 방법을 고려하세요\n`;
                  }
                  alternativeMessage += `4. 프로젝트 디렉토리 구조를 확인하세요`;
                }
                
                modifyResults.push({
                  path: filePath,
                  success: false,
                  message: `❌ **${isCreateOperation ? "생성" : "수정"} 실패:** ${errorMessage}${alternativeMessage}`,
                });
                
                // 실패 내역을 LLM에 전달하여 대안 제안 요청
                const failureContext = {
                  filePath: filePath,
                  operation: isCreateOperation ? "CREATE" : "MODIFY",
                  errorMessage: errorMessage,
                  errorType: errorType,
                  errorDetails: fileData.details || errorMessage,
                  suggestions: suggestions,
                  attemptedContent: codeBlock.content.substring(0, 200) + (codeBlock.content.length > 200 ? "..." : ""), // 내용 일부만
                };
                
                const clarificationPrompt = `⚠️ **파일 ${isCreateOperation ? "생성" : "수정"} 실패**

**실패 내역:**
- 파일 경로: \`${filePath}\`
- 작업 유형: ${isCreateOperation ? "CREATE (생성)" : "MODIFY (수정)"}
- 오류 메시지: ${errorMessage}
- 에러 타입: ${errorType}
- 상세 정보: ${fileData.details || "없음"}

**시도한 내용:**
\`\`\`
${codeBlock.content.substring(0, 300)}${codeBlock.content.length > 300 ? "\n..." : ""}
\`\`\`

**현재까지 시도한 대안:**
${suggestions.length > 0 ? suggestions.map((s: string, idx: number) => `${idx + 1}. ${s}`).join("\n") : "없음"}

**요청사항:**
위 실패 내역을 분석하여 다른 방법을 제안해주세요. 다음을 고려해주세요:
1. 파일 경로 문제인지 확인 (다른 경로 제안)
2. 권한 문제인지 확인 (권한 해결 방법 제안)
3. 디렉토리 구조 문제인지 확인 (디렉토리 생성 또는 다른 구조 제안)
4. 작업 유형 변경 (CREATE → MODIFY 또는 MODIFY → CREATE)
5. 기타 대안 방법

구체적인 해결 방안과 함께 새로운 파일 경로나 작업 방법을 제안해주세요.`;

                // 실패 시 재질문 이벤트 발생
                window.dispatchEvent(
                  new CustomEvent("workflowClarificationNeeded", {
                    detail: {
                      filePath: filePath,
                      clarificationPrompt: clarificationPrompt,
                      originalRequest: request,
                      failureContext: failureContext, // 실패 내역 추가
                    },
                  })
                );
              } else {
                // 성공 메시지에 파일 경로와 파일명 포함
                const fileName = filePath.split("/").pop() || filePath;
                modifyResults.push({
                  path: filePath,
                  success: true,
                  message: `✅ **${isCreateOperation ? "생성" : "수정"} 완료**\n경로: \`${filePath}\`\n파일명: \`${fileName}\``,
                });
              }
              
              // 성공 시 diff 뷰어 표시를 위한 이벤트 발생
              if (fileResponse.ok) {
                window.dispatchEvent(
                  new CustomEvent("codeChanges", {
                    detail: {
                      codeBlocks: [codeBlock],
                      response: request,
                    },
                  })
                );
              }
            }
            
            const successCount = modifyResults.filter((r) => r.success).length;
            const modifyResultsList = modifyResults.length > 0
              ? modifyResults.map((r, idx) => {
                  const status = r.success ? "✅" : "❌";
                  return `${idx + 1}. ${status} \`${r.path}\` - ${r.message}`;
                }).join("\n")
              : "수정할 파일이 없습니다.";
            
            result = {
              success: successCount > 0,
              message: `**수정한 파일 (${successCount}/${modifyResults.length}개 성공):**\n${modifyResultsList}`,
              data: { results: modifyResults },
            };
          } catch (error) {
            result = {
              success: false,
              message: `소스 수정 오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
            };
          }
          break;

        case TaskType.COMPARE:
          // 비교 (diff 뷰어 표시)
          result = {
            success: true,
            message: "비교 완료 (diff 뷰어에서 확인 가능)",
            data: {},
          };
          break;

        case TaskType.VERIFY:
          // 검증
          result = {
            success: true,
            message: "검증 완료",
            data: {},
          };
          break;

        case TaskType.APPLY:
          // 적용
          result = {
            success: true,
            message: "변경사항 적용 완료",
            data: {},
          };
          break;

        default:
          result = { success: false, message: "알 수 없는 작업 유형" };
      }

      // 작업 완료 상태 업데이트
      setWorkflow((prev) => {
        if (!prev) return prev;
        const updatedTasks = prev.tasks.map((t) =>
          t.id === taskId
            ? { ...t, status: result.success ? ("completed" as const) : ("failed" as const), result }
            : t
        );
        return {
          ...prev,
          tasks: updatedTasks,
          results: new Map(prev.results.set(taskId, result)),
        };
      });

      // 작업 완료 이벤트 발생 (채팅창에 메시지 추가용)
      const taskTypeLabel = getTaskTypeLabel(task.type);
      const statusIcon = result.success ? "✅" : "❌";
      // 제목과 내용을 하나의 메시지로 통합
      const executionMessage = `${statusIcon} **${taskTypeLabel}**: ${task.description}\n\n${result.message}`;
      
      window.dispatchEvent(
        new CustomEvent("workflowTaskComplete", {
          detail: {
            taskType: task.type,
            taskDescription: task.description,
            result: result,
            message: executionMessage,
          },
        })
      );

      onTaskComplete?.(taskId, result);

      // 다음 작업으로 이동
      const taskIndex = workflow.tasks.findIndex((t) => t.id === taskId);
      if (taskIndex < workflow.tasks.length - 1) {
        setCurrentTaskIndex(taskIndex + 1);
      }
    } catch (error) {
      setWorkflow((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: "failed" as const,
                  result: {
                    success: false,
                    message: `오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
                  },
                }
              : t
          ),
        };
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // 모든 작업 순차 실행
  const executeAll = async () => {
    if (!workflow || isExecuting) return;

    setIsExecuting(true);
    setCurrentTaskIndex(0);

    for (let i = 0; i < workflow.tasks.length; i++) {
      const task = workflow.tasks[i];
      
      // 의존성 확인
      const allDepsCompleted = task.dependencies.every((depId) => {
        const depTask = workflow.tasks.find((t) => t.id === depId);
        return depTask?.status === "completed";
      });

      if (!allDepsCompleted) {
        setWorkflow((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id === task.id ? { ...t, status: "skipped" as const } : t
            ),
          };
        });
        continue;
      }

      setCurrentTaskIndex(i);
      await executeTask(task.id);
      
      // 작업 간 지연
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    setIsExecuting(false);
  };

  if (!workflow) {
    return (
      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <p className="text-sm text-gray-500">워크플로우 초기화 중...</p>
      </div>
    );
  }

  // 단계별로 작업 그룹화
  const tasksByStage = workflow.tasks.reduce((acc, task) => {
    if (!acc[task.stage]) {
      acc[task.stage] = [];
    }
    acc[task.stage].push(task);
    return acc;
  }, {} as Record<WorkflowStage, typeof workflow.tasks>);

  const getStageLabel = (stage: WorkflowStage): string => {
    const labels: Record<WorkflowStage, string> = {
      [WorkflowStage.ANALYSIS]: "1. 요청 분석",
      [WorkflowStage.DESIGN]: "2. 처리 방식 설계",
      [WorkflowStage.RESOURCE_GATHERING]: "3. 리소스 수집",
      [WorkflowStage.EXECUTION_PLAN]: "4. 실행 계획 수립",
      [WorkflowStage.EXECUTION]: "5. 순차적 실행",
      [WorkflowStage.VALIDATION]: "6. 검증",
      [WorkflowStage.COMPLETION]: "7. 완료",
    };
    return labels[stage] || stage;
  };

  const getTaskTypeLabel = (type: TaskType): string => {
    const labels: Record<TaskType, string> = {
      [TaskType.INSTALL]: "라이브러리 설치",
      [TaskType.FIND_FILES]: "대상 파일 찾기",
      [TaskType.ANALYZE_SOURCE]: "소스 분석",
      [TaskType.MODIFY_SOURCE]: "소스 수정",
      [TaskType.COMPARE]: "비교",
      [TaskType.APPLY]: "적용",
      [TaskType.VERIFY]: "검증",
    };
    return labels[type] || type;
  };

  return (
    <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          워크플로우 ({workflow.tasks.length}개 작업)
        </span>
        <button
          onClick={executeAll}
          disabled={isExecuting}
          className="px-3 py-1.5 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors flex items-center gap-1 disabled:opacity-50"
        >
          {isExecuting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          모두 실행
        </button>
      </div>

      <div className="space-y-2">
        {Object.entries(tasksByStage).map(([stage, tasks]) => {
          const isExpanded = expandedStages.has(stage as WorkflowStage);
          return (
            <div key={stage} className="border border-gray-200 dark:border-gray-700 rounded">
              <button
                onClick={() => {
                  const newExpanded = new Set(expandedStages);
                  if (isExpanded) {
                    newExpanded.delete(stage as WorkflowStage);
                  } else {
                    newExpanded.add(stage as WorkflowStage);
                  }
                  setExpandedStages(newExpanded);
                }}
                className="w-full flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-800"
              >
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {getStageLabel(stage as WorkflowStage)} ({tasks.length}개)
                </span>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              {isExpanded && (
                <div className="p-2 space-y-1">
                  {tasks.map((task) => {
                    const isCurrent = workflow.tasks[currentTaskIndex]?.id === task.id;
                    const isRunning = task.status === "running";
                    const isCompleted = task.status === "completed";
                    const isFailed = task.status === "failed";

                    return (
                      <div
                        key={task.id}
                        className={`flex items-center justify-between p-2 rounded ${
                          isCurrent ? "bg-blue-50 dark:bg-blue-900/20" : "bg-white dark:bg-gray-800"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            {getTaskTypeLabel(task.type)}: {task.description}
                          </div>
                          {task.result && (
                            <div className="text-xs mt-1 text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words overflow-wrap-anywhere">
                              {task.result.message}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => executeTask(task.id)}
                          disabled={isRunning || isCompleted || isExecuting}
                          className={`ml-2 p-1.5 rounded transition-colors ${
                            isCompleted
                              ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                              : isFailed
                              ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                              : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                          } ${isRunning || isExecuting ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          {isRunning ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : isCompleted ? (
                            <Check className="w-3 h-3" />
                          ) : isFailed ? (
                            <X className="w-3 h-3" />
                          ) : (
                            <Play className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

