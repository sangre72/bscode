import { ExecutionLog } from "../types";
import { getLanguageFromExtension } from "./languageUtils";

// 언어별 에러 확인 함수
export async function checkErrorsForLanguage(
  language: string,
  filePath: string,
  currentContent: string,
  projectPath?: string | null
): Promise<Array<{ message: string; line: number; character: number; severity: string }>> {
  // TypeScript/JavaScript: 기존 diagnostics API 사용
  if (language === "typescript" || language === "javascript") {
    try {
      const diagnosticsResponse = await fetch("/api/typescript/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: filePath,
          projectPath: projectPath,
          content: currentContent,
        }),
      });

      if (diagnosticsResponse.ok) {
        const diagnosticsData = await diagnosticsResponse.json();
        return diagnosticsData.errors || [];
      }
    } catch (error) {
      console.error("TypeScript diagnostics error:", error);
    }
    return [];
  }

  // 다른 언어: 명령어 실행으로 에러 확인
  const languageCommands: Record<string, { command: string; errorParser?: (output: string) => Array<{ message: string; line: number; character: number; severity: string }> }> = {
    python: {
      command: `python -m py_compile "${filePath}"`,
      errorParser: (output: string) => {
        // Python 컴파일 에러 파싱
        // 예: "File \"file.py\", line 10, in <module>\n    syntax error"
        const errors: Array<{ message: string; line: number; character: number; severity: string }> = [];
        const lines = output.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const lineMatch = lines[i].match(/File\s+"[^"]+",\s+line\s+(\d+)/);
          if (lineMatch && i + 1 < lines.length) {
            errors.push({
              message: lines[i + 1].trim(),
              line: parseInt(lineMatch[1]),
              character: 1,
              severity: "error",
            });
          }
        }
        return errors;
      },
    },
    java: {
      command: `javac "${filePath}"`,
      errorParser: (output: string) => {
        // Java 컴파일 에러 파싱
        // 예: "file.java:10: error: cannot find symbol"
        const errors: Array<{ message: string; line: number; character: number; severity: string }> = [];
        const lines = output.split('\n');
        for (const line of lines) {
          const errorMatch = line.match(/([^:]+):(\d+):\s*(error|warning):\s*(.+)/);
          if (errorMatch) {
            errors.push({
              message: errorMatch[4].trim(),
              line: parseInt(errorMatch[2]),
              character: 1,
              severity: errorMatch[3] === "error" ? "error" : "warning",
            });
          }
        }
        return errors;
      },
    },
    go: {
      command: `go build "${filePath}"`,
      errorParser: (output: string) => {
        // Go 컴파일 에러 파싱
        // 예: "file.go:10:5: undefined: variable"
        const errors: Array<{ message: string; line: number; character: number; severity: string }> = [];
        const lines = output.split('\n');
        for (const line of lines) {
          const errorMatch = line.match(/([^:]+):(\d+):(\d+):\s*(.+)/);
          if (errorMatch) {
            errors.push({
              message: errorMatch[4].trim(),
              line: parseInt(errorMatch[2]),
              character: parseInt(errorMatch[3]),
              severity: "error",
            });
          }
        }
        return errors;
      },
    },
    rust: {
      command: `cargo check --message-format=short 2>&1 | grep "${filePath}" || true`,
      errorParser: (output: string) => {
        // Rust 컴파일 에러 파싱
        const errors: Array<{ message: string; line: number; character: number; severity: string }> = [];
        const lines = output.split('\n');
        for (const line of lines) {
          const errorMatch = line.match(/([^:]+):(\d+):(\d+):\s+(\d+):(\d+):\s+(error|warning):\s*(.+)/);
          if (errorMatch) {
            errors.push({
              message: errorMatch[7].trim(),
              line: parseInt(errorMatch[2]),
              character: parseInt(errorMatch[3]),
              severity: errorMatch[6] === "error" ? "error" : "warning",
            });
          }
        }
        return errors;
      },
    },
    cpp: {
      command: `g++ -fsyntax-only "${filePath}" 2>&1 || clang++ -fsyntax-only "${filePath}" 2>&1 || true`,
      errorParser: (output: string) => {
        // C++ 컴파일 에러 파싱
        // 예: "file.cpp:10:5: error: 'variable' was not declared"
        const errors: Array<{ message: string; line: number; character: number; severity: string }> = [];
        const lines = output.split('\n');
        for (const line of lines) {
          const errorMatch = line.match(/([^:]+):(\d+):(\d+):\s*(error|warning):\s*(.+)/);
          if (errorMatch) {
            errors.push({
              message: errorMatch[5].trim(),
              line: parseInt(errorMatch[2]),
              character: parseInt(errorMatch[3]),
              severity: errorMatch[4] === "error" ? "error" : "warning",
            });
          }
        }
        return errors;
      },
    },
    c: {
      command: `gcc -fsyntax-only "${filePath}" 2>&1 || clang -fsyntax-only "${filePath}" 2>&1 || true`,
      errorParser: (output: string) => {
        // C 컴파일 에러 파싱
        const errors: Array<{ message: string; line: number; character: number; severity: string }> = [];
        const lines = output.split('\n');
        for (const line of lines) {
          const errorMatch = line.match(/([^:]+):(\d+):(\d+):\s*(error|warning):\s*(.+)/);
          if (errorMatch) {
            errors.push({
              message: errorMatch[5].trim(),
              line: parseInt(errorMatch[2]),
              character: parseInt(errorMatch[3]),
              severity: errorMatch[4] === "error" ? "error" : "warning",
            });
          }
        }
        return errors;
      },
    },
  };

  const langConfig = languageCommands[language];
  if (!langConfig) {
    // 지원하지 않는 언어는 에러 없음으로 처리
    return [];
  }

  try {
    // 임시 파일로 저장 후 명령어 실행
    const tempResponse = await fetch("/api/files/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filePath: filePath,
        projectPath: projectPath,
        content: currentContent,
      }),
    });

    if (!tempResponse.ok) {
      return [];
    }

    // 명령어 실행
    const commandResponse = await fetch("/api/commands/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: langConfig.command,
        projectPath: projectPath,
      }),
    });

    if (commandResponse.ok) {
      const commandData = await commandResponse.json();
      const output = (commandData.stderr || commandData.stdout || "").trim();
      
      // 에러가 없으면 (명령어 성공) 빈 배열 반환
      if (commandData.exitCode === 0 && !output.includes("error")) {
        return [];
      }

      // 에러 파서가 있으면 사용
      if (langConfig.errorParser) {
        return langConfig.errorParser(output);
      }

      // 기본 파싱: 라인 번호와 메시지 추출
      const errors: Array<{ message: string; line: number; character: number; severity: string }> = [];
      const lines = output.split('\n');
      for (const line of lines) {
        const lineMatch = line.match(/:(\d+):/);
        if (lineMatch && (line.includes("error") || line.includes("Error"))) {
          errors.push({
            message: line.trim(),
            line: parseInt(lineMatch[1]),
            character: 1,
            severity: "error",
          });
        }
      }
      return errors;
    }
  } catch (error) {
    console.error(`Error checking ${language} file:`, error);
  }

  return [];
}

