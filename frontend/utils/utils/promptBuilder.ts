/**
 * LLM 프롬프트 빌더 - 구조화된 응답을 요청
 */

export interface TaskDefinition {
  type: "install" | "create" | "modify" | "command" | "info";
  description: string;
  target?: string; // 파일 경로 또는 패키지명
  content?: string; // 파일 내용
  command?: string; // 실행할 명령어
  dependencies?: string[]; // 선행 작업
}

export interface StructuredResponse {
  phase?: "planning" | "execution";
  analysis?: string;
  isClear?: boolean;
  questions?: string[];
  plan?: {
    packages?: string[];
    filesToModify?: Array<{
      path: string;
      reason: string;
      changes: string;
      fileExists?: boolean;
    }>;
    filesToCreate?: Array<{
      path: string;
      reason: string;
      purpose: string;
      fileExists?: boolean;
    }>;
    executionOrder?: string[];
    architecture?: string;
    subTasks?: Array<{
      name: string;
      description: string;
      files: string[];
      dependencies?: string[];
    }>;
  };
  readyToExecute?: boolean;
  tasks?: TaskDefinition[];
  explanation?: string;
  codeBlocks?: Array<{
    filePath: string;
    language: string;
    content: string;
  }>;
}

/**
 * 시스템 프롬프트 생성
 */
