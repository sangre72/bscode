import { buildSystemPrompt, enhanceUserPrompt } from "@/utils/promptBuilder";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { message, history, context, model, provider, contextFiles, projectType, simpleMode } = await request.json();

    const selectedProvider = provider || "grok";
    const selectedModel = model || (selectedProvider === "grok" ? process.env.GROK_MODEL || "grok-code-fast-1" : "llama3.2");

    // Provider에 따라 다른 API 호출
    if (selectedProvider === "ollama") {
      return await handleOllamaRequest(message, history, context, selectedModel, contextFiles, projectType, simpleMode);
    } else {
      return await handleGrokRequest(message, history, context, selectedModel, contextFiles, projectType, simpleMode);
    }
  } catch (error) {
    console.error("Chat API Error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
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
  const apiKey = process.env.GROK_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROK_API_KEY가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

    // 시스템 프롬프트 추가 (일반 질문 모드에서는 간단한 프롬프트 사용)
    const systemPrompt = simpleMode 
      ? `You are a helpful AI assistant. Answer questions naturally and conversationally in Korean.

**IMPORTANT: This is a simple conversation mode.**
- DO NOT use structured JSON format
- DO NOT use code blocks with JSON
- DO NOT use planning phases or structured responses
- Just provide a natural, conversational text response
- Answer directly and helpfully, as if talking to a friend

If the user asks about system design or implementation, you can discuss it naturally without using structured formats.`
      : buildSystemPrompt();
    const enhancedMessage = simpleMode
      ? message
      : enhanceUserPrompt(
          message,
          contextFiles,
          projectType,
          history // 대화 히스토리를 컨텍스트로 전달
        );

    // 대화 히스토리를 Grok API 형식으로 변환
    const messages = [];
    
    // 시스템 프롬프트는 항상 포함 (대화 컨텍스트 유지를 위해)
    messages.push({
      role: "system" as const,
      content: systemPrompt,
    });
    
    // 기존 히스토리 추가 (최근 20개 메시지만 유지하여 토큰 제한 방지)
    const recentHistory = history.slice(-20);
    messages.push(
      ...recentHistory.map((msg: { role: string; content: string }) => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      }))
    );
    
    // 컨텍스트 파일 내용이 있으면 메시지에 포함
    let finalMessage = enhancedMessage;
    
    // package.json이 컨텍스트 파일에 있으면 내용 요청
    if (contextFiles && contextFiles.some(f => f.name === "package.json" || f.path.includes("package.json"))) {
      // package.json 내용은 이미 fileContents에 포함되어 있을 수 있음
      // 하지만 명시적으로 언급
      finalMessage += `\n\n**Note:** package.json content is provided in the context files section above. Please analyze it to understand the project structure and dependencies.`;
    }
    
    // 현재 메시지 추가
    messages.push({
      role: "user" as const,
      content: context
        ? `현재 편집 중인 코드 컨텍스트:\n\`\`\`\n${context}\n\`\`\`\n\n${finalMessage}`
        : finalMessage,
    });

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 4000,
      stream: true, // 스트리밍 활성화
    }),
  });

  if (!response.ok) {
    let errorMessage = `Grok API 오류: ${response.statusText}`;
    try {
      const errorData = await response.json();
      console.error("Grok API Error:", errorData);
      errorMessage = errorData.error?.message || errorData.error || errorMessage;
    } catch {
      const errorText = await response.text();
      console.error("Grok API Error (text):", errorText);
      errorMessage = errorText || errorMessage;
    }
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
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                controller.close();
                return;
              }

              try {
                const json = JSON.parse(data);
                const content = json.choices?.[0]?.delta?.content || '';
                if (content) {
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ content })}\n\n`));
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
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
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
  const systemPrompt = simpleMode
    ? `You are a helpful AI assistant. Answer questions naturally and conversationally in Korean.

**IMPORTANT: This is a simple conversation mode.**
- DO NOT use structured JSON format
- DO NOT use code blocks with JSON
- DO NOT use planning phases or structured responses
- Just provide a natural, conversational text response
- Answer directly and helpfully, as if talking to a friend

If the user asks about system design or implementation, you can discuss it naturally without using structured formats.`
    : buildSystemPrompt();
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
  const recentHistory = history.slice(-20);
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
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  
  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: true, // 스트리밍 활성화
        options: {
          temperature: 0.7,
          num_predict: 4000,
        },
      }),
    });

    if (!response.ok) {
      let errorMessage = `Ollama API 오류: ${response.statusText}`;
      try {
        const errorData = await response.json();
        console.error("Ollama API Error:", errorData);
        errorMessage = errorData.error || errorMessage;
      } catch {
        const errorText = await response.text();
        console.error("Ollama API Error (text):", errorText);
        errorMessage = errorText || errorMessage;
      }
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
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ content })}\n\n`));
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
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error("Ollama connection error:", error);
    return NextResponse.json(
      { error: `Ollama 서버에 연결할 수 없습니다. Ollama가 실행 중인지 확인하세요. (${ollamaUrl})` },
      { status: 500 }
    );
  }
}

