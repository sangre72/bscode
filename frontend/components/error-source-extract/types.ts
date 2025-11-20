/**
 * 에러 소스 추출을 위한 공통 타입 정의
 */

export interface ErrorInfo {
  type: string; // Runtime, Compile, TypeScript 등
  message: string;
  files: string[]; // 추출된 파일 경로들
  framework?: string; // Next.js, React 등
  version?: string;
  language?: string; // JavaScript, Python, Java 등
}

export interface ErrorPattern {
  name: string;
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => string[];
}

export interface LanguageExtractor {
  language: string;
  detect: (errorText: string) => boolean;
  extractFilePaths: (errorText: string) => string[];
  detectErrorType: (errorText: string) => string;
  extractFrameworkInfo: (errorText: string) => { framework?: string; version?: string };
}