export function buildSystemPrompt(): string {
  return `You are an expert AI programmer assistant. Your primary mission is to help users build and modify software projects by generating clean, scalable, and maintainable code. You MUST follow all instructions and principles outlined below.

---

### CORE PRINCIPLE 1: ALWAYS RESPOND IN STRUCTURED JSON

Every response you provide MUST be a single JSON object enclosed in a \`\`\`json ... \`\`\` code block. No text should precede or follow this block. The JSON object must conform to the structure defined in this prompt.

---

### CORE PRINCIPLE 2: ADHERE TO FEATURE-DRIVEN ARCHITECTURE

For any non-trivial request, you MUST propose and generate a scalable, **feature-driven project structure**. Do NOT place all components into a single \`/components\` directory. Group files by feature or domain.

#### Architectural Rules:
1.  **Features First**: Create a \`src/features\` directory for domain-specific logic.
2.  **Self-Contained Modules**: Each feature directory (e.g., \`profile\`) should contain its own \`components\`, \`hooks\`, \`types\`, etc.
3.  **Shared Logic**:
    *   Truly reusable, "dumb" UI components (Button, Input) go into \`src/components/common\`.
    *   Shared utility functions (formatters, API clients) go into \`src/lib\` or \`src/utils\`.
4.  **API Routes**: Keep API routes in \`app/api/...\`.
5.  **State Management**: Global state stores (Zustand, Redux) go in \`src/store\`.
6.  **Language Agnostic**: Apply this modular principle to all languages (e.g., Python/Django apps, Java packages).

#### Good vs. Bad Structure Examples:

**User Request:** "Create a user profile page with an editor."

**❌ BAD RESPONSE (Flat, Unscalable Structure):**
\`\`\`json
{
  "plan": {
    "filesToCreate": [
      { "path": "app/profile/page.tsx" },
      { "path": "components/UserProfile.tsx" },
      { "path": "components/ProfileEditor.tsx" }
    ]
  }
}
\`\`\`

**✅ GOOD RESPONSE (Feature-Driven Structure):**
\`\`\`json
{
  "plan": {
    "architecture": "Feature-Driven Structure: Creating a self-contained 'profile' feature in \`src/features/profile\` and placing reusable UI in \`src/components/common\`.",
    "filesToCreate": [
      { "path": "app/profile/page.tsx", "reason": "Next.js page to render the profile feature." },
      { "path": "src/features/profile/components/UserProfile.tsx", "reason": "Main component for the profile feature." },
      { "path": "src/features/profile/components/ProfileEditor.tsx", "reason": "Editor component, specific to the profile feature." },
      { "path": "src/components/common/Avatar.tsx", "reason": "A generic, reusable Avatar component for use across the app." },
      { "path": "src/features/profile/hooks/useUserProfile.ts", "reason": "Business logic hook for the profile feature." }
    ]
  }
}
\`\`\`
---

### CORE PRINCIPLE 3: FOLLOW THE TWO-PHASE PROCESS (PLANNING -> EXECUTION)

**Phase 1: Planning**
Your first response MUST be a detailed plan (\`"phase": "planning"\`).

1.  **Analyze & Understand**: Analyze the user's request, existing files (\`package.json\`, file structure), and project type.
2.  **Define Architecture**: Explicitly state the architecture you will use in \`plan.architecture\`.
3.  **Break Down Complex Requests**: For complex tasks ("build a chat app"), break it down into smaller sub-tasks (\`plan.subTasks\`) with clear dependencies.
4.  **Identify All Files**: List every single file to be created or modified with a clear \`reason\` or \`purpose\`.
5.  **Check File Existence (MANDATORY)**: You MUST verify if files already exist using the available tools. Report the status in \`fileExists\`. If a file exists, ask the user whether to overwrite or modify.
6.  **Provide Code Previews**: For every new file, you MUST provide a complete, working code preview in the \`codeBlocks\` array, even in the planning phase. This is not optional.
7.  **Ask Clarifying Questions**: If the request is ambiguous, use the \`questions\` array to ask for specifics. DO NOT proceed if you are unsure.

**Phase 2: Execution**
Once the user approves the plan, you will respond with an execution payload (\`"phase": "execution"\`).

1.  **Generate Final Code**: Provide the complete, final, and runnable code for all files in the \`codeBlocks\` array. Do not use placeholders like "// TODO".
2.  **Define Tasks**: Create a list of tasks (\`tasks\` array) for the client to execute (e.g., \`"type": "create"\`, \`"type": "install"\`). Each file in \`codeBlocks\` must have a corresponding task.

---

### DETAILED JSON RESPONSE STRUCTURE

You MUST ALWAYS respond using this exact JSON structure.

\`\`\`json
{
  "phase": "planning" | "execution",
  "analysis": "Your detailed analysis of the user's request and how you plan to implement it based on the architectural principles.",
  "isClear": true | false,
  "questions": [
    "Specific, targeted questions if the request is ambiguous."
  ],
  "plan": {
    "architecture": "A brief description of the chosen architecture (e.g., 'Feature-Driven Structure').",
    "packages": ["list-of-npm-packages-to-install"],
    "filesToModify": [
      {
        "path": "src/path/to/existing/file.ts",
        "reason": "Why this file needs to be changed.",
        "fileExists": true
      }
    ],
    "filesToCreate": [
      {
        "path": "src/features/feature-name/components/Component.tsx",
        "reason": "A clear, specific reason for creating this file.",
        "purpose": "The role this file plays in the feature.",
        "fileExists": false
      }
    ],
    "executionOrder": [
      "1. Install required packages.",
      "2. Create the common Avatar component.",
      "3. Implement the profile feature module.",
      "4. Create the profile page."
    ],
    "subTasks": [
      {
        "name": "Sub-task name (e.g., 'Implement Backend API')",
        "description": "What this sub-task achieves.",
        "files": ["list-of-files-for-this-task"],
        "dependencies": []
      }
    ]
  },
  "readyToExecute": true | false,
  "tasks": [
    {
      "type": "install" | "create" | "modify" | "command",
      "description": "A description of the task for the user.",
      "target": "package-name or file-path"
    }
  ],
  "codeBlocks": [
    {
      "filePath": "src/features/feature-name/components/Component.tsx",
      "language": "typescript",
      "content": "export default function Component() { ... complete, runnable code ... }"
    }
  ]
}
\`\`\`

### FINAL CRITICAL REMINDERS:
- **JSON ONLY**: Your entire response must be a single JSON object in a code block.
- **COMPLETE CODE**: \`codeBlocks\` must contain full, working code, not placeholders. This is mandatory for both planning and execution phases.
- **FEATURE-DRIVEN**: Always default to the feature-driven structure unless the request is trivially simple (e.g., updating a single config file).
- **VALIDATE JSON**: Ensure your JSON is valid before responding. No trailing commas, use double quotes, and quote all keys.
- **ASK, DON'T ASSUME**: If a request is vague (e.g., "add a library"), ask for the exact package name and where it should be used.`
}


/**
 * 사용자 요청 정규화 - 일관된 형식으로 변환
 */
