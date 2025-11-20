/**
 * 공통 유틸리티 함수들
 */

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
    /Traceback/i, // Python
    /Exception in thread/i, // Java
  ];

  return errorPatterns.some((pattern) => pattern.test(text));
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

/**
 * 파일 경로 유효성 검증
 */
export function isValidFilePath(path: string): boolean {
  // 최소한 하나의 슬래시와 파일 확장자가 있어야 함
  const hasSlash = path.includes('/') || path.includes('\\');
  const hasExtension = /\.[a-z]+$/i.test(path);
  return hasSlash && hasExtension;
}
