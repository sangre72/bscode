import {
  parseApiErrorResponse,
  validateAndRespond,
} from "@/utils/apiHelpers";
import {
  API_ENDPOINTS,
  ERROR_MESSAGES,
  PROJECT_SUMMARY_SYSTEM_PROMPT,
  getGrokApiKey,
  getModelConfig,
} from "@/utils/modelConfig";
import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

const PROJECTS_DIR = path.join(process.cwd(), "recent-projects");

// 프로젝트 프로필 요약본 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const validation = validateAndRespond(body, ["projectPath", "profile"]);
    if (validation) return validation;
    
    const { projectPath, profile } = body;

    // LLM에게 요약본 생성 요청
    const apiKey = getGrokApiKey();

    const prompt = `다음 프로젝트 프로필을 분석하여 질문에 대한 컨텍스트로 사용할 수 있는 요약본을 작성해주세요.

**요약본 작성 지침:**
1. 프로필의 핵심 정보만 추출 (프로젝트 타입, 주요 구조, 코딩 컨벤션)
2. 질문 시 컨텍스트로 사용되므로 명확하고 간결하게 작성
3. 토큰 제한을 고려하여 최대한 압축하되 중요한 정보는 누락하지 않기
4. 마크다운 형식으로 작성

**원본 프로필:**
${profile}

위 프로필을 요약하여 질문 시 컨텍스트로 사용할 수 있는 요약본을 작성해주세요.`;

    // 모델별 설정 가져오기 (통합 관리)
    const model = "grok-beta";
    const modelConfig = getModelConfig(model, "summary");

    const response = await fetch(API_ENDPOINTS.GROK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: PROJECT_SUMMARY_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: modelConfig.temperature,
        max_tokens: modelConfig.maxTokens,
      }),
    });

    if (!response.ok) {
      const errorMessage = await parseApiErrorResponse(
        response,
        ERROR_MESSAGES.LLM_API_CALL_FAILED(response.status, "")
      );
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const summary = data.choices[0]?.message?.content || "";

    // 요약본 저장
    const projectName = path.basename(projectPath);
    const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "_");
    const summaryFileName = `${safeName}_summary.md`;
    const summaryPath = path.join(PROJECTS_DIR, summaryFileName);

    try {
      await fs.access(PROJECTS_DIR);
    } catch {
      await fs.mkdir(PROJECTS_DIR, { recursive: true });
    }

    await fs.writeFile(summaryPath, summary, "utf-8");

    // 메타데이터 업데이트
    const metadataFileName = `${safeName}_profile_meta.json`;
    const metadataPath = path.join(PROJECTS_DIR, metadataFileName);

    try {
      const metadataContent = await fs.readFile(metadataPath, "utf-8");
      const metadata = JSON.parse(metadataContent);
      metadata.summaryFile = summaryFileName;
      metadata.updatedAt = new Date().toISOString();
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
    } catch {
      // 메타데이터가 없으면 새로 생성
      const metadata = {
        projectPath,
        profileFile: `${safeName}_profile.md`,
        summaryFile: summaryFileName,
        updatedAt: new Date().toISOString(),
      };
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
    }

    return NextResponse.json({
      success: true,
      summary,
      summaryFile: summaryFileName,
      message: "프로젝트 프로필 요약본이 생성되었습니다.",
    });
  } catch (error) {
    console.error("Error summarizing project profile:", error);
    return NextResponse.json(
      { 
        error: "프로젝트 프로필 요약본을 생성할 수 없습니다.",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