// 에러 확인 및 수정 함수 (최대 3회 반복)
export async function checkAndFixErrors(
  stepIndex: number,
  filePath: string,
  currentContent: string,
  attempt: number,
  projectPath: string | null | undefined,
  addExecutionLog: (stepIndex: number, log: ExecutionLog) => void
): Promise<string> {
  const maxAttempts = 3;
  
  if (attempt >= maxAttempts) {
    addExecutionLog(stepIndex, {
      timestamp: new Date(),
      type: "error",
      message: "에러 수정 시도 횟수 초과",
      filePath: filePath,
      details: `최대 ${maxAttempts}회 시도 후에도 에러가 남아있습니다.`,
    });
    return currentContent;
  }

  try {
    // 언어 감지
    const language = getLanguageFromExtension(filePath);
    
    // 에러 확인이 지원되는 언어인지 확인
    const supportedLanguages = ["typescript", "javascript", "python", "java", "go", "rust", "cpp", "c"];
    if (!supportedLanguages.includes(language)) {
      // 지원하지 않는 언어는 에러 확인 건너뛰기
      return currentContent;
    }

    // 1. 에러 확인
    addExecutionLog(stepIndex, {
      timestamp: new Date(),
      type: "info",
      message: `에러 확인 중 (${language}, 시도 ${attempt + 1}/${maxAttempts})`,
      filePath: filePath,
    });

    const errors = await checkErrorsForLanguage(language, filePath, currentContent, projectPath);
    const errorCount = errors.filter((e: { severity: string }) => e.severity === "error").length;

    if (errorCount === 0) {
      addExecutionLog(stepIndex, {
        timestamp: new Date(),
        type: "success",
        message: "에러 확인 완료 - 에러 없음",
        filePath: filePath,
      });
      return currentContent;
    }

    // 2. 에러가 있으면 LLM에게 수정 요청
    addExecutionLog(stepIndex, {
      timestamp: new Date(),
      type: "info",
      message: `${errorCount}개 에러 발견 - 수정 요청 중`,
      filePath: filePath,
      details: errors.slice(0, 5).map((e: { message: string; line: number }) => 
        `라인 ${e.line}: ${e.message}`
      ).join("\n"),
    });

    const errorMessages = errors
      .slice(0, 10) // 최대 10개 에러만 전송
      .map((e: { message: string; line: number; character: number }) => 
        `라인 ${e.line}, 컬럼 ${e.character}: ${e.message}`
      )
      .join("\n");

    // 언어별 코드 블록 태그 결정
    const codeBlockTag = (() => {
      if (language === "typescript" || language === "javascript") {
        return filePath.endsWith(".tsx") || filePath.endsWith(".jsx") ? "tsx" : 
               filePath.endsWith(".ts") ? "typescript" : "javascript";
      }
      return language;
    })();

    const fixRequest = `다음 ${language} 파일에 ${errorCount}개의 에러가 있습니다. 에러를 모두 수정한 완전한 파일 내용을 제공해주세요.

**파일 경로:** ${filePath}
**언어:** ${language}

**에러 목록:**
${errorMessages}

**현재 파일 내용:**
\`\`\`${codeBlockTag}
${currentContent}
\`\`\`

**요구사항:**
1. 모든 에러를 수정한 완전한 파일 내용을 제공하세요
2. 파일의 기능과 구조는 유지하세요
3. ${language} 언어의 문법과 규칙을 정확히 따르세요
4. JSON 형식으로 응답하세요:
\`\`\`json
{
  "fixedContent": "수정된 전체 파일 내용"
}
\`\`\``;

    const fixResponse = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: fixRequest,
        history: [],
        context: "",
        contextFiles: [],
        projectType: "Next.js",
        model: "grok-code-fast-1",
        provider: "grok",
      }),
    });

    if (!fixResponse.ok) {
      addExecutionLog(stepIndex, {
        timestamp: new Date(),
        type: "error",
        message: "에러 수정 요청 실패",
        filePath: filePath,
        details: "LLM에게 수정 요청을 보낼 수 없습니다.",
      });
      return currentContent;
    }

    // 스트리밍 응답 읽기
    const reader = fixResponse.body?.getReader();
    const decoder = new TextDecoder();
    let fixContent = "";

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
                fixContent += data.content;
              }
              if (data.done) break;
            } catch {
              // JSON 파싱 실패 무시
            }
          }
        }
      }
    }

    // 수정된 내용 추출
    let fixedContent = currentContent;
    const jsonMatch = fixContent.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.fixedContent) {
          fixedContent = parsed.fixedContent;
        }
      } catch {
        // JSON 파싱 실패 시 코드 블록에서 추출 시도
        // 언어별 코드 블록 태그로 추출
        const codeBlockPatterns = [
          new RegExp(`\`\`\`(?:${codeBlockTag}|${language})\\s*([\\s\\S]*?)\`\`\``),
          /```(?:tsx?|jsx?|typescript|javascript|python|java|go|rust|cpp|c)?\s*([\s\S]*?)```/,
        ];
        
        for (const pattern of codeBlockPatterns) {
          const codeBlockMatch = fixContent.match(pattern);
          if (codeBlockMatch && codeBlockMatch[1]) {
            fixedContent = codeBlockMatch[1].trim();
            break;
          }
        }
      }
    } else {
      // JSON 형식이 아니면 코드 블록에서 추출
      // 언어별 코드 블록 태그로 추출
      const codeBlockPatterns = [
        new RegExp(`\`\`\`(?:${codeBlockTag}|${language})\\s*([\\s\\S]*?)\`\`\``),
        /```(?:tsx?|jsx?|typescript|javascript|python|java|go|rust|cpp|c)?\s*([\s\S]*?)```/,
      ];
      
      for (const pattern of codeBlockPatterns) {
        const codeBlockMatch = fixContent.match(pattern);
        if (codeBlockMatch && codeBlockMatch[1]) {
          fixedContent = codeBlockMatch[1].trim();
          break;
        }
      }
    }

    // 3. 수정된 내용으로 파일 업데이트
    if (fixedContent !== currentContent) {
      addExecutionLog(stepIndex, {
        timestamp: new Date(),
        type: "file",
        message: "에러 수정된 내용으로 파일 업데이트 중",
        filePath: filePath,
      });

      const updateResponse = await fetch("/api/files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: filePath,
          projectPath: projectPath,
          content: fixedContent,
        }),
      });

      if (updateResponse.ok) {
        addExecutionLog(stepIndex, {
          timestamp: new Date(),
          type: "success",
          message: "에러 수정된 파일 업데이트 완료",
          filePath: filePath,
        });

        // 4. 다시 에러 확인 (재귀)
        return await checkAndFixErrors(stepIndex, filePath, fixedContent, attempt + 1, projectPath, addExecutionLog);
      } else {
        addExecutionLog(stepIndex, {
          timestamp: new Date(),
          type: "error",
          message: "수정된 파일 업데이트 실패",
          filePath: filePath,
        });
        return currentContent;
      }
    } else {
      addExecutionLog(stepIndex, {
        timestamp: new Date(),
        type: "info",
        message: "수정된 내용이 없음",
        filePath: filePath,
      });
      return currentContent;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류";
    addExecutionLog(stepIndex, {
      timestamp: new Date(),
      type: "error",
      message: "에러 확인/수정 중 오류",
      filePath: filePath,
      details: errorMessage,
    });
    return currentContent;
  }
}

