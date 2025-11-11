import React from "react";
import { toast } from "sonner";
import { ExecutionLog, PlanningData, StepResult } from "../types";
import { checkAndFixErrors } from "../utils/errorChecking";
import { stripAnsiCodes } from "../utils/formatting";
import { getLanguageFromExtension } from "../utils/languageUtils";

export interface StepExecutionContext {
  projectPath: string | null | undefined;
  planning: PlanningData["planning"];
  metadata: { userRequest?: string };
  tasks: Array<{ type: string; description?: string; target?: string; command?: string; content?: string }>;
  codeBlocks: Array<{ filePath: string; language?: string; content?: string }>;
  addExecutionLog: (stepIndex: number, log: ExecutionLog) => void;
  setAnalysisResults: React.Dispatch<React.SetStateAction<Map<number, string>>>;
  analysisResults: Map<number, string>;
}

export async function executeStep(
  stepIndex: number,
  stepDescription: string,
  context: StepExecutionContext
): Promise<StepResult> {
  const { projectPath, planning, tasks, addExecutionLog } = context;

  if (!projectPath) {
    toast.error("프로젝트 경로가 없습니다.");
    return { success: false, message: "프로젝트 경로가 없습니다." };
  }

  // 실행 시작 로그
  addExecutionLog(stepIndex, {
    timestamp: new Date(),
    type: "info",
    message: `단계 실행 시작: ${stepDescription}`,
  });

  try {
    // stepDescription에서 작업 유형과 대상 추출
    let result: StepResult | null = null;

    // 1. 패키지 설치 단계인지 확인
    if (stepDescription.toLowerCase().includes("install") || stepDescription.toLowerCase().includes("패키지")) {
      const packages = planning?.plan?.packages || [];
      if (packages.length > 0) {
        const installCommand = `npm install ${packages.join(" ")}`;
        
        // 명령어 실행 로그
        addExecutionLog(stepIndex, {
          timestamp: new Date(),
          type: "command",
          message: "패키지 설치 명령어 실행",
          command: installCommand,
          details: `설치할 패키지: ${packages.join(", ")}`,
        });
        
        const response = await fetch("/api/commands/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: installCommand,
            projectPath: projectPath,
          }),
        });
        const data = await response.json();
        
        // 터미널에 출력
        const terminalWriteOutput = (window as { terminalWriteOutput?: (output: string, isError?: boolean) => void }).terminalWriteOutput;
        if (typeof terminalWriteOutput === "function") {
          if (response.ok) {
            const output = data.stdout || "설치가 완료되었습니다.";
            terminalWriteOutput(`[${stepDescription}] ${installCommand}\n${output}`, false);
          } else {
            // 오류 정보를 모두 포함
            const errorParts: string[] = [];
            if (data.error) errorParts.push(`오류: ${data.error}`);
            if (data.details) errorParts.push(`상세: ${data.details}`);
            if (data.stderr) errorParts.push(`stderr: ${data.stderr}`);
            if (data.stdout) errorParts.push(`stdout: ${data.stdout}`);
            const errorOutput = errorParts.length > 0 
              ? errorParts.join('\n')
              : "알 수 없는 오류";
            terminalWriteOutput(`[${stepDescription}] ${installCommand}\n${errorOutput}`, true);
          }
        }
        
        // 실행 결과 로그
        if (response.ok) {
          addExecutionLog(stepIndex, {
            timestamp: new Date(),
            type: "success",
            message: "패키지 설치 성공",
            details: data.stdout || "설치가 완료되었습니다.",
          });
        } else {
          // 오류 정보를 모두 포함
          const errorParts: string[] = [];
          if (data.error) errorParts.push(data.error);
          if (data.details) errorParts.push(data.details);
          if (data.stderr) errorParts.push(data.stderr);
          if (data.stdout) errorParts.push(data.stdout);
          const errorMessage = errorParts.length > 0 
            ? errorParts.join(' | ')
            : "알 수 없는 오류";
          
          addExecutionLog(stepIndex, {
            timestamp: new Date(),
            type: "error",
            message: "패키지 설치 실패",
            details: errorMessage,
          });
        }
        
        result = {
          success: response.ok,
          message: data.message || data.error || "패키지 설치 완료",
        };
      }
    }
    // 2. 파일 생성 단계인지 확인
    else if (stepDescription.toLowerCase().includes("create") || stepDescription.toLowerCase().includes("생성")) {
      result = await handleFileCreation(stepIndex, stepDescription, context);
    }
    // 3. 파일 수정 단계인지 확인
    else if (stepDescription.toLowerCase().includes("modify") || stepDescription.toLowerCase().includes("수정") || stepDescription.toLowerCase().includes("update")) {
      result = await handleFileModification(stepIndex, stepDescription, context);
    }
    // 3-1. 명령어 실행 단계인지 확인
    else if (
      stepDescription.toLowerCase().includes("개발 서버") ||
      stepDescription.toLowerCase().includes("빌드") ||
      stepDescription.toLowerCase().includes("테스트") ||
      stepDescription.toLowerCase().includes("재시작") ||
      stepDescription.toLowerCase().includes("실행") ||
      stepDescription.toLowerCase().includes("restart") ||
      stepDescription.toLowerCase().includes("build") ||
      stepDescription.toLowerCase().includes("dev") ||
      stepDescription.toLowerCase().includes("run") ||
      stepDescription.toLowerCase().includes("test") ||
      stepDescription.toLowerCase().includes("compile") ||
      stepDescription.toLowerCase().includes("컴파일") ||
      stepDescription.match(/npm\s+run\s+(dev|build|start|test)/i) ||
      stepDescription.match(/yarn\s+(dev|build|start|test)/i) ||
      stepDescription.match(/pnpm\s+run\s+(dev|build|start|test)/i) ||
      stepDescription.match(/python\s+.*(run|test|build)/i) ||
      stepDescription.match(/java\s+.*(run|test|build)/i) ||
      stepDescription.match(/go\s+(run|build|test)/i) ||
      stepDescription.match(/cargo\s+(run|build|test)/i) ||
      stepDescription.match(/mvn\s+(.*)/i) ||
      stepDescription.match(/gradle\s+(.*)/i) ||
      stepDescription.match(/make\s+(.*)/i) ||
      stepDescription.match(/cmake\s+(.*)/i)
    ) {
      result = await handleCommandExecution(stepIndex, stepDescription, context);
    }
    // 4. tasks에서 해당 단계 찾기
    else if (tasks.length > 0) {
      result = await handleTaskExecution(stepIndex, stepDescription, context);
    }

    // 결과가 설정되지 않은 경우
    if (!result) {
      // 환경 변수 설정 단계인지 확인 (.env 파일 관련)
      result = await handleEnvironmentVariable(stepIndex, stepDescription, context);
    }

    // 설정 파일 생성/수정 단계인지 확인
    if (!result && stepDescription.match(/(설정|config|configuration|설정 파일)/i)) {
      result = await handleConfigFileCreation(stepIndex, stepDescription, context);
    }

    // 정보 제공 단계인지 확인 (분석, 요약, 제시 등)
    if (!result) {
      result = await handleInformationStep(stepIndex, stepDescription, context);
    }

    // result가 null이면 기본값 설정
    if (!result) {
      result = {
        success: false,
        message: "작업을 실행할 수 없습니다.",
      };
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류";
    addExecutionLog(stepIndex, {
      timestamp: new Date(),
      type: "error",
      message: "단계 실행 중 오류",
      details: errorMessage,
    });
    return {
      success: false,
      message: errorMessage,
    };
  }
}

