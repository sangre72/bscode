/**
 * LLM 응답에서 실행 가능한 작업을 추출하는 유틸리티
 */

export interface Task {
  type: "install" | "create" | "modify" | "command";
  description: string;
  target?: string; // 파일 경로 또는 패키지명
  content?: string; // 파일 내용
  command?: string; // 실행할 명령어
}

/**
 * LLM 응답에서 작업을 추출합니다.
 */
export function parseTasks(response: string): Task[] {
  const tasks: Task[] = [];

  // 1. 패키지 설치 작업 추출
  const installPatterns = [
    /npm install (.+?)(?:\n|$)/g,
    /yarn add (.+?)(?:\n|$)/g,
    /npm install -D (.+?)(?:\n|$)/g,
    /yarn add -D (.+?)(?:\n|$)/g,
  ];

  for (const pattern of installPatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const packages = match[1].trim().split(/\s+/);
      for (const pkg of packages) {
        if (pkg && !pkg.startsWith('-')) {
          tasks.push({
            type: "install",
            description: `패키지 설치: ${pkg}`,
            target: pkg,
            command: response.includes('yarn') ? `yarn add ${pkg}` : `npm install ${pkg}`,
          });
        }
      }
    }
  }

  // 2. 파일 생성/수정 작업 추출 (코드 블록에서)
  const codeBlockRegex = /```(\w+)?:?([^\n]+)?\n([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const language = match[1] || "text";
    const pathOrLine = match[2]?.trim() || "";
    const content = match[3]?.trim() || "";

    if (content) {
      let filePath = pathOrLine;
      
      // 경로가 없으면 추론
      if (!filePath) {
        if (content.includes('package.json') || content.includes('"dependencies"')) {
          filePath = 'package.json';
        } else if (content.includes('import') && content.includes('React')) {
          filePath = 'components/TiptapEditor.tsx';
        }
      }

      if (filePath) {
        // 기존 파일인지 새 파일인지 확인 (응답 내용으로 추론)
        const isNewFile = response.toLowerCase().includes('생성') || 
                         response.toLowerCase().includes('추가') ||
                         response.toLowerCase().includes('create') ||
                         response.toLowerCase().includes('add');
        
        tasks.push({
          type: isNewFile ? "create" : "modify",
          description: `${isNewFile ? '파일 생성' : '파일 수정'}: ${filePath}`,
          target: filePath,
          content: content,
        });
      }
    }
  }

  // 3. 명령어 실행 작업 추출
  const commandPatterns = [
    /실행.*?:\s*(.+?)(?:\n|$)/g,
    /명령어.*?:\s*(.+?)(?:\n|$)/g,
    /터미널.*?:\s*(.+?)(?:\n|$)/g,
  ];

  for (const pattern of commandPatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const command = match[1].trim();
      if (command && !command.includes('npm install') && !command.includes('yarn add')) {
        tasks.push({
          type: "command",
          description: `명령어 실행: ${command}`,
          command: command,
        });
      }
    }
  }

  return tasks;
}

