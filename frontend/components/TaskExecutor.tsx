"use client";

import { useState, useEffect } from "react";
import { Play, Check, X, Loader2 } from "lucide-react";
import { parseTasks, Task } from "@/utils/taskParser";
import { parseStructuredResponse, StructuredResponse } from "@/utils/promptBuilder";

interface TaskExecutorProps {
  messageIndex: number;
  messageContent: string;
  projectPath: string;
  executingTasks: Set<number>;
  setExecutingTasks: (tasks: Set<number>) => void;
}

export default function TaskExecutor({
  messageIndex,
  messageContent,
  projectPath,
  executingTasks,
  setExecutingTasks,
}: TaskExecutorProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [executedTasks, setExecutedTasks] = useState<Set<number>>(new Set());
  const [taskResults, setTaskResults] = useState<Map<number, { success: boolean; message: string }>>(new Map());

  // 작업 파싱 (구조화된 응답 우선, 실패 시 일반 파싱)
  const handleParseTasks = () => {
    // 먼저 구조화된 응답 시도
    const structuredResponse = parseStructuredResponse(messageContent);
    
    if (structuredResponse && structuredResponse.tasks && structuredResponse.tasks.length > 0) {
      // 구조화된 응답에서 작업 추출
      const parsedTasks: Task[] = structuredResponse.tasks.map((task) => ({
        type: task.type as Task["type"],
        description: task.description,
        target: task.target,
        content: task.content,
        command: task.command,
      }));
      setTasks(parsedTasks);
    } else {
      // 구조화된 응답이 없으면 일반 파싱
      const parsedTasks = parseTasks(messageContent);
      setTasks(parsedTasks);
    }
  };

  // 메시지가 변경되면 자동으로 작업 파싱 시도
  useEffect(() => {
    if (messageContent) {
      const structuredResponse = parseStructuredResponse(messageContent);
      if (structuredResponse && structuredResponse.tasks && structuredResponse.tasks.length > 0) {
        const parsedTasks: Task[] = structuredResponse.tasks.map((task) => ({
          type: task.type as Task["type"],
          description: task.description,
          target: task.target,
          content: task.content,
          command: task.command,
        }));
        setTasks(parsedTasks);
      }
    }
  }, [messageContent]);

  // 작업 실행
  const handleExecuteTask = async (taskIndex: number) => {
    const task = tasks[taskIndex];
    if (!task || !projectPath) return;

    setExecutingTasks(new Set([...executingTasks, taskIndex]));

    try {
      let result: { success: boolean; message: string };

      switch (task.type) {
        case "install":
          // 패키지 설치
          const installResponse = await fetch("/api/commands/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              command: task.command || `npm install ${task.target}`,
              projectPath: projectPath,
            }),
          });
          const installData = await installResponse.json();
          result = {
            success: installResponse.ok,
            message: installData.message || installData.error || "설치 완료",
          };
          break;

        case "create":
        case "modify":
          // 파일 생성/수정
          const fileResponse = await fetch("/api/files/write", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filePath: task.target,
              projectPath: projectPath,
              content: task.content || "",
            }),
          });
          const fileData = await fileResponse.json();
          result = {
            success: fileResponse.ok,
            message: fileData.message || fileData.error || `${task.type === "create" ? "생성" : "수정"} 완료`,
          };
          break;

        case "command":
          // 명령어 실행
          const commandResponse = await fetch("/api/commands/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              command: task.command,
              projectPath: projectPath,
            }),
          });
          const commandData = await commandResponse.json();
          result = {
            success: commandResponse.ok,
            message: commandData.message || commandData.error || "실행 완료",
          };
          break;

        default:
          result = { success: false, message: "알 수 없는 작업 유형" };
      }

      setTaskResults(new Map(taskResults.set(taskIndex, result)));
      setExecutedTasks(new Set([...executedTasks, taskIndex]));

      // 성공 시 페이지 새로고침 또는 파일 목록 업데이트
      if (result.success && (task.type === "create" || task.type === "modify")) {
        // 파일 변경 이벤트 발생
        window.dispatchEvent(new CustomEvent("fileChanged", { detail: { filePath: task.target } }));
      }
    } catch (error) {
      setTaskResults(
        new Map(
          taskResults.set(taskIndex, {
            success: false,
            message: `오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
          })
        )
      );
    } finally {
      const newExecuting = new Set(executingTasks);
      newExecuting.delete(taskIndex);
      setExecutingTasks(newExecuting);
    }
  };

  // 모든 작업 실행
  const handleExecuteAll = async () => {
    for (let i = 0; i < tasks.length; i++) {
      if (!executedTasks.has(i)) {
        await handleExecuteTask(i);
        // 작업 간 약간의 지연
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  };

  if (tasks.length === 0) {
    return (
      <button
        onClick={handleParseTasks}
        className="mt-2 px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center gap-1"
      >
        <Play className="w-3 h-3" />
        작업 추출
      </button>
    );
  }

  return (
    <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
          추출된 작업 ({tasks.length}개)
        </span>
        {tasks.some((_, i) => !executedTasks.has(i)) && (
          <button
            onClick={handleExecuteAll}
            className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors flex items-center gap-1"
            disabled={executingTasks.size > 0}
          >
            {executingTasks.size > 0 ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            모두 실행
          </button>
        )}
      </div>
      <div className="space-y-2">
        {tasks.map((task, index) => {
          const isExecuting = executingTasks.has(index);
          const isExecuted = executedTasks.has(index);
          const result = taskResults.get(index);

          return (
            <div
              key={index}
              className="flex items-center justify-between p-2 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                  {task.description}
                </div>
                {result && (
                  <div
                    className={`text-xs mt-1 ${
                      result.success ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {result.message}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleExecuteTask(index)}
                disabled={isExecuting || isExecuted}
                className={`ml-2 p-1.5 rounded transition-colors ${
                  isExecuted
                    ? result?.success
                      ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                      : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                    : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                } ${isExecuting ? "opacity-50 cursor-not-allowed" : ""}`}
                title={isExecuted ? (result?.success ? "실행 완료" : "실행 실패") : "실행"}
              >
                {isExecuting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : isExecuted ? (
                  result?.success ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <X className="w-3 h-3" />
                  )
                ) : (
                  <Play className="w-3 h-3" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