// 파일 생성 핸들러
async function handleFileCreation(
  stepIndex: number,
  stepDescription: string,
  context: StepExecutionContext
): Promise<StepResult | null> {
  const { projectPath, planning, tasks, codeBlocks, addExecutionLog } = context;
  const filesToCreate = planning?.plan?.filesToCreate || [];
  
  if (filesToCreate.length === 0) {
    return null;
  }

  // stepDescription에서 여러 파일명 추출 (예: "3.1 컴포넌트 생성 (PostList.tsx, PostForm.tsx, PostDetail.tsx)")
  let fileNamesToCreate: string[] = [];
  
  // 방법 1: 괄호 안의 파일명들 추출
  const parenthesesMatch = stepDescription.match(/\(([^)]+)\)/);
  if (parenthesesMatch && parenthesesMatch[1]) {
    // 쉼표로 구분된 파일명들 추출
    fileNamesToCreate = parenthesesMatch[1]
      .split(",")
      .map(name => name.trim())
      .filter(name => name.length > 0);
  }
  
  // 방법 2: stepDescription에서 파일 경로 패턴 추출 (단일 파일인 경우)
  if (fileNamesToCreate.length === 0) {
    const pathPatterns = [
      /([a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|json|css|md|py|java|go|rs|cpp|c|h|hpp|sql|yaml|yml|xml|sh|bash|zsh|txt|html|vue|svelte))\s*(생성|create|수정|modify|생성|만들기)/i,
      /([a-zA-Z0-9_\-./]+\/)+[a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|json|css|md|py|java|go|rs|cpp|c|h|hpp|sql|yaml|yml|xml|sh|bash|zsh|txt|html|vue|svelte)/i,
      /([a-zA-Z0-9_\-./]+)\s*(생성|create|수정|modify)/i,
    ];
    
    for (const pattern of pathPatterns) {
      const match = stepDescription.match(pattern);
      if (match && match[1]) {
        fileNamesToCreate = [match[1].trim()];
        break;
      }
    }
  }
  
  // 방법 3: tasks에서 stepDescription과 일치하는 작업들 찾기
  if (fileNamesToCreate.length === 0) {
    const matchingTasks = tasks.filter(t => 
      (t.type === "create" || t.type === "modify") &&
      t.target &&
      stepDescription.includes(t.target.split("/").pop() || "")
    );
    
    if (matchingTasks.length > 0) {
      fileNamesToCreate = matchingTasks.map(t => t.target?.split("/").pop() || "").filter(Boolean);
    }
  }
  
  // 방법 4: stepIndex로 매칭 (fallback)
  if (fileNamesToCreate.length === 0) {
    const fallbackFile = filesToCreate[stepIndex] || filesToCreate[0];
    if (fallbackFile) {
      fileNamesToCreate = [fallbackFile.path.split("/").pop() || fallbackFile.path];
    }
  }
  
  // 각 파일명에 대해 매칭되는 파일 찾기 및 생성
  const filesToProcess: Array<typeof filesToCreate[0]> = [];
  
  console.log("🔍 파일 생성 단계 - 추출된 파일명들:", fileNamesToCreate);
  console.log("🔍 filesToCreate 목록:", filesToCreate.map(f => f.path));
  
  for (const fileName of fileNamesToCreate) {
    // filesToCreate에서 매칭되는 파일 찾기
    // 1. 정확한 경로 매칭
    let matchedFile = filesToCreate.find(f => f.path === fileName);
    
    // 2. 경로 끝부분 매칭 (fileName이 상대 경로인 경우)
    if (!matchedFile) {
      matchedFile = filesToCreate.find(f => f.path.endsWith(fileName));
    }
    
    // 3. 경로 시작 부분 매칭
    if (!matchedFile) {
      matchedFile = filesToCreate.find(f => fileName.endsWith(f.path));
    }
    
    // 4. 파일명만 매칭 (경로가 다른 경우)
    if (!matchedFile) {
      const fileNameOnly = fileName.split("/").pop() || fileName;
      matchedFile = filesToCreate.find(f => {
        const fNameOnly = f.path.split("/").pop() || f.path;
        return fNameOnly === fileNameOnly || f.path.includes(fileNameOnly);
      });
    }
    
    // 5. 부분 포함 매칭 (최후의 수단)
    if (!matchedFile) {
      matchedFile = filesToCreate.find(f => 
        f.path.includes(fileName) || fileName.includes(f.path)
      );
    }
    
    if (matchedFile) {
      console.log(`✅ 파일 매칭 성공: "${fileName}" -> "${matchedFile.path}"`);
      filesToProcess.push(matchedFile);
    } else {
      console.warn(`⚠️ 파일 매칭 실패: "${fileName}" - filesToCreate에서 찾을 수 없음`);
      // 매칭 실패해도 파일명으로 직접 생성 시도
      filesToProcess.push({
        path: fileName,
        reason: "단계 설명에서 추출",
        purpose: "파일 생성",
        fileExists: false,
      } as typeof filesToCreate[0]);
    }
  }
  
  console.log(`📦 처리할 파일 개수: ${filesToProcess.length}`);
  
  // 모든 파일 생성
  if (filesToProcess.length > 0) {
    let successCount = 0;
    let failCount = 0;
    const messages: string[] = [];
    
    console.log(`🔄 ${filesToProcess.length}개 파일 생성 시작`);
    
    // 순차적으로 각 파일 생성
    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      console.log(`📄 [${i + 1}/${filesToProcess.length}] 파일 처리 시작: ${file.path}`);
      
      try {
        // codeBlocks에서 해당 파일의 코드 찾기
        let codeBlock = codeBlocks.find((cb) => cb.filePath === file.path);
        let contentSource = "없음";
        
        // 정확한 매칭 실패 시 다른 방식 시도
        if (!codeBlock) {
          codeBlock = codeBlocks.find((cb) => 
            cb.filePath.endsWith(file.path) || 
            file.path.endsWith(cb.filePath) ||
            cb.filePath.split("/").pop() === file.path.split("/").pop()
          );
        }
        
        let content = codeBlock?.content || "";
        if (codeBlock) {
          contentSource = `codeBlocks[${codeBlocks.indexOf(codeBlock)}] (${codeBlock.filePath})`;
          console.log(`📦 [${i + 1}/${filesToProcess.length}] codeBlocks에서 찾음:`, {
            filePath: file.path,
            codeBlockPath: codeBlock.filePath,
            contentLength: content.length,
            contentPreview: content.substring(0, 200),
          });
        }
        
        // content가 비어있으면 tasks에서 찾기
        if (!content || content.trim().length < 10) {
          let task = tasks.find((t) => 
            (t.type === "create" || t.type === "modify") && 
            t.target &&
            (t.target === file.path || 
             t.target.endsWith(file.path) ||
             file.path.endsWith(t.target) ||
             t.target.split("/").pop() === file.path.split("/").pop())
          );
          
          if (!task) {
            const fileNameOnly = file.path.split("/").pop() || "";
            task = tasks.find((t) => 
              (t.type === "create" || t.type === "modify") && 
              t.target &&
              (t.target.endsWith(fileNameOnly) || t.target.includes(fileNameOnly))
            );
          }
          
          if (task && task.content) {
            content = task.content;
            contentSource = `tasks[${tasks.indexOf(task)}] (${task.target || "unknown"})`;
            console.log(`📋 [${i + 1}/${filesToProcess.length}] tasks에서 찾음:`, {
              filePath: file.path,
              taskTarget: task.target,
              taskType: task.type,
              contentLength: content.length,
              contentPreview: content.substring(0, 200),
            });
          }
        }
        
        // content가 여전히 비어있으면 기본 템플릿 생성
        if (!content || content.trim().length < 10) {
          const ext = file.path.split(".").pop()?.toLowerCase() || "";
          if (ext === "tsx" || ext === "jsx") {
            const componentName = file.path.split("/").pop()?.replace(/\.(tsx|jsx)$/, "") || "Component";
            content = `export default function ${componentName}() {\n  return (\n    <div>\n      <h1>${componentName}</h1>\n    </div>\n  );\n}\n`;
            contentSource = "기본 템플릿 (tsx/jsx)";
          } else if (ext === "ts" || ext === "js") {
            content = `// ${file.path.split("/").pop() || "file"}\n`;
            contentSource = "기본 템플릿 (ts/js)";
          } else {
            content = `// ${file.path.split("/").pop() || "file"}\n`;
            contentSource = "기본 템플릿 (기타)";
          }
        }

        // 파일 생성 로그
        addExecutionLog(stepIndex, {
          timestamp: new Date(),
          type: "file",
          message: `[${i + 1}/${filesToProcess.length}] 파일 생성 중`,
          filePath: file.path,
          details: `파일 크기: ${(content.length / 1024).toFixed(2)} KB | 내용 출처: ${contentSource}`,
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
        
        // 파일 생성 결과 로그
        if (response.ok) {
          successCount++;
          messages.push(`${file.path}: 성공`);
          console.log(`✅ [${i + 1}/${filesToProcess.length}] 파일 생성 성공: ${file.path}`);
          addExecutionLog(stepIndex, {
            timestamp: new Date(),
            type: "success",
            message: `[${i + 1}/${filesToProcess.length}] 파일 생성 성공`,
            filePath: file.path,
            details: data.message || "파일이 성공적으로 생성되었습니다.",
          });

          // 지원되는 언어 파일인 경우 에러 확인 및 수정
          const language = getLanguageFromExtension(file.path);
          const supportedLanguages = ["typescript", "javascript", "python", "java", "go", "rust", "cpp", "c"];
          if (supportedLanguages.includes(language)) {
            await checkAndFixErrors(stepIndex, file.path, content, 0, projectPath, addExecutionLog);
          }
        } else {
          failCount++;
          messages.push(`${file.path}: 실패 (${data.error || "알 수 없는 오류"})`);
          console.error(`❌ [${i + 1}/${filesToProcess.length}] 파일 생성 실패: ${file.path}`, data.error);
          addExecutionLog(stepIndex, {
            timestamp: new Date(),
            type: "error",
            message: `[${i + 1}/${filesToProcess.length}] 파일 생성 실패`,
            filePath: file.path,
            details: data.error || "알 수 없는 오류",
          });
        }
      } catch (error) {
        failCount++;
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류";
        messages.push(`${file.path}: 오류 (${errorMessage})`);
        console.error(`❌ [${i + 1}/${filesToProcess.length}] 파일 생성 중 오류: ${file.path}`, error);
        addExecutionLog(stepIndex, {
          timestamp: new Date(),
          type: "error",
          message: `[${i + 1}/${filesToProcess.length}] 파일 생성 중 오류`,
          filePath: file.path,
          details: errorMessage,
        });
      }
      
      // 파일 간 약간의 지연
      if (i < filesToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`✅ 파일 생성 완료: 성공 ${successCount}개, 실패 ${failCount}개`);
    
    // 전체 결과 설정
    if (successCount > 0) {
      return {
        success: failCount === 0,
        message: `${successCount}개 파일 생성 완료${failCount > 0 ? `, ${failCount}개 실패` : ""}. ${messages.join(", ")}`,
      };
    } else {
      return {
        success: false,
        message: `파일을 찾을 수 없습니다. 단계 설명: "${stepDescription}"`,
      };
    }
  } else {
    return {
      success: false,
      message: `단계 설명에서 파일을 찾을 수 없습니다. 단계 설명: "${stepDescription}"`,
    };
  }
}

// 파일 수정 핸들러
async function handleFileModification(
  stepIndex: number,
  stepDescription: string,
  context: StepExecutionContext
): Promise<StepResult | null> {
  const { projectPath, planning, tasks, codeBlocks, addExecutionLog } = context;
  const filesToModify = planning?.plan?.filesToModify || [];
  
  if (filesToModify.length === 0) {
    return null;
  }

  // stepDescription에서 파일 경로 추출
  let matchedFile = null;
  
  const pathPatterns = [
    /([a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|json|css|md|py|java|go|rs|cpp|c|h|hpp|sql|yaml|yml|xml|sh|bash|zsh|txt|html|vue|svelte))\s*(수정|modify|update|생성|create)/i,
    /([a-zA-Z0-9_\-./]+\/)+[a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|json|css|md|py|java|go|rs|cpp|c|h|hpp|sql|yaml|yml|xml|sh|bash|zsh|txt|html|vue|svelte)/i,
    /([a-zA-Z0-9_\-./]+)\s*(수정|modify|update)/i,
  ];
  
  for (const pattern of pathPatterns) {
    const match = stepDescription.match(pattern);
    if (match && match[1]) {
      const extractedPath = match[1].trim();
      matchedFile = filesToModify.find(f => 
        f.path === extractedPath || 
        f.path.endsWith(extractedPath) ||
        extractedPath.endsWith(f.path.split("/").pop() || "") ||
        f.path.includes(extractedPath) ||
        extractedPath.includes(f.path.split("/").pop() || "")
      );
      if (matchedFile) break;
    }
  }
  
  // tasks에서 매칭
  if (!matchedFile) {
    const matchingTask = tasks.find(t => 
      (t.type === "modify" || t.type === "create") &&
      t.target &&
      (stepDescription.includes(t.target) || 
       stepDescription.includes(t.target.split("/").pop() || ""))
    );
    
    if (matchingTask && matchingTask.target) {
      matchedFile = filesToModify.find(f => f.path === matchingTask.target);
    }
  }
  
  // fallback
  if (!matchedFile) {
    matchedFile = filesToModify[stepIndex] || filesToModify[0];
  }
  
  const file = matchedFile;
  if (!file) {
    return null;
  }

  const codeBlock = codeBlocks.find((cb) => cb.filePath === file.path);
  const content = codeBlock?.content || "";

  if (!content || content.trim().length < 10) {
    addExecutionLog(stepIndex, {
      timestamp: new Date(),
      type: "warning",
      message: "파일 수정 내용이 없습니다",
      filePath: file.path,
    });
    return {
      success: false,
      message: "파일 수정 내용을 찾을 수 없습니다.",
    };
  }

  addExecutionLog(stepIndex, {
    timestamp: new Date(),
    type: "file",
    message: "파일 수정 중",
    filePath: file.path,
    details: `파일 크기: ${(content.length / 1024).toFixed(2)} KB`,
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
  
  if (response.ok) {
    // 지원되는 언어 파일인 경우 에러 확인 및 수정
    const language = getLanguageFromExtension(file.path);
    const supportedLanguages = ["typescript", "javascript", "python", "java", "go", "rust", "cpp", "c"];
    if (supportedLanguages.includes(language)) {
      await checkAndFixErrors(stepIndex, file.path, content, 0, projectPath, addExecutionLog);
    }

    addExecutionLog(stepIndex, {
      timestamp: new Date(),
      type: "success",
      message: "파일 수정 성공",
      filePath: file.path,
      details: data.message || "파일이 성공적으로 수정되었습니다.",
    });
  } else {
    addExecutionLog(stepIndex, {
      timestamp: new Date(),
      type: "error",
      message: "파일 수정 실패",
      filePath: file.path,
      details: data.error || "알 수 없는 오류",
    });
  }
  
  return {
    success: response.ok,
    message: data.message || data.error || "파일 수정 완료",
  };
}

// 명령어 실행 핸들러
async function handleCommandExecution(
  stepIndex: number,
  stepDescription: string,
  context: StepExecutionContext
): Promise<StepResult | null> {
  const { projectPath, tasks, addExecutionLog } = context;
  
  // stepDescription에서 명령어 추출
  let commandsToExecute: string[] = [];
  
  // 방법 1: 괄호 안의 명령어 추출
  const parenthesesMatches = stepDescription.matchAll(/\(([^)]+)\)/g);
  for (const match of parenthesesMatches) {
    const content = match[1].trim();
    if (content.match(/^(npm|yarn|pnpm|node|next|npx|java|javac|python|python3|pip|pip3|py|go|rustc|cargo|gcc|g\+\+|clang|clang\+\+|make|cmake|mvn|gradle|dotnet|dart|flutter|php|ruby|rails|bundle|rake|perl|swift|kotlin|scala|sbt|tsc|ts-node|deno|bun)/i)) {
      commandsToExecute.push(content);
    }
  }
  
  // 방법 2: stepDescription에서 직접 명령어 패턴 추출
  if (commandsToExecute.length === 0) {
    const commandPatterns = [
      /(npm\s+run\s+\w+)/i, /(yarn\s+\w+)/i, /(pnpm\s+run\s+\w+)/i,
      /(npm\s+run\s+dev)/i, /(npm\s+run\s+build)/i, /(npm\s+run\s+start)/i, /(npm\s+run\s+test)/i,
      /(node\s+[\w./]+)/i, /(npx\s+[\w\s]+)/i,
      /(python\s+[\w./\s]+)/i, /(python3\s+[\w./\s]+)/i, /(py\s+[\w./\s]+)/i,
      /(pip\s+install\s+[\w\s]+)/i, /(pip3\s+install\s+[\w\s]+)/i, /(python\s+-m\s+[\w.]+)/i,
      /(java\s+[\w./\s]+)/i, /(javac\s+[\w./\s]+)/i, /(mvn\s+[\w\s]+)/i, /(gradle\s+[\w\s]+)/i,
      /(go\s+run\s+[\w./\s]+)/i, /(go\s+build\s+[\w./\s]*)/i, /(go\s+test\s+[\w./\s]*)/i,
      /(cargo\s+run)/i, /(cargo\s+build)/i, /(cargo\s+test)/i, /(rustc\s+[\w./\s]+)/i,
      /(gcc\s+[\w./\s]+)/i, /(g\+\+\s+[\w./\s]+)/i, /(clang\s+[\w./\s]+)/i, /(clang\+\+\s+[\w./\s]+)/i,
      /(make\s+[\w\s]*)/i, /(cmake\s+[\w\s]+)/i,
    ];
    
    for (const pattern of commandPatterns) {
      const match = stepDescription.match(pattern);
      if (match && match[1]) {
        const command = match[1].trim();
        if (!commandsToExecute.includes(command)) {
          commandsToExecute.push(command);
        }
      }
    }
  }
  
  // 방법 3: tasks에서 command 타입 찾기
  if (commandsToExecute.length === 0) {
    const commandTasks = tasks.filter(t => 
      t.type === "command" && 
      t.command &&
      (stepDescription.includes(t.command) || 
       stepDescription.toLowerCase().includes("개발 서버") && (t.command.includes("dev") || t.command.includes("run")) ||
       stepDescription.toLowerCase().includes("빌드") && (t.command.includes("build") || t.command.includes("compile")) ||
       stepDescription.toLowerCase().includes("테스트") && (t.command.includes("test")))
    );
    
    if (commandTasks.length > 0) {
      commandsToExecute = commandTasks.map(t => t.command!).filter(Boolean);
    }
  }
  
  // 방법 4: 일반적인 명령어 추론
  if (commandsToExecute.length === 0) {
    const lowerDesc = stepDescription.toLowerCase();
    if (lowerDesc.includes("개발 서버") || lowerDesc.includes("dev") || lowerDesc.includes("서버")) {
      commandsToExecute.push("npm run dev");
    }
    if (lowerDesc.includes("빌드") || lowerDesc.includes("build")) {
      commandsToExecute.push("npm run build");
    }
    if (lowerDesc.includes("테스트") || lowerDesc.includes("test")) {
      commandsToExecute.push("npm test");
    }
  }
  
  if (commandsToExecute.length === 0) {
    return null;
  }
  
  let successCount = 0;
  let failCount = 0;
  const messages: string[] = [];
  
  // 각 명령어를 순차적으로 실행
  for (const command of commandsToExecute) {
    addExecutionLog(stepIndex, {
      timestamp: new Date(),
      type: "command",
      message: `명령어 실행: ${command}`,
      command: command,
    });
    
    const response = await fetch("/api/commands/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: command,
        projectPath: projectPath,
      }),
    });
    const data = await response.json();
    
    // 터미널에 출력
    const terminalWriteOutput = (window as { terminalWriteOutput?: (output: string, isError?: boolean) => void }).terminalWriteOutput;
    if (typeof terminalWriteOutput === "function") {
      if (response.ok) {
        const output = data.stdout || data.message || "실행이 완료되었습니다.";
        terminalWriteOutput(`[${stepDescription}] ${command}\n${output}`, false);
      } else {
        const errorParts: string[] = [];
        if (data.error) errorParts.push(`오류: ${data.error}`);
        if (data.details) errorParts.push(`상세: ${data.details}`);
        if (data.stderr) errorParts.push(`stderr: ${data.stderr}`);
        if (data.stdout) errorParts.push(`stdout: ${data.stdout}`);
        const errorOutput = errorParts.length > 0 
          ? errorParts.join('\n')
          : "알 수 없는 오류";
        terminalWriteOutput(`[${stepDescription}] ${command}\n${errorOutput}`, true);
      }
    }
    
    if (response.ok) {
      successCount++;
      messages.push(`${command}: 성공`);
      addExecutionLog(stepIndex, {
        timestamp: new Date(),
        type: "success",
        message: `명령어 실행 성공: ${command}`,
        details: data.stdout || data.message || "실행이 완료되었습니다.",
      });
    } else {
      const rawErrorText = data.stderr || data.stdout || data.details || "";
      const cleanErrorText = stripAnsiCodes(rawErrorText);
      const errorText = cleanErrorText.toLowerCase();
      
      // 포트 충돌 오류인 경우 처리
      const isPortConflict = errorText.includes("eaddrinuse") || 
                             errorText.includes("address already in use") ||
                             errorText.includes("listen eaddrinuse") ||
                             (errorText.includes("port") && errorText.includes("already")) ||
                             (errorText.includes("listen") && errorText.includes("error"));
      
      if (isPortConflict && (command.includes("dev") || command.includes("start") || command.includes("run"))) {
        // 포트 번호 추출
        const portPatterns = [
          /port[:\s]+(\d+)/i,
          /:(\d+)/,
          /port\s+(\d+)/i,
          /(\d{4,5})/  // 4-5자리 숫자 (포트 번호)
        ];
        
        let port = "3000"; // 기본값
        for (const pattern of portPatterns) {
          const match = errorText.match(pattern);
          if (match && match[1]) {
            const extractedPort = match[1];
            const portNum = parseInt(extractedPort, 10);
            if (portNum >= 1 && portNum <= 65535) {
              port = extractedPort;
              break;
            }
          }
        }
        
        addExecutionLog(stepIndex, {
          timestamp: new Date(),
          type: "info",
          message: `포트 ${port} 충돌 감지. 기존 프로세스를 종료하고 재시작합니다...`,
        });
        
        try {
          addExecutionLog(stepIndex, {
            timestamp: new Date(),
            type: "info",
            message: `포트 ${port}를 사용하는 프로세스 종료 중...`,
          });
          
          const killResponse = await fetch("/api/commands/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              command: `kill-port-process ${port}`,
              projectPath: projectPath,
            }),
          });
          
          const killData = await killResponse.json();
          
          if (killResponse.ok) {
            addExecutionLog(stepIndex, {
              timestamp: new Date(),
              type: "success",
              message: `포트 ${port} 프로세스 종료 완료`,
              details: killData.message || "프로세스가 종료되었습니다.",
            });
          } else {
            addExecutionLog(stepIndex, {
              timestamp: new Date(),
              type: "warning",
              message: `포트 ${port} 프로세스 종료 실패 (계속 진행)`,
              details: killData.error || killData.stderr || "프로세스를 찾을 수 없을 수 있습니다.",
            });
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          addExecutionLog(stepIndex, {
            timestamp: new Date(),
            type: "command",
            message: `개발 서버 재시작: ${command}`,
            command: command,
          });
          
          const retryResponse = await fetch("/api/commands/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              command: command,
              projectPath: projectPath,
            }),
          });
          const retryData = await retryResponse.json();
          
          const terminalWriteOutput = (window as { terminalWriteOutput?: (output: string, isError?: boolean) => void }).terminalWriteOutput;
          if (typeof terminalWriteOutput === "function") {
            if (retryResponse.ok) {
              const output = retryData.stdout || retryData.message || "개발 서버가 재시작되었습니다.";
              terminalWriteOutput(`[재시작] ${command}\n${output}`, false);
            } else {
              const errorParts: string[] = [];
              if (retryData.error) errorParts.push(`오류: ${retryData.error}`);
              if (retryData.details) errorParts.push(`상세: ${retryData.details}`);
              if (retryData.stderr) errorParts.push(`stderr: ${retryData.stderr}`);
              if (retryData.stdout) errorParts.push(`stdout: ${retryData.stdout}`);
              const errorOutput = errorParts.length > 0
                ? errorParts.join('\n')
                : "알 수 없는 오류";
              terminalWriteOutput(`[재시작] ${command}\n${errorOutput}`, true);
            }
          }
          
          if (retryResponse.ok) {
            addExecutionLog(stepIndex, {
              timestamp: new Date(),
              type: "success",
              message: `개발 서버 재시작 성공: ${command}`,
              details: retryData.stdout || retryData.message || "개발 서버가 재시작되었습니다.",
            });
            messages.push(`${command}: 재시작 성공`);
            continue; // 다음 명령어로
          } else {
            failCount++;
            const errorParts: string[] = [];
            if (retryData.error) errorParts.push(retryData.error);
            if (retryData.details) errorParts.push(retryData.details);
            if (retryData.stderr) errorParts.push(retryData.stderr);
            if (retryData.stdout) errorParts.push(retryData.stdout);
            const errorMessage = errorParts.length > 0
              ? errorParts.join(' | ')
              : "알 수 없는 오류";
            messages.push(`${command}: 재시작 실패 (${errorMessage})`);
            addExecutionLog(stepIndex, {
              timestamp: new Date(),
              type: "error",
              message: `개발 서버 재시작 실패: ${command}`,
              details: errorMessage,
            });
            continue; // 다음 명령어로
          }
        } catch (error) {
          console.error("포트 충돌 처리 중 오류:", error);
          failCount++;
          messages.push(`${command}: 포트 충돌 처리 실패`);
          addExecutionLog(stepIndex, {
            timestamp: new Date(),
            type: "error",
            message: `포트 충돌 처리 중 오류: ${command}`,
            details: error instanceof Error ? error.message : "알 수 없는 오류",
          });
          continue; // 다음 명령어로
        }
      }
      
      // 빌드/컴파일 오류인 경우 자동 수정 시도
      if ((command.includes("build") || command.includes("compile") || command.includes("test")) && 
          (data.stderr || data.stdout || data.details)) {
        const rawBuildOutput = data.stderr || data.stdout || data.details || "";
        const cleanBuildOutput = stripAnsiCodes(rawBuildOutput);
        const buildOutput = cleanBuildOutput.toLowerCase();
        
        // TypeScript/JavaScript/Next.js 빌드 오류인 경우
        if (buildOutput.includes("error") && (buildOutput.includes("typescript") || buildOutput.includes("next") || buildOutput.includes("react") || buildOutput.includes("turbopack"))) {
          addExecutionLog(stepIndex, {
            timestamp: new Date(),
            type: "info",
            message: "빌드 오류 자동 수정 시도 중...",
          });
          
          const errorText = cleanBuildOutput;
          const fileErrorPattern = /\.\/([^:]+):(\d+):(\d+)/g;
          const fileErrors = new Map<string, Array<{ line: number; char: number; message: string }>>();
          
          let match;
          while ((match = fileErrorPattern.exec(errorText)) !== null) {
            const filePath = match[1].trim();
            const line = parseInt(match[2]);
            const char = parseInt(match[3]);
            
            const errorLines = errorText.split('\n');
            let errorMessage = "";
            for (let i = 0; i < errorLines.length; i++) {
              if (errorLines[i].includes(filePath) && errorLines[i].includes(`:${line}:`)) {
                for (let j = i; j < Math.min(i + 5, errorLines.length); j++) {
                  if (errorLines[j].trim() && !errorLines[j].includes(filePath)) {
                    errorMessage = errorLines[j].trim();
                    break;
                  }
                }
                break;
              }
            }
            
            if (!fileErrors.has(filePath)) {
              fileErrors.set(filePath, []);
            }
            fileErrors.get(filePath)!.push({ line, char, message: errorMessage });
          }
          
          // 각 파일의 오류 수정 시도
          for (const [filePath, errors] of fileErrors.entries()) {
            try {
              const readResponse = await fetch("/api/files/read", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  filePath: filePath,
                  projectPath: projectPath,
                }),
              });
              
              if (readResponse.ok) {
                const fileData = await readResponse.json();
                const currentContent = fileData.content || "";
                
                const errorSummary = errors.map(e => `Line ${e.line}:${e.char} - ${e.message}`).join('\n');
                const fixPrompt = `다음 파일의 빌드 오류를 수정해주세요:\n\n파일: ${filePath}\n\n오류:\n${errorSummary}\n\n현재 파일 내용:\n\`\`\`\n${currentContent}\n\`\`\`\n\n수정된 전체 파일 내용을 반환해주세요. Next.js App Router를 사용하는 경우, React Hooks를 사용하는 컴포넌트에는 "use client" 지시어를 추가해야 합니다.`;
                
                addExecutionLog(stepIndex, {
                  timestamp: new Date(),
                  type: "info",
                  message: `파일 오류 수정 요청: ${filePath}`,
                  details: `오류: ${errorSummary}`,
                });
                
                const llmResponse = await fetch("/api/chat", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    message: fixPrompt,
                    projectPath: projectPath,
                  }),
                });
                
                if (llmResponse.ok) {
                  const reader = llmResponse.body?.getReader();
                  const decoder = new TextDecoder();
                  let fixedContent = "";
                  
                  if (reader) {
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      fixedContent += decoder.decode(value, { stream: true });
                    }
                  }
                  
                  let parsedContent = fixedContent;
                  try {
                    const jsonMatch = fixedContent.match(/\{[\s\S]*"fixedContent"[\s\S]*\}/);
                    if (jsonMatch) {
                      const json = JSON.parse(jsonMatch[0]);
                      parsedContent = json.fixedContent || fixedContent;
                    } else {
                      const codeBlockMatch = fixedContent.match(/```(?:typescript|tsx|javascript|jsx)?\n([\s\S]*?)```/);
                      if (codeBlockMatch) {
                        parsedContent = codeBlockMatch[1];
                      }
                    }
                  } catch {
                    // 파싱 실패 시 원본 사용
                  }
                  
                  if (parsedContent && parsedContent.trim() !== currentContent.trim()) {
                    const updateResponse = await fetch("/api/files/write", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        filePath: filePath,
                        projectPath: projectPath,
                        content: parsedContent,
                      }),
                    });
                    
                    if (updateResponse.ok) {
                      addExecutionLog(stepIndex, {
                        timestamp: new Date(),
                        type: "success",
                        message: `파일 오류 수정 완료: ${filePath}`,
                      });
                    } else {
                      addExecutionLog(stepIndex, {
                        timestamp: new Date(),
                        type: "error",
                        message: `파일 업데이트 실패: ${filePath}`,
                      });
                    }
                  }
                }
              }
            } catch (error) {
              console.error("빌드 오류 수정 중 오류:", error);
            }
          }
          
          // 수정 후 다시 빌드 시도
          if (fileErrors.size > 0) {
            addExecutionLog(stepIndex, {
              timestamp: new Date(),
              type: "info",
              message: "파일 수정 완료. 자동으로 다시 빌드를 시도합니다...",
            });
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            addExecutionLog(stepIndex, {
              timestamp: new Date(),
              type: "command",
              message: `재빌드 실행: ${command}`,
              command: command,
            });
            
            const retryResponse = await fetch("/api/commands/execute", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                command: command,
                projectPath: projectPath,
              }),
            });
            const retryData = await retryResponse.json();
            
            const terminalWriteOutput = (window as { terminalWriteOutput?: (output: string, isError?: boolean) => void }).terminalWriteOutput;
            if (typeof terminalWriteOutput === "function") {
              if (retryResponse.ok) {
                const output = retryData.stdout || retryData.message || "재빌드가 완료되었습니다.";
                terminalWriteOutput(`[재빌드] ${command}\n${output}`, false);
              } else {
                const errorParts: string[] = [];
                if (retryData.error) errorParts.push(`오류: ${retryData.error}`);
                if (retryData.details) errorParts.push(`상세: ${retryData.details}`);
                if (retryData.stderr) errorParts.push(`stderr: ${retryData.stderr}`);
                if (retryData.stdout) errorParts.push(`stdout: ${retryData.stdout}`);
                const errorOutput = errorParts.length > 0
                  ? errorParts.join('\n')
                  : "알 수 없는 오류";
                terminalWriteOutput(`[재빌드] ${command}\n${errorOutput}`, true);
              }
            }
            
            if (retryResponse.ok) {
              addExecutionLog(stepIndex, {
                timestamp: new Date(),
                type: "success",
                message: `재빌드 성공: ${command}`,
                details: retryData.stdout || retryData.message || "재빌드가 완료되었습니다.",
              });
              failCount = Math.max(0, failCount - 1);
              messages.push(`${command}: 재빌드 성공`);
              continue; // 다음 명령어로
            } else {
              addExecutionLog(stepIndex, {
                timestamp: new Date(),
                type: "error",
                message: `재빌드 실패: ${command}`,
                details: retryData.error || retryData.stderr || "재빌드 중 오류가 발생했습니다.",
              });
            }
          }
        }
      }
      
      failCount++;
      const errorParts: string[] = [];
      if (data.error) errorParts.push(stripAnsiCodes(data.error));
      if (data.details) errorParts.push(stripAnsiCodes(data.details));
      if (data.stderr) errorParts.push(stripAnsiCodes(data.stderr));
      if (data.stdout) {
        const cleanStdout = stripAnsiCodes(data.stdout);
        if (cleanStdout.toLowerCase().includes("error") || cleanStdout.toLowerCase().includes("failed")) {
          errorParts.push(cleanStdout);
        }
      }
      
      let errorMessage = errorParts.length > 0
        ? errorParts.filter((part, index, self) =>
            part.trim() && self.indexOf(part) === index && part.length < 5000
          ).join('\n\n')
        : "알 수 없는 오류";
      
      if (errorMessage.length > 2000) {
        errorMessage = errorMessage.substring(0, 2000) + "\n\n... (메시지가 너무 길어 일부만 표시됩니다)";
      }
      
      messages.push(`${command}: 실패`);
      addExecutionLog(stepIndex, {
        timestamp: new Date(),
        type: "error",
        message: `명령어 실행 실패: ${command}`,
        details: errorMessage,
      });
    }
    
    // 명령어 간 약간의 지연
    if (commandsToExecute.indexOf(command) < commandsToExecute.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return {
    success: failCount === 0,
    message: `${successCount}개 명령어 실행 완료${failCount > 0 ? `, ${failCount}개 실패` : ""}. ${messages.join(", ")}`,
  };
}

