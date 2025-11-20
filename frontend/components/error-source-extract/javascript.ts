/**
 * JavaScript/TypeScript 에러 추출기
 */

import { LanguageExtractor } from './types';
import { isValidFilePath } from './common';

export const JavaScriptExtractor: LanguageExtractor = {
  language: 'JavaScript/TypeScript',

  /**
   * JavaScript/TypeScript 에러인지 감지
   */
  detect(errorText: string): boolean {
    const jsPatterns = [
      /at\s+[^\(]*\([^:)]+\.[jt]sx?:\d+:\d+\)/i, // Stack trace
      /Next\.js/i,
      /React/i,
      /webpack/i,
      /TypeError/i,
      /ReferenceError/i,
      /SyntaxError/i,
      /\.tsx?:/i,
      /\.jsx?:/i,
    ];

    return jsPatterns.some((pattern) => pattern.test(errorText));
  },

  /**
   * 파일 경로 추출
   */
  extractFilePaths(errorText: string): string[] {
    const files = new Set<string>();

    // 패턴 1: Stack trace 형식 - at Component (path/to/file.tsx:31:9)
    const stackTracePattern = /at\s+[^\(]*\(([^:)]+\.[jt]sx?):\d+:\d+\)/gi;
    let match;
    while ((match = stackTracePattern.exec(errorText)) !== null) {
      const path = match[1].trim();
      if (isValidFilePath(path)) {
        files.add(path);
      }
    }

    // 패턴 2: 직접 경로 언급 - path/to/file.tsx:31:9
    const directPathPattern = /([a-zA-Z0-9_\-\/\.]+\.[jt]sx?):\d+:\d+/gi;
    while ((match = directPathPattern.exec(errorText)) !== null) {
      const path = match[1].trim();
      if (isValidFilePath(path)) {
        files.add(path);
      }
    }

    // 패턴 3: webpack 경로 - webpack://Component/path/to/file.tsx
    const webpackPattern = /webpack:\/\/[^\/]+\/(.+\.[jt]sx?)/gi;
    while ((match = webpackPattern.exec(errorText)) !== null) {
      const path = match[1].trim();
      if (isValidFilePath(path)) {
        files.add(path);
      }
    }

    // 패턴 4: Module not found - Can't resolve './Component'
    const modulePattern = /Can't resolve ['"]([^'"]+)['"]/gi;
    while ((match = modulePattern.exec(errorText)) !== null) {
      const path = match[1].trim();
      // 상대 경로 import인 경우에만 추가
      if (path.startsWith('./') || path.startsWith('../')) {
        // 확장자가 없으면 .tsx, .ts, .jsx, .js 등을 시도
        files.add(`${path}.tsx`);
        files.add(`${path}.ts`);
        files.add(`${path}.jsx`);
        files.add(`${path}.js`);
      }
    }

    return Array.from(files);
  },

  /**
   * 에러 타입 감지
   */
  detectErrorType(errorText: string): string {
    if (/runtime error/i.test(errorText)) return "Runtime Error";
    if (/type error/i.test(errorText)) return "Type Error";
    if (/compile/i.test(errorText)) return "Compile Error";
    if (/syntax error/i.test(errorText)) return "Syntax Error";
    if (/reference error/i.test(errorText)) return "Reference Error";
    if (/cannot read properties/i.test(errorText)) return "Runtime TypeError";
    if (/module not found/i.test(errorText)) return "Module Not Found";
    return "JavaScript Error";
  },

  /**
   * 프레임워크 정보 추출
   */
  extractFrameworkInfo(errorText: string): { framework?: string; version?: string } {
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

    // webpack 언급이 있으면
    if (/webpack/i.test(errorText)) {
      return { framework: "webpack" };
    }

    return {};
  },
};
