/**
 * LLM 모델 설정 유틸리티
 * 모든 API 엔드포인트에서 일관된 모델 설정을 사용하도록 통합 관리
 */

export interface ModelConfig {
  maxTokens: number;
  temperature: number;
}

/**
 * API 엔드포인트 URL 설정
 */
export const API_ENDPOINTS = {
  GROK: "https://api.x.ai/v1/chat/completions",
  OLLAMA: process.env.OLLAMA_URL || "http://localhost:11434",
  LMSTUDIO: process.env.LMSTUDIO_BASE_URL || "http://localhost:1234",
} as const;

/**
 * 환경 변수 키
 */
export const ENV_KEYS = {
  GROK_API_KEY: "GROK_API_KEY",
  OLLAMA_URL: "OLLAMA_URL",
  LMSTUDIO_BASE_URL: "LMSTUDIO_BASE_URL",
  GROK_MODEL: "GROK_MODEL",
} as const;

/**
 * 기본 모델 설정
 */
export const DEFAULT_MODELS = {
  GROK: process.env.GROK_MODEL || "grok-4-fast-reasoning",
  OLLAMA: "llama3.2",
} as const;

/**
 * 기본 설정값
 */
export const DEFAULT_CONFIG = {
  MAX_HISTORY_MESSAGES: 20, // 최근 메시지 개수 제한
  MAX_ITERATIONS: 5, // 최대 반복 횟수
  STREAM: true, // 스트리밍 활성화
} as const;

/**
 * 에러 메시지
 */
export const ERROR_MESSAGES = {
  GROK_API_KEY_MISSING: "GROK_API_KEY가 설정되지 않았습니다.",
  OLLAMA_CONNECTION_FAILED: (url: string) => 
    `Ollama 서버에 연결할 수 없습니다. Ollama가 실행 중인지 확인하세요. (${url})`,
  LLM_API_CALL_FAILED: (status: number, details: string) =>
    `LLM API 호출 실패: ${status} - ${details}`,
  SERVER_ERROR: "서버 오류가 발생했습니다.",
} as const;

/**
 * Simple Mode 시스템 프롬프트
 */
export const SIMPLE_MODE_SYSTEM_PROMPT = `You are a helpful AI assistant. Answer questions naturally and conversationally in Korean.

**IMPORTANT: This is a simple conversation mode.**
- DO NOT use structured JSON format
- DO NOT use code blocks with JSON
- DO NOT use planning phases or structured responses
- Just provide a natural, conversational text response
- Answer directly and helpfully, as if talking to a friend

If the user asks about system design or implementation, you can discuss it naturally without using structured formats.`;

/**
 * 프로젝트 분석용 시스템 프롬프트
 */
export const PROJECT_ANALYSIS_SYSTEM_PROMPT = `You are a project analysis assistant. Analyze project structures and create detailed project profiles in Korean. You will receive project structure information step by step and should request additional files when needed. Based on the file structure, identify the project type (Java/Spring, Python/Flask/Django, Node.js/Next.js/React, Go, Rust, C/C++, etc.) and request relevant configuration files and source files.`;

/**
 * 프로젝트 요약용 시스템 프롬프트
 */
export const PROJECT_SUMMARY_SYSTEM_PROMPT = "You are a project profile summarizer. Create concise summaries of project profiles for use as context in questions.";

/**
 * API 키 검증
 */
export function getGrokApiKey(): string {
  const apiKey = process.env[ENV_KEYS.GROK_API_KEY];
  if (!apiKey) {
    throw new Error(ERROR_MESSAGES.GROK_API_KEY_MISSING);
  }
  return apiKey;
}

/**
 * Ollama URL 가져오기
 */
export function getOllamaUrl(): string {
  return API_ENDPOINTS.OLLAMA;
}

/**
 * LM Studio URL 가져오기
 */
export function getLMStudioUrl(): string {
  return API_ENDPOINTS.LMSTUDIO;
}

/**
 * 모델별 max_tokens 설정
 * @param model 모델 이름 (예: "grok-4-reasoning", "grok-beta", "grok-3")
 * @param useCase 사용 사례에 따른 토큰 조정 (기본값: "default")
 *   - "default": 일반 대화/코드 생성
 *   - "analysis": 프로젝트 분석 (중간 길이)
 *   - "summary": 요약 생성 (짧은 길이)
 *   - "long": 긴 응답 필요 (최대 토큰)
 */
export function getMaxTokens(model: string, useCase: "default" | "analysis" | "summary" | "long" = "default"): number {
  // useCase에 따른 기본 배율
  const useCaseMultiplier: Record<string, number> = {
    default: 1.0,
    analysis: 0.8, // 분석은 조금 더 짧게
    summary: 0.5, // 요약은 더 짧게
    long: 1.5, // 긴 응답은 더 길게
  };

  const multiplier = useCaseMultiplier[useCase] || 1.0;

  // 모델별 기본 max_tokens
  let baseTokens = 4000; // 기본값

  if (model.includes("reasoning")) {
    baseTokens = 4000; // reasoning 모델은 긴 응답을 위해 더 많은 토큰 할당
  } else if (model.includes("grok-4") || model.includes("grok-beta")) {
    baseTokens = 4000; // Grok 4 모델은 중간 수준의 토큰 할당
  } else if (model.includes("grok-3")) {
    baseTokens = 4000; // Grok 3 모델
  } else if (model.includes("grok-2")) {
    baseTokens = 4000; // Grok 2 모델
  } else if (model.includes("grok-code")) {
    baseTokens = 4000; // Grok Code 모델
  }

  // useCase에 따라 조정
  const finalTokens = Math.round(baseTokens * multiplier);

  // 최소값 보장 (너무 작으면 의미 없음)
  const minTokens = useCase === "summary" ? 1000 : 2000;
  return Math.max(finalTokens, minTokens);
}

/**
 * 모델별 temperature 설정
 * @param model 모델 이름
 * @param useCase 사용 사례
 */
export function getTemperature(model: string, useCase: "default" | "analysis" | "summary" | "long" = "default"): number {
  // useCase별 기본 temperature
  const useCaseTemp: Record<string, number> = {
    default: 0.7, // 일반 대화: 창의성과 일관성의 균형
    analysis: 0.3, // 분석: 더 정확하고 일관된 응답
    summary: 0.3, // 요약: 정확하고 간결한 요약
    long: 0.7, // 긴 응답: 창의성 허용
  };

  return useCaseTemp[useCase] || 0.7;
}

/**
 * 모델별 전체 설정 가져오기
 * @param model 모델 이름
 * @param useCase 사용 사례
 */
export function getModelConfig(model: string, useCase: "default" | "analysis" | "summary" | "long" = "default"): ModelConfig {
  return {
    maxTokens: getMaxTokens(model, useCase),
    temperature: getTemperature(model, useCase),
  };
}