export function normalizeUserRequest(request: string | undefined): string {
  if (!request || typeof request !== 'string') {
    return request || '';
  }

  let normalized = request.trim();

  // 일반적인 패턴 정규화
  const patterns = [
    // "헬로우 출력 프로그램" -> "헬로우를 출력하는 페이지 생성"
    { 
      pattern: /(헬로우|hello|Hello)\s*(를|을)?\s*(출력|표시|보여주|만들|생성)/gi, 
      replacement: (match: string) => {
        const text = match.match(/(헬로우|hello)/i)?.[0] || "Hello";
        return `${text}를 출력하는 페이지를 생성`;
      }
    },
    // "프로그램 만들어줘" -> "페이지 생성" (Next.js 컨텍스트에서)
    { 
      pattern: /프로그램\s*(을|를)?\s*(만들|생성|만들어)/gi, 
      replacement: "페이지를 생성"
    },
    // "컴포넌트 만들어줘" -> "컴포넌트 생성"
    { 
      pattern: /컴포넌트\s*(을|를)?\s*(만들|생성|만들어)/gi, 
      replacement: "컴포넌트를 생성"
    },
    // "페이지 만들어줘" -> "페이지 생성"
    { 
      pattern: /페이지\s*(을|를)?\s*(만들|생성|만들어)/gi, 
      replacement: "페이지를 생성"
    },
    // "출력하는" -> "출력하는" (일관성 유지)
    { pattern: /출력\s*(하는|하는데|하도록)/gi, replacement: "출력하는" },
    // "보여주는" -> "표시하는"
    { pattern: /보여주\s*(는|는데|도록)/gi, replacement: "표시하는" },
    // "만들어줘" -> "생성"
    { pattern: /만들어\s*(줘|주세요|주시겠어요)/gi, replacement: "생성" },
    // "추가해줘" -> "추가"
    { pattern: /추가해\s*(줘|주세요|주시겠어요)/gi, replacement: "추가" },
  ];

  // 패턴 적용
  for (const { pattern, replacement } of patterns) {
    if (typeof replacement === 'function') {
      normalized = normalized.replace(pattern, replacement);
    } else {
      normalized = normalized.replace(pattern, replacement);
    }
  }

  // 불필요한 공백 정리
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * 사용자 프롬프트에 컨텍스트 추가
 */
// enhanceUserPrompt는 아래에 통합됨

/**
 * LLM 응답에서 명확성 요청 여부 확인
 */
export function needsClarification(response: string): boolean {
  const clarificationKeywords = [
    "어떤",
    "어느",
    "어디에",
    "어떻게",
    "구체적으로",
    "명확히",
    "clarify",
    "which",
    "where",
    "how",
    "what specific",
    "need more information",
    "불명확",
    "추가 정보",
  ];
  
  const lowerResponse = response.toLowerCase();
  return clarificationKeywords.some(keyword => 
    lowerResponse.includes(keyword.toLowerCase())
  );
}

/**
 * LLM 응답 검증 및 불명확한 부분 확인
 */
export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  needsClarification: boolean;
  clarificationQuestions: string[];
}

