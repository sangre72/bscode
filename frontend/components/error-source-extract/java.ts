/**
 * Java 에러 추출기
 */

import { LanguageExtractor } from './types';
import { isValidFilePath } from './common';

export const JavaExtractor: LanguageExtractor = {
  language: 'Java',

  /**
   * Java 에러인지 감지
   */
  detect(errorText: string): boolean {
    const javaPatterns = [
      /Exception in thread/i,
      /at [a-z]+\.[a-z]+\..*\([A-Z][a-zA-Z]+\.java:\d+\)/i,
      /Caused by:/i,
      /\.java:\d+/,
    ];

    return javaPatterns.some((pattern) => pattern.test(errorText));
  },

  /**
   * 파일 경로 추출
   */
  extractFilePaths(errorText: string): string[] {
    const files = new Set<string>();

    // 패턴 1: at package.Class.method(SourceFile.java:42)
    const stackPattern = /at\s+([a-z][a-zA-Z0-9_$.]*)\(([A-Z][a-zA-Z0-9_]+\.java):(\d+)\)/gi;
    let match;
    while ((match = stackPattern.exec(errorText)) !== null) {
      const packagePath = match[1].replace(/\./g, '/');
      const fileName = match[2];
      // 패키지 경로에서 클래스명 제거하고 파일명 추가
      const pathParts = packagePath.split('/');
      pathParts.pop(); // 마지막 부분 (메소드명) 제거
      const filePath = `${pathParts.join('/')}/${fileName}`;
      files.add(filePath);
    }

    // 패턴 2: 직접 경로 - /path/to/File.java:42
    const directPattern = /([a-zA-Z0-9_\-\/\.]+\.java):\d+/gi;
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
    if (/NullPointerException/i.test(errorText)) return "NullPointerException";
    if (/ClassNotFoundException/i.test(errorText)) return "ClassNotFoundException";
    if (/IllegalArgumentException/i.test(errorText)) return "IllegalArgumentException";
    if (/ArrayIndexOutOfBoundsException/i.test(errorText)) return "ArrayIndexOutOfBoundsException";
    if (/IOException/i.test(errorText)) return "IOException";
    if (/SQLException/i.test(errorText)) return "SQLException";
    return "Java Exception";
  },

  /**
   * 프레임워크 정보 추출
   */
  extractFrameworkInfo(errorText: string): { framework?: string; version?: string } {
    // Spring
    if (/springframework/i.test(errorText)) {
      return { framework: "Spring" };
    }

    // Hibernate
    if (/hibernate/i.test(errorText)) {
      return { framework: "Hibernate" };
    }

    return {};
  },
};
