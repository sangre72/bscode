import {
  API_ENDPOINTS,
  ERROR_MESSAGES,
  PROJECT_ANALYSIS_SYSTEM_PROMPT,
  getGrokApiKey,
  getModelConfig,
  getOllamaUrl
} from "@/utils/modelConfig";
import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

// 무시할 디렉토리/파일 목록
const IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".DS_Store",
  ".env",
  ".env.local",
  ".cache",
  "coverage",
  ".vscode",
  ".idea",
  "planning",
];

function shouldIgnore(name: string): boolean {
  return IGNORE_PATTERNS.some((pattern) => name.includes(pattern));
}

async function buildFileTree(dirPath: string, basePath: string, maxDepth: number = 5, currentDepth: number = 0): Promise<FileNode[]> {
  if (currentDepth >= maxDepth) {
    return [];
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      if (shouldIgnore(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      if (entry.isDirectory()) {
        const children = await buildFileTree(fullPath, basePath, maxDepth, currentDepth + 1);
        nodes.push({
          name: entry.name,
          path: relativePath,
          type: "directory",
          children: children.length > 0 ? children : undefined,
        });
      } else {
        nodes.push({
          name: entry.name,
          path: relativePath,
          type: "file",
        });
      }
    }

    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
    return [];
  }
}

// 파일 트리를 텍스트 형식으로 변환
function treeToText(nodes: FileNode[], indent: string = ""): string {
  let result = "";
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const currentIndent = indent + (isLast ? "└── " : "├── ");
    const nextIndent = indent + (isLast ? "    " : "│   ");
    
    result += currentIndent + node.name;
    if (node.type === "directory") {
      result += "/";
    }
    result += "\n";
    
    if (node.children && node.children.length > 0) {
      result += treeToText(node.children, nextIndent);
    }
  }
  return result;
}

// 파일 목록을 평면 리스트로 변환
function flattenFileList(nodes: FileNode[]): Array<{ path: string; type: string }> {
  const files: Array<{ path: string; type: string }> = [];
  
  for (const node of nodes) {
    files.push({
      path: node.path,
      type: node.type,
    });
    
    if (node.children) {
      files.push(...flattenFileList(node.children));
    }
  }
  
  return files;
}

