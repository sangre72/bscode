/**
 * LLM 응답에서 코드 블록과 파일 경로를 추출하는 유틸리티
 */

export interface ParsedCodeBlock {
  filePath: string;
  language: string;
  content: string;
  startLine?: number;
  endLine?: number;
}

/**
 * LLM 응답에서 코드 블록을 추출합니다.
 * 형식: ```typescript:path/to/file.ts 또는 ```path/to/file.ts
 */
export function parseCodeBlocks(response: string, contextFiles?: string[]): ParsedCodeBlock[] {
  const codeBlocks: ParsedCodeBlock[] = [];
  
  // 코드 블록 정규식: ```language:path 또는 ```path 또는 ```language
  // 더 유연한 패턴: ``` 뒤에 언어, 콜론, 경로가 올 수 있음
  const codeBlockRegex = /```(\w+)?\s*:?\s*([^\n]+)?\n([\s\S]*?)```/g;
  
  let match;
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const language = match[1] || "text";
    const pathOrLine = match[2]?.trim() || "";
    let content = match[3]?.trim() || "";
    
    // 빈 코드 블록은 건너뛰기
    if (!content || content.length < 10) continue;
    
    // 경로 추출 (경로가 있는 경우)
    let filePath = "";
    let startLine: number | undefined;
    let endLine: number | undefined;
    
    if (pathOrLine) {
      // 경로:라인 또는 경로:시작라인-끝라인 형식
      const pathMatch = pathOrLine.match(/^(.+?)(?::(\d+)(?:-(\d+))?)?$/);
      if (pathMatch) {
        filePath = pathMatch[1];
        if (pathMatch[2]) {
          startLine = parseInt(pathMatch[2], 10);
          endLine = pathMatch[3] ? parseInt(pathMatch[3], 10) : startLine;
        }
      } else {
        // 경로만 있는 경우
        filePath = pathOrLine;
      }
    } else {
      // 경로가 없으면 내용 첫 줄에서 경로 찾기
      const firstLine = content.split('\n')[0];
      const pathInContent = firstLine.match(/^([./]?[\w\-./]+\.(ts|tsx|js|jsx|css|json|md|py|java|go|rs|cpp|c|h|html|xml|yaml|yml))\s*$/);
      if (pathInContent) {
        filePath = pathInContent[1];
        content = content.split('\n').slice(1).join('\n').trim();
      } else if (contextFiles && contextFiles.length > 0) {
        // 컨텍스트 파일이 있으면 첫 번째 파일 사용
        filePath = contextFiles[0];
      }
    }
    
    // 파일 경로가 없어도 코드가 있으면 추론 시도
    if (!filePath && content) {
      // React 컴포넌트인 경우
      if (content.includes('import') && (content.includes('React') || content.includes('from \'react\'') || content.includes('from "react"') || content.includes('useState') || content.includes('useEffect'))) {
        // package.json이나 tsconfig.json을 참고하여 파일 경로 추론
        if (contextFiles && contextFiles.length > 0) {
          filePath = contextFiles.find(f => f.endsWith('.tsx') || f.endsWith('.jsx')) || contextFiles[0];
        } else {
          // 컴포넌트 이름 추출 시도
          const componentMatch = content.match(/(?:export\s+(?:default\s+)?(?:function|const)\s+)?([A-Z][a-zA-Z0-9]+)/);
          if (componentMatch) {
            filePath = `components/${componentMatch[1]}.tsx`;
          } else {
            filePath = 'components/NewComponent.tsx'; // 기본값
          }
        }
      } else if (content.includes('package.json') || content.includes('"dependencies"') || content.includes('"devDependencies"')) {
        filePath = 'package.json';
      } else if (content.includes('tsconfig') || content.includes('"compilerOptions"')) {
        filePath = 'tsconfig.json';
      } else if (content.includes('export') || content.includes('import')) {
        // 일반적인 TypeScript/JavaScript 파일
        if (contextFiles && contextFiles.length > 0) {
          filePath = contextFiles.find(f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.tsx') || f.endsWith('.jsx')) || contextFiles[0];
        } else {
          filePath = 'src/index.ts';
        }
      }
    }
    
    // 파일 경로가 있으면 추가 (경로가 없어도 내용이 있으면 기본 경로 사용)
    if (content) {
      if (!filePath) {
        // 마지막 수단: 기본 경로
        const ext = language === "typescript" || language === "tsx" ? ".tsx" : 
                   language === "javascript" || language === "jsx" ? ".jsx" :
                   language === "css" ? ".css" :
                   language === "json" ? ".json" : ".ts";
        filePath = `components/NewFile${codeBlocks.length + 1}${ext}`;
      }
      
      codeBlocks.push({
        filePath,
        language,
        content,
        startLine,
        endLine,
      });
    }
  }
  
  return codeBlocks;
}

/**
 * 응답에서 파일 경로를 추출합니다 (코드 블록 외부에서도)
 */
export function extractFilePaths(response: string): string[] {
  const paths: string[] = [];
  
  // 일반적인 파일 경로 패턴
  const pathPatterns = [
    /(?:^|\s)([./]?[\w\-./]+\.(ts|tsx|js|jsx|css|json|md|py|java|go|rs|cpp|c|h))\b/g,
    /`([./]?[\w\-./]+\.(ts|tsx|js|jsx|css|json|md|py|java|go|rs|cpp|c|h))`/g,
  ];
  
  for (const pattern of pathPatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const path = match[1];
      if (path && !paths.includes(path)) {
        paths.push(path);
      }
    }
  }
  
  return paths;
}

/**
 * 코드 블록에서 파일 경로를 추출합니다.
 */
export function extractFilePathsFromCodeBlocks(response: string): string[] {
  const codeBlocks = parseCodeBlocks(response);
  return codeBlocks
    .map((block) => block.filePath)
    .filter((path) => path.length > 0);
}