export function validateLLMResponse(
  response: string,
  structuredResponse: StructuredResponse | null
): ValidationResult {
  const issues: string[] = [];
  const clarificationQuestions: string[] = [];
  
  // Phase 1 (Planning) 검증
  try {
    const planningMatch = response.match(/```json\s*([\s\S]*?)```/);
    if (planningMatch) {
      const planningData = JSON.parse(planningMatch[1]);
      if (planningData.phase === "planning") {
        // 계획 검증
        if (!planningData.plan) {
          issues.push("계획(plan)이 없습니다");
        } else {
          const plan = planningData.plan;
          
          // 패키지 설치가 필요한데 패키지명이 불명확한 경우
          if (response.toLowerCase().includes("install") || response.toLowerCase().includes("설치")) {
            if (!plan.packages || plan.packages.length === 0) {
              clarificationQuestions.push("설치할 패키지의 정확한 이름을 알려주세요 (예: @tiptap/react, @tiptap/starter-kit 등)");
            }
          }
          
          // 파일 수정이 너무 많은 경우
          if (plan.filesToModify && plan.filesToModify.length > 5) {
            clarificationQuestions.push(`정말 ${plan.filesToModify.length}개 파일을 모두 수정해야 하나요? 핵심 파일만 수정해도 될까요?`);
          }
          
          // 파일 경로가 불명확한 경우
          if (plan.filesToModify) {
            interface PlanFile {
              path?: string;
              reason?: string;
              changes?: string;
            }
            const unclearPaths = plan.filesToModify.filter((f: PlanFile) => 
              !f.path || f.path.includes("*") || f.path.includes("?") || f.path.length < 3
            );
            if (unclearPaths.length > 0) {
              clarificationQuestions.push("수정할 파일의 정확한 경로를 알려주세요");
            }
          }
          
          // 실행 순서가 없는 경우
          if (!plan.executionOrder || plan.executionOrder.length === 0) {
            issues.push("실행 순서(executionOrder)가 없습니다");
          }
        }
        
        // 질문이 있으면 명확성 필요
        if (planningData.questions && planningData.questions.length > 0) {
          clarificationQuestions.push(...planningData.questions);
        }
      }
    }
  } catch {
    // JSON 파싱 실패는 무시 (일반 텍스트 응답일 수 있음)
  }
  
  // Phase 2 (Execution) 검증
  if (structuredResponse && structuredResponse.tasks) {
    const tasks = structuredResponse.tasks;
    
    // 파일 수정 작업이 너무 많은 경우
    const modifyTasks = tasks.filter(t => t.type === "modify");
    if (modifyTasks.length > 5) {
      clarificationQuestions.push(`정말 ${modifyTasks.length}개 파일을 모두 수정해야 하나요?`);
    }
    
    // 파일 경로가 불명확한 작업 확인
    const unclearTasks = tasks.filter(t => 
      (t.type === "modify" || t.type === "create") && 
      (!t.target || t.target.includes("*") || t.target.length < 3)
    );
    if (unclearTasks.length > 0) {
      clarificationQuestions.push("수정/생성할 파일의 정확한 경로를 알려주세요");
    }
    
    // 패키지 설치 작업이 있는데 패키지명이 불명확한 경우
    const installTasks = tasks.filter(t => t.type === "install");
    installTasks.forEach(task => {
      if (!task.target || task.target.length < 2) {
        clarificationQuestions.push("설치할 패키지의 정확한 이름을 알려주세요");
      }
    });
    
    // 코드 블록이 없는데 파일 수정/생성 작업이 있는 경우
    const needsCodeBlocks = tasks.filter(t => 
      (t.type === "modify" || t.type === "create")
    );
    
    // plan에 filesToCreate나 filesToModify가 있는 경우도 확인
    const planNeedsCodeBlocks = structuredResponse.plan && (
      (structuredResponse.plan.filesToCreate && structuredResponse.plan.filesToCreate.length > 0) ||
      (structuredResponse.plan.filesToModify && structuredResponse.plan.filesToModify.length > 0)
    );
    
    if (needsCodeBlocks.length > 0 || planNeedsCodeBlocks) {
      // codeBlocks가 없거나 비어있는 경우
      if (!structuredResponse.codeBlocks || structuredResponse.codeBlocks.length === 0) {
        const phase = structuredResponse.phase === "planning" ? "Planning" : "Execution";
        issues.push(`파일 생성/수정 작업이 있지만 codeBlocks가 없습니다. ${phase} 단계에서도 파일을 생성/수정할 때는 반드시 codeBlocks 배열을 포함해야 합니다.`);
      } else {
        // codeBlocks가 있지만 필요한 파일이 누락된 경우
        const neededPathsFromTasks = needsCodeBlocks.map(t => t.target).filter((path): path is string => Boolean(path));
        const neededPathsFromPlan: string[] = [];
        if (structuredResponse.plan?.filesToCreate) {
          neededPathsFromPlan.push(...structuredResponse.plan.filesToCreate.map(f => f.path));
        }
        if (structuredResponse.plan?.filesToModify) {
          neededPathsFromPlan.push(...structuredResponse.plan.filesToModify.map(f => f.path));
        }
        const allNeededPaths = [...neededPathsFromTasks, ...neededPathsFromPlan];
        const providedPaths = structuredResponse.codeBlocks.map(cb => cb.filePath);
        const missingPaths = allNeededPaths.filter(path => !providedPaths.includes(path));
        if (missingPaths.length > 0) {
          issues.push(`다음 파일들의 코드 블록이 누락되었습니다: ${missingPaths.join(", ")}`);
        }
        
        // codeBlocks에 빈 내용이 있는 경우
        const emptyCodeBlocks = structuredResponse.codeBlocks.filter(cb => !cb.content || cb.content.trim().length < 10);
        if (emptyCodeBlocks.length > 0) {
          issues.push(`다음 파일들의 코드 블록이 비어있습니다: ${emptyCodeBlocks.map(cb => cb.filePath).join(", ")}`);
        }
      }
    }
    
    // 기존 검증 로직 (하위 호환성 유지)
    if (needsCodeBlocks.length > 0 && !structuredResponse.codeBlocks) {
      issues.push("파일 수정/생성 작업이 있지만 코드 블록이 없습니다");
    }
  } else {
    // 구조화된 응답이 없고 일반 텍스트만 있는 경우
    if (response.length > 100 && !response.includes("```")) {
      issues.push("구조화된 응답 형식이 없습니다. JSON 형식으로 응답해주세요");
    }
  }
  
  return {
    isValid: issues.length === 0 && clarificationQuestions.length === 0,
    issues,
    needsClarification: clarificationQuestions.length > 0,
    clarificationQuestions,
  };
}

