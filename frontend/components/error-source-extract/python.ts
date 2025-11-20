/**
 * Python 에러 추출기
 */

import { LanguageExtractor } from './types';
import { isValidFilePath } from './common';

export const PythonExtractor: LanguageExtractor = {
  language: 'Python',

  /**
   * Python 에러인지 감지
   */
  detect(errorText: string): boolean {
    const pythonPatterns = [
      /Traceback \(most recent call last\)/i,
      /File ".*\.py", line \d+/i,
      /Error: /i,
      /Exception: /i,
      /\.py:\d+/,
    ];

    return pythonPatterns.some((pattern) => pattern.test(errorText));
  },

  /**
   * 파일 경로 추출
   */
  extractFilePaths(errorText: string): string[] {
    const files = new Set<string>();

    // 패턴 1: File "/path/to/file.py", line 42
    const filePattern = /File "([^"]+\.py)", line \d+/gi;
    let match;
    while ((match = filePattern.exec(errorText)) !== null) {
      const path = match[1].trim();
      if (isValidFilePath(path)) {
        files.add(path);
      }
    }

    // 패턴 2: /path/to/file.py:42:
    const directPattern = /([a-zA-Z0-9_\-\/\.]+\.py):\d+/gi;
    while ((match = directPattern.exec(errorText)) !== null) {
      const path = match[1].trim();
      if (isValidFilePath(path)) {
        files.add(path);
      }
    }

    return Array.from(files);
  },

  /**
   * 에러 타입 감지
   */
  detectErrorType(errorText: string): string {
    if (/AttributeError/i.test(errorText)) return "AttributeError";
    if (/TypeError/i.test(errorText)) return "TypeError";
    if (/ValueError/i.test(errorText)) return "ValueError";
    if (/KeyError/i.test(errorText)) return "KeyError";
    if (/IndexError/i.test(errorText)) return "IndexError";
    if (/NameError/i.test(errorText)) return "NameError";
    if (/ImportError/i.test(errorText)) return "ImportError";
    if (/SyntaxError/i.test(errorText)) return "SyntaxError";
    return "Python Error";
  },

  /**
   * 프레임워크 정보 추출
   */
  extractFrameworkInfo(errorText: string): { framework?: string; version?: string } {
    // Django
    if (/django/i.test(errorText)) {
      return { framework: "Django" };
    }

    // Flask
    if (/flask/i.test(errorText)) {
      return { framework: "Flask" };
    }

    // FastAPI
    if (/fastapi/i.test(errorText)) {
      return { framework: "FastAPI" };
    }

    return {};
  },
};