// 특정 파일 읽기
async function readFileContent(filePath: string, projectPath: string): Promise<string | null> {
  try {
    const fullPath = path.join(projectPath, filePath);
    const stats = await fs.stat(fullPath);
    if (stats.isFile()) {
      const content = await fs.readFile(fullPath, "utf-8");
      // 파일 크기 제한 (100KB)
      if (content.length < 100000) {
        return content;
      } else {
        return content.substring(0, 100000) + "\n... (파일이 너무 커서 일부만 표시)";
      }
    }
    return null;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
}

// 프로젝트 타입 자동 감지 (파일 목록 기반)
function detectProjectType(fileList: Array<{ path: string; type: string }>): string {
  const filePaths = fileList.map(f => f.path.toLowerCase());
  
  // Java/Spring
  if (filePaths.some(p => p.includes('pom.xml') || p.includes('build.gradle') || p.includes('application.properties') || p.includes('application.yml'))) {
    return 'Java/Spring';
  }
  
  // Python
  if (filePaths.some(p => p.includes('requirements.txt') || p.includes('setup.py') || p.includes('pyproject.toml') || p.includes('pipfile') || p.includes('manage.py'))) {
    if (filePaths.some(p => p.includes('flask') || p.includes('app.py'))) {
      return 'Python/Flask';
    }
    if (filePaths.some(p => p.includes('django') || p.includes('settings.py'))) {
      return 'Python/Django';
    }
    return 'Python';
  }
  
  // Node.js/Next.js/React
  if (filePaths.some(p => p.includes('package.json'))) {
    if (filePaths.some(p => p.includes('next.config'))) {
      return 'Next.js';
    }
    if (filePaths.some(p => p.includes('react'))) {
      return 'React';
    }
    return 'Node.js';
  }
  
  // Go
  if (filePaths.some(p => p.includes('go.mod') || p.includes('go.sum'))) {
    return 'Go';
  }
  
  // Rust
  if (filePaths.some(p => p.includes('cargo.toml'))) {
    return 'Rust';
  }
  
  // C/C++
  if (filePaths.some(p => p.includes('cmakelists.txt') || p.includes('makefile'))) {
    return 'C/C++';
  }
  
  return 'Unknown';
}

// LLM과 대화형으로 프로젝트 프로필 생성
async function generateProjectProfileInteractive(
  projectPath: string,
  fileTree: FileNode[],
  model: string,
  provider: "grok" | "ollama",
  maxIterations: number = 5
): Promise<{ profile: string; conversationHistory: Array<{ role: "system" | "user" | "assistant"; content: string }> }> {
  // API 키는 필요할 때 검증

  const treeText = treeToText(fileTree);
  const fileList = flattenFileList(fileTree);
  const fileListText = fileList
    .filter(f => f.type === "file")
    .map(f => `  - ${f.path}`)
    .join("\n");

  // 프로젝트 타입 자동 감지
  const detectedType = detectProjectType(fileList);

  // 첫 번째 요청: 디렉토리 구조와 파일 목록만 전송
  const conversationHistory: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content: PROJECT_ANALYSIS_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: `다음 프로젝트의 구조를 분석하여 상세한 프로젝트 프로필을 작성해주세요.

**프로젝트 경로:** ${projectPath}

**감지된 프로젝트 타입 (예상):** ${detectedType !== 'Unknown' ? detectedType : '파일 구조를 분석하여 프로젝트 타입을 파악하세요'}

**디렉토리 구조:**
\`\`\`
${treeText}
\`\`\`

**파일 목록:**
\`\`\`
${fileListText}
\`\`\`

**지시사항:**
1. 위 디렉토리 구조와 파일 목록을 분석하여 프로젝트 타입을 파악하세요.
2. 프로젝트 타입에 맞는 주요 설정 파일과 소스 파일을 우선적으로 요청하세요.
   - Java/Spring: pom.xml, build.gradle, application.properties, src/main/java 구조
   - Python/Flask: requirements.txt, app.py, config.py, Flask 관련 파일
   - Python/Django: requirements.txt, manage.py, settings.py, urls.py
   - Next.js/React: package.json, tsconfig.json, next.config.js, app/ 또는 pages/ 구조
   - Go: go.mod, main.go, 주요 소스 파일
   - Rust: Cargo.toml, src/main.rs
   - 기타: 프로젝트 타입에 맞는 주요 파일들
3. 프로젝트 프로필을 작성하기 위해 **추가로 필요한 파일들의 경로**를 나열해주세요.

**CRITICAL: JSON Format Requirements:**
1. **MUST use double quotes (") for all property names and string values** - NEVER use single quotes (')
2. **MUST use proper JSON syntax** - All property names MUST be quoted
3. **MUST wrap your response in a JSON code block** - Use \`\`\`json ... \`\`\`
4. **MUST ensure valid JSON** - No trailing commas, no comments, no JavaScript-style syntax
5. **MUST use exact format** - Follow the structure below EXACTLY
6. **MUST validate JSON before sending** - Test with JSON.parse() in your mind
7. **MUST escape special characters** - Use \\n for newlines, \\" for quotes

**응답 형식 (반드시 준수):**
\`\`\`json
{
  "phase": "analysis",
  "analysis": {
    "projectType": "프로젝트 타입 (예: Next.js, Java/Spring, Python/Flask 등)",
    "framework": "프레임워크 및 버전",
    "language": "주요 언어",
    "structure": "디렉토리 구조 분석",
    "currentUnderstanding": "현재까지 파악한 내용"
  },
  "plan": {
    "neededFiles": ["파일경로1", "파일경로2", ...],
    "reasons": {
      "파일경로1": "필요한 이유",
      "파일경로2": "필요한 이유"
    },
    "nextSteps": ["다음 단계 1", "다음 단계 2", ...]
  },
  "isComplete": false
}
\`\`\`

**프로필 완성 시 형식:**
\`\`\`json
{
  "phase": "complete",
  "analysis": {
    "projectType": "프로젝트 타입",
    "framework": "프레임워크 및 버전",
    "language": "주요 언어",
    "structure": "디렉토리 구조 분석",
    "dependencies": "의존성 정보",
    "buildTools": "빌드 도구",
    "codingConventions": "코딩 컨벤션",
    "specialNotes": "특이사항"
  },
  "profile": "마크다운 형식의 상세 프로젝트 프로필",
  "isComplete": true
}
\`\`\`

**중요:**
- 반드시 \`\`\`json으로 시작하고 \`\`\`로 끝나야 합니다
- JSON 외의 텍스트는 포함하지 마세요
- 모든 문자열은 이중 따옴표를 사용하세요
- trailing comma를 사용하지 마세요
- 주석을 포함하지 마세요`,
    },
  ];

  let iteration = 0;
  const collectedFiles: Record<string, string> = {};

  while (iteration < maxIterations) {
    iteration++;

    // LLM API 호출 (Grok 또는 Ollama)
    let assistantMessage = "";
    
    if (provider === "grok") {
      const apiKey = getGrokApiKey();

      // 모델별 설정 가져오기 (통합 관리)
      const modelConfig = getModelConfig(model, "analysis");

      const response = await fetch(API_ENDPOINTS.GROK, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: conversationHistory,
          temperature: modelConfig.temperature,
          max_tokens: modelConfig.maxTokens,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(ERROR_MESSAGES.LLM_API_CALL_FAILED(response.status, errorText));
      }

      const data = await response.json();
      assistantMessage = data.choices[0]?.message?.content || "";
    } else if (provider === "ollama") {
      const ollamaUrl = getOllamaUrl();
      
      // Ollama 형식으로 메시지 변환
      const ollamaMessages = conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model,
          messages: ollamaMessages,
          stream: false,
          options: {
            temperature: 0.3,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(ERROR_MESSAGES.LLM_API_CALL_FAILED(response.status, errorText));
      }

      const data = await response.json();
      assistantMessage = data.message?.content || "";
    } else {
      throw new Error(`지원하지 않는 provider: ${provider}`);
    }
    
    conversationHistory.push({
      role: "assistant",
      content: assistantMessage,
    });

      // JSON 응답 파싱
    try {
      // promptBuilder의 extractCompleteJSON 함수를 먼저 사용 (가장 robust)
      const { extractCompleteJSON, cleanJSONString } = await import("@/utils/promptBuilder");
      
      // 여러 방법으로 JSON 추출 시도
      let jsonStr = "";
      
      // 방법 1: extractCompleteJSON 사용 (가장 robust - 중괄호 매칭 사용)
      // 이 방법이 가장 정확하므로 우선 사용
      let extractedJSON = extractCompleteJSON(assistantMessage);
      
      // extractCompleteJSON이 실패하거나 너무 짧은 경우, 원본 전체에서 직접 추출 시도
      if (!extractedJSON || extractedJSON.length < 100) {
        console.warn("⚠️ extractCompleteJSON 실패 또는 결과가 너무 짧음, 원본에서 직접 추출 시도...");
        
        // 원본 전체에서 첫 번째 { 부터 시작해서 완전한 JSON 추출
        const firstBrace = assistantMessage.indexOf('{');
        if (firstBrace !== -1) {
          // extractCompleteJSON을 원본 전체에 대해 다시 시도
          extractedJSON = extractCompleteJSON(assistantMessage.substring(firstBrace));
        }
      }
      
      if (extractedJSON && extractedJSON.length > 100) {
        // 추출된 JSON이 충분히 긴 경우에만 사용
        jsonStr = extractedJSON;
        console.log("✅ extractCompleteJSON으로 JSON 추출 성공, 길이:", jsonStr.length);
      } else {
        // 여전히 실패한 경우, 수동으로 중괄호 매칭 시도
        console.warn("⚠️ extractCompleteJSON 완전 실패, 수동 중괄호 매칭 시도...");
        
        const firstBrace = assistantMessage.indexOf('{');
        const lastBrace = assistantMessage.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          // 중괄호 매칭으로 완전한 JSON 확인
          let braceCount = 0;
          let inString = false;
          let escapeNext = false;
          let stringChar = '';
          let validEnd = -1;
          
          for (let i = firstBrace; i <= lastBrace; i++) {
            const char = assistantMessage[i];
            
            if (escapeNext) {
              escapeNext = false;
              continue;
            }
            
            if (char === '\\') {
              escapeNext = true;
              continue;
            }
            
            if ((char === '"' || char === "'") && !escapeNext) {
              if (!inString) {
                inString = true;
                stringChar = char;
              } else if (char === stringChar) {
                inString = false;
                stringChar = '';
              }
              continue;
            }
            
            if (inString) continue;
            
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                validEnd = i + 1;
                break;
              }
            }
          }
          
          if (validEnd > firstBrace) {
            jsonStr = assistantMessage.substring(firstBrace, validEnd);
            console.log("✅ 수동 중괄호 매칭으로 JSON 추출 성공, 길이:", jsonStr.length);
          } else {
            // 완전한 매칭 실패 - 그래도 시도
            jsonStr = assistantMessage.substring(firstBrace, lastBrace + 1);
            console.warn("⚠️ 불완전한 JSON 추출, 길이:", jsonStr.length);
          }
        }
        
        if (!jsonStr || jsonStr.length < 50) {
          throw new Error("JSON 응답을 찾을 수 없습니다.");
        }
      }

      // JSON 정규화 - cleanJSONString 사용 (더 robust)
      try {
        jsonStr = cleanJSONString(jsonStr);
      } catch {
        // cleanJSONString 실패 시 기본 정규화만 수행
        jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
        jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
        jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');
      }
      
      // JSON 파싱 시도 (여러 방법)
      interface AnalysisResponse {
        phase?: string;
        analysis?: Record<string, unknown>;
        profile?: string;
        isComplete?: boolean;
        plan?: {
          neededFiles?: string[];
          reasons?: Record<string, string>;
        };
      }
      
      let responseData: AnalysisResponse;
      
      // 다단계 파싱 시도
      try {
        // 1단계: 직접 파싱 시도
        responseData = JSON.parse(jsonStr) as AnalysisResponse;
      } catch (parseError) {
        // 2단계: cleanJSONString 재적용 후 파싱
        try {
          const reCleaned = cleanJSONString(jsonStr);
          responseData = JSON.parse(reCleaned) as AnalysisResponse;
        } catch (secondError) {
          // 3단계: extractCompleteJSON으로 다시 추출 후 파싱
          try {
            const reExtracted = extractCompleteJSON(assistantMessage);
            if (reExtracted) {
              const reCleaned = cleanJSONString(reExtracted);
              responseData = JSON.parse(reCleaned) as AnalysisResponse;
            } else {
              throw secondError;
            }
          } catch (thirdError) {
            // 모든 시도 실패 - 상세한 에러 로깅
            console.error("❌ JSON 파싱 실패 (모든 시도 실패):");
            console.error("첫 번째 에러:", parseError instanceof Error ? parseError.message : String(parseError));
            console.error("두 번째 에러:", secondError instanceof Error ? secondError.message : String(secondError));
            console.error("세 번째 에러:", thirdError instanceof Error ? thirdError.message : String(thirdError));
            console.error("JSON 문자열 길이:", jsonStr.length);
            console.error("전체 응답 길이:", assistantMessage.length);
            console.error("=== 전체 응답 시작 ===");
            console.error(assistantMessage);
            console.error("=== 전체 응답 끝 ===");
            console.error("=== JSON 문자열 시작 ===");
            console.error(jsonStr);
            console.error("=== JSON 문자열 끝 ===");
            
            // JSON이 잘린 경우를 감지하고 복구 시도
            if (jsonStr.includes('"profile"') || assistantMessage.includes('"profile"')) {
              console.warn("⚠️ JSON이 잘린 것으로 보입니다. profile 필드를 수동으로 추출 시도...");
              
              // profile 필드 추출 시도 (더 robust한 방법)
              // profile 필드는 매우 긴 문자열이므로 여러 줄에 걸쳐 있을 수 있음
              // 전체 응답에서도 추출 시도
              let profileValue = "";
              const searchStr = jsonStr.length < assistantMessage.length / 2 
                ? assistantMessage 
                : jsonStr;
              
              // 방법 1: "profile": " 부터 시작해서 완전한 문자열 찾기
              const profileStart = searchStr.indexOf('"profile"');
              if (profileStart !== -1) {
                // "profile": " 또는 "profile":" 찾기
                let valueStart = searchStr.indexOf('"', profileStart + 9); // "profile" 다음
                if (valueStart !== -1) {
                  // 콜론과 공백 건너뛰기
                  valueStart = searchStr.indexOf('"', valueStart + 1) + 1; // 값의 시작 따옴표 다음
                  
                  if (valueStart > 0) {
                    // 문자열 끝 찾기 (이스케이프된 따옴표는 제외)
                    let valueEnd = -1;
                    let escapeNext = false;
                    for (let i = valueStart; i < searchStr.length; i++) {
                      if (escapeNext) {
                        escapeNext = false;
                        continue;
                      }
                      if (searchStr[i] === '\\') {
                        escapeNext = true;
                        continue;
                      }
                      if (searchStr[i] === '"' && !escapeNext) {
                        // 다음 문자가 } 또는 , 또는 공백+} 또는 공백+, 인지 확인
                        const nextChar = searchStr.substring(i + 1).trim()[0];
                        if (nextChar === '}' || nextChar === ',' || nextChar === undefined) {
                          valueEnd = i;
                          break;
                        }
                      }
                    }
                    
                    if (valueEnd > valueStart) {
                      profileValue = searchStr.substring(valueStart, valueEnd)
                        .replace(/\\n/g, '\n')
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\')
                        .replace(/\\t/g, '\t')
                        .replace(/\\r/g, '\r')
                        .replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => String.fromCharCode(parseInt(code, 16)));
                    } else if (valueStart > 0) {
                      // 문자열 끝을 찾지 못했지만, JSON이 잘린 것으로 보임
                      // 마지막 } 전까지 모두 profile로 간주
                      const lastBrace = searchStr.lastIndexOf('}');
                      if (lastBrace > valueStart) {
                        // 마지막 } 전까지 추출 (불완전할 수 있음)
                        profileValue = searchStr.substring(valueStart, lastBrace)
                          .replace(/\\n/g, '\n')
                          .replace(/\\"/g, '"')
                          .replace(/\\\\/g, '\\')
                          .replace(/\\t/g, '\t')
                          .replace(/\\r/g, '\r')
                          .replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => String.fromCharCode(parseInt(code, 16)));
                        console.warn("⚠️ profile 필드가 잘린 것으로 보이지만 추출 시도, 길이:", profileValue.length);
                      }
                    }
                  }
                }
              }
              
              // 방법 2: 정규식으로 profile 필드 찾기 (이스케이프된 따옴표 고려) - 백업
              if (!profileValue) {
                const profileMatch1 = searchStr.match(/"profile"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                if (profileMatch1) {
                  profileValue = profileMatch1[1]
                    .replace(/\\n/g, '\n')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\')
                    .replace(/\\t/g, '\t')
                    .replace(/\\r/g, '\r')
                    .replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => String.fromCharCode(parseInt(code, 16)));
                }
              }
              
              if (profileValue) {
                // analysis 필드도 추출 시도
                let analysisData: Record<string, unknown> = {};
                try {
                  const analysisMatch = jsonStr.match(/"analysis"\s*:\s*\{([^}]*)\}/);
                  if (analysisMatch) {
                    // 간단한 파싱 시도
                    const analysisStr = "{" + analysisMatch[1] + "}";
                    try {
                      analysisData = JSON.parse(analysisStr) as Record<string, unknown>;
                    } catch {
                      // 파싱 실패 시 빈 객체 사용
                    }
                  }
                } catch {
                  // analysis 추출 실패 시 무시
                }
                
                // 최소한 profile은 추출 가능
                responseData = {
                  phase: "complete",
                  analysis: analysisData,
                  profile: profileValue,
                  isComplete: true,
                } as AnalysisResponse;
                console.log("✅ profile 필드 추출하여 복구 성공, profile 길이:", profileValue.length);
              } else {
                throw new Error(
                  `JSON 파싱 실패: ${parseError instanceof Error ? parseError.message : String(parseError)}. ` +
                  `JSON 길이: ${jsonStr.length}, 응답 길이: ${assistantMessage.length}. ` +
                  `JSON이 잘렸고 profile 필드도 추출할 수 없습니다.`
                );
              }
            } else {
              throw new Error(
                `JSON 파싱 실패: ${parseError instanceof Error ? parseError.message : String(parseError)}. ` +
                `JSON 길이: ${jsonStr.length}, 응답 길이: ${assistantMessage.length}`
              );
            }
          }
        }
      }

      // 프로필이 완성되었는지 확인
      if (responseData.isComplete && responseData.profile) {
        return { profile: responseData.profile, conversationHistory };
      }

      // phase가 "complete"인 경우도 확인
      if (responseData.phase === "complete" && responseData.profile) {
        return { profile: responseData.profile, conversationHistory };
      }

      // 필요한 파일들 읽기 (plan.neededFiles 또는 neededFiles)
      const neededFiles = (responseData.plan?.neededFiles as string[] | undefined) || [];
      if (neededFiles.length === 0) {
        // 파일이 더 이상 필요 없으면 최종 프로필 요청
        conversationHistory.push({
          role: "user",
          content: "추가 파일이 필요 없다면, 현재까지 수집한 정보를 바탕으로 최종 프로젝트 프로필을 작성해주세요.\n\n**CRITICAL: 반드시 다음 형식으로 응답하세요:**\n```json\n{\n  \"phase\": \"complete\",\n  \"analysis\": {\n    \"projectType\": \"프로젝트 타입\",\n    \"framework\": \"프레임워크 및 버전\",\n    \"language\": \"주요 언어\",\n    \"structure\": \"디렉토리 구조 분석\",\n    \"dependencies\": \"의존성 정보\",\n    \"buildTools\": \"빌드 도구\",\n    \"codingConventions\": \"코딩 컨벤션 및 스타일\",\n    \"specialNotes\": \"특이사항 및 주의사항\"\n  },\n  \"profile\": \"마크다운 형식의 상세 프로젝트 프로필\",\n  \"isComplete\": true\n}\n```\n\n**중요:** 반드시 ```json으로 시작하고 ```로 끝나야 합니다. JSON 외의 텍스트는 포함하지 마세요.",
        });
        continue;
      }

      // 파일들 읽기
      const fileContents: Record<string, string> = {};
      for (const filePath of neededFiles) {
        if (!collectedFiles[filePath]) {
          const content = await readFileContent(filePath, projectPath);
          if (content) {
            fileContents[filePath] = content;
            collectedFiles[filePath] = content;
          }
        }
      }

      // 읽은 파일들을 LLM에 전송
      if (Object.keys(fileContents).length > 0) {
        let fileInfoText = "**요청하신 파일들의 내용:**\n\n";
        for (const [filePath, content] of Object.entries(fileContents)) {
          fileInfoText += `### ${filePath}\n`;
          fileInfoText += "```\n";
          const maxLength = 5000;
          if (content.length > maxLength) {
            fileInfoText += content.substring(0, maxLength) + "\n... (내용 생략)";
          } else {
            fileInfoText += content;
          }
          fileInfoText += "\n```\n\n";
        }

        fileInfoText += `\n위 파일들의 내용을 분석하여 프로젝트 프로필을 계속 작성하세요.\n\n`;
        fileInfoText += `**CRITICAL: 응답 형식 (반드시 준수):**\n`;
        fileInfoText += `- 추가로 필요한 파일이 있으면:\n`;
        fileInfoText += `\`\`\`json\n`;
        fileInfoText += `{\n`;
        fileInfoText += `  "phase": "analysis",\n`;
        fileInfoText += `  "analysis": { "projectType": "...", "currentUnderstanding": "..." },\n`;
        fileInfoText += `  "plan": { "neededFiles": ["파일1", "파일2"], "reasons": {...} },\n`;
        fileInfoText += `  "isComplete": false\n`;
        fileInfoText += `}\n`;
        fileInfoText += `\`\`\`\n\n`;
        fileInfoText += `- 프로필이 완성되었으면:\n`;
        fileInfoText += `\`\`\`json\n`;
        fileInfoText += `{\n`;
        fileInfoText += `  "phase": "complete",\n`;
        fileInfoText += `  "analysis": { "projectType": "...", "framework": "...", ... },\n`;
        fileInfoText += `  "profile": "마크다운 형식의 최종 프로필",\n`;
        fileInfoText += `  "isComplete": true\n`;
        fileInfoText += `}\n`;
        fileInfoText += `\`\`\`\n\n`;
        fileInfoText += `**중요:** 반드시 \`\`\`json으로 시작하고 \`\`\`로 끝나야 합니다. JSON 외의 텍스트는 포함하지 마세요.`;

        conversationHistory.push({
          role: "user",
          content: fileInfoText,
        });
      } else {
        // 파일을 읽을 수 없으면 알림
        conversationHistory.push({
          role: "user",
          content: `요청하신 파일들을 읽을 수 없습니다. 현재까지 수집한 정보를 바탕으로 프로젝트 프로필을 작성해주세요.\n\n**CRITICAL: 반드시 다음 형식으로 응답하세요:**\n\`\`\`json\n{\n  "phase": "complete",\n  "analysis": {\n    "projectType": "프로젝트 타입",\n    "framework": "프레임워크",\n    "language": "언어",\n    "structure": "구조 분석",\n    "dependencies": "의존성",\n    "buildTools": "빌드 도구",\n    "codingConventions": "코딩 컨벤션",\n    "specialNotes": "특이사항"\n  },\n  "profile": "마크다운 형식의 프로젝트 프로필",\n  "isComplete": true\n}\n\`\`\`\n\n**중요:** 반드시 \`\`\`json으로 시작하고 \`\`\`로 끝나야 합니다.`,
        });
      }
    } catch (error) {
      console.error(`Iteration ${iteration} JSON parsing error:`, error);
      // JSON 파싱 실패 시 최종 프로필 요청
      conversationHistory.push({
        role: "user",
        content: "JSON 파싱에 실패했습니다. 현재까지 수집한 정보를 바탕으로 최종 프로젝트 프로필을 작성해주세요.\n\n**CRITICAL: 반드시 다음 형식으로 응답하세요:**\n```json\n{\n  \"phase\": \"complete\",\n  \"analysis\": {\n    \"projectType\": \"프로젝트 타입\",\n    \"framework\": \"프레임워크\",\n    \"language\": \"언어\",\n    \"structure\": \"구조 분석\",\n    \"dependencies\": \"의존성\",\n    \"buildTools\": \"빌드 도구\",\n    \"codingConventions\": \"코딩 컨벤션\",\n    \"specialNotes\": \"특이사항\"\n  },\n  \"profile\": \"마크다운 형식의 프로젝트 프로필\",\n  \"isComplete\": true\n}\n```\n\n**중요:** 반드시 ```json으로 시작하고 ```로 끝나야 합니다.",
      });
    }
  }

  // 최대 반복 횟수에 도달했으면 마지막 응답에서 프로필 추출 시도
  const lastMessage = conversationHistory[conversationHistory.length - 1]?.content || "";
  const jsonMatch = lastMessage.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const responseData = JSON.parse(jsonMatch[1]);
      if (responseData.profile) {
        return { profile: responseData.profile, conversationHistory };
      }
    } catch {
      // 파싱 실패 시 무시
    }
  }

  throw new Error("프로젝트 프로필 생성에 실패했습니다. 최대 반복 횟수에 도달했습니다.");
}