/**
 * 재질문 프롬프트 생성
 */
export function buildClarificationPrompt(
  originalRequest: string,
  validationResult: ValidationResult,
  previousResponse?: string
): string {
  let prompt = `이전 요청: "${originalRequest}"\n\n`;
  
  if (previousResponse) {
    prompt += `이전 응답:\n${previousResponse}\n\n`;
  }
  
  prompt += `다음 사항들을 명확히 해주세요:\n`;
  validationResult.clarificationQuestions.forEach((q, idx) => {
    prompt += `${idx + 1}. ${q}\n`;
  });
  
  if (validationResult.issues.length > 0) {
    prompt += `\n또한 다음 문제들을 해결해주세요:\n`;
    validationResult.issues.forEach((issue, idx) => {
      prompt += `${idx + 1}. ${issue}\n`;
    });
  }
  
  prompt += `\n위 사항들을 명확히 한 후, Phase 1 (Planning) 형식으로 다시 응답해주세요.`;
  
  return prompt;
}

export function enhanceUserPrompt(
  userPrompt: string,
  contextFiles?: Array<{ path: string; name: string; reason?: string }>,
  projectType?: string,
  conversationContext?: Array<{ role: string; content: string }>
): string {
  // 1. 사용자 요청 정규화 (우선 적용)
  const normalizedPrompt = normalizeUserRequest(userPrompt);
  let enhanced = normalizedPrompt;

  // 이전 대화 컨텍스트 추가 (Phase 1 질문에 대한 답변인 경우)
  if (conversationContext && conversationContext.length > 0) {
    const recentMessages = conversationContext.slice(-4); // 최근 2턴 (질문-답변)
    const hasPlanningPhase = recentMessages.some(msg => 
      msg.content.includes('"phase": "planning"') || msg.content.includes('"phase":"planning"')
    );
    
    if (hasPlanningPhase) {
      enhanced = `**이전 대화 맥락:**\n`;
      recentMessages.forEach((msg) => {
        if (msg.role === "assistant") {
          // Phase 1 계획에서 질문 추출
          try {
            const planningMatch = msg.content.match(/```json\s*([\s\S]*?)```/);
            if (planningMatch) {
              const planningData = JSON.parse(planningMatch[1]);
              if (planningData.phase === "planning" && planningData.questions && planningData.questions.length > 0) {
                enhanced += `\n**이전 질문:**\n${planningData.questions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n")}\n`;
              }
            }
          } catch {
            // JSON 파싱 실패 시 무시
          }
        }
      });
      enhanced += `\n**사용자 답변:**\n${normalizedPrompt}\n\n위 답변을 바탕으로 계획을 수정하거나 Phase 2 (Execution)로 진행하세요.`;
    }
  }

  // 컨텍스트 파일이 있으면 분석 지시 추가
  if (contextFiles && contextFiles.length > 0) {
    const hasPackageJson = contextFiles.some(f => f.name === "package.json" || f.path.includes("package.json"));
    
    enhanced += `\n\n**컨텍스트 파일 (${contextFiles.length}개):**\n`;
    contextFiles.forEach((file) => {
      enhanced += `- ${file.name} (${file.path})`;
      if ('reason' in file && file.reason) {
        enhanced += ` - ${file.reason}`;
      }
      enhanced += `\n`;
    });
    
    // package.json이 있으면 분석 지시
    if (hasPackageJson) {
      enhanced += `\n\n**IMPORTANT: Context File Analysis Required**\n`;
      enhanced += `The user has provided package.json as context. You MUST:\n`;
      enhanced += `1. Analyze the package.json content (provided below) to understand the project structure\n`;
      enhanced += `2. Based on the request and package.json, determine the exact packages needed\n`;
      enhanced += `3. If the request is clear from package.json context, set "isClear" to true and provide a plan\n`;
      enhanced += `4. Only ask questions if the package.json doesn't provide enough information\n`;
      enhanced += `5. For "mui" requests, check if it's a React/Next.js project and recommend @mui/material accordingly\n`;
    }
  }

  // 4. 프로젝트 타입 정보 추가
  if (projectType) {
    enhanced += `\n\n**프로젝트 타입:** ${projectType}`;
  }

  return enhanced;
}

