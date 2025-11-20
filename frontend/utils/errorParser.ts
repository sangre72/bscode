/**
 * 에러 메시지에서 파일 경로를 추출하는 유틸리티
 */

export interface ErrorInfo {
  type: string; // Runtime, Compile, TypeScript 등
  message: string;
  files: string[]; // 추출된 파일 경로들
  framework?: string; // Next.js, React 등
  version?: string;
}

/**
 * 에러 메시지가 포함되어 있는지 확인
 */
export function isErrorMessage(text: string): boolean {
  const errorPatterns = [
    /error/i,
    /exception/i,
    /failed/i,
    /cannot read/i,
    /undefined/i,
    /not defined/i,
    /stack trace/i,
    /at .+\(.+:\d+:\d+\)/,
    /Error Type:/,
    /Error Message:/,
  ];

  return errorPatterns.some((pattern) => pattern.test(text));
}

/**
 * 에러 메시지에서 파일 경로 추출
 */
export function extractFilePaths(errorText: string): string[] {
  const files = new Set<string>();

  // 패턴 1: Stack trace 형식 - at Component (path/to/file.tsx:31:9)
  const stackTracePattern = /at\s+[^\(]*\(([^:)]+\.[a-z]+):\d+:\d+\)/gi;
  let match;
  while ((match = stackTracePattern.exec(errorText)) !== null) {
    files.add(match[1].trim());
  }

  // 패턴 2: 직접 경로 언급 - path/to/file.tsx:31:9
  const directPathPattern = /([a-zA-Z0-9_\-\/\.]+\.[a-z]+):\d+:\d+/gi;
  while ((match = directPathPattern.exec(errorText)) !== null) {
    const path = match[1].trim();
    // 너무 짧은 경로는 제외 (최소 한 개의 슬래시 필요)
    if (path.includes('/') || path.includes('\\')) {
      files.add(path);
    }
  }

  // 패턴 3: 코드 프레임 - > 31 | <code>
  const codeFramePattern = /Code Frame:[\s\S]*?at\s+([^\s]+)/i;
  if ((match = codeFramePattern.exec(errorText)) !== null) {
    const component = match[1].trim();
    // 컴포넌트명으로 가능한 파일 경로 추정
    if (component && !component.includes('(')) {
      // 이미 스택에서 찾은 경로들 중에서 이 컴포넌트와 매칭되는 것 찾기
      for (const file of files) {
        if (file.toLowerCase().includes(component.toLowerCase())) {
          // 이미 추가됨
          break;
        }
      }
    }
  }

  // 패턴 4: webpack 경로 - webpack://Component/path/to/file.tsx
  const webpackPattern = /webpack:\/\/[^\/]+\/(.+\.tsx?)/gi;
  while ((match = webpackPattern.exec(errorText)) !== null) {
    files.add(match[1].trim());
  }

  return Array.from(files);
}

/**
 * 에러 타입 감지
 */
export function detectErrorType(errorText: string): string {
  if (/runtime error/i.test(errorText)) return "Runtime Error";
  if (/type error/i.test(errorText)) return "Type Error";
  if (/compile/i.test(errorText)) return "Compile Error";
  if (/syntax error/i.test(errorText)) return "Syntax Error";
  if (/reference error/i.test(errorText)) return "Reference Error";
  if (/cannot read properties/i.test(errorText)) return "Runtime TypeError";
  return "Error";
}

/**
 * 프레임워크 정보 추출
 */
export function extractFrameworkInfo(errorText: string): {
  framework?: string;
  version?: string;
} {
  // Next.js version: 16.0.1
  const nextjsPattern = /Next\.js version:\s*([\d.]+)/i;
  const nextMatch = nextjsPattern.exec(errorText);
  if (nextMatch) {
    return { framework: "Next.js", version: nextMatch[1] };
  }

  // React version: 18.2.0
  const reactPattern = /React version:\s*([\d.]+)/i;
  const reactMatch = reactPattern.exec(errorText);
  if (reactMatch) {
    return { framework: "React", version: reactMatch[1] };
  }

  return {};
}

/**
 * 에러 메시지 파싱
 */
export function parseErrorMessage(errorText: string): ErrorInfo {
  const type = detectErrorType(errorText);
  const files = extractFilePaths(errorText);
  const { framework, version } = extractFrameworkInfo(errorText);

  // 에러 메시지 추출
  const messagePattern = /Error Message:\s*(.+?)(?:\n|$)/;
  const messageMatch = messagePattern.exec(errorText);
  const message = messageMatch ? messageMatch[1].trim() : errorText.split('\n')[0];

  return {
    type,
    message,
    files,
    framework,
    version,
  };
}

/**
 * 경로 정규화 (상대 경로를 절대 경로로 변환)
 */
export function normalizePath(filePath: string, projectPath: string): string {
  // 이미 절대 경로인 경우
  if (filePath.startsWith('/')) {
    return filePath;
  }

  // webpack:// 같은 프리픽스 제거
  let cleanPath = filePath.replace(/^webpack:\/\/[^\/]+\//, '');

  // ./ 또는 ../ 제거
  cleanPath = cleanPath.replace(/^\.\//, '');

  // 프로젝트 경로와 결합
  return `${projectPath}/${cleanPath}`;
}