// 작업 실행 핸들러
async function handleTaskExecution(
  stepIndex: number,
  stepDescription: string,
  context: StepExecutionContext
): Promise<StepResult | null> {
  const { projectPath, tasks, codeBlocks, addExecutionLog } = context;
  
  if (tasks.length === 0) {
    return null;
  }

  // stepDescription과 일치하는 task 찾기
  let matchedTask = null;
  
  const pathPatterns = [
    /([a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|json|css|md|py|java|go|rs|cpp|c|h|hpp|sql|yaml|yml|xml|sh|bash|zsh|txt|html|vue|svelte))/i,
    /([a-zA-Z0-9_\-./]+\/)+[a-zA-Z0-9_\-./]+/i,
  ];
  
  let extractedPath = "";
  for (const pattern of pathPatterns) {
    const match = stepDescription.match(pattern);
    if (match && match[1]) {
      extractedPath = match[1].trim();
      break;
    }
  }
  
  if (extractedPath) {
    matchedTask = tasks.find(t => 
      t.target &&
      (t.target === extractedPath ||
       t.target.endsWith(extractedPath) ||
       extractedPath.endsWith(t.target.split("/").pop() || "") ||
       stepDescription.includes(t.target) ||
       stepDescription.includes(t.target.split("/").pop() || ""))
    );
  }
  
  if (!matchedTask && (stepDescription.toLowerCase().includes("install") || stepDescription.toLowerCase().includes("패키지") || stepDescription.toLowerCase().includes("command"))) {
    matchedTask = tasks.find(t => 
      (t.type === "install" || t.type === "command") &&
      t.command &&
      (stepDescription.includes(t.command) || 
       stepDescription.toLowerCase().includes("install") && t.type === "install")
    );
  }
  
  if (!matchedTask && tasks.length > stepIndex) {
    matchedTask = tasks[stepIndex];
  }
  
  const task = matchedTask;
  if (!task) {
    return {
      success: false,
      message: "해당 단계와 일치하는 작업을 찾을 수 없습니다.",
    };
  }

  if (task.type === "install" && task.command) {
    addExecutionLog(stepIndex, {
      timestamp: new Date(),
      type: "command",
      message: "명령어 실행",
      command: task.command,
    });
    
    const response = await fetch("/api/commands/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: task.command,
        projectPath: projectPath,
      }),
    });
    const data = await response.json();
    
    const terminalWriteOutput = (window as { terminalWriteOutput?: (output: string, isError?: boolean) => void }).terminalWriteOutput;
    if (typeof terminalWriteOutput === "function") {
      if (response.ok) {
        const output = data.stdout || data.message || "실행이 완료되었습니다.";
        terminalWriteOutput(`[${stepDescription}] ${task.command}\n${output}`, false);
      } else {
        const errorParts: string[] = [];
        if (data.error) errorParts.push(`오류: ${data.error}`);
        if (data.details) errorParts.push(`상세: ${data.details}`);
        if (data.stderr) errorParts.push(`stderr: ${data.stderr}`);
        if (data.stdout) errorParts.push(`stdout: ${data.stdout}`);
        const errorOutput = errorParts.length > 0 
          ? errorParts.join('\n')
          : "알 수 없는 오류";
        terminalWriteOutput(`[${stepDescription}] ${task.command}\n${errorOutput}`, true);
      }
    }
    
    if (response.ok) {
      addExecutionLog(stepIndex, {
        timestamp: new Date(),
        type: "success",
        message: "명령어 실행 성공",
        details: data.stdout || data.message || "실행이 완료되었습니다.",
      });
    } else {
      const errorParts: string[] = [];
      if (data.error) errorParts.push(data.error);
      if (data.details) errorParts.push(data.details);
      if (data.stderr) errorParts.push(data.stderr);
      if (data.stdout) errorParts.push(data.stdout);
      const errorMessage = errorParts.length > 0 
        ? errorParts.join(' | ')
        : "알 수 없는 오류";
      
      addExecutionLog(stepIndex, {
        timestamp: new Date(),
        type: "error",
        message: "명령어 실행 실패",
        details: errorMessage,
      });
    }
    
    return {
      success: response.ok,
      message: data.message || data.error || "명령 실행 완료",
    };
  } else if ((task.type === "create" || task.type === "modify") && task.target) {
    const codeBlock = codeBlocks.find((cb) => cb.filePath === task.target);
    let content = codeBlock?.content || task.content || "";
    
    if (!content || content.trim().length < 10) {
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

    addExecutionLog(stepIndex, {
      timestamp: new Date(),
      type: "file",
      message: task.type === "create" ? "파일 생성 중" : "파일 수정 중",
      filePath: task.target,
      details: `파일 크기: ${(content.length / 1024).toFixed(2)} KB`,
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
    
    if (response.ok) {
      addExecutionLog(stepIndex, {
        timestamp: new Date(),
        type: "success",
        message: task.type === "create" ? "파일 생성 성공" : "파일 수정 성공",
        filePath: task.target,
        details: data.message || "작업이 완료되었습니다.",
      });

      const language = getLanguageFromExtension(task.target);
      const supportedLanguages = ["typescript", "javascript", "python", "java", "go", "rust", "cpp", "c"];
      if (supportedLanguages.includes(language)) {
        await checkAndFixErrors(stepIndex, task.target, content, 0, projectPath, addExecutionLog);
      }
    } else {
      addExecutionLog(stepIndex, {
        timestamp: new Date(),
        type: "error",
        message: task.type === "create" ? "파일 생성 실패" : "파일 수정 실패",
        filePath: task.target,
        details: data.error || "알 수 없는 오류",
      });
    }
    
    return {
      success: response.ok,
      message: data.message || data.error || `${task.type === "create" ? "생성" : "수정"} 완료`,
    };
  }

  return {
    success: false,
    message: "지원하지 않는 작업 유형입니다.",
  };
}

// 환경 변수 설정 핸들러
async function handleEnvironmentVariable(
  stepIndex: number,
  stepDescription: string,
  context: StepExecutionContext
): Promise<StepResult | null> {
  const { projectPath, addExecutionLog } = context;
  
  const isEnvStep = stepDescription.match(/(환경 변수|\.env|env|environment|변수 설정|변수 추가)/i);
  if (!isEnvStep || !projectPath) {
    return null;
  }

  try {
    let envVarName: string | null = null;
    let finalValue: string = "";
    
    const envVarNamePatterns = [
      /([A-Z_][A-Z0-9_]*)\s*=\s*([^\s,)]+)/i,
      /([A-Z_][A-Z0-9_]*)\s+추가/i,
      /([A-Z_][A-Z0-9_]*)\s+설정/i,
      /\.env.*?([A-Z_][A-Z0-9_]*)/i,
      /([A-Z_][A-Z0-9_]*)/i,
    ];
    
    for (const pattern of envVarNamePatterns) {
      const match = stepDescription.match(pattern);
      if (match && match[1]) {
        envVarName = match[1].trim();
        if (match[2]) {
          finalValue = match[2].trim();
        }
        break;
      }
    }
    
    if (!finalValue) {
      const valuePatterns = [
        /예[:\s]+([a-zA-Z0-9_\-./:]+)/i,
        /예\s*:\s*([^\s,)]+)/i,
        /값[:\s]+([^\s,)]+)/i,
        /추가[:\s]+([^\s,)]+)/i,
        /설정[:\s]+([^\s,)]+)/i,
        /\([^)]*예[:\s]*([^)]+)\)/i,
        /:\s*([a-zA-Z0-9_\-./:]+)/i,
      ];
      
      for (const pattern of valuePatterns) {
        const match = stepDescription.match(pattern);
        if (match && match[1]) {
          let extractedValue = match[1].trim();
          extractedValue = extractedValue.replace(/^[("']+|[)"']+$/g, "");
          if (extractedValue && !extractedValue.match(/^[A-Z_][A-Z0-9_]*$/)) {
            finalValue = extractedValue;
            break;
          }
        }
      }
    }
    
    if (!envVarName || !finalValue) {
      return {
        success: false,
        message: "환경 변수 정보를 추출할 수 없습니다. 단계 설명을 더 구체적으로 작성해주세요.",
      };
    }

    const envFilePath = ".env";
    
    let existingContent = "";
    try {
      const readResponse = await fetch(`/api/files/read?path=${encodeURIComponent(envFilePath)}&projectPath=${encodeURIComponent(projectPath)}`);
      if (readResponse.ok) {
        const readData = await readResponse.json();
        existingContent = readData.content || "";
      }
    } catch {
      // 파일이 없으면 빈 문자열로 시작
    }
    
    let newContent = existingContent;
    
    const envVarRegex = new RegExp(`^${envVarName}\\s*=\\s*.*$`, "m");
    if (envVarRegex.test(newContent)) {
      newContent = newContent.replace(envVarRegex, `${envVarName}=${finalValue}`);
      
      addExecutionLog(stepIndex, {
        timestamp: new Date(),
        type: "file",
        message: "환경 변수 업데이트",
        filePath: envFilePath,
        details: `${envVarName} 값을 ${finalValue}로 업데이트`,
      });
    } else {
      if (newContent && !newContent.endsWith("\n")) {
        newContent += "\n";
      }
      newContent += `${envVarName}=${finalValue}\n`;
      
      addExecutionLog(stepIndex, {
        timestamp: new Date(),
        type: "file",
        message: "환경 변수 추가",
        filePath: envFilePath,
        details: `${envVarName}=${finalValue} 추가`,
      });
    }
    
    const writeResponse = await fetch("/api/files/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filePath: envFilePath,
        projectPath: projectPath,
        content: newContent,
      }),
    });
    
    const writeData = await writeResponse.json();
    
    if (writeResponse.ok) {
      addExecutionLog(stepIndex, {
        timestamp: new Date(),
        type: "success",
        message: "환경 변수 설정 완료",
        filePath: envFilePath,
        details: writeData.message || "환경 변수가 성공적으로 설정되었습니다.",
      });
      
      return {
        success: true,
        message: writeData.message || "환경 변수 설정 완료",
      };
    } else {
      addExecutionLog(stepIndex, {
        timestamp: new Date(),
        type: "error",
        message: "환경 변수 설정 실패",
        filePath: envFilePath,
        details: writeData.error || "알 수 없는 오류",
      });
      
      return {
        success: false,
        message: writeData.error || "환경 변수 설정 실패",
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "환경 변수 설정 중 오류가 발생했습니다.";
    return {
      success: false,
      message: errorMessage,
    };
  }
}

