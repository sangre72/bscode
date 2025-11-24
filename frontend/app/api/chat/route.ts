import {
  createErrorResponse,
  createStreamResponseHeaders,
  encodeStreamMessage,
  parseApiErrorResponse,
} from "@/utils/apiHelpers";
import {
  API_ENDPOINTS,
  DEFAULT_CONFIG,
  DEFAULT_MODELS,
  ERROR_MESSAGES,
  SIMPLE_MODE_SYSTEM_PROMPT,
  getGrokApiKey,
  getModelConfig,
  getOllamaUrl,
  getLMStudioUrl,
} from "@/utils/modelConfig";
import {
  buildSystemPrompt,
  enhanceUserPrompt,
} from "@/utils/promptBuilder";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { message, history, context, model, provider, contextFiles, projectType, simpleMode } = await request.json();

    const selectedProvider = provider || "grok";
    const selectedModel = model || (selectedProvider === "grok" ? DEFAULT_MODELS.GROK : DEFAULT_MODELS.OLLAMA);

    // Provider에 따라 다른 API 호출
    if (selectedProvider === "ollama") {
      return await handleOllamaRequest(message, history, context, selectedModel, contextFiles, projectType, simpleMode);
    } else if (selectedProvider === "lmstudio") {
      return await handleLMStudioRequest(message, history, context, selectedModel, contextFiles, projectType, simpleMode);
    } else {
      return await handleGrokRequest(message, history, context, selectedModel, contextFiles, projectType, simpleMode);
    }
  } catch (error) {
    return createErrorResponse(error, "서버 오류가 발생했습니다.", 500);
  }
}

async function handleGrokRequest(
  message: string,
  history: any[],
  context: string | undefined,
  model: string,
  contextFiles: any[] | undefined,
  projectType: string | undefined,
  simpleMode: boolean = false
) {
  const apiKey = getGrokApiKey();
  const messages = [];

  if (simpleMode) {
    // Simple mode: 간단한 대화
    messages.push({ role: "system", content: SIMPLE_MODE_SYSTEM_PROMPT });
    messages.push(...history.map((msg: { role: string; content: string }) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    })));
    messages.push({ role: "user", content: message });
  } else {
    // Enhanced mode: 상세한 시스템 프롬프트와 향상된 사용자 프롬프트 사용
    const systemPrompt = buildSystemPrompt();
    const enhancedMessage = enhanceUserPrompt(message, contextFiles, projectType, history);

    // 시스템 프롬프트 추가
    messages.push({ role: "system", content: systemPrompt });

    // 대화 히스토리 추가 (최근 메시지만)
    const recentHistory = history.slice(-DEFAULT_CONFIG.MAX_HISTORY_MESSAGES);
    messages.push(...recentHistory.map((msg: { role: string; content: string }) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    })));

    // 현재 컨텍스트가 있으면 메시지에 포함
    let finalMessage = enhancedMessage;
    if (context) {
      finalMessage = `현재 편집 중인 코드 컨텍스트:\n\`\`\`\n${context}\n\`\`\`\n\n${enhancedMessage}`;
    }

    messages.push({ role: "user", content: finalMessage });
  }

  // 모델별 설정 가져오기 (통합 관리)
  const modelConfig = getModelConfig(model, "default");

  const response = await fetch(API_ENDPOINTS.GROK, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: modelConfig.temperature,
      max_tokens: modelConfig.maxTokens,
      stream: DEFAULT_CONFIG.STREAM, // 스트리밍 활성화
    }),
  });

  if (!response.ok) {
    const errorMessage = await parseApiErrorResponse(
      response,
      `Grok API 오류: ${response.statusText}`
    );
    return NextResponse.json(
      { error: errorMessage },
      { status: response.status }
    );
  }

  // 스트리밍 응답 생성
  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        controller.close();
        return;
      }

      let buffer = ''; // 불완전한 JSON을 저장할 버퍼
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // 마지막 버퍼 처리
            if (buffer.trim()) {
              const lines = buffer.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim();
                  if (data && data !== '[DONE]') {
                    try {
                      const json = JSON.parse(data);
                      const content = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || '';
                      if (content) {
                        controller.enqueue(encodeStreamMessage({ content }));
                      }
                    } catch (e) {
                      // 마지막 버퍼 파싱 실패는 무시
                    }
                  }
                }
              }
            }
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          // 완전한 라인만 처리
          const lines = buffer.split('\n');
          // 마지막 라인은 불완전할 수 있으므로 버퍼에 유지
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                controller.close();
                return;
              }

              if (!data) continue; // 빈 데이터 스킵

              try {
                const json = JSON.parse(data);
                // reasoning 모델은 finish_reason이 있을 수 있음
                const finishReason = json.choices?.[0]?.finish_reason;
                if (finishReason === "stop" || finishReason === "length") {
                  // 응답 완료 신호 전송
                  controller.enqueue(encodeStreamMessage({ content: "", done: true, finishReason }));
                }
                const content = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || '';
                if (content) {
                  controller.enqueue(encodeStreamMessage({ content }));
                }
              } catch (e) {
                // JSON 파싱 실패는 조용히 무시 (불완전한 청크일 수 있음)
                // 디버깅이 필요할 때만 로그 출력
                if (process.env.NODE_ENV === 'development' && data.length < 500 && !data.includes('"created"')) {
                  console.debug("Failed to parse Grok response chunk (expected for incomplete chunks):", data.substring(0, 100));
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("Stream error:", error);
        controller.error(error);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: createStreamResponseHeaders(),
  });
}

