import { NextRequest, NextResponse } from "next/server";

/**
 * API 에러 응답 생성 (공통)
 */
export function createErrorResponse(
  error: unknown,
  defaultMessage: string = "서버 오류가 발생했습니다.",
  status: number = 500
): NextResponse {
  console.error("API Error:", error);
  
  const errorMessage = error instanceof Error 
    ? error.message 
    : typeof error === 'string' 
    ? error 
    : defaultMessage;
  
  return NextResponse.json(
    { error: errorMessage },
    { status }
  );
}

/**
 * 파일 시스템 에러 타입별 상세 메시지 생성
 */
export function getFileSystemErrorMessage(error: unknown): {
  message: string;
  type: string;
  suggestions: string[];
} {
  const errorMessage = String(error);
  let detailedError = "파일 작업을 수행할 수 없습니다.";
  let errorType = "unknown";
  const suggestions: string[] = [];

  if (errorMessage.includes("EACCES") || errorMessage.includes("permission denied")) {
    detailedError = "파일 작업 권한이 없습니다. 파일 또는 디렉토리의 권한을 확인하세요.";
    errorType = "permission";
    suggestions.push("파일/디렉토리 권한 확인");
    suggestions.push("관리자 권한으로 실행");
  } else if (errorMessage.includes("ENOENT")) {
    detailedError = "디렉토리 또는 파일 경로를 찾을 수 없습니다. 경로를 확인하세요.";
    errorType = "not_found";
    suggestions.push("경로 확인");
    suggestions.push("디렉토리 존재 여부 확인");
  } else if (errorMessage.includes("EISDIR")) {
    detailedError = "파일 경로가 디렉토리입니다. 파일 경로를 확인하세요.";
    errorType = "is_directory";
    suggestions.push("파일 경로 확인");
  } else if (errorMessage.includes("ENOSPC")) {
    detailedError = "디스크 공간이 부족합니다.";
    errorType = "no_space";
    suggestions.push("디스크 공간 확인");
  } else if (errorMessage.includes("EMFILE") || errorMessage.includes("ENFILE")) {
    detailedError = "열 수 있는 파일 수가 초과되었습니다.";
    errorType = "too_many_files";
    suggestions.push("열려있는 파일 닫기");
  } else if (errorMessage.includes("EBUSY")) {
    detailedError = "파일이 다른 프로세스에서 사용 중입니다. 파일을 닫고 다시 시도하세요.";
    errorType = "busy";
    suggestions.push("파일 사용 중인 프로세스 확인");
  }

  return { message: detailedError, type: errorType, suggestions };
}

/**
 * 파일 시스템 에러 응답 생성
 */
export function createFileSystemErrorResponse(
  error: unknown,
  filePath?: string
): NextResponse {
  const { message, type, suggestions } = getFileSystemErrorMessage(error);
  
  return NextResponse.json(
    {
      error: message,
      details: String(error),
      errorType: type,
      filePath: filePath || "",
      suggestions,
    },
    { status: 500 }
  );
}

/**
 * API 응답 에러 파싱 (Grok/Ollama 공통)
 */
export async function parseApiErrorResponse(
  response: Response,
  defaultMessage: string
): Promise<string> {
  let errorMessage = defaultMessage;
  try {
    const errorData = await response.json();
    console.error("API Error Response:", errorData);
    errorMessage = errorData.error?.message || errorData.error || errorMessage;
  } catch {
    try {
      const errorText = await response.text();
      console.error("API Error Response (text):", errorText);
      errorMessage = errorText || errorMessage;
    } catch {
      // 파싱 실패 시 기본 메시지 사용
    }
  }
  return errorMessage;
}

/**
 * 스트리밍 응답 헤더 생성 (공통)
 */
export function createStreamResponseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };
}

/**
 * 스트리밍 메시지 인코딩 (공통)
 */
export function encodeStreamMessage(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * 요청 본문 파싱 (공통)
 */
export async function parseRequestBody<T = Record<string, unknown>>(
  request: NextRequest
): Promise<T> {
  try {
    return await request.json();
  } catch (error) {
    throw new Error("요청 본문을 파싱할 수 없습니다.");
  }
}

/**
 * 필수 파라미터 검증
 */
export function validateRequiredParams(
  params: Record<string, unknown>,
  required: string[]
): { valid: boolean; missing: string[] } {
  const missing = required.filter(key => !params[key] || (typeof params[key] === 'string' && !params[key].trim()));
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * 필수 파라미터 검증 및 에러 응답
 */
export function validateAndRespond(
  params: Record<string, unknown>,
  required: string[]
): NextResponse | null {
  const { valid, missing } = validateRequiredParams(params, required);
  if (!valid) {
    return NextResponse.json(
      { error: `필수 파라미터가 누락되었습니다: ${missing.join(', ')}` },
      { status: 400 }
    );
  }
  return null;
}

