/**
 * Grok API 클라이언트
 * xAI의 Grok API와 통신하여 프롬프트를 전송하고 응답을 받습니다.
 */

export interface GrokMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GrokRequestParams {
  model?: string;
  messages: GrokMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface GrokResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class GrokClient {
  private apiKey: string;
  private baseUrl: string = 'https://api.x.ai/v1';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GROK_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('Grok API key is required. Set GROK_API_KEY environment variable.');
    }
  }

  /**
   * Grok API에 채팅 완성 요청 전송
   */
  async chat(params: GrokRequestParams): Promise<GrokResponse> {
    const defaultParams = {
      model: 'grok-4-fast-reasoning',
      temperature: 0.3,
      max_tokens: 32000,
      stream: false,
    };

    const requestBody = {
      ...defaultParams,
      ...params,
    };

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Grok API error (${response.status}): ${errorText}`);
      }

      const data: GrokResponse = await response.json();
      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to call Grok API: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 단일 프롬프트를 전송하고 응답 받기 (간편 메서드)
   */
  async sendPrompt(
    userPrompt: string,
    systemPrompt?: string,
    options?: Partial<GrokRequestParams>
  ): Promise<string> {
    const messages: GrokMessage[] = [];

    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    messages.push({
      role: 'user',
      content: userPrompt,
    });

    const response = await this.chat({
      messages,
      ...options,
    });

    if (!response.choices || response.choices.length === 0) {
      throw new Error('No response from Grok API');
    }

    return response.choices[0].message.content;
  }

  /**
   * 대화 히스토리와 함께 프롬프트 전송
   */
  async sendWithHistory(
    messages: GrokMessage[],
    options?: Partial<GrokRequestParams>
  ): Promise<string> {
    const response = await this.chat({
      messages,
      ...options,
    });

    if (!response.choices || response.choices.length === 0) {
      throw new Error('No response from Grok API');
    }

    return response.choices[0].message.content;
  }
}