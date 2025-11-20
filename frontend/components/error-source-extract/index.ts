/**
 * 에러 소스 추출 메인 인터페이스
 * 언어별 추출기를 관리하고 적절한 추출기를 선택
 */

import { ErrorInfo, LanguageExtractor } from './types';
import { isErrorMessage, normalizePath } from './common';
import { JavaScriptExtractor } from './javascript';
import { PythonExtractor } from './python';
import { JavaExtractor } from './java';

// 지원하는 언어 추출기 목록
const extractors: LanguageExtractor[] = [
  JavaScriptExtractor,
  PythonExtractor,
  JavaExtractor,
];

/**
 * 적절한 언어 추출기 선택
 */
function selectExtractor(errorText: string): LanguageExtractor | null {
  for (const extractor of extractors) {
    if (extractor.detect(errorText)) {
      return extractor;
    }
  }
  return null;
}

/**
 * 에러 메시지 파싱
 */
export function parseErrorMessage(errorText: string): ErrorInfo {
  const extractor = selectExtractor(errorText);

  if (!extractor) {
    // 추출기를 찾지 못한 경우 기본값 반환
    return {
      type: "Unknown Error",
      message: errorText.split('\n')[0],
      files: [],
    };
  }

  const type = extractor.detectErrorType(errorText);
  const files = extractor.extractFilePaths(errorText);
  const { framework, version } = extractor.extractFrameworkInfo(errorText);

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
    language: extractor.language,
  };
}

// 공통 함수들도 export
export { isErrorMessage, normalizePath };
export type { ErrorInfo };