// 설정 파일 생성 핸들러
async function handleConfigFileCreation(
  stepIndex: number,
  stepDescription: string,
  context: StepExecutionContext
): Promise<StepResult | null> {
  const { projectPath, addExecutionLog } = context;
  
  const configFilePatterns = [
    /([a-zA-Z0-9_\-./]+\.(json|js|ts|yaml|yml|toml|ini|conf|config))/i,
    /([a-zA-Z0-9_\-./]+)\s*(설정|config|configuration)/i,
  ];
  
  let configFilePath = null;
  for (const pattern of configFilePatterns) {
    const match = stepDescription.match(pattern);
    if (match && match[1]) {
      configFilePath = match[1].trim();
      break;
    }
  }
  
  if (!configFilePath || !projectPath) {
    return null;
  }

  try {
    addExecutionLog(stepIndex, {
      timestamp: new Date(),
      type: "info",
      message: "설정 파일 생성 요청",
      filePath: configFilePath,
    });
    
    let configContent = "";
    if (configFilePath.endsWith(".json")) {
      configContent = "{\n  \n}\n";
    } else if (configFilePath.endsWith(".js") || configFilePath.endsWith(".ts")) {
      configContent = "module.exports = {\n  \n};\n";
    } else if (configFilePath.endsWith(".yaml") || configFilePath.endsWith(".yml")) {
      configContent = "# Configuration\n";
    } else {
      configContent = "# Configuration\n";
    }
    
    const writeResponse = await fetch("/api/files/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filePath: configFilePath,
        projectPath: projectPath,
        content: configContent,
      }),
    });
    
    const writeData = await writeResponse.json();
    
    if (writeResponse.ok) {
      addExecutionLog(stepIndex, {
        timestamp: new Date(),
        type: "success",
        message: "설정 파일 생성 완료",
        filePath: configFilePath,
        details: writeData.message || "설정 파일이 생성되었습니다.",
      });
      
      return {
        success: true,
        message: writeData.message || "설정 파일 생성 완료",
      };
    } else {
      return {
        success: false,
        message: writeData.error || "설정 파일 생성 실패",
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "설정 파일 생성 중 오류",
    };
  }
}

// 정보 제공 단계 핸들러
async function handleInformationStep(
  stepIndex: number,
  stepDescription: string,
  context: StepExecutionContext
): Promise<StepResult | null> {
  const { projectPath, metadata, setAnalysisResults, analysisResults } = context;
  
  const isInfoStep = stepDescription.match(/(분석|요약|제시|제공|확인|검토|리뷰|구조|의존성|개선)/i);
  
  if (!isInfoStep) {
    return null;
  }

  try {
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

    if (fullContent.trim().length > 0) {
      setAnalysisResults(new Map(analysisResults.set(stepIndex, fullContent)));
      return {
        success: true,
        message: "분석이 완료되었습니다.",
      };
    } else {
      throw new Error("분석 결과가 비어있습니다.");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "분석 요청 중 오류가 발생했습니다.";
    return {
      success: false,
      message: errorMessage,
    };
  }
}