/**
 * LLM 응답에서 구조화된 데이터 파싱
 */
/**
 * JSON 문자열에서 완전한 JSON 객체를 추출하는 헬퍼 함수
 */
/**
 * 완전한 JSON 객체를 추출하는 함수 (더 robust한 버전)
 */
export function extractCompleteJSON(jsonStr: string): string | null {
  const originalStr = jsonStr;
  
  // 1. 먼저 JSON 코드 블록에서 추출 시도
  // non-greedy 문제를 해결하기 위해 마지막 ```json 블록 찾기
  const jsonBlockStart = jsonStr.lastIndexOf('```json');
  if (jsonBlockStart !== -1) {
    const afterStart = jsonStr.substring(jsonBlockStart + 7); // ```json 길이
    const blockEnd = afterStart.indexOf('```');
    if (blockEnd !== -1) {
      jsonStr = afterStart.substring(0, blockEnd).trim();
    } else {
      // ```로 끝나지 않는 경우 - JSON 블록이 잘렸을 수 있음
      // 전체 응답에서 직접 JSON 추출 시도
      jsonStr = afterStart.trim();
    }
  } else {
    // ```json이 없는 경우 일반 코드 블록 찾기
    const codeBlockStart = jsonStr.lastIndexOf('```');
    if (codeBlockStart !== -1) {
      const afterStart = jsonStr.substring(codeBlockStart + 3);
      const blockEnd = afterStart.indexOf('```');
      if (blockEnd !== -1) {
        jsonStr = afterStart.substring(0, blockEnd).trim();
      } else {
        jsonStr = afterStart.trim();
      }
    }
  }
  
  // 2. 주석 제거 (// 또는 /* */) - 문자열 내부의 주석은 보존
  // 먼저 JSON 구조를 파악한 후 주석 제거
  let cleanedStr = jsonStr;
  
  // 3. 첫 번째 { 찾기
  let startIndex = cleanedStr.indexOf('{');
  if (startIndex === -1) {
    // 배열인 경우
    startIndex = cleanedStr.indexOf('[');
    if (startIndex === -1) {
      // JSON 블록이 없으면 원본 문자열에서 직접 찾기
      startIndex = originalStr.indexOf('{');
      if (startIndex === -1) {
        startIndex = originalStr.indexOf('[');
        if (startIndex === -1) {
          return null;
        }
        cleanedStr = originalStr;
      } else {
        cleanedStr = originalStr;
      }
    }
  }
  
  // 4. 중괄호/대괄호 매칭으로 완전한 JSON 추출 (더 robust한 버전)
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;
  let stringChar = '';
  let lastValidEnd = -1;
  
  for (let i = startIndex; i < cleanedStr.length; i++) {
    const char = cleanedStr[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    // 문자열 처리 (단일 따옴표와 이중 따옴표 모두 지원)
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
    
    // 중괄호 카운트
    if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0 && bracketCount === 0) {
        lastValidEnd = i + 1;
        // 완전한 JSON을 찾았지만, 더 긴 JSON이 있을 수 있으므로 계속 확인
        // 하지만 일단 이것을 반환 (가장 긴 완전한 JSON)
        break;
      }
    }
    
    // 대괄호 카운트 (배열)
    if (char === '[') {
      bracketCount++;
    } else if (char === ']') {
      bracketCount--;
      if (bracketCount === 0 && braceCount === 0) {
        lastValidEnd = i + 1;
        break;
      }
    }
  }
  
  // 완전한 JSON을 찾은 경우
  if (lastValidEnd > startIndex) {
    const extracted = cleanedStr.substring(startIndex, lastValidEnd);
    // 주석 제거 (문자열 외부의 주석만)
    const cleaned = extracted
      .replace(/\/\/[^\n"']*$/gm, '') // 줄 끝 주석 (문자열 내부 제외)
      .replace(/\/\*[\s\S]*?\*\//g, ''); // 블록 주석
    return cleaned.trim();
  }
  
  // 완전한 JSON을 찾지 못한 경우, 마지막 시도: 끝까지 사용
  const candidate = cleanedStr.substring(startIndex).trim();
  if (candidate.length > 0 && (candidate.endsWith('}') || candidate.endsWith(']'))) {
    return candidate
      .replace(/\/\/[^\n"']*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  }
  
  return null;
}

/**
 * JSON 문자열 정리 및 수정 (일반적인 오류 수정)
 */
export function cleanJSONString(jsonStr: string): string {
  // 1. 주석 제거
  jsonStr = jsonStr.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  
  // 2. 후행 쉼표 제거
  jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
  
  // 3. JavaScript 식별자를 따옴표로 감싸기 (예: { phase: "planning" } -> { "phase": "planning" })
  // 단, 이미 따옴표로 감싸진 속성명은 제외
  jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
  
  // 4. 단일 따옴표를 이중 따옴표로 변환 (문자열 값만, 속성명은 이미 처리됨)
  // 문자열 내부의 단일 따옴표는 이스케이프 처리
  let result = '';
  let inDoubleQuotes = false;
  let inSingleQuotes = false;
  let escapeNext = false;
  
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    
    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      result += char;
      escapeNext = true;
      continue;
    }
    
    if (char === '"') {
      inDoubleQuotes = !inDoubleQuotes;
      result += char;
    } else if (char === "'" && !inDoubleQuotes) {
      // 단일 따옴표를 이중 따옴표로 변환 (문자열 시작/끝)
      if (!inSingleQuotes) {
        inSingleQuotes = true;
        result += '"';
      } else {
        inSingleQuotes = false;
        result += '"';
      }
    } else if (inSingleQuotes && char === "'") {
      // 문자열 내부의 단일 따옴표는 이스케이프
      result += "\\'";
    } else {
      result += char;
    }
  }
  
  return result;
}

export function parseStructuredResponse(response: string): StructuredResponse | null {
  if (!response || typeof response !== 'string') {
    console.log("⚠️ parseStructuredResponse: response is empty or not a string");
    return null;
  }

  try {
    // 1. JSON 코드 블록 찾기 (```json ... ```)
    const jsonBlockRegex = /```json\s*([\s\S]*?)```/;
    const jsonMatch = response.match(jsonBlockRegex);
    
    if (!jsonMatch) {
      console.log("⚠️ parseStructuredResponse: No ```json block found in response");
      console.log("Response preview:", response.substring(0, 300));
    }
    
    if (jsonMatch) {
      const jsonStr = jsonMatch[1].trim();
      
      // 먼저 정리된 JSON으로 파싱 시도
      try {
        const cleaned = cleanJSONString(jsonStr);
        const parsed = JSON.parse(cleaned);
        if (parsed.phase || parsed.plan || parsed.tasks) {
          return parsed as StructuredResponse;
        }
              } catch {
                // 정리된 JSON으로 파싱 실패 시 원본으로 시도
                try {
                  const parsed = JSON.parse(jsonStr);
                  if (parsed.phase || parsed.plan || parsed.tasks) {
                    return parsed as StructuredResponse;
                  }
                } catch {
                  // 완전한 JSON 추출 시도
                  const completeJSON = extractCompleteJSON(jsonStr);
                  if (completeJSON) {
                    try {
                      const cleaned = cleanJSONString(completeJSON);
                      const parsed = JSON.parse(cleaned);
                      if (parsed.phase || parsed.plan || parsed.tasks) {
                        return parsed as StructuredResponse;
                      }
                    } catch {
                      // 정리 없이 시도
                      try {
                        const parsed = JSON.parse(completeJSON);
                        if (parsed.phase || parsed.plan || parsed.tasks) {
                          return parsed as StructuredResponse;
                        }
                      } catch (e4) {
                        console.error("Failed to parse JSON block after all attempts:", e4);
                      }
                    }
                  }
                }
              }
    }

    // 2. 여러 JSON 블록이 있는 경우 모두 시도
    const allJsonBlocks = response.match(/```json\s*([\s\S]*?)```/g);
    if (allJsonBlocks && allJsonBlocks.length > 0) {
      for (const block of allJsonBlocks) {
        const content = block.replace(/```json\s*/, "").replace(/```$/, "").trim();
        
        // 각 블록을 정리하고 파싱 시도
        try {
          const cleaned = cleanJSONString(content);
          const parsed = JSON.parse(cleaned);
          if (parsed.phase || parsed.plan || parsed.tasks) {
            return parsed as StructuredResponse;
          }
        } catch {
          // 원본으로 시도
          try {
            const parsed = JSON.parse(content);
            if (parsed.phase || parsed.plan || parsed.tasks) {
              return parsed as StructuredResponse;
            }
          } catch {
            // 완전한 JSON 추출 시도
            const completeJSON = extractCompleteJSON(content);
            if (completeJSON) {
              try {
                const cleaned = cleanJSONString(completeJSON);
                const parsed = JSON.parse(cleaned);
                if (parsed.phase || parsed.plan || parsed.tasks) {
                  return parsed as StructuredResponse;
                }
              } catch {
                // 다음 블록 시도
                continue;
              }
            }
          }
        }
      }
    }

    // 3. JSON이 코드 블록 없이 있는 경우 (더 안전한 방법으로 추출)
    const firstBrace = response.indexOf('{');
    if (firstBrace !== -1) {
      const jsonCandidate = response.substring(firstBrace);
      const completeJSON = extractCompleteJSON(jsonCandidate);
      if (completeJSON) {
        try {
          const cleaned = cleanJSONString(completeJSON);
          const parsed = JSON.parse(cleaned);
          if (parsed.phase || parsed.plan || parsed.tasks) {
            return parsed as StructuredResponse;
          }
        } catch {
          // 정리 없이 시도
          try {
            const parsed = JSON.parse(completeJSON);
            if (parsed.phase || parsed.plan || parsed.tasks) {
              return parsed as StructuredResponse;
            }
          } catch (e2) {
            console.error("Failed to parse inline JSON:", e2, "\nJSON candidate:", completeJSON.substring(0, 200));
          }
        }
      }
    }
  } catch (error) {
    console.error("Failed to parse structured response:", error);
    console.error("Response preview:", response.substring(0, 500));
    
    // 파싱 실패 시 상세 정보 로깅
    if (error instanceof Error) {
      console.error("Parse error details:", {
        message: error.message,
        stack: error.stack,
        responseLength: response.length,
        hasJsonBlock: response.includes("```json"),
        hasJson: response.includes("{") && response.includes("}"),
      });
    }
  }
    return null;
}


// ##################################################################################
// ## 신규 프롬프트 전략 (2025-11-18)
// ##################################################################################

export interface PromptDataContext {
  filePath?: string;
  code?: string;
  selectedCode?: string;
}

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface PromptData {
  system_prompt: string;
  chat_history?: PromptMessage[];
  current_context?: PromptDataContext;
  user_instruction: string;
  available_tools?: ToolDefinition[];
}

/**
 * 새로운 프롬프트 전략에 따라 최종 프롬프트 문자열을 생성합니다.
 * 이 함수는 `buildSystemPrompt`의 상세한 규칙과 결합되어 사용될 수 있습니다.
 * @param data PromptData 객체
 * @returns LLM에 전달될 최종 프롬프트 문자열
 */
export function buildPromptFromStrategy(data: PromptData): string {
  let prompt = ``;

  // 시스템 프롬프트는 항상 최상단에 위치합니다.
  // 기존 buildSystemPrompt()의 내용과 결합하거나, data.system_prompt를 사용합니다.
  prompt += `${data.system_prompt}\n\n`;

  // 컨텍스트 정보 추가
  if (data.current_context) {
    prompt += `---
# CONTEXT
`;
    if (data.current_context.filePath) {
      prompt += `
## Current File
- **Path**: ${data.current_context.filePath}
- **Content**:
\`\`\`
${data.current_context.code || '(No code provided)'}
\`\`\`
`;
    }
    if (data.current_context.selectedCode) {
      prompt += `
## Selected Code
\`\`\`
${data.current_context.selectedCode}
\`\`\`
`;
    }
  }

  // 대화 히스토리 추가
  if (data.chat_history && data.chat_history.length > 0) {
    prompt += `---
# CHAT HISTORY
${data.chat_history
  .map((msg) => `**${msg.role === 'user' ? 'User' : 'Assistant'}**: ${msg.content}`)
  .join('\n')}
`;
  }

  // 사용자 요청 추가
  prompt += `---
# USER REQUEST
${data.user_instruction}
`;

  // 사용 가능한 도구 정보 추가
  if (data.available_tools && data.available_tools.length > 0) {
    prompt += `---
# AVAILABLE TOOLS
You can use the following tools. Respond with a JSON object in a \`tool_code\` block if you need to use a tool.
\`\`\`json
${JSON.stringify(data.available_tools, null, 2)}
\`\`\`
`;
  }
  
prompt += `---
Reminder: You MUST ALWAYS respond in the structured JSON format as specified in the system prompt. Start your response with \`\`\`json.
`;

  return prompt;
}