export async function POST(request: NextRequest) {
  try {
    const { projectPath, model, provider } = await request.json();

    if (!projectPath) {
      return NextResponse.json(
        { error: "프로젝트 경로가 필요합니다." },
        { status: 400 }
      );
    }

    // 기본값 설정
    const selectedModel = model || "grok-3";
    const selectedProvider = (provider || "grok") as "grok" | "ollama";

    // 경로 검증
    try {
      const stats = await fs.stat(projectPath);
      if (!stats.isDirectory()) {
        return NextResponse.json(
          { error: "유효한 디렉토리가 아닙니다." },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "디렉토리를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 파일 트리 생성
    const fileTree = await buildFileTree(projectPath, projectPath);
    
    // 대화형으로 프로젝트 프로필 생성 (실시간 업데이트를 위해 콜백 추가)
    const { profile, conversationHistory } = await generateProjectProfileInteractive(
      projectPath, 
      fileTree, 
      selectedModel, 
      selectedProvider
    );

    // conversationHistory에서 user와 assistant 메시지만 추출 (system 제외)
    const conversationMessages = conversationHistory
      .filter((msg: { role: string; content: string }) => msg.role !== "system")
      .map((msg: { role: string; content: string }) => ({
        role: msg.role,
        content: msg.content,
      }));

    return NextResponse.json({
      success: true,
      profile,
      conversation: conversationMessages,
      message: "프로젝트 프로필이 생성되었습니다.",
    });
  } catch (error) {
    console.error("Error analyzing project:", error);
    return NextResponse.json(
      { 
        error: "프로젝트 분석 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
