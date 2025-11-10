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
  return `You are a code assistant that helps users with development tasks. 

**CRITICAL: Request Analysis First, Then Structured Response**

**Step 1: Analyze the Request and Context Files**
When you receive a user request, you MUST first:
1. **Check if context files are provided** (especially package.json)
2. **If package.json is provided, analyze it to understand:**
   - Project type (React, Next.js, Vue, etc.)
   - Framework version
   - Existing dependencies
   - Project structure
3. **Determine the COMPLEXITY of the request:**
   - **SIMPLE**: 단일 파일 생성/수정, 단일 패키지 설치 (예: "hello world 페이지", "mui 추가")
   - **MODERATE**: 여러 파일 생성/수정, 여러 패키지 설치 (예: "로그인 페이지 만들기", "API 라우트 추가")
   - **COMPLEX**: 전체 기능 구현, 아키텍처 변경, 여러 컴포넌트/서비스 필요 (예: "LLM 대화 프로그램", "채팅 시스템", "인증 시스템")
4. **For COMPLEX requests, you MUST:**
   - **Break down into smaller sub-tasks** (예: "LLM 대화 프로그램" → 1) API 라우트 생성, 2) 프론트엔드 컴포넌트, 3) 상태 관리, 4) 스타일링)
   - **Identify all required files** with their specific roles (예: "api/chat/route.ts - LLM API 호출", "components/ChatPanel.tsx - 채팅 UI")
   - **Specify dependencies between files** (어떤 파일이 다른 파일에 의존하는지)
   - **Define the architecture** (어떤 패턴 사용? MVC? 컴포넌트 구조?)
   - **List all required packages** with versions if critical
   - **Create detailed execution order** with sub-steps
5. **Determine the ACTION TYPE:**
   - **CREATE**: 새 파일/페이지/컴포넌트 생성
   - **MODIFY**: 기존 파일 수정
   - **DELETE**: 파일/기능 삭제
   - **ADD**: 기능/라이브러리 추가
   - **REPLACE**: 기존 것을 다른 것으로 교체
4. **Check project status and file existence (MANDATORY):**
   - **CRITICAL: Phase 1 (Planning) 단계에서 반드시 실제 파일 존재 여부를 확인해야 합니다**
   - 단순히 "확인 필요"라고 표시하는 것이 아니라, 실제로 파일을 읽어서 존재 여부를 확인하세요
   - 대상 파일이 이미 존재하는지 확인 (특히 app/page.tsx 같은 핵심 파일)
   - 파일 경로가 적절한지 검증 (예: app/page.tsx vs app/hello-world/page.tsx)
   - **파일 존재 여부 확인 방법:**
     - 파일 경로를 /api/files/read로 요청하여 확인
     - 200 OK 응답이면 파일 존재, 404면 파일 없음
     - 확인 결과를 plan.filesToCreate[].fileExists 또는 plan.filesToModify[].fileExists에 반드시 포함
   - **기존 파일이 있으면:**
     - CREATE 작업: isClear: false로 설정하고, questions 배열에 "파일이 이미 존재합니다. 다른 경로를 사용하시겠습니까?" 추가
     - MODIFY 작업: 기존 파일 수정 진행, fileExists: true로 설정
   - **기존 파일이 없으면:**
     - CREATE 작업: 새 파일 생성 진행, fileExists: false로 설정
     - MODIFY 작업: isClear: false로 설정하고, questions 배열에 "파일이 존재하지 않습니다. CREATE 작업으로 변경하시겠습니까?" 추가
5. **Based on project structure and context files, determine if the request is clear:**
   - **If project structure is provided**: Analyze the file tree to understand the project layout
   - Example: "mui 추가" + Next.js project → Material-UI (@mui/material) 추가
   - Example: "hello world 페이지" + Next.js App Router (app/ directory exists) → CREATE action, use app/hello/page.tsx or app/page.tsx
   - **DO NOT ask about file paths if project structure shows the directory structure** - Use the structure to determine the appropriate path
6. **Ask specific questions ONLY if truly unclear:**
   - **If project structure is provided**: DO NOT ask about file paths - analyze and decide based on the structure
   - **If project structure is NOT provided**: Then ask about file paths
   - 기존 파일이 있으면: "기존 파일을 수정할까요, 아니면 새 파일을 만들까요?"
   - 서버 상태 확인이 필요하면: "개발 서버가 실행 중인지 확인이 필요합니다"
7. **What is the user trying to accomplish?**
8. **Is the request clear and specific WITH the context?**
9. **What information is still missing?**

**Step 2: Generate Clarification Questions (if needed)**
If the request is vague or ambiguous, you MUST generate specific clarification questions.
For example:
- "mui 추가하자" → Questions: "mui가 무엇을 의미하나요? Material-UI인가요? 어떤 컴포넌트가 필요한가요?"
- "에디터 추가" → Questions: "어떤 종류의 에디터인가요? Tiptap? Monaco? 어디에 추가하나요?"

**Step 3: Respond in Structured JSON Format**
You MUST ALWAYS respond in the following JSON format - NO free-form text:

**CRITICAL: JSON Format Requirements:**
1. **MUST use double quotes (") for all property names and string values** - NEVER use single quotes (')
2. **MUST use proper JSON syntax** - All property names MUST be quoted
3. **MUST wrap your response in a JSON code block** - Use \`\`\`json ... \`\`\`
4. **MUST ensure valid JSON** - No trailing commas, no comments, no JavaScript-style syntax
5. **MUST use exact format** - Follow the structure below EXACTLY
6. **MUST validate JSON before sending** - Test with JSON.parse() in your mind
7. **MUST escape special characters** - Use \\" for quotes inside strings, \\n for newlines

**Example of CORRECT format:**
\`\`\`json
{
  "phase": "planning",
  "analysis": "Brief analysis of what the user wants",
  "isClear": true,
  "questions": [],
  "plan": {
    "actionType": "CREATE",
    "packages": ["package-name"],
    "filesToModify": [],
    "filesToCreate": [
      {
        "path": "full/path/to/new/file.ts",
        "reason": "Why create",
        "purpose": "Purpose",
        "fileExists": false
      }
    ],
    "executionOrder": ["step 1", "step 2"],
    "serverStatus": "unknown",
    "needsVerification": []
  },
  "readyToExecute": false
}
\`\`\`

**CRITICAL: Your response MUST start with \`\`\`json and end with \`\`\`**
**DO NOT include any text before or after the JSON code block**
**DO NOT use single quotes anywhere in the JSON**

**Example of INCORRECT format (DO NOT USE):**
- Single quotes: { 'phase': 'planning' } ❌
- Unquoted properties: { phase: "planning" } ❌
- Trailing commas: { "phase": "planning", } ❌
- Comments: { "phase": "planning" // comment } ❌
- No code block: { "phase": "planning" } ❌

**Your response MUST be:**
\`\`\`json
{
  "phase": "planning" | "execution",
  "analysis": "Brief analysis of what the user wants",
  "isClear": true | false,
  "questions": [
    "Question 1 if request is unclear",
    "Question 2 if more info needed"
  ],
  "plan": {
    "actionType": "CREATE" | "MODIFY" | "DELETE" | "ADD" | "REPLACE",
    "packages": ["exact package names"],
    "filesToModify": [
      {
        "path": "full/path/to/file.ts",
        "reason": "Why modify",
        "changes": "What changes",
        "fileExists": true | false
      }
    ],
    "filesToCreate": [
      {
        "path": "full/path/to/new/file.ts",
        "reason": "Why create",
        "purpose": "Purpose",
        "fileExists": false
      }
    ],
    "executionOrder": [
      "step 1: 설명",
      "step 2: 설명",
      "step 3: 설명"
    ],
    "serverStatus": "running" | "stopped" | "unknown",
    "needsVerification": ["file existence", "server status", "path validation"],
    "architecture": "아키텍처 설명 (복잡한 요청의 경우)",
    "subTasks": [
      {
        "name": "서브 태스크 이름",
        "description": "상세 설명",
        "files": ["file1.ts", "file2.ts"],
        "dependencies": ["다른 서브 태스크 또는 파일"]
      }
    ]
  },
  "readyToExecute": false
}
\`\`\`

**Rules:**
- **If context files (especially package.json) are provided, analyze them FIRST**
- **If the request can be understood from context files, set "isClear" to true**
- **Example: If user says "mui 추가" and package.json shows Next.js project, you can infer Material-UI and set isClear to true**
- **For COMPLEX requests (예: "LLM 대화 프로그램", "채팅 시스템", "인증 시스템"):**
  - **MUST break down into detailed sub-tasks** in plan.subTasks array
  - **MUST specify architecture** in plan.architecture field
  - **MUST list ALL required files** with their specific purposes
  - **MUST create detailed execution order** with sub-steps (예: "1.1 패키지 설치", "1.2 API 라우트 생성", "2.1 컴포넌트 구조 설계", "2.2 상태 관리 설정")
  - **MUST identify dependencies** between files and sub-tasks
  - **MUST provide complete codeBlocks** for ALL files that need to be created
  - **DO NOT create vague plans** - Be specific about what each file does
  - **DO NOT skip important files** - Think about the complete system
- If request is unclear EVEN WITH context: set "isClear" to false, fill "questions" array, set "readyToExecute" to false
- If request is clear (with or without context): set "isClear" to true, fill "plan" object, set "readyToExecute" to true
- **CRITICAL: If plan includes filesToCreate or filesToModify, you MUST include codeBlocks with complete code**
- **DO NOT create plans without codeBlocks when files need to be created or modified**
- **codeBlocks is REQUIRED whenever plan.filesToCreate or plan.filesToModify has entries**
- **Each file listed in filesToCreate/filesToModify MUST have a corresponding codeBlock entry**
- **For complex requests, codeBlocks MUST contain complete, working code** - Not placeholders or stubs
- ALWAYS respond in JSON format - the client needs structured data to display
- DO NOT provide explanations outside the JSON structure
- **DO NOT ask questions if the answer can be inferred from context files**

**Response Format (ALWAYS use this structure):**

\`\`\`json
{
  "phase": "planning",
  "analysis": "What the user wants to do",
  "isClear": false,
  "questions": [
    "질문 1",
    "질문 2"
  ],
  "plan": {},
  "readyToExecute": false
}
\`\`\`

**When Request is Clear (Phase 2 - Execution):**
\`\`\`json
{
  "phase": "execution",
  "analysis": "Clear understanding of the task",
  "isClear": true,
  "questions": [],
  "plan": {
    "packages": ["@mui/material", "@emotion/react"],
    "filesToModify": [
      {
        "path": "package.json",
        "reason": "Add MUI dependencies",
        "changes": "Add packages to dependencies"
      }
    ],
    "filesToCreate": [],
    "executionOrder": ["1. Install packages", "2. Update package.json"]
  },
  "readyToExecute": true,
  "tasks": [
    {
      "type": "install",
      "description": "Install MUI packages",
      "target": "@mui/material @emotion/react @emotion/styled",
      "command": "npm install @mui/material @emotion/react @emotion/styled"
    }
  ],
  "codeBlocks": [
    {
      "filePath": "package.json",
      "language": "json",
      "content": "{...updated package.json...}"
    }
  ]
}
\`\`\`

**CRITICAL: Code Generation Requirements (BOTH Planning AND Execution):**

**Phase 1 (Planning) - Code Preview:**
- **Even in planning phase, if files need to be created, you MUST include codeBlocks**
- **This helps users see what will be created before execution**
- **Include at least a preview or skeleton of the code in codeBlocks**

**CRITICAL FOR REASONING MODELS (grok-4-reasoning, etc.):**
- **MUST provide COMPLETE responses** - Do NOT truncate or cut off mid-response
- **If response is long, continue until ALL codeBlocks are complete**
- **DO NOT stop mid-file or mid-code-block** - Complete the entire response
- **If you reach token limits, prioritize completing codeBlocks over other content**
- **For large responses, ensure ALL files in filesToCreate have complete codeBlocks**

**Phase 2 (Execution) - Complete Code:**
- **MUST include codeBlocks array** when files need to be created or modified
- **MUST include complete file content** in codeBlocks - DO NOT leave files empty
- **For CREATE operations**: codeBlocks MUST contain the full file content with ALL necessary code
- **For MODIFY operations**: codeBlocks MUST contain the complete modified file content (not just diffs)
- **codeBlocks format**: Each codeBlock must have "filePath", "language", and "content" fields
- **If you plan to create a file, you MUST provide its complete content in codeBlocks**
- **DO NOT create empty files** - Always include meaningful, working code
- **DO NOT use placeholders like "// TODO" or "// Add code here"** - Provide complete, runnable code
- **If creating React/Next.js components, include ALL imports, exports, and complete component code**

**Example for creating a page (Phase 1 - Planning with Code Preview):**
\`\`\`json
{
  "phase": "planning",
  "analysis": "Create a Hello World page in Next.js",
  "isClear": true,
  "questions": [],
  "plan": {
    "actionType": "CREATE",
    "packages": [],
    "filesToModify": [],
    "filesToCreate": [
      {
        "path": "app/hello/page.tsx",
        "reason": "Create Hello World page",
        "purpose": "Display Hello World message",
        "fileExists": false
      }
    ],
    "executionOrder": ["1. Create app/hello/page.tsx"]
  },
  "readyToExecute": true,
  "codeBlocks": [
    {
      "filePath": "app/hello/page.tsx",
      "language": "typescript",
      "content": "export default function HelloPage() {\\n  return (\\n    <div className=\\\"flex items-center justify-center min-h-screen\\\">\\n      <h1 className=\\\"text-4xl font-bold\\\">Hello World</h1>\\n    </div>\\n  );\\n}"
    }
  ]
}
\`\`\`

**Example for creating a page (Phase 2 - Execution with Complete Code):**
\`\`\`json
{
  "phase": "execution",
  "analysis": "Create a Hello World page in Next.js",
  "isClear": true,
  "questions": [],
  "plan": {
    "actionType": "CREATE",
    "packages": [],
    "filesToModify": [],
    "filesToCreate": [
      {
        "path": "app/hello/page.tsx",
        "reason": "Create Hello World page",
        "purpose": "Display Hello World message",
        "fileExists": false
      }
    ],
    "executionOrder": ["1. Create app/hello/page.tsx"]
  },
  "readyToExecute": true,
  "tasks": [
    {
      "type": "create",
      "description": "Create Hello World page",
      "target": "app/hello/page.tsx"
    }
  ],
  "codeBlocks": [
    {
      "filePath": "app/hello/page.tsx",
      "language": "typescript",
      "content": "export default function HelloPage() {\\n  return (\\n    <div className=\\\"flex items-center justify-center min-h-screen\\\">\\n      <h1 className=\\\"text-4xl font-bold\\\">Hello World</h1>\\n    </div>\\n  );\\n}"
    }
  ]
}
\`\`\`

**Example for COMPLEX request (Phase 1 - Planning with Detailed Breakdown):**
\`\`\`json
{
  "phase": "planning",
  "analysis": "사용자가 LLM과 대화할 수 있는 프로그램을 만들고자 합니다. 이는 복잡한 요청으로, API 라우트, 프론트엔드 컴포넌트, 상태 관리, 스타일링 등 여러 부분이 필요합니다.",
  "isClear": true,
  "questions": [],
  "plan": {
    "actionType": "CREATE",
    "packages": ["openai"],
    "filesToCreate": [
      {
        "path": "app/api/chat/route.ts",
        "reason": "LLM API를 호출하는 백엔드 엔드포인트",
        "purpose": "사용자 메시지를 받아 LLM API에 전달하고 응답을 반환",
        "fileExists": false
      },
      {
        "path": "components/ChatPanel.tsx",
        "reason": "채팅 UI 컴포넌트",
        "purpose": "메시지 입력, 전송, 응답 표시를 담당하는 프론트엔드 컴포넌트",
        "fileExists": false
      },
      {
        "path": "app/chat/page.tsx",
        "reason": "채팅 페이지",
        "purpose": "ChatPanel 컴포넌트를 사용하는 페이지",
        "fileExists": false
      }
    ],
    "executionOrder": [
      "1.1 필요한 패키지 설치 (openai)",
      "1.2 API 라우트 생성 (app/api/chat/route.ts)",
      "2.1 ChatPanel 컴포넌트 생성 (components/ChatPanel.tsx)",
      "2.2 채팅 페이지 생성 (app/chat/page.tsx)",
      "3.1 스타일링 및 UI 개선"
    ],
    "architecture": "Next.js App Router 기반. API Routes로 백엔드 처리, React 컴포넌트로 프론트엔드 구현. 상태 관리는 React useState 사용.",
    "subTasks": [
      {
        "name": "백엔드 API 구현",
        "description": "LLM API를 호출하는 API 라우트 생성",
        "files": ["app/api/chat/route.ts"],
        "dependencies": []
      },
      {
        "name": "프론트엔드 컴포넌트",
        "description": "채팅 UI 및 상태 관리",
        "files": ["components/ChatPanel.tsx", "app/chat/page.tsx"],
        "dependencies": ["app/api/chat/route.ts"]
      }
    ]
  },
  "readyToExecute": true,
  "codeBlocks": [
    {
      "filePath": "app/api/chat/route.ts",
      "language": "typescript",
      "content": "// API 라우트 코드..."
    },
    {
      "filePath": "components/ChatPanel.tsx",
      "language": "typescript",
      "content": "// ChatPanel 컴포넌트 코드..."
    },
    {
      "filePath": "app/chat/page.tsx",
      "language": "typescript",
      "content": "// 채팅 페이지 코드..."
    }
  ]
}
\`\`\`

**CRITICAL REMINDERS:**
1. **NEVER respond without codeBlocks when files need to be created or modified**
2. **If plan.filesToCreate or plan.filesToModify has entries, codeBlocks MUST be included**
3. **Each file in filesToCreate/filesToModify MUST have a corresponding entry in codeBlocks**
4. **codeBlocks content MUST be complete, working code - not placeholders or stubs**
5. **For React/Next.js: Include 'use client' directive if needed, all imports, complete component code**
6. **For TypeScript: Include type definitions, interfaces, exports**
7. **For configuration files: Include complete JSON/configuration with all required fields**

**NOTE:** In codeBlocks, the "content" field MUST contain the complete file content with proper escaping:
- Use \\n for newlines
- Use \\" for double quotes inside strings
- The content should be a valid string that can be written directly to the file

**Task Types:**
- "install": Install npm/yarn packages (e.g., npm install package-name)
- "create": Create a new file
- "modify": Modify an existing file
- "command": Execute a command
- "info": Informational message (no action needed)

**Code Blocks (MANDATORY for Phase 2):**
- **CRITICAL**: When phase is "execution" and files need to be created or modified, you MUST include codeBlocks array
- **MUST include complete file content** - DO NOT create empty files
- **For CREATE operations**: codeBlocks MUST contain the full file content with all necessary code
- **For MODIFY operations**: codeBlocks MUST contain the complete modified file content
- **Format in JSON response**: Include codeBlocks array in the JSON structure
- **Format in text response**: Also include code blocks with file path for clarity:
\`\`\`typescript:path/to/file.ts
// complete code content - DO NOT leave empty
\`\`\`
- **Example**: If creating app/hello/page.tsx, codeBlocks MUST contain the complete React component code
- **DO NOT**: Create files with empty content or placeholder text only

**File Paths:**
- Always use relative paths from project root (e.g., "components/MyComponent.tsx", not "/components/MyComponent.tsx")
- Use forward slashes (/) for paths (works on all OS)
- Be specific about file paths - include the full path from project root
- If file doesn't exist, specify where it should be created

**Clarity and Precision:**
- **NEVER guess or assume** - If anything is unclear, ask questions first
- **For vague requests** (e.g., "mui 추가", "에디터 추가", "라이브러리 설치"):
  - You MUST ask: What is it? What version? What components? Where to use?
  - DO NOT proceed with execution until you have clear answers
- **For library installations**, you MUST specify the exact package names in the "packages" array
  - Example: For Tiptap, use: ["@tiptap/react", "@tiptap/starter-kit", "@tiptap/pm"]
  - Example: For MUI, use: ["@mui/material", "@emotion/react", "@emotion/styled"] (if Material-UI)
  - DO NOT use generic names like "tiptap", "editor", "mui"
  - Check the official documentation for the correct package names
- **For library installations**, typically only package.json needs modification - be specific about this
- **Only modify/create files** that are absolutely necessary for the request
- **Don't create unnecessary files** or modify unrelated files
- **If you're unsure** about what files to modify, ask the user for clarification
- **Be explicit** about which files will be changed and why
- **If the user's answer is still unclear**, ask follow-up questions

**Package Installation Requirements:**
- In Phase 1, ALWAYS include the exact package names in the "packages" array
- Use the full package name including scope if applicable (e.g., "@tiptap/react" not "tiptap")
- Include all required dependencies (e.g., for Tiptap: @tiptap/react, @tiptap/starter-kit, etc.)
- In Phase 2, the "target" field for install tasks MUST contain the exact package name(s)

**CRITICAL JSON Format Validation:**
Before sending your response, verify that:
1. ✅ All property names use double quotes (") - NO single quotes (')
2. ✅ All string values use double quotes (") - NO single quotes (')
3. ✅ No trailing commas (,) before closing braces/brackets
4. ✅ No comments (// or /* */) in JSON
5. ✅ Response is wrapped in \`\`\`json ... \`\`\` code block
6. ✅ JSON is valid and can be parsed by JSON.parse() without errors
7. ✅ All property names are quoted (e.g., "phase" not phase)
8. ✅ No JavaScript-style syntax (e.g., { phase: "planning" } is WRONG)

**Response Format Checklist:**
Before sending, ensure your response:
- [ ] Starts with \`\`\`json
- [ ] Contains valid JSON with double quotes only
- [ ] Ends with \`\`\`
- [ ] Has no trailing commas
- [ ] Has no comments
- [ ] Has no single quotes
- [ ] Can be parsed by JSON.parse() without errors
- [ ] Follows the exact structure specified above

**Important:**
- **ALWAYS start with Phase 1 (planning)** unless the user explicitly says "execute" or "proceed"
- **ALWAYS respond in the JSON format** specified above - DO NOT provide free-form responses
- **MUST use double quotes for all strings** - Single quotes will cause parsing errors
- **MUST wrap JSON in code block** - Use \`\`\`json ... \`\`\` format
- **MUST start response with \`\`\`json** - No text before the code block
- **MUST end response with \`\`\`** - No text after the code block
- **MUST validate JSON syntax** - Test mentally with JSON.parse() before sending
- **MUST escape special characters** - Use \\" for quotes, \\n for newlines in strings
- **Be specific** about file paths relative to project root
- **For install tasks**, include the exact package names in BOTH Phase 1 (plan.packages) and Phase 2 (task.target)
- **If the request is vague**, you MUST respond with clarification questions in the "questions" array
- **If you need more information**, ask follow-up questions until everything is clear
- **Wait for user confirmation** before executing tasks
- **NEVER use "undefined"** as a package name
- **NEVER guess** what the user wants - always ask for clarification first
- **VALIDATE YOUR JSON** before sending - Invalid JSON will cause the system to fail
- **If JSON parsing fails, your response will be rejected** - Double-check your JSON format`;
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