async function handleOllamaRequest(
  message: string,
  history: any[],
  context: string | undefined,
  model: string,
  contextFiles: any[] | undefined,
  projectType: string | undefined,
  simpleMode: boolean = false
) {
  const systemPrompt = simpleMode ? SIMPLE_MODE_SYSTEM_PROMPT : buildSystemPrompt();
  const enhancedMessage = simpleMode
    ? message
    : enhanceUserPrompt(
        message,
        contextFiles,
        projectType,
        history
      );

  // Ollama API 형식으로 메시지 변환
  const messages = [];
  
  // 시스템 프롬프트는 첫 번째 메시지에 포함
  let finalMessage = enhancedMessage;
  if (context) {
    finalMessage = `현재 편집 중인 코드 컨텍스트:\n\`\`\`\n${context}\n\`\`\`\n\n${finalMessage}`;
  }
  
  // 시스템 프롬프트를 첫 메시지에 포함
  messages.push({
    role: "system",
    content: systemPrompt,
  });
  
  // 기존 히스토리 추가
  const recentHistory = history.slice(-DEFAULT_CONFIG.MAX_HISTORY_MESSAGES);
  messages.push(
    ...recentHistory.map((msg: { role: string; content: string }) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    }))
  );
  
  // 현재 메시지 추가
  messages.push({
    role: "user",
    content: finalMessage,
  });

  // Ollama API 호출 (로컬 서버)
  const ollamaUrl = getOllamaUrl();
  
  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: DEFAULT_CONFIG.STREAM, // 스트리밍 활성화
        options: {
          temperature: 0.7,
          num_predict: 32000,
        },
      }),
    });

    if (!response.ok) {
      const errorMessage = await parseApiErrorResponse(
        response,
        `Ollama API 오류: ${response.statusText}`
      );
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    // 스트리밍 응답 생성
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.trim() === '') continue;

              try {
                const json = JSON.parse(line);
                const content = json.message?.content || '';
                if (content) {
                  controller.enqueue(encodeStreamMessage({ content }));
                }
              } catch (e) {
                // JSON 파싱 실패 무시
              }
            }
          }
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: createStreamResponseHeaders(),
    });
  } catch (error) {
    console.error("Ollama connection error:", error);
      return NextResponse.json(
      { error: ERROR_MESSAGES.OLLAMA_CONNECTION_FAILED(ollamaUrl) },
      { status: 500 }
    );
  }
}

async function handleLMStudioRequest(
  message: string,
  history: any[],
  context: string | undefined,
  model: string,
  contextFiles: any[] | undefined,
  projectType: string | undefined,
  simpleMode: boolean = false
) {
  // 32K 컨텍스트 길이를 활용 - 원래 프롬프트 사용 (제한 없음)
  const messages = [];

  if (simpleMode) {
    // Simple mode: 간단한 대화
    messages.push({ role: "system", content: SIMPLE_MODE_SYSTEM_PROMPT });
    // 전체 히스토리 포함 (제한 없음)
    messages.push(...history.map((msg: { role: string; content: string }) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    })));
    messages.push({ role: "user", content: message });
  } else {
    // Enhanced mode: 상세한 시스템 프롬프트와 향상된 사용자 프롬프트 사용
    const systemPrompt = buildSystemPrompt();
    const enhancedMessage = enhanceUserPrompt(message, contextFiles, projectType, history);

    // 시스템 프롬프트 추가
    messages.push({ role: "system", content: systemPrompt });

    // 전체 대화 히스토리 포함 (제한 제거)
    messages.push(...history.map((msg: { role: string; content: string }) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    })));

    // 현재 컨텍스트가 있으면 메시지에 포함
    let finalMessage = enhancedMessage;
    if (context) {
      finalMessage = `현재 편집 중인 코드 컨텍스트:\n\`\`\`\n${context}\n\`\`\`\n\n${enhancedMessage}`;
    }

    messages.push({ role: "user", content: finalMessage });
  }

  // LM Studio API 호출 (OpenAI 호환)
  const lmstudioBaseUrl = getLMStudioUrl();
  const lmstudioUrl = `${lmstudioBaseUrl}/v1/chat/completions`;

  try {
    const response = await fetch(lmstudioUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 3000, // LM Studio 응답 길이
        stream: true,
        // 컨텍스트 길이 설정 (큰 모델용)
        num_ctx: 32768, // 32K 컨텍스트
      }),
    });

    if (!response.ok) {
      const errorMessage = await parseApiErrorResponse(
        response,
        `LM Studio API 오류: ${response.statusText}`
      );
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    // 스트리밍 응답 생성 (OpenAI 형식)
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          controller.close();
          return;
        }

        try {
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine || trimmedLine === "data: [DONE]") continue;

              if (trimmedLine.startsWith("data: ")) {
                try {
                  const jsonStr = trimmedLine.slice(6);
                  const data = JSON.parse(jsonStr);
                  const content = data.choices?.[0]?.delta?.content || "";

                  if (content) {
                    controller.enqueue(encodeStreamMessage({ content }));
                  }
                } catch (e) {
                  // JSON 파싱 실패 무시
                }
              }
            }
          }
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: createStreamResponseHeaders(),
    });
  } catch (error) {
    const lmstudioBaseUrl = getLMStudioUrl();
    console.error("LM Studio connection error:", error);
    return NextResponse.json(
      { error: `LM Studio에 연결할 수 없습니다. ${lmstudioBaseUrl} 에서 LM Studio가 실행 중인지 확인하세요.` },
      { status: 500 }
    );
  }
}

