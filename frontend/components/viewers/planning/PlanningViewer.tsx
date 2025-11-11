"use client";

import { Check, CheckCircle2, ChevronDown, ChevronUp, Loader2, Play, XCircle } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StepExecutionContext, executeStep } from "./handlers/stepExecution";
import { ExecutionLog, PlanningViewerProps, StepResult } from "./types";
import { formatAnalysisResult } from "./utils/formatting";
import { getLanguageFromExtension } from "./utils/languageUtils";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.Editor),
  { ssr: false }
);

export default function PlanningViewer({ content, projectPath }: PlanningViewerProps) {
  const [executingSteps, setExecutingSteps] = useState<Set<number>>(new Set());
  const [executedSteps, setExecutedSteps] = useState<Set<number>>(new Set());
  const [stepResults, setStepResults] = useState<Map<number, StepResult>>(new Map());
  const [analysisResults, setAnalysisResults] = useState<Map<number, string>>(new Map());
  const [executionLogs, setExecutionLogs] = useState<Map<number, ExecutionLog[]>>(new Map());
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());

  // 실행 로그 추가 함수
  const addExecutionLog = (stepIndex: number, log: ExecutionLog) => {
    setExecutionLogs(prev => {
      const newLogs = new Map(prev);
      const stepLogs = newLogs.get(stepIndex) || [];
      newLogs.set(stepIndex, [...stepLogs, log]);
      return newLogs;
    });
  };

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
      const context: StepExecutionContext = {
        projectPath,
        planning,
        metadata,
        tasks,
        codeBlocks,
        addExecutionLog,
        setAnalysisResults,
        analysisResults,
      };

      const result = await executeStep(stepIndex, stepDescription, context);

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
                    </span>
                  </div>
                </div>
              )}

              {/* 패키지 */}
              {planning.plan.packages && planning.plan.packages.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    설치할 패키지
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded-lg">
                    <div className="flex flex-wrap gap-2">
                      {planning.plan.packages.map((pkg: string, idx: number) => (
                        <span
                          key={idx}
                          className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded"
                        >
                          {pkg}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 생성할 파일 */}
              {planning.plan.filesToCreate && planning.plan.filesToCreate.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    생성할 파일
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded-lg space-y-1">
                    {planning.plan.filesToCreate.map((file: { path: string; reason?: string; purpose?: string }, idx: number) => (
                      <div key={idx} className="text-xs">
                        <span
                          className="font-mono text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
                          onClick={() => handlePathClick(file.path)}
                        >
                          {file.path}
                        </span>
                        {file.reason && (
                          <span className="text-gray-600 dark:text-gray-400 ml-2">
                            ({file.reason})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 수정할 파일 */}
              {planning.plan.filesToModify && planning.plan.filesToModify.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    수정할 파일
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded-lg space-y-1">
                    {planning.plan.filesToModify.map((file: { path: string; reason?: string; changes?: string }, idx: number) => (
                      <div key={idx} className="text-xs">
                        <span
                          className="font-mono text-orange-600 dark:text-orange-400 cursor-pointer hover:underline"
                          onClick={() => handlePathClick(file.path)}
                        >
                          {file.path}
                        </span>
                        {file.reason && (
                          <span className="text-gray-600 dark:text-gray-400 ml-2">
                            ({file.reason})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 실행 순서 */}
              {planning.plan.executionOrder && planning.plan.executionOrder.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    실행 순서
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded-lg">
                    <ol className="list-decimal list-inside space-y-1 text-xs text-gray-700 dark:text-gray-300">
                      {planning.plan.executionOrder.map((step: string, idx: number) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 실행 단계 */}
        {planning.plan?.executionOrder && planning.plan.executionOrder.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              실행 단계
            </h2>
            <div className="space-y-3">
              {planning.plan.executionOrder.map((stepDescription: string, stepIndex: number) => {
                const isExecuting = executingSteps.has(stepIndex);
                const isExecuted = executedSteps.has(stepIndex);
                const result = stepResults.get(stepIndex);
                const stepLogs = executionLogs.get(stepIndex) || [];
                const isLogsExpanded = expandedLogs.has(stepIndex);
                const analysisResult = analysisResults.get(stepIndex);

                return (
                  <div
                    key={stepIndex}
                    className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {stepIndex + 1}. {stepDescription}
                          </span>
                          {isExecuting && (
                            <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                          )}
                          {isExecuted && result && (
                            result.success ? (
                              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                            )
                          )}
                        </div>

                        {/* 분석 결과 표시 */}
                        {analysisResult && (
                          <div className="mt-2 mb-2 p-3 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                              분석 결과:
                            </div>
                            <div className="text-sm text-gray-700 dark:text-gray-300">
                              {formatAnalysisResult(analysisResult)}
                            </div>
                          </div>
                        )}

                        {/* 실행 결과 표시 */}
                        {result && (
                          <div className={`text-xs mt-2 p-2 rounded ${
                            result.success
                              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
                              : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
                          }`}>
                            {result.message}
                          </div>
                        )}

                        {/* 실행 로그 표시 */}
                        {stepLogs.length > 0 && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                실행 로그 ({stepLogs.length}개)
                              </div>
                              <button
                                onClick={() => {
                                  const newExpanded = new Set(expandedLogs);
                                  if (isLogsExpanded) {
                                    newExpanded.delete(stepIndex);
                                  } else {
                                    newExpanded.add(stepIndex);
                                  }
                                  setExpandedLogs(newExpanded);
                                }}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {isLogsExpanded ? (
                                  <ChevronUp className="w-4 h-4 inline" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 inline" />
                                )}
                              </button>
                            </div>
                            <div className={`space-y-1 text-xs ${
                              isLogsExpanded ? "" : "max-h-60 overflow-y-auto"
                            }`}>
                              {stepLogs.map((log, logIdx) => (
                                <div
                                  key={logIdx}
                                  className={`p-2 rounded border ${
                                    log.type === "command"
                                      ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                                      : log.type === "file"
                                      ? "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800"
                                      : log.type === "success"
                                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                                      : log.type === "error"
                                      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                                      : log.type === "warning"
                                      ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                                      : "bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                      {log.timestamp.toLocaleTimeString()}
                                    </span>
                                    <span className={`font-medium ${
                                      log.type === "command"
                                        ? "text-blue-700 dark:text-blue-300"
                                        : log.type === "file"
                                        ? "text-purple-700 dark:text-purple-300"
                                        : log.type === "success"
                                        ? "text-green-700 dark:text-green-300"
                                        : log.type === "error"
                                        ? "text-red-700 dark:text-red-300"
                                        : log.type === "warning"
                                        ? "text-yellow-700 dark:text-yellow-300"
                                        : "text-gray-700 dark:text-gray-300"
                                    }`}>
                                      {log.message}
                                    </span>
                                  </div>
                                  {log.command && (
                                    <div className="text-xs font-mono text-gray-600 dark:text-gray-400 mt-1">
                                      명령어: {log.command}
                                    </div>
                                  )}
                                  {log.filePath && (
                                    <div className="text-xs font-mono text-gray-600 dark:text-gray-400 mt-1">
                                      파일: {log.filePath}
                                    </div>
                                  )}
                                  {log.details && (
                                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">
                                      {log.details}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="ml-4 flex-shrink-0">
                        <button
                          onClick={() => handleExecuteStep(stepIndex, stepDescription)}
                          disabled={isExecuting}
                          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                            isExecuting
                              ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                              : isExecuted && result?.success
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/40"
                              : isExecuted && !result?.success
                              ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/40"
                              : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/40"
                          }`}
                        >
                          {isExecuting ? (
                            <>
                              <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
                              실행 중...
                            </>
                          ) : isExecuted ? (
                            <>
                              <Check className="w-3 h-3 inline mr-1" />
                              재실행
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 inline mr-1" />
                              실행
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 코드 블록 (각 파일의 소스 코드) */}
        {codeBlocks && codeBlocks.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              코드 블록
            </h2>
            <div className="space-y-4">
              {codeBlocks.map((codeBlock: { filePath: string; language?: string; content?: string }, idx: number) => {
                const language = codeBlock.language || getLanguageFromExtension(codeBlock.filePath);
                
                return (
                  <div
                    key={idx}
                    className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
                  >
                    <div className="bg-gray-200 dark:bg-gray-700 px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-mono text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
                          onClick={() => handlePathClick(codeBlock.filePath)}
                          title="클릭하여 파일 트리에서 열기"
                        >
                          {codeBlock.filePath}
                        </span>
                        {language && (
                          <span className="text-xs text-gray-600 dark:text-gray-400 bg-gray-300 dark:bg-gray-600 px-2 py-0.5 rounded">
                            {language}
                          </span>
                        )}
                      </div>
                    </div>
                    {codeBlock.content ? (
                      <div className="h-[400px] border-t border-gray-200 dark:border-gray-700">
                        <MonacoEditor
                          height="400px"
                          language={language}
                          value={codeBlock.content}
                          theme="vs-dark"
                          options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            fontSize: 12,
                            lineNumbers: "on",
                            wordWrap: "on",
                            automaticLayout: true,
                            scrollbar: {
                              vertical: "auto",
                              horizontal: "auto",
                            },
                          }}
                        />
                      </div>
                    ) : (
                      <div className="p-4 text-xs text-gray-500 dark:text-gray-400 italic">
                        내용이 없습니다.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
