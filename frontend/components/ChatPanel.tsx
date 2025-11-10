"use client";

import { Bot, Check, Copy, Send, Settings, User, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatPanelProps {
  codeContext?: string;
  projectPath?: string;
  onOpenProfile?: (profile: string) => void;
}

interface ModelOption {
  id: string;
  name: string;
  description: string;
  provider: "grok" | "ollama";
  tokens?: string;
}

const GROK_MODELS: ModelOption[] = [
  {
    id: "grok-code-fast-1",
    name: "Grok Code Fast",
    description: "코드 작업용 (빠름, 저렴)",
    provider: "grok",
    tokens: "256K / 2M",
  },
  {
    id: "grok-4-fast-reasoning",
    name: "Grok-4 Fast Reasoning",
    description: "추론이 필요한 작업",
    provider: "grok",
    tokens: "2M / 4M",
  },
  {
    id: "grok-4-fast-non-reasoning",
    name: "Grok-4 Fast Non-Reasoning",
    description: "일반 대화",
    provider: "grok",
    tokens: "2M / 4M",
  },
  {
    id: "grok-4-0709",
    name: "Grok-4 0709",
    description: "고품질 응답",
    provider: "grok",
    tokens: "256K / 2M",
  },
];

const COMMON_OLLAMA_MODELS: ModelOption[] = [
  {
    id: "llama3.2",
    name: "Llama 3.2",
    description: "Meta의 최신 모델",
    provider: "ollama",
  },
  {
    id: "llama3.1",
    name: "Llama 3.1",
    description: "Meta의 고성능 모델",
    provider: "ollama",
  },
  {
    id: "qwen2.5",
    name: "Qwen 2.5",
    description: "Alibaba의 다국어 모델",
    provider: "ollama",
  },
  {
    id: "codellama",
    name: "CodeLlama",
    description: "코드 전용 모델",
    provider: "ollama",
  },
  {
    id: "deepseek-coder",
    name: "DeepSeek Coder",
    description: "코드 생성 특화",
    provider: "ollama",
  },
  {
    id: "mistral",
    name: "Mistral",
    description: "고성능 오픈소스 모델",
    provider: "ollama",
  },
];

const AVAILABLE_MODELS = [...GROK_MODELS, ...COMMON_OLLAMA_MODELS];

// 경로 클릭 가능한 컨텐츠 컴포넌트
function PathClickableContent({ content }: { content: string }) {
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);

  // 경로 클릭 핸들러
  const handlePathClick = (path: string) => {
    // 이벤트 발생
    window.dispatchEvent(
      new CustomEvent("filePathClick", {
        detail: { path },
      })
    );
  };

  // 코드 복사 핸들러
  const handleCopyCode = async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeIndex(index);
      setTimeout(() => setCopiedCodeIndex(null), 2000);
      toast.success("코드가 복사되었습니다.");
    } catch (error) {
      console.error("Failed to copy code:", error);
      toast.error("코드 복사에 실패했습니다.");
    }
  };

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

  // 마크다운 텍스트를 파싱하여 경로를 클릭 가능하게 만들기
  const renderContent = () => {
    // 코드 블록 패턴 (```language ... ```)
    const codeBlockPattern = /```(\w+)?\n?([\s\S]*?)```/g;
    // 인라인 코드 패턴 (`code`)
    const inlineCodePattern = /`([^`\n]+)`/g;
    
    const parts: Array<{ 
      type: "text" | "path" | "codeBlock" | "inlineCode"; 
      content: string;
      language?: string;
    }> = [];
    let lastIndex = 0;

    // 먼저 코드 블록 처리
    const codeBlockMatches: Array<{ start: number; end: number; language: string; content: string }> = [];
    let codeBlockMatch: RegExpExecArray | null;
    while ((codeBlockMatch = codeBlockPattern.exec(content)) !== null) {
      codeBlockMatches.push({
        start: codeBlockMatch.index,
        end: codeBlockMatch.index + codeBlockMatch[0].length,
        language: codeBlockMatch[1] || "",
        content: codeBlockMatch[2] || "",
      });
    }

    // 코드 블록과 인라인 코드를 모두 포함한 정렬된 매치 리스트 생성
    const allMatches: Array<{
      type: "codeBlock" | "inlineCode";
      start: number;
      end: number;
      language?: string;
      content: string;
    }> = [];

    // 코드 블록 추가
    codeBlockMatches.forEach(m => {
      allMatches.push({
        type: "codeBlock",
        start: m.start,
        end: m.end,
        language: m.language,
        content: m.content,
      });
    });

    // 인라인 코드 추가 (코드 블록과 겹치지 않는 것만)
    let inlineCodeMatch: RegExpExecArray | null;
    while ((inlineCodeMatch = inlineCodePattern.exec(content)) !== null) {
      const isInsideCodeBlock = codeBlockMatches.some(
        cb => inlineCodeMatch!.index >= cb.start && inlineCodeMatch!.index < cb.end
      );
      
      if (!isInsideCodeBlock) {
        const path = inlineCodeMatch[1];
        allMatches.push({
          type: "inlineCode",
          start: inlineCodeMatch.index,
          end: inlineCodeMatch.index + inlineCodeMatch[0].length,
          content: path,
        });
      }
    }

    // 시작 위치로 정렬
    allMatches.sort((a, b) => a.start - b.start);

    // 파트 생성
    for (const match of allMatches) {
      // 이전 텍스트 추가
      if (match.start > lastIndex) {
        parts.push({
          type: "text",
          content: content.substring(lastIndex, match.start),
        });
      }

      if (match.type === "codeBlock") {
        parts.push({
          type: "codeBlock",
          content: match.content,
          language: match.language,
        });
      } else if (match.type === "inlineCode") {
        const looksLikePath =
          match.content.includes("/") ||
          match.content.includes("\\") ||
          /\.(ts|tsx|js|jsx|json|css|html|py|java|go|rs|cpp|c|md|yaml|yml|xml|sh|bash|zsh)$/i.test(match.content);

        if (looksLikePath) {
          parts.push({
            type: "path",
            content: match.content,
          });
        } else {
          parts.push({
            type: "inlineCode",
            content: match.content,
          });
        }
      }

      lastIndex = match.end;
    }

    // 마지막 텍스트 추가
    if (lastIndex < content.length) {
      parts.push({
        type: "text",
        content: content.substring(lastIndex),
      });
    }

    return (
      <div className="text-sm whitespace-pre-wrap break-words overflow-wrap-anywhere space-y-2">
        {parts.map((part, index) => {
          if (part.type === "codeBlock") {
            return (
              <div key={index} className="my-2 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
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
          if (part.type === "inlineCode") {
            return (
              <code key={index} className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs font-mono">
                {part.content}
              </code>
            );
          }
          if (part.type === "path") {
            return (
              <span
                key={index}
                onClick={() => handlePathClick(part.content)}
                className="cursor-pointer text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline font-mono bg-blue-50 dark:bg-blue-900/20 px-1 rounded"
                title="클릭하여 파일 트리에서 열기"
              >
                `{part.content}`
              </span>
            );
          }
          // 텍스트는 줄바꿈과 마크다운 기본 스타일 적용
          const lines = part.content.split('\n');
          return (
            <span key={index}>
              {lines.map((line, lineIdx) => (
                <span key={lineIdx}>
                  {line}
                  {lineIdx < lines.length - 1 && <br />}
                </span>
              ))}
            </span>
          );
        })}
      </div>
    );
  };

  return renderContent();
}

export default function ChatPanel({ codeContext = "", projectPath, onOpenProfile }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "안녕하세요! 코드 어시스턴트입니다. 무엇을 도와드릴까요?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [projectStructure, setProjectStructure] = useState<{
    treeText?: string;
    configFiles?: Record<string, string>;
    projectType?: string;
  } | null>(null);
  const [projectProfile, setProjectProfile] = useState<{
    profile?: string;
    summary?: string;
    metadata?: { updatedAt: string };
  } | null>(null);
  const [isAnalyzingProject, setIsAnalyzingProject] = useState(false);
  const [currentProjectInfo, setCurrentProjectInfo] = useState<{
    name?: string;
    path?: string;
  } | null>(null);
  // localStorage에서 저장된 모델 설정 불러오기
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window !== "undefined") {
      const savedModel = localStorage.getItem("selected-model");
      return savedModel || "grok-code-fast-1";
    }
    return "grok-code-fast-1";
  });
  const [selectedProvider, setSelectedProvider] = useState<"grok" | "ollama">(() => {
    if (typeof window !== "undefined") {
      const savedProvider = localStorage.getItem("selected-provider") as "grok" | "ollama" | null;
      return savedProvider || "grok";
    }
    return "grok";
  });
  const [ollamaModels, setOllamaModels] = useState<ModelOption[]>(COMMON_OLLAMA_MODELS);
  const [customOllamaModel, setCustomOllamaModel] = useState("");
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<Array<{ 
    path: string; 
    name: string; 
    projectPath: string;
    content?: string;
  }>>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [relatedFiles, setRelatedFiles] = useState<Array<{
    path: string;
    name: string;
    reason: string;
    projectPath: string;
    content?: string;
  }>>([]);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modelSelectorRef.current &&
        !modelSelectorRef.current.contains(event.target as Node)
      ) {
        setShowModelSelector(false);
      }
    };

    if (showModelSelector) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showModelSelector]);

  // 구조화된 응답을 사용자 친화적인 형식으로 변환
  interface StructuredResponse {
    analysis?: string;
    isClear?: boolean;
    questions?: string[];
    plan?: {
      packages?: string[];
      filesToModify?: Array<{ path: string; reason: string }>;
      filesToCreate?: Array<{ path: string; purpose: string }>;
    };
    readyToExecute?: boolean;
  }

  const formatStructuredResponse = useCallback((response: StructuredResponse): string => {
    let formatted = "";
    
    if (response.analysis) {
      formatted += `**분석:**\n${response.analysis}\n\n`;
    }
    
    if (response.isClear === false && response.questions && response.questions.length > 0) {
      formatted += `**질문:**\n`;
      response.questions.forEach((q: string, i: number) => {
        formatted += `${i + 1}. ${q}\n`;
      });
      formatted += `\n위 질문에 답변해주시면 계획을 수립하겠습니다.\n`;
    }
    
    if (response.isClear === true && response.plan) {
      formatted += `**계획:**\n`;
      
      if (response.plan.packages && response.plan.packages.length > 0) {
        formatted += `\n**설치할 패키지:**\n`;
        response.plan.packages.forEach((pkg: string, i: number) => {
          formatted += `${i + 1}. \`${pkg}\`\n`;
        });
      }
      
      if (response.plan.filesToModify && response.plan.filesToModify.length > 0) {
        formatted += `\n**수정할 파일 (${response.plan.filesToModify.length}개):**\n`;
        response.plan.filesToModify.forEach((file, i: number) => {
          const fileName = file.path.split("/").pop() || file.path;
          const dirPath = file.path.substring(0, file.path.lastIndexOf("/")) || ".";
          formatted += `${i + 1}. **파일명:** \`${fileName}\`\n`;
          formatted += `   **경로:** \`${file.path}\`\n`;
          formatted += `   **디렉토리:** \`${dirPath}\`\n`;
          if (file.reason) {
            formatted += `   **이유:** ${file.reason}\n`;
          }
          formatted += `\n`;
        });
      }
      
      if (response.plan.filesToCreate && response.plan.filesToCreate.length > 0) {
        formatted += `\n**생성할 파일 (${response.plan.filesToCreate.length}개):**\n`;
        response.plan.filesToCreate.forEach((file, i: number) => {
          const fileName = file.path.split("/").pop() || file.path;
          const dirPath = file.path.substring(0, file.path.lastIndexOf("/")) || ".";
          formatted += `${i + 1}. **파일명:** \`${fileName}\`\n`;
          formatted += `   **경로:** \`${file.path}\`\n`;
          formatted += `   **디렉토리:** \`${dirPath}\`\n`;
          if (file.purpose) {
            formatted += `   **목적:** ${file.purpose}\n`;
          }
          formatted += `\n`;
        });
      }
      
      if (response.readyToExecute) {
        formatted += `\n✅ **실행 준비 완료**\n`;
      }
    }
    
    // 원본 JSON도 포함 (디버깅용, 필요시 숨김)
    formatted += `\n\`\`\`json\n${JSON.stringify(response, null, 2)}\n\`\`\``;
    
    return formatted;
  }, []);

  // 워크플로우 작업 완료 이벤트 리스너
  useEffect(() => {
    const handleWorkflowTaskComplete = (event: Event) => {
      const customEvent = event as CustomEvent<{ message: string }>;
      const { message } = customEvent.detail;
      const executionMessage: Message = {
        role: "assistant",
        content: message,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, executionMessage]);
    };

    window.addEventListener("workflowTaskComplete", handleWorkflowTaskComplete);
    return () => {
      window.removeEventListener("workflowTaskComplete", handleWorkflowTaskComplete);
    };
  }, []);

  // 워크플로우 재질문 필요 이벤트 리스너
  useEffect(() => {
    const handleWorkflowClarificationNeeded = async (event: Event) => {
      console.log("🔄 workflowClarificationNeeded 이벤트 수신:", event);
      const customEvent = event as CustomEvent;
      const { clarificationPrompt, originalRequest, failureContext } = customEvent.detail;
      
      console.log("📋 이벤트 상세:", { clarificationPrompt, originalRequest, failureContext });
      
      // 재질문 메시지를 채팅에 추가
      const clarificationMessage: Message = {
        role: "assistant",
        content: clarificationPrompt,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, clarificationMessage]);
      
      // 자동으로 LLM에게 재질문 전송 (즉시 실행)
      if (projectPath) {
        // 실패 내역을 포함한 재질문 프롬프트 생성
        let rePrompt = "";
        
        // 원본 요청이 있으면 포함
        if (originalRequest) {
          rePrompt += `이전 요청: "${originalRequest}"\n\n`;
        }
        
        if (failureContext) {
          rePrompt += `**실패 내역 분석 요청:**\n\n`;
          rePrompt += `위 작업이 실패했습니다. 실패 내역을 분석하여 다른 방법을 제안해주세요.\n\n`;
          rePrompt += `**실패 정보:**\n`;
          rePrompt += `- 파일 경로: ${failureContext.filePath}\n`;
          rePrompt += `- 작업 유형: ${failureContext.operation}\n`;
          rePrompt += `- 오류: ${failureContext.errorMessage}\n`;
          rePrompt += `- 에러 타입: ${failureContext.errorType}\n`;
          if (failureContext.errorDetails) {
            rePrompt += `- 상세: ${failureContext.errorDetails}\n`;
          }
          if (failureContext.attemptedContent) {
            rePrompt += `\n**시도한 내용 (일부):**\n\`\`\`\n${failureContext.attemptedContent}\n\`\`\`\n`;
          }
          rePrompt += `\n`;
          rePrompt += `**요청사항:**\n`;
          rePrompt += `1. 실패 원인을 분석해주세요\n`;
          rePrompt += `2. 구체적인 해결 방안을 제안해주세요\n`;
          rePrompt += `3. 새로운 파일 경로나 작업 방법을 제안해주세요\n`;
          rePrompt += `4. Phase 1 (Planning) 형식으로 응답해주세요 (isClear: false, questions 포함 가능)\n`;
        } else {
          rePrompt += `${clarificationPrompt}\n\n`;
          rePrompt += `위 문제를 해결하기 위해 다른 파일 경로를 제안해주세요. 또는 MODIFY 작업으로 변경할지 결정해주세요.`;
        }
        
        console.log("📤 LLM에 재질문 전송:", rePrompt);
        
        // 입력창에 자동으로 설정
        setInput(rePrompt);
        
        // 즉시 자동 전송 (setTimeout 제거)
        (async () => {
          if (!projectPath) {
            console.warn("⚠️ projectPath가 없어 재질문을 전송할 수 없습니다.");
            return;
          }
          
          console.log("🚀 즉시 LLM에 재질문 전송 시작");
          
          // 재질문을 자동으로 전송
          const userMessage: Message = {
            role: "user",
            content: rePrompt,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, userMessage]);
          setInput("");
          setIsLoading(true);

          try {
            // 파일 내용 읽기 (기존 로직과 동일)
            let fileContents = "";
            const allFiles = [...droppedFiles, ...relatedFiles];
            
            if (allFiles.length > 0) {
              fileContents += "\n\n## 첨부된 파일들\n\n";
              
              for (const file of allFiles) {
                try {
                  const fileResponse = await fetch(
                    `/api/files/read?path=${encodeURIComponent(file.path)}&projectPath=${encodeURIComponent(file.projectPath)}`
                  );
                  
                  if (fileResponse.ok) {
                    const fileData = await fileResponse.json();
                    const content = fileData.content || "";
                    
                    fileContents += `### ${file.name} (${file.path})\n`;
                    if ('reason' in file && file.reason) {
                      fileContents += `*${file.reason}*\n`;
                    }
                    
                    if (fileData.encoding === "text" || !fileData.encoding) {
                      fileContents += `\`\`\`\n${content}\n\`\`\`\n\n`;
                    } else {
                      fileContents += `*(바이너리 파일 - 내용 생략)*\n\n`;
                    }
                  }
                } catch (error) {
                  console.error(`Error reading file ${file.path}:`, error);
                }
              }
            }

            console.log("📨 LLM API 호출 시작");
            const response = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: rePrompt + fileContents,
                model: selectedModel,
                provider: selectedProvider,
                history: messages.slice(-20), // 최근 20개 메시지만 전송
                contextFiles: [
                  ...droppedFiles.map(f => ({ path: f.path, name: f.name })),
                  ...relatedFiles.map(f => ({ path: f.path, name: f.name })),
                ],
                projectType: "Next.js",
              }),
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const assistantResponse = data.response || data.message || "";
            console.log("✅ LLM 응답 수신:", assistantResponse.substring(0, 100) + "...");

            // 구조화된 응답 파싱 및 표시
            let displayContent = assistantResponse;
            const { parseStructuredResponse } = await import("@/utils/promptBuilder");
            const structuredResponse = parseStructuredResponse(assistantResponse);

            if (structuredResponse) {
              console.log("📋 구조화된 응답 파싱 완료:", structuredResponse);
              
              // Phase 1 (Planning) 응답 저장
              const isPlanningPhase = structuredResponse.phase === "planning" || 
                (!structuredResponse.tasks && structuredResponse.plan);
              const hasPlanObject = structuredResponse.plan && 
                (structuredResponse.plan.filesToCreate || structuredResponse.plan.filesToModify || structuredResponse.plan.packages);

              if (isPlanningPhase && hasPlanObject && projectPath) {
                try {
                  const saveResponse = await fetch("/api/planning/save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      projectPath: projectPath,
                      planningData: structuredResponse,
                      userRequest: rePrompt,
                    }),
                  });
                  
                  if (saveResponse.ok) {
                    console.log("💾 Planning 저장 완료");
                    window.dispatchEvent(new CustomEvent("planningSaved"));
                  }
                } catch (error) {
                  console.error("❌ Error saving planning:", error);
                }
              }
              
              displayContent = formatStructuredResponse(structuredResponse);
            } else {
              // JSON 파싱 실패 시 경고 메시지 추가
              const hasJsonBlock = assistantResponse.includes("```json");
              const hasJson = assistantResponse.includes("{") && assistantResponse.includes("}");
              
              if (hasJsonBlock || hasJson) {
                displayContent = `⚠️ **JSON 파싱 실패**\n\nLLM 응답에서 구조화된 JSON을 추출할 수 없습니다.\n\n**문제점:**\n- JSON 형식이 올바르지 않거나\n- 코드 블록 형식이 잘못되었거나\n- 특수 문자가 제대로 이스케이프되지 않았습니다\n\n**원본 응답 (일부):**\n${assistantResponse.substring(0, 500)}${assistantResponse.length > 500 ? "..." : ""}\n\n**해결 방법:**\n다음 형식으로 다시 응답해주세요:\n\`\`\`json\n{\n  "phase": "planning" | "execution",\n  ...\n}\n\`\`\``;
                console.error("❌ JSON 파싱 실패 - 응답에 JSON이 있지만 파싱할 수 없음");
              }
            }
            
            const assistantMessage: Message = {
              role: "assistant",
              content: displayContent,
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, assistantMessage]);

            // 코드 변경사항 파싱 및 전달
            if (assistantResponse) {
              const { parseCodeBlocks } = await import("@/utils/codeParser");
              const contextFiles = [
                ...droppedFiles.map(f => f.path),
                ...relatedFiles.map(f => f.path),
              ];
              const codeBlocks = parseCodeBlocks(assistantResponse, contextFiles);
              
              if (codeBlocks.length > 0) {
                window.dispatchEvent(
                  new CustomEvent("codeChanges", {
                    detail: {
                      codeBlocks,
                      response: assistantResponse,
                    },
                  })
                );
              }
            }
          } catch (error) {
            console.error("❌ 재질문 전송 중 오류:", error);
            const errorMessage: Message = {
              role: "assistant",
              content: `❌ 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`,
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errorMessage]);
          } finally {
            setIsLoading(false);
          }
        })();
      }
    };

    window.addEventListener("workflowClarificationNeeded", handleWorkflowClarificationNeeded);
    return () => {
      window.removeEventListener("workflowClarificationNeeded", handleWorkflowClarificationNeeded);
    };
  }, [isLoading, projectPath, droppedFiles, relatedFiles, selectedModel, selectedProvider, messages, formatStructuredResponse]);

  // 현재 프로젝트 정보 가져오기
  useEffect(() => {
    const loadCurrentProject = async () => {
      try {
        const response = await fetch("/api/projects/current");
        if (response.ok) {
          const data = await response.json();
          if (data.project) {
            setCurrentProjectInfo({
              name: data.project.name,
              path: data.project.path,
            });
          } else {
            setCurrentProjectInfo(null);
          }
        } else {
          setCurrentProjectInfo(null);
        }
      } catch (error) {
        console.error("❌ 현재 프로젝트 정보 로드 오류:", error);
        setCurrentProjectInfo(null);
      }
    };

    loadCurrentProject();
  }, [projectPath]);

  // 프로젝트 구조 및 프로필 가져오기
  useEffect(() => {
    const loadProjectData = async () => {
      if (!projectPath) {
        setProjectStructure(null);
        setProjectProfile(null);
        return;
      }

      // 프로젝트 구조 로드
      try {
        const structureResponse = await fetch(`/api/projects/structure?path=${encodeURIComponent(projectPath)}`);
        if (structureResponse.ok) {
          const structureData = await structureResponse.json();
          setProjectStructure({
            treeText: structureData.treeText,
            configFiles: structureData.configFiles,
            projectType: structureData.projectType,
          });
          console.log("📁 프로젝트 구조 로드 완료:", {
            projectType: structureData.projectType,
            configFilesCount: Object.keys(structureData.configFiles || {}).length,
            treeTextLength: structureData.treeText?.length || 0,
          });
        } else {
          console.warn("⚠️ 프로젝트 구조 로드 실패");
          setProjectStructure(null);
        }
      } catch (error) {
        console.error("❌ 프로젝트 구조 로드 오류:", error);
        setProjectStructure(null);
      }

      // 프로젝트 프로필 로드
      try {
        const profileResponse = await fetch(`/api/projects/profile?path=${encodeURIComponent(projectPath)}`);
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          if (profileData.profile) {
            setProjectProfile({
              profile: profileData.profile,
              summary: profileData.summary || undefined,
              metadata: profileData.metadata,
            });
            console.log("📋 프로젝트 프로필 로드 완료:", {
              hasProfile: !!profileData.profile,
              hasSummary: !!profileData.summary,
              updatedAt: profileData.metadata?.updatedAt,
            });
          } else {
            console.log("ℹ️ 프로젝트 프로필이 없습니다. 생성이 필요합니다.");
            setProjectProfile(null);
          }
        } else {
          console.warn("⚠️ 프로젝트 프로필 로드 실패");
          setProjectProfile(null);
        }
      } catch (error) {
        console.error("❌ 프로젝트 프로필 로드 오류:", error);
        setProjectProfile(null);
      }
    };

    loadProjectData();
  }, [projectPath]);

  // 프로젝트 프로필 생성 함수
  const analyzeProject = async () => {
    if (!projectPath || isAnalyzingProject) return;

    setIsAnalyzingProject(true);
    
    // 분석 시작 메시지 추가
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: "프로젝트 분석을 시작합니다.",
        timestamp: new Date(),
      },
    ]);

    try {
      console.log("🔍 프로젝트 분석 시작...");
      
      const analyzeResponse = await fetch("/api/projects/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          projectPath,
          model: selectedModel,
          provider: selectedProvider,
        }),
      });

      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "프로젝트 분석 실패");
      }

      const analyzeData = await analyzeResponse.json();
      const profile = analyzeData.profile;
      const conversation = analyzeData.conversation || [];

      if (!profile) {
        throw new Error("프로필 생성에 실패했습니다.");
      }

      // 대화 히스토리를 채팅 영역에 순차적으로 추가
      if (conversation && conversation.length > 0) {
        setMessages((prev) => {
          const newMessages = [...prev];
          // 기존 "프로젝트 분석을 시작합니다." 메시지 제거
          newMessages.pop();
          
          // 대화 히스토리를 순차적으로 추가 (실시간 느낌을 위해)
          conversation.forEach((msg: { role: string; content: string }) => {
            // user 메시지는 간단하게 표시
            if (msg.role === "user") {
              // 파일 내용이 포함된 긴 메시지는 요약
              let displayContent = msg.content;
              if (displayContent.length > 500) {
                const firstLine = displayContent.split('\n')[0];
                displayContent = `${firstLine}\n\n... (파일 내용 분석 중)`;
              }
              newMessages.push({
                role: "user",
                content: displayContent,
                timestamp: new Date(),
              });
            } else if (msg.role === "assistant") {
              // assistant 메시지는 전체 표시
              // JSON 블록이 있으면 파싱해서 보기 좋게 표시
              let displayContent = msg.content;
              const jsonMatch = displayContent.match(/```json\s*([\s\S]*?)```/);
              if (jsonMatch) {
                try {
                  const jsonData = JSON.parse(jsonMatch[1]);
                  if (jsonData.phase === "analysis") {
                    displayContent = `**분석 중...**\n\n프로젝트 타입: ${jsonData.analysis?.projectType || "분석 중"}\n\n추가 파일 요청: ${jsonData.plan?.neededFiles?.length || 0}개`;
                  } else if (jsonData.phase === "complete") {
                    displayContent = `**분석 완료**\n\n프로젝트 타입: ${jsonData.analysis?.projectType || "알 수 없음"}\n프레임워크: ${jsonData.analysis?.framework || "알 수 없음"}\n\n프로필이 생성되었습니다.`;
                  }
                } catch {
                  // JSON 파싱 실패 시 원본 표시
                }
              }
              newMessages.push({
                role: "assistant",
                content: displayContent,
                timestamp: new Date(),
              });
            }
          });
          
          return newMessages;
        });
      }

      // 프로필 저장
      const saveResponse = await fetch("/api/projects/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath,
          profile,
        }),
      });

      if (saveResponse.ok) {
        // 프로필 저장 후 다시 로드하여 최신 정보 반영
        const profileResponse = await fetch(`/api/projects/profile?path=${encodeURIComponent(projectPath)}`);
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          if (profileData.profile) {
            setProjectProfile({
              profile: profileData.profile,
              summary: profileData.summary || undefined,
              metadata: profileData.metadata || { updatedAt: new Date().toISOString() },
            });
            console.log("✅ 프로젝트 프로필 생성 및 저장 완료");
            toast.success("프로젝트 프로필이 생성되었습니다.");
            
            // 분석 완료 메시지 추가
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: "✅ 프로젝트 분석이 완료되었습니다. 프로필 보기 버튼을 클릭하여 상세 내용을 확인할 수 있습니다.",
                timestamp: new Date(),
              },
            ]);
          }
        }
      } else {
        const errorData = await saveResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "프로필 저장 실패");
      }
    } catch (error) {
      console.error("❌ 프로젝트 분석 오류:", error);
      const errorMessage = error instanceof Error ? error.message : "프로젝트 분석 중 오류가 발생했습니다.";
      toast.error(`프로젝트 분석 실패: ${errorMessage}`);
      
      // 에러 메시지 추가
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ 프로젝트 분석 실패: ${errorMessage}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsAnalyzingProject(false);
    }
  };

  // Ollama 모델 목록 가져오기 및 현재 실행 중인 모델 확인
  useEffect(() => {
    const fetchOllamaModels = async () => {
      try {
        // 설치된 모델 목록 가져오기
        const tagsResponse = await fetch("http://localhost:11434/api/tags");
        if (tagsResponse.ok) {
          const tagsData = await tagsResponse.json();
          interface OllamaModel {
            name: string;
            size?: number;
          }
          const installedModels: ModelOption[] = (tagsData.models || []).map((m: OllamaModel) => ({
            id: m.name,
            name: m.name,
            description: `Ollama 모델${m.size ? ` (${(m.size / 1024 / 1024 / 1024).toFixed(1)}GB)` : ""}`,
            provider: "ollama" as const,
          }));
          
          if (installedModels.length > 0) {
            setOllamaModels(installedModels);
            
            // 현재 실행 중인 모델 확인
            try {
              const psResponse = await fetch("http://localhost:11434/api/ps");
              if (psResponse.ok) {
                const psData = await psResponse.json();
                const runningModels = psData.models || [];
                
                // 실행 중인 모델이 있으면 자동 선택
                if (runningModels.length > 0) {
                  const runningModelName = runningModels[0].name;
                  const runningModel = installedModels.find(m => m.id === runningModelName);
                  
                  if (runningModel) {
                    console.log(`🔄 실행 중인 Ollama 모델 자동 선택: ${runningModelName}`);
                    setSelectedModel(runningModelName);
                    setSelectedProvider("ollama");
                    localStorage.setItem("selected-model", runningModelName);
                    localStorage.setItem("selected-provider", "ollama");
                  }
                }
              }
            } catch {
              console.log("실행 중인 모델 확인 실패 (무시됨)");
            }
          } else {
            console.log("설치된 Ollama 모델이 없습니다.");
          }
        }
      } catch {
        console.log("Ollama 서버에 연결할 수 없습니다. 기본 모델 목록을 사용합니다.");
        // Ollama 서버가 없으면 기본 모델 목록 유지
      }
    };
    fetchOllamaModels();
  }, []);

  // Ollama 모델 목록 로드 후 저장된 모델이 Ollama인 경우 확인
  useEffect(() => {
    // Ollama 모델 목록이 로드된 후에만 실행
    if (ollamaModels.length > 0 && selectedProvider === "ollama") {
      // 저장된 Ollama 모델이 목록에 있는지 확인
      const savedModel = localStorage.getItem("selected-model");
      if (savedModel) {
        const modelExists = ollamaModels.some(m => m.id === savedModel);
        if (!modelExists) {
          // 저장된 모델이 없으면 첫 번째 모델 사용
          if (ollamaModels.length > 0) {
            setSelectedModel(ollamaModels[0].id);
            localStorage.setItem("selected-model", ollamaModels[0].id);
          }
        }
      }
    }
  }, [ollamaModels, selectedProvider]);

  // 모델 변경 시 로컬 스토리지에 저장
  const handleModelChange = (modelId: string, provider: "grok" | "ollama") => {
    setSelectedModel(modelId);
    setSelectedProvider(provider);
    localStorage.setItem("selected-model", modelId);
    localStorage.setItem("selected-provider", provider);
    setShowModelSelector(false);
  };

  // 드래그 앤 드롭 핸들러
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    try {
      const data = e.dataTransfer.getData("text/plain");
      if (data) {
        const fileInfo = JSON.parse(data);
        const { path, name, projectPath } = fileInfo;

        setIsAnalyzing(true);
        setRelatedFiles([]);

        // 파일 목록에 추가 (내용은 나중에 전송 시 읽음)
        setDroppedFiles((prev) => [
          ...prev,
          { path, name, projectPath },
        ]);

        // 연관 파일 찾기
        try {
          const relatedResponse = await fetch("/api/files/related", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filePath: path,
              projectPath: projectPath,
              purpose: "analyze", // 사용자 목적에 따라 변경 가능
            }),
          });

          if (relatedResponse.ok) {
            const relatedData = await relatedResponse.json();
            setRelatedFiles(relatedData.relatedFiles || []);
          }
        } catch (error) {
          console.error("Error finding related files:", error);
        } finally {
          setIsAnalyzing(false);
        }
      }
    } catch (error) {
      console.error("Error handling drop:", error);
      setIsAnalyzing(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 질문 감지 함수
  const checkForQuestions = (response: string, structuredResponse: any): boolean => {
    // 구조화된 응답에서 질문 확인
    if (structuredResponse?.questions && structuredResponse.questions.length > 0) {
      return true;
    }
    
    // 텍스트에서 질문 패턴 감지
    const questionPatterns = [
      /어떤.*(분석|부분|기능|내용|항목|요소)/i,
      /(어떻게|어디에|무엇을|어떤|어느).*\?/i,
      /(알려주세요|알려주시겠어요|알려주시겠습니까|알려주시겠어요|알려주시겠습니까)\?/i,
      /(선택|고르|정하|지정).*해주세요/i,
      /(구체적|명확).*알려주세요/i,
      /(필요|원하).*정보/i,
    ];
    
    return questionPatterns.some(pattern => pattern.test(response));
  };

  // 질문 추출 함수
  const extractQuestions = (response: string, structuredResponse: any): string[] => {
    const questions: string[] = [];
    
    // 구조화된 응답에서 질문 추출
    if (structuredResponse?.questions && Array.isArray(structuredResponse.questions)) {
      questions.push(...structuredResponse.questions);
    }
    
    // 텍스트에서 질문 추출
    const questionMatches = response.match(/[^.!?]*\?/g);
    if (questionMatches) {
      questionMatches.forEach(q => {
        const trimmed = q.trim();
        if (trimmed.length > 5 && !questions.includes(trimmed)) {
          questions.push(trimmed);
        }
      });
    }
    
    return questions;
  };

  // 자동 답변 생성 함수
  const generateAutoResponse = (
    questions: string[],
    originalRequest: string,
    projectContextInfo: string,
    fileContents: string
  ): string => {
    let autoResponse = `**자동 답변 생성 (질문 해결):**\n\n`;
    autoResponse += `원래 요청: "${originalRequest}"\n\n`;
    autoResponse += `다음 질문들에 대해 프로젝트 컨텍스트를 바탕으로 가장 적절한 답변을 선택하고 바로 진행하세요:\n\n`;
    
    questions.forEach((q, idx) => {
      autoResponse += `${idx + 1}. ${q}\n`;
    });
    
    autoResponse += `\n**지시사항:**\n`;
    autoResponse += `- 위 질문들에 대해 프로젝트 구조, 설정 파일, 기존 코드를 분석하여 가장 적절한 답변을 선택하세요.\n`;
    autoResponse += `- 불필요한 질문 없이 바로 계획을 세우고 실행하세요.\n`;
    autoResponse += `- 프로젝트 컨텍스트 정보를 활용하여 명확한 결정을 내리세요.\n`;
    autoResponse += `- 질문에 대한 답변을 선택한 후, 그에 맞는 구체적인 계획을 제시하세요.\n`;
    
    if (projectContextInfo) {
      autoResponse += `\n${projectContextInfo}`;
    }
    
    if (fileContents) {
      autoResponse += `\n${fileContents}`;
    }
    
    return autoResponse;
  };

  // 자동 답변 처리 함수 (재귀)
  const handleAutoResponse = async (
    autoResponseContent: string,
    messageHistory: Message[],
    projectContextInfo: string,
    fileContents: string,
    allContextFiles: Array<{ path: string; name: string }>,
    depth: number
  ) => {
    // 최대 재귀 깊이 제한 (무한 루프 방지)
    if (depth >= 5) {
      console.warn("⚠️ 최대 재귀 깊이에 도달했습니다. 자동 답변 생성을 중단합니다.");
      const maxDepthMessage: Message = {
        role: "assistant",
        content: "⚠️ 질문 해결 과정이 너무 깊어져 자동 처리를 중단했습니다. 수동으로 답변해주세요.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, maxDepthMessage]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      
      // 스트리밍 응답을 위한 assistant 메시지 미리 생성
      const assistantMessage: Message = {
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // API 호출
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: autoResponseContent + projectContextInfo + fileContents,
          history: messageHistory.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          context: codeContext,
          contextFiles: allContextFiles,
          projectType: projectStructure?.projectType || "Next.js",
          model: selectedModel,
          provider: selectedProvider,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "API 호출 실패");
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
                // 메시지 업데이트
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIndex = updated.length - 1;
                  if (updated[lastIndex]?.role === "assistant") {
                    updated[lastIndex] = {
                      ...updated[lastIndex],
                      content: fullContent,
                    };
                  }
                  return updated;
                });
              }
            } catch (e) {
              // JSON 파싱 실패 무시
            }
          }
        }
      }

      const assistantResponse = fullContent;
      
      // 구조화된 응답 파싱
      const { parseStructuredResponse } = await import("@/utils/promptBuilder");
      const structuredResponse = parseStructuredResponse(assistantResponse);

      // 다시 질문이 있는지 확인
      const hasMoreQuestions = checkForQuestions(assistantResponse, structuredResponse);
      
      if (hasMoreQuestions) {
        console.log(`❓ 추가 질문이 감지되었습니다. (깊이: ${depth + 1})`);
        
        // 질문 추출
        const questions = extractQuestions(assistantResponse, structuredResponse);
        
        // 자동 답변 생성 메시지 추가
        const nextAutoResponseMessage: Message = {
          role: "user",
          content: generateAutoResponse(questions, autoResponseContent, projectContextInfo, fileContents),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, nextAutoResponseMessage]);
        
        // 재귀 호출
        await handleAutoResponse(
          nextAutoResponseMessage.content,
          [...messageHistory, { ...assistantMessage, content: assistantResponse }, nextAutoResponseMessage],
          projectContextInfo,
          fileContents,
          allContextFiles,
          depth + 1
        );
        return;
      }

      // 질문이 없으면 구조화된 응답 처리
      if (structuredResponse) {
        const displayContent = formatStructuredResponse(structuredResponse);
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (updated[lastIndex]?.role === "assistant") {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: displayContent,
            };
          }
          return updated;
        });

        // 계획 저장
        const hasPlanObject = !!structuredResponse.plan;
        const hasPlanContent = structuredResponse.plan && (
          (structuredResponse.plan.packages && structuredResponse.plan.packages.length > 0) ||
          (structuredResponse.plan.filesToModify && structuredResponse.plan.filesToModify.length > 0) ||
          (structuredResponse.plan.filesToCreate && structuredResponse.plan.filesToCreate.length > 0) ||
          structuredResponse.plan.executionOrder ||
          structuredResponse.plan.architecture ||
          structuredResponse.plan.subTasks ||
          Object.keys(structuredResponse.plan).length > 0
        );
        
        const isPlanningPhase = structuredResponse.phase === "planning";
        const isExecutionPhase = structuredResponse.phase === "execution";
        const hasAnalysis = !!structuredResponse.analysis;
        const hasTasks = structuredResponse.tasks && structuredResponse.tasks.length > 0;
        const hasCodeBlocks = structuredResponse.codeBlocks && structuredResponse.codeBlocks.length > 0;
        
        // 저장 조건: plan 객체가 있거나, planning/execution phase이거나, analysis가 있거나, tasks가 있거나, codeBlocks가 있으면 저장
        const shouldSave = (isPlanningPhase || isExecutionPhase || hasPlanObject || hasAnalysis || hasTasks || hasCodeBlocks) && projectPath;
        
        console.log("📋 Planning save check (auto response):", {
          phase: structuredResponse.phase,
          hasPlanObject,
          hasAnalysis,
          hasTasks,
          hasCodeBlocks,
          isPlanningPhase,
          isExecutionPhase,
          shouldSave,
          projectPath: !!projectPath
        });
        
        if (shouldSave) {
          try {
            const saveResponse = await fetch("/api/planning/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectPath: projectPath,
                planningData: structuredResponse,
                userRequest: autoResponseContent,
              }),
            });
            
            if (saveResponse.ok) {
              window.dispatchEvent(new CustomEvent("planningSaved"));
            }
          } catch (error) {
            console.error("❌ Error saving planning:", error);
          }
        }
      }

      // 코드 변경사항 파싱
      if (assistantResponse) {
        const { parseCodeBlocks } = await import("@/utils/codeParser");
        const contextFiles = [
          ...droppedFiles.map(f => f.path),
          ...relatedFiles.map(f => f.path),
        ];
        const codeBlocks = parseCodeBlocks(assistantResponse, contextFiles);
        
        if (codeBlocks.length > 0) {
          if (window.dispatchEvent) {
            window.dispatchEvent(
              new CustomEvent("codeChanges", {
                detail: {
                  codeBlocks,
                  response: assistantResponse,
                },
              })
            );
          }
        }
      }
    } catch (error) {
      console.error("Error in handleAutoResponse:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: `자동 답변 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (useSimpleMode: boolean = false) => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input.trim();
    
    // 디버깅: 실제 사용자 입력 확인
    console.log("📝 사용자 입력:", {
      original: input,
      trimmed: currentInput,
      length: currentInput.length
    });
    
    setInput("");
    setIsLoading(true);

    try {
      // 일반 질문 모드: 프로젝트 컨텍스트 없이 간단하게 질문만 전송
      if (useSimpleMode) {
        // 스트리밍 응답을 위한 assistant 메시지 미리 생성
        const assistantMessage: Message = {
          role: "assistant",
          content: "",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: currentInput,
            history: messages.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
            context: codeContext,
            contextFiles: [],
            projectType: "General",
            model: selectedModel,
            provider: selectedProvider,
            simpleMode: true, // 일반 질문 모드
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "API 호출 실패");
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
                  // 메시지 업데이트
                  setMessages((prev) => {
                    const updated = [...prev];
                    // 마지막 메시지가 assistant 메시지인지 확인
                    const lastIndex = prev.length - 1;
                    if (updated[lastIndex]?.role === "assistant") {
                      updated[lastIndex] = {
                        ...updated[lastIndex],
                        content: fullContent,
                      };
                    }
                    return updated;
                  });
                }
              } catch (e) {
                // JSON 파싱 실패 무시
              }
            }
          }
        }
        return;
      }

      // 프로젝트 프로필 정보 추가 (우선순위: 프로필 > 구조)
      let projectContextInfo = "";
      
      if (projectProfile?.profile && projectPath) {
        // 프로필이 있으면 프로필 사용 (요약본이 있으면 요약본 우선)
        const profileContent = projectProfile.summary || projectProfile.profile;
        projectContextInfo += "\n\n## 📋 프로젝트 프로필\n\n";
        projectContextInfo += profileContent;
        projectContextInfo += "\n\n**중요:** 위 프로젝트 프로필을 참고하여 다음을 파악하세요:\n";
        projectContextInfo += "- 프로젝트 타입, 프레임워크, 구조\n";
        projectContextInfo += "- 코딩 컨벤션 및 스타일 가이드\n";
        projectContextInfo += "- 파일 생성 시 적절한 경로 및 구조\n";
        projectContextInfo += "- 프로젝트에 맞는 코드 작성\n\n";
        projectContextInfo += "**프로젝트 프로필을 분석한 후, 불필요한 질문 없이 바로 계획을 세우세요.**\n";
      } else if (projectStructure && projectPath) {
        // 프로필이 없으면 기본 구조 정보 사용
        projectContextInfo += "\n\n## 📁 프로젝트 구조\n\n";
        projectContextInfo += `**프로젝트 타입:** ${projectStructure.projectType || "Unknown"}\n\n`;
        
        if (projectStructure.treeText) {
          projectContextInfo += "**파일 트리 구조:**\n";
          projectContextInfo += "```\n";
          projectContextInfo += projectStructure.treeText;
          projectContextInfo += "```\n\n";
        }
        
        if (projectStructure.configFiles) {
          projectContextInfo += "**주요 설정 파일:**\n\n";
          for (const [fileName, content] of Object.entries(projectStructure.configFiles)) {
            projectContextInfo += `### ${fileName}\n`;
            projectContextInfo += "```json\n";
            const maxLength = 2000;
            if (content.length > maxLength) {
              projectContextInfo += content.substring(0, maxLength) + "\n... (내용 생략)";
            } else {
              projectContextInfo += content;
            }
            projectContextInfo += "\n```\n\n";
          }
        }
        
        projectContextInfo += "\n**중요:** 위 프로젝트 구조를 참고하여 다음을 파악하세요:\n";
        projectContextInfo += "- 프로젝트 타입과 프레임워크 버전\n";
        projectContextInfo += "- 기존 파일 구조와 경로 규칙\n";
        projectContextInfo += "- 설정 파일의 내용과 의존성\n";
        projectContextInfo += "- 파일 생성 시 적절한 경로 결정\n";
        projectContextInfo += "- 프로젝트 구조에 맞는 코드 작성\n\n";
        projectContextInfo += "**프로젝트 구조를 분석한 후, 불필요한 질문 없이 바로 계획을 세우세요.**\n";
      }

      // 파일 내용 읽기
      let fileContents = "";
      const allFiles = [...droppedFiles, ...relatedFiles];
      
      if (allFiles.length > 0) {
        fileContents += "\n\n## 첨부된 파일들\n\n";
        
        for (const file of allFiles) {
          try {
            const fileResponse = await fetch(
              `/api/files/read?path=${encodeURIComponent(file.path)}&projectPath=${encodeURIComponent(file.projectPath)}`
            );
            
            if (fileResponse.ok) {
              const fileData = await fileResponse.json();
              const content = fileData.content || "";
              
              fileContents += `### ${file.name} (${file.path})\n`;
              if ('reason' in file && file.reason) {
                fileContents += `*${file.reason}*\n`;
              }
              
              // 텍스트 파일인 경우 내용 포함
              if (fileData.encoding === "text" || !fileData.encoding) {
                fileContents += `\`\`\`\n${content}\n\`\`\`\n\n`;
              } else {
                fileContents += `*(바이너리 파일 - 내용 생략)*\n\n`;
              }
            } else {
              fileContents += `### ${file.name} (${file.path})\n`;
              if ('reason' in file && file.reason) {
                fileContents += `*${file.reason}*\n`;
              }
              fileContents += `*(파일을 읽을 수 없습니다)*\n\n`;
            }
          } catch (error) {
            console.error(`Error reading file ${file.path}:`, error);
            fileContents += `### ${file.name} (${file.path})\n*(파일 읽기 오류)*\n\n`;
          }
        }
      }

      // Phase 1 계획에서 언급된 파일들의 존재 여부 사전 확인
      // 사용자 요청에서 파일 경로 추출 시도
      const filePathPatterns = [
        /(?:생성|create|만들|추가|수정|modify).*?([a-zA-Z0-9_\-/]+\.(tsx?|jsx?|ts|js|css|json|md|txt|py|java|go|rs|cpp|c|h))/gi,
        /(?:파일|file).*?([a-zA-Z0-9_\-/]+\.(tsx?|jsx?|ts|js|css|json|md|txt|py|java|go|rs|cpp|c|h))/gi,
        /`([a-zA-Z0-9_\-/]+\.(tsx?|jsx?|ts|js|css|json|md|txt|py|java|go|rs|cpp|c|h))`/gi,
        /([a-zA-Z0-9_\-/]+)\/([a-zA-Z0-9_\-]+)\.(tsx?|jsx?|ts|js)/gi, // app/page.tsx 같은 패턴
      ];
      
      const mentionedFiles: string[] = [];
      for (const pattern of filePathPatterns) {
        let match;
        while ((match = pattern.exec(currentInput)) !== null) {
          const filePath = match[1] || (match[2] ? `${match[1]}/${match[2]}.${match[3]}` : null);
          if (filePath && !mentionedFiles.includes(filePath)) {
            mentionedFiles.push(filePath);
          }
        }
      }
      
      // 언급된 파일들의 존재 여부 확인
      if (mentionedFiles.length > 0 && projectPath) {
        const fileExistenceInfo: Array<{ path: string; exists: boolean }> = [];
        
        for (const filePath of mentionedFiles) {
          try {
            // 경로 정규화
            let normalizedPath = filePath;
            if (normalizedPath.startsWith("./")) {
              normalizedPath = normalizedPath.substring(2);
            }
            if (normalizedPath.startsWith("/")) {
              normalizedPath = normalizedPath.substring(1);
            }
            
            const checkResponse = await fetch(
              `/api/files/read?path=${encodeURIComponent(normalizedPath)}&projectPath=${encodeURIComponent(projectPath)}`
            );
            
            fileExistenceInfo.push({
              path: normalizedPath,
              exists: checkResponse.ok,
            });
          } catch {
            // 확인 실패 시 존재하지 않음으로 간주
            fileExistenceInfo.push({
              path: filePath,
              exists: false,
            });
          }
        }
        
        // 파일 존재 여부 정보를 프롬프트에 추가
        if (fileExistenceInfo.length > 0) {
          fileContents += `\n\n## ⚠️ 파일 존재 여부 확인 결과 (Phase 1 계획에 반드시 반영하세요)\n\n`;
          fileContents += `**중요:** 다음 파일들의 존재 여부를 확인했습니다. 계획을 세울 때 이 정보를 반드시 고려하세요:\n\n`;
          fileExistenceInfo.forEach((info) => {
            fileContents += `- \`${info.path}\`: ${info.exists ? "✅ **이미 존재함**" : "❌ **존재하지 않음**"}\n`;
          });
          fileContents += `\n**지시사항:**\n`;
          fileContents += `- 파일이 **이미 존재**하면:\n`;
          fileContents += `  - CREATE 작업: \`isClear: false\`로 설정하고, \`questions\` 배열에 "파일이 이미 존재합니다. 다른 경로를 사용하시겠습니까?" 추가\n`;
          fileContents += `  - MODIFY 작업: \`fileExists: true\`로 설정하고 계속 진행\n`;
          fileContents += `- 파일이 **존재하지 않으면**:\n`;
          fileContents += `  - CREATE 작업: \`fileExists: false\`로 설정하고 계속 진행\n`;
          fileContents += `  - MODIFY 작업: \`isClear: false\`로 설정하고, \`questions\` 배열에 "파일이 존재하지 않습니다. CREATE 작업으로 변경하시겠습니까?" 추가\n`;
          fileContents += `- 계획의 \`filesToCreate\` 또는 \`filesToModify\` 배열에 각 파일의 \`fileExists\` 필드를 반드시 포함하세요 (true/false, "unknown" 금지).\n`;
          fileContents += `- "확인 필요"라고만 표시하지 말고, 실제 확인 결과(true/false)를 반드시 포함하세요.\n`;
        }
      }

      // 컨텍스트 파일 목록 생성
      const allContextFiles = [
        ...droppedFiles.map(f => ({ path: f.path, name: f.name })),
        ...relatedFiles.map(f => ({ path: f.path, name: f.name })),
      ];

      // 1단계: LLM에게 사용자 의도 파악 및 요청서 보강 요청 (백그라운드 처리, 사용자에게 보이지 않음)
      console.log("🔍 사용자 의도 파악 중...", {
        currentInput: currentInput,
        inputValue: currentInput,
        timestamp: new Date().toISOString()
      });
      
      // 명시적으로 현재 입력값으로 초기화 (이전 값이 남아있을 수 있음)
      let enhancedRequest: string = currentInput;
      let shouldIncludeHistory: boolean = true;
      let isNewTask: boolean = false;

      // 의도 파악을 빠르게 처리하기 위해 타임아웃 설정 (3초)
      const intentAnalysisPromise = Promise.race([
        (async () => {
          const intentAnalysisResponse = await fetch("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: `**CRITICAL: 사용자 원본 요청만 따르세요. 이전 대화는 무시하세요.**

다음 사용자 요청을 분석하여 명확한 요청서를 작성해주세요.

**사용자 원본 요청 (절대 변경 금지, 이것만 따르세요):**
"${String(currentInput).trim()}"

**CRITICAL 분석 규칙:**
1. **원본 요청의 핵심 키워드를 반드시 유지하세요**
   - 예: 원본이 "루미큐브"이면 → 보강 요청서에도 반드시 "루미큐브" 포함
   - 예: 원본이 "테트리스"이면 → 보강 요청서에도 반드시 "테트리스" 포함
   - 절대로 다른 게임/프로젝트 이름으로 바꾸지 마세요

2. **새로운 작업 판단:**
   - 원본 요청의 핵심 키워드(게임 이름, 프로젝트 이름 등)가 명확히 다르면 → 새로운 독립적인 작업
   - 예: 이전에 "테트리스"를 요청했고 지금 "루미큐브"를 요청하면 → 새로운 작업
   - 예: 이전에 "로그인 페이지"를 요청했고 지금 "회원가입 페이지"를 요청하면 → 새로운 작업

3. **보강 요청서 작성:**
   - 원본 요청의 핵심 단어/이름은 절대 변경하지 마세요
   - 오타 수정만 허용
   - 불명확한 표현만 구체화
   - 프로젝트 컨텍스트 정보만 추가

**응답 형식 (JSON만):**
\`\`\`json
{
  "isNewTask": true/false,
  "enhancedRequest": "보강된 명확한 요청서 (원본 핵심 키워드 반드시 포함, 절대 변경 금지)",
  "shouldIncludeHistory": true/false
}
\`\`\`

**중요:**
- 원본 요청의 핵심 키워드가 다른 게임/프로젝트 이름이면 반드시 isNewTask: true로 설정
- 보강된 요청서는 원본 요청의 핵심을 절대 변경하지 말고, 명확성만 추가하세요`,
              history: [], // 의도 파악은 히스토리 없이 진행
              context: "",
              contextFiles: [],
              projectType: projectStructure?.projectType || "Next.js",
              model: selectedModel,
              provider: selectedProvider,
              simpleMode: true, // 빠른 응답을 위해 simpleMode 사용
            }),
          });

          if (!intentAnalysisResponse.ok) {
            return null;
          }

          // 스트리밍 응답 읽기 (빠르게 처리)
          const reader = intentAnalysisResponse.body?.getReader();
          const decoder = new TextDecoder();
          let analysisContent = "";

          if (reader) {
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
                      analysisContent += data.content;
                    }
                    if (data.done) break; // 완료 신호
                  } catch {
                    // JSON 파싱 실패 무시
                  }
                }
              }
            }
          }
          
          return analysisContent;
        })(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)) // 3초 타임아웃
      ]);

      try {
        const analysisContent = await intentAnalysisPromise;
        
        if (analysisContent) {
          // 분석 결과 파싱
          const { parseStructuredResponse } = await import("@/utils/promptBuilder");
          const analysisResult = parseStructuredResponse(analysisContent);
          
          if (analysisResult) {
            // JSON 응답에서 정보 추출 시도
            try {
              const jsonMatch = analysisContent.match(/```json\s*([\s\S]*?)```/);
              if (jsonMatch) {
                const analysisData = JSON.parse(jsonMatch[1]);
                if (analysisData.enhancedRequest) {
                  // 원본 요청의 핵심 키워드 추출 (2글자 이상 단어, 특수문자 제거)
                  const originalKeywords = currentInput
                    .split(/\s+/)
                    .filter(word => word.length >= 2)
                    .map(word => word.toLowerCase().replace(/[^\w가-힣]/g, ''))
                    .filter(keyword => keyword.length >= 2); // 최소 2글자
                  
                  // 보강된 요청서에 원본 키워드가 포함되어 있는지 검증
                  const enhancedLower = analysisData.enhancedRequest.toLowerCase().replace(/[^\w가-힣]/g, ' ');
                  
                  // 핵심 키워드가 모두 포함되어 있는지 확인 (더 엄격한 검증)
                  const hasAllKeywords = originalKeywords.length > 0 
                    ? originalKeywords.every(keyword => enhancedLower.includes(keyword))
                    : true; // 키워드가 없으면 통과
                  
                  // 또는 최소한 하나라도 포함되어 있는지 확인
                  const hasOriginalKeywords = originalKeywords.length > 0
                    ? originalKeywords.some(keyword => enhancedLower.includes(keyword))
                    : true;
                  
                  // 키워드 검증: 핵심 키워드가 모두 포함되어 있거나, 최소한 하나라도 포함되어 있어야 함
                  if (hasAllKeywords || (hasOriginalKeywords && originalKeywords.length <= 3)) {
                    // 원본 키워드가 모두 포함되어 있거나, 키워드가 3개 이하일 때 하나라도 포함되면 보강된 요청서 사용
                    enhancedRequest = analysisData.enhancedRequest;
                    shouldIncludeHistory = analysisData.shouldIncludeHistory !== false;
                    isNewTask = analysisData.isNewTask === true;
                    
                    console.log("✅ 요청서 보강 완료:", {
                      original: currentInput.substring(0, 50),
                      enhanced: enhancedRequest.substring(0, 50),
                      isNewTask,
                      shouldIncludeHistory,
                      keywords: originalKeywords,
                      hasAllKeywords,
                      hasOriginalKeywords
                    });
                  } else {
                    // 원본 키워드가 충분히 포함되지 않으면 원본 요청 사용
                    console.warn("⚠️ 보강된 요청서에 원본 키워드 누락, 원본 요청 사용:", {
                      original: currentInput,
                      enhanced: analysisData.enhancedRequest,
                      keywords: originalKeywords,
                      hasAllKeywords,
                      hasOriginalKeywords
                    });
                    enhancedRequest = currentInput; // 원본 유지
                    // 원본을 사용할 때는 새로운 작업으로 간주
                    isNewTask = true;
                    shouldIncludeHistory = false;
                  }
                }
              }
            } catch (parseError) {
              console.warn("⚠️ 분석 결과 파싱 실패, 원본 요청 사용:", parseError);
            }
          }
        }
      } catch (error) {
        console.warn("⚠️ 의도 분석 실패, 원본 요청 사용:", error);
      }

      // 히스토리 필터링 (새로운 작업이면 이전 대화 제한)
      let filteredHistory = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      if (isNewTask || !shouldIncludeHistory) {
        // 새로운 작업이면 이전 대화 히스토리를 완전히 제거
        // 원본 요청의 키워드가 다른 게임/프로젝트 이름이면 완전히 새로운 작업
        filteredHistory = [];
        
        console.log("🆕 새로운 작업 감지 - 히스토리 완전 제거:", {
          original: messages.length,
          cleared: "all"
        });
      } else {
        // 기존 작업의 연속이면 최근 20개 유지하되, planning/execution 단계 내용은 제외
        filteredHistory = filteredHistory.filter(msg => {
          const content = msg.content.toLowerCase();
          // planning/execution 단계의 상세 내용 제외
          const hasPlan = content.includes('"plan"') || content.includes('"codeBlocks"');
          const hasExecution = content.includes('"phase": "execution"') || content.includes('"phase":"execution"');
          const hasAnalysis = content.includes('"analysis"') && content.length > 500;
          
          return !hasPlan && !hasExecution && !hasAnalysis;
        });
        
        filteredHistory = filteredHistory.slice(-20);
      }

      // 스트리밍 응답을 위한 assistant 메시지 미리 생성
      const assistantMessage: Message = {
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // 2단계: 보강된 요청서로 최종 API 호출
      // 원본 요청을 명시적으로 포함하여 LLM이 정확히 이해하도록 함
      
      // currentInput을 명시적으로 문자열로 변환하여 클로저 문제 방지
      const originalRequest = String(currentInput).trim();
      
      // 디버깅: 현재 입력값 확인
      console.log("🔍 최종 요청 전 확인:", {
        currentInput: currentInput,
        originalRequest: originalRequest,
        enhancedRequest: enhancedRequest,
        isNewTask: isNewTask,
        shouldIncludeHistory: shouldIncludeHistory,
        inputLength: currentInput.length,
        originalLength: originalRequest.length,
        enhancedLength: enhancedRequest.length,
        areEqual: currentInput === originalRequest
      });
      
      const finalMessage = isNewTask || !shouldIncludeHistory
        ? `**⚠️ CRITICAL: 사용자 원본 요청을 정확히 따르세요. 이전 대화 히스토리는 무시하세요.**

**사용자 원본 요청 (절대 변경 금지, 이것만 따르세요):**
"${originalRequest}"

**보강된 요청서 (참고용, 원본 요청이 우선):**
${enhancedRequest}

**중요 지시사항:**
1. 위 "사용자 원본 요청"에 명시된 내용을 정확히 따르세요
2. 원본 요청의 핵심 키워드(게임 이름, 프로젝트 이름 등)를 절대 변경하지 마세요
   - 예: 원본이 "루미큐브"이면 → 반드시 "루미큐브"로 작업
   - 예: 원본이 "테트리스"이면 → 반드시 "테트리스"로 작업
3. 이전 대화 히스토리에 다른 게임/프로젝트 이름이 있어도 무시하고, 원본 요청만 따르세요
4. 보강된 요청서는 참고용이며, 원본 요청이 우선입니다

${projectContextInfo}${fileContents}`
        : `${enhancedRequest}${projectContextInfo}${fileContents}`;

      // 디버깅: 최종 메시지 확인
      console.log("📤 최종 전송 메시지:", {
        messagePreview: finalMessage.substring(0, 200),
        messageLength: finalMessage.length,
        containsOriginal: finalMessage.includes(currentInput),
        historyLength: filteredHistory.length
      });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: finalMessage,
          history: filteredHistory,
          context: codeContext, // 현재 편집 중인 코드 컨텍스트
          contextFiles: allContextFiles, // 컨텍스트 파일 목록
          projectType: projectStructure?.projectType || "Next.js", // 프로젝트 타입 (자동 감지)
          model: selectedModel, // 선택한 모델
          provider: selectedProvider, // 선택한 provider
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "API 호출 실패");
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
              // done 신호 확인 (reasoning 모델용)
              if (data.done) {
                console.log("✅ Stream completed");
                break;
              }
              if (data.content) {
                fullContent += data.content;
                // 메시지 업데이트
                setMessages((prev) => {
                  const updated = [...prev];
                  // 마지막 메시지가 assistant 메시지인지 확인
                  const lastIndex = updated.length - 1;
                  if (updated[lastIndex]?.role === "assistant") {
                    updated[lastIndex] = {
                      ...updated[lastIndex],
                      content: fullContent,
                    };
                  }
                  return updated;
                });
              }
            } catch (e) {
              // JSON 파싱 실패 무시
            }
          }
        }
      }

      const assistantResponse = fullContent;
      
      // 응답이 완전한지 확인 (reasoning 모델의 경우 응답이 끊길 수 있음)
      console.log("📝 Full response received:", {
        length: assistantResponse.length,
        hasJsonBlock: assistantResponse.includes("```json"),
        endsWithJson: assistantResponse.trim().endsWith("```"),
        preview: assistantResponse.substring(0, 200) + "...",
      });
      
      // 구조화된 응답 파싱
      const { parseStructuredResponse } = await import("@/utils/promptBuilder");
      const structuredResponse = parseStructuredResponse(assistantResponse);
      
      // 디버깅: 응답 구조 확인
      if (structuredResponse) {
        console.log("📋 Structured response parsed:", {
          phase: structuredResponse.phase,
          hasPlan: !!structuredResponse.plan,
          planKeys: structuredResponse.plan ? Object.keys(structuredResponse.plan) : [],
          isClear: structuredResponse.isClear,
          hasTasks: !!structuredResponse.tasks,
          tasksCount: structuredResponse.tasks?.length || 0,
          hasCodeBlocks: !!structuredResponse.codeBlocks,
          codeBlocksCount: structuredResponse.codeBlocks?.length || 0,
        });
      } else {
        console.warn("⚠️ No structured response found in:", {
          responseLength: assistantResponse.length,
          preview: assistantResponse.substring(0, 500),
          hasJsonBlock: assistantResponse.includes("```json"),
        });
      }

      // 질문 감지 및 자동 답변 생성
      const hasQuestions = checkForQuestions(assistantResponse, structuredResponse);
      if (hasQuestions) {
        console.log("❓ 질문이 감지되었습니다. 자동 답변 생성 시작...");
        
        // 질문 추출
        const questions = extractQuestions(assistantResponse, structuredResponse);
        
        // 자동 답변 생성 메시지 추가
        const autoResponseMessage: Message = {
          role: "user",
          content: generateAutoResponse(questions, currentInput, projectContextInfo, fileContents),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, autoResponseMessage]);
        
        // 자동 답변 생성 (재귀 호출)
        await handleAutoResponse(
          autoResponseMessage.content,
          [...messages, userMessage, { ...assistantMessage, content: assistantResponse }, autoResponseMessage],
          projectContextInfo,
          fileContents,
          allContextFiles,
          0 // 재귀 깊이
        );
        return; // 자동 답변 생성 후 종료
      }
      
      // 구조화된 응답이 있으면 포맷팅해서 표시
      let displayContent = assistantResponse;
      
      if (structuredResponse) {
        // 계획 저장 조건: plan 객체가 있거나, phase가 planning이거나, analysis가 있으면 저장
        const hasPlanObject = !!structuredResponse.plan;
        const hasPlanContent = structuredResponse.plan && (
          (structuredResponse.plan.packages && structuredResponse.plan.packages.length > 0) ||
          (structuredResponse.plan.filesToModify && structuredResponse.plan.filesToModify.length > 0) ||
          (structuredResponse.plan.filesToCreate && structuredResponse.plan.filesToCreate.length > 0) ||
          structuredResponse.plan.executionOrder ||
          structuredResponse.plan.architecture ||
          structuredResponse.plan.subTasks ||
          Object.keys(structuredResponse.plan).length > 0
        );
        
        const isPlanningPhase = structuredResponse.phase === "planning";
        const isExecutionPhase = structuredResponse.phase === "execution";
        const hasAnalysis = !!structuredResponse.analysis;
        const hasTasks = structuredResponse.tasks && structuredResponse.tasks.length > 0;
        const hasCodeBlocks = structuredResponse.codeBlocks && structuredResponse.codeBlocks.length > 0;
        
        // 저장 조건: plan 객체가 있거나, planning/execution phase이거나, analysis가 있거나, tasks가 있거나, codeBlocks가 있으면 저장
        const shouldSave = (isPlanningPhase || isExecutionPhase || hasPlanObject || hasAnalysis || hasTasks || hasCodeBlocks) && projectPath;
        
        console.log("📋 Planning save check:", {
          phase: structuredResponse.phase,
          hasPlanObject,
          hasPlanContent,
          hasAnalysis,
          hasTasks,
          hasCodeBlocks,
          isPlanningPhase,
          isExecutionPhase,
          shouldSave,
          projectPath: projectPath || "MISSING",
          planKeys: structuredResponse.plan ? Object.keys(structuredResponse.plan) : [],
          planFilesToCreate: structuredResponse.plan?.filesToCreate?.length || 0,
          planFilesToModify: structuredResponse.plan?.filesToModify?.length || 0,
          planPackages: structuredResponse.plan?.packages?.length || 0,
          tasksCount: structuredResponse.tasks?.length || 0,
          codeBlocksCount: structuredResponse.codeBlocks?.length || 0,
        });
        
        if (shouldSave) {
          try {
            console.log("💾 Attempting to save planning...", {
              projectPath,
              hasPlan: !!structuredResponse.plan,
              phase: structuredResponse.phase,
            });
            
            if (!projectPath) {
              console.error("❌ Cannot save planning: projectPath is missing!");
              // 사용자에게 알림 표시
              const errorMessage: Message = {
                role: "assistant",
                content: "⚠️ **계획 저장 실패**\n\n프로젝트가 선택되지 않아 계획을 저장할 수 없습니다. 좌측 사이드바에서 프로젝트를 선택한 후 다시 시도해주세요.",
                timestamp: new Date(),
              };
              setMessages((prev) => [...prev, errorMessage]);
              return;
            }
            
            const saveResponse = await fetch("/api/planning/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectPath: projectPath,
                planningData: structuredResponse,
                userRequest: currentInput,
              }),
            });
            
            if (saveResponse.ok) {
              const saveData = await saveResponse.json();
              console.log("✅ Planning saved successfully:", saveData.path);
              // 저장 성공 후 계획 검토 탭 새로고침 이벤트 발생
              window.dispatchEvent(new CustomEvent("planningSaved"));
            } else {
              const errorData = await saveResponse.json();
              console.error("❌ Planning save failed:", errorData);
            }
          } catch (error) {
            console.error("❌ Error saving planning:", error);
            // 저장 실패해도 계속 진행
          }
        } else {
          console.warn("⏭️ Planning not saved - conditions not met:", {
            isPlanningPhase,
            hasPlanObject,
            hasAnalysis,
            hasTasks,
            projectPath: projectPath || "MISSING",
            reason: !projectPath ? "projectPath is missing" : "planning conditions not met"
          });
        }
        
        // 구조화된 데이터를 사용자 친화적인 형식으로 변환
        displayContent = formatStructuredResponse(structuredResponse);
        // 스트리밍으로 받은 메시지를 포맷팅된 내용으로 업데이트
        setMessages((prev) => {
          const updated = [...prev];
          // 마지막 메시지가 assistant 메시지인지 확인
          const lastIndex = updated.length - 1;
          if (updated[lastIndex]?.role === "assistant") {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: displayContent,
            };
          }
          return updated;
        });
      }

      // 코드 변경사항 파싱 및 전달
      if (assistantResponse) {
        const { parseCodeBlocks } = await import("@/utils/codeParser");
        // 컨텍스트 파일 목록 생성 (드롭된 파일 + 연관 파일)
        const contextFiles = [
          ...droppedFiles.map(f => f.path),
          ...relatedFiles.map(f => f.path),
        ];
        const codeBlocks = parseCodeBlocks(assistantResponse, contextFiles);
        
        if (codeBlocks.length > 0) {
          // 부모 컴포넌트에 코드 변경사항 전달
          if (window.dispatchEvent) {
            window.dispatchEvent(
              new CustomEvent("codeChanges", {
                detail: {
                  codeBlocks,
                  response: assistantResponse,
                },
              })
            );
          }
        }
      }
    } catch (error) {
      console.error("Error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: `오류가 발생했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Enter 또는 Cmd+Enter: 일반 질문 모드
        e.preventDefault();
        handleSend(true);
      } else if (!e.shiftKey) {
        // Enter만: 기존 워크플로우 모드
        e.preventDefault();
        handleSend(false);
      }
      // Shift+Enter: 줄바꿈 (기본 동작)
    }
  };

      const allModels = [...AVAILABLE_MODELS, ...ollamaModels];
      const currentModel = allModels.find((m) => m.id === selectedModel && m.provider === selectedProvider);

  return (
    <div
      className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 현재 프로젝트 헤더 */}
      {currentProjectInfo && (
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                현재 프로젝트:
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate" title={currentProjectInfo.name}>
                {currentProjectInfo.name || "알 수 없음"}
              </span>
              {projectProfile ? (
                <span className="text-xs text-green-600 dark:text-green-400 whitespace-nowrap">✓ 프로필 있음</span>
              ) : (
                <span className="text-xs text-yellow-600 dark:text-yellow-400 whitespace-nowrap">⚠ 프로필 없음</span>
              )}
            </div>
            <button
              onClick={() => {
                if (confirm("프로젝트를 재설정하시겠습니까?\n\n좌측 프로젝트 목록에서 다른 프로젝트를 선택할 수 있습니다.")) {
                  // 프로젝트 사이드바로 포커스 이동 (이벤트 발생)
                  window.dispatchEvent(new CustomEvent("focusProjectSidebar"));
                }
              }}
              className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors whitespace-nowrap"
              title="프로젝트 재설정"
            >
              재설정
            </button>
          </div>
        </div>
      )}

      {/* 모델 선택 헤더 */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              모델
            </span>
          </div>
          <div className="relative" ref={modelSelectorRef}>
            <button
              onClick={() => setShowModelSelector(!showModelSelector)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {currentModel?.name || selectedModel}
            </button>
            {showModelSelector && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 max-h-80 overflow-y-auto">
                <div className="p-2">
                  {/* Provider 선택 */}
                  <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 mb-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          // Provider만 변경하고 모델은 유지 (또는 현재 선택된 Grok 모델이 있으면 유지)
                          if (selectedProvider !== "grok") {
                            // Ollama에서 Grok로 전환 시, 현재 선택된 모델이 Grok 모델 목록에 있으면 유지
                            const currentModelInGrok = GROK_MODELS.find(m => m.id === selectedModel);
                            if (currentModelInGrok) {
                              setSelectedProvider("grok");
                            } else {
                              // 없으면 첫 번째 Grok 모델로 변경
                              handleModelChange(GROK_MODELS[0].id, "grok");
                            }
                          }
                        }}
                        className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                          selectedProvider === "grok"
                            ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        }`}
                      >
                        Grok
                      </button>
                      <button
                        onClick={() => {
                          // Provider만 변경하고 모델은 유지 (또는 현재 선택된 Ollama 모델이 있으면 유지)
                          if (selectedProvider !== "ollama") {
                            // Grok에서 Ollama로 전환 시, 현재 선택된 모델이 Ollama 모델 목록에 있으면 유지
                            const currentModelInOllama = ollamaModels.find(m => m.id === selectedModel);
                            if (currentModelInOllama) {
                              setSelectedProvider("ollama");
                            } else if (ollamaModels.length > 0) {
                              // 없으면 첫 번째 Ollama 모델로 변경
                              handleModelChange(ollamaModels[0].id, "ollama");
                            } else {
                              // Ollama 모델이 없으면 provider만 변경
                              setSelectedProvider("ollama");
                            }
                          }
                        }}
                        className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                          selectedProvider === "ollama"
                            ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        }`}
                      >
                        Ollama
                      </button>
                    </div>
                  </div>

                  {/* Grok 모델 목록 */}
                  {selectedProvider === "grok" && GROK_MODELS.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => handleModelChange(model.id, "grok")}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedModel === model.id && selectedProvider === "grok"
                          ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      }`}
                    >
                      <div className="font-medium">{model.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {model.description}
                      </div>
                      {model.tokens && (
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {model.tokens}
                        </div>
                      )}
                    </button>
                  ))}

                  {/* Ollama 모델 목록 */}
                  {selectedProvider === "ollama" && (
                    <>
                      {ollamaModels.length > 0 ? (
                        <>
                          <div className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400 mb-1">
                            설치된 모델 ({ollamaModels.length}개)
                          </div>
                          {ollamaModels.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => handleModelChange(model.id, "ollama")}
                              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                selectedModel === model.id && selectedProvider === "ollama"
                                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                              }`}
                            >
                              <div className="font-medium">{model.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {model.description}
                              </div>
                            </button>
                          ))}
                        </>
                      ) : (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                          설치된 Ollama 모델이 없습니다.
                        </div>
                      )}
                      
                      {/* 커스텀 Ollama 모델 입력 */}
                      <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          또는 모델명 직접 입력:
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={customOllamaModel}
                            onChange={(e) => setCustomOllamaModel(e.target.value)}
                            placeholder="예: gemma2:27b, llama3.2"
                            className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && customOllamaModel.trim()) {
                                handleModelChange(customOllamaModel.trim(), "ollama");
                                setCustomOllamaModel("");
                              }
                            }}
                          />
                          <button
                            onClick={() => {
                              if (customOllamaModel.trim()) {
                                handleModelChange(customOllamaModel.trim(), "ollama");
                                setCustomOllamaModel("");
                              }
                            }}
                            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                          >
                            사용
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 우측 상단: 대화 결과창 */}
      <div
        ref={chatAreaRef}
        className={`flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 transition-colors ${
          isDragging
            ? "bg-blue-50 dark:bg-blue-900/20 border-2 border-dashed border-blue-500"
            : ""
        }`}
      >
        {isDragging && (
          <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-50">
            <div className="bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg">
              파일을 여기에 드롭하세요
            </div>
          </div>
        )}
        {isAnalyzing && (
          <div className="flex gap-3 justify-start mb-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg px-4 py-2">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                연관 파일 분석 중...
              </p>
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex gap-2 ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {message.role === "assistant" && (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center mt-1">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div
              className={`max-w-[90%] rounded-lg px-3 py-2 relative group break-words ${
                message.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              }`}
            >
              <PathClickableContent content={message.content} />
              
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs opacity-70" suppressHydrationWarning>
                  {message.timestamp.toLocaleTimeString()}
                </span>
                {message.role === "assistant" && (
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(message.content);
                        setCopiedMessageIndex(index);
                        setTimeout(() => setCopiedMessageIndex(null), 2000);
                      } catch (error) {
                        console.error("Failed to copy:", error);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    title="복사"
                  >
                    {copiedMessageIndex === index ? (
                      <Check className="w-3 h-3 text-green-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
            </div>
            {message.role === "user" && (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center mt-1">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-2 justify-start">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center mt-1">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 드롭된 파일 및 연관 파일 목록 */}
      {(droppedFiles.length > 0 || relatedFiles.length > 0) && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 bg-gray-50 dark:bg-gray-900 max-h-40 overflow-y-auto overflow-x-hidden">
          {droppedFiles.length > 0 && (
            <div className="mb-2">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                첨부된 파일:
              </div>
              <div className="flex flex-wrap gap-1">
                {droppedFiles.map((file, index) => (
                  <span
                    key={`dropped-${index}`}
                    className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded flex items-center gap-1 group"
                  >
                    <span className="truncate max-w-[100px]">{file.name}</span>
                    <button
                      onClick={() => {
                        setDroppedFiles((prev) => prev.filter((_, i) => i !== index));
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:bg-blue-200 dark:hover:bg-blue-800 rounded p-0.5 transition-opacity"
                      title="제거"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {relatedFiles.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  연관된 파일 ({relatedFiles.length}개):
                </div>
                <button
                  onClick={() => setRelatedFiles([])}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  title="모두 제거"
                >
                  모두 제거
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {relatedFiles.map((file, index) => (
                  <span
                    key={`related-${index}`}
                    className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded flex items-center gap-1 group"
                    title={file.reason}
                  >
                    <span className="truncate max-w-[100px]">{file.name}</span>
                    <button
                      onClick={() => {
                        setRelatedFiles((prev) => prev.filter((_, i) => i !== index));
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:bg-green-200 dark:hover:bg-green-800 rounded p-0.5 transition-opacity"
                      title="제거"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 우측 하단: 대화 입력창 */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요... (Enter: 워크플로우, Ctrl+Enter: 일반 질문, Shift+Enter: 줄바꿈)"
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            rows={3}
          />
          <button
            onClick={() => handleSend(true)}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            title="일반 질문으로 전송 (Ctrl+Enter)"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

