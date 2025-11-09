import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const PROJECTS_DIR = path.join(process.cwd(), "recent-projects");

// 프로젝트 프로필 요약본 생성
export async function POST(request: NextRequest) {
  try {
    const { projectPath, profile } = await request.json();

    if (!projectPath || !profile) {
      return NextResponse.json(
        { error: "프로젝트 경로와 프로필이 필요합니다." },
        { status: 400 }
      );
    }

    // LLM에게 요약본 생성 요청
    const apiKey = process.env.GROK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GROK_API_KEY가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const prompt = `다음 프로젝트 프로필을 분석하여 질문에 대한 컨텍스트로 사용할 수 있는 요약본을 작성해주세요.

**요약본 작성 지침:**
1. 프로필의 핵심 정보만 추출 (프로젝트 타입, 주요 구조, 코딩 컨벤션)
2. 질문 시 컨텍스트로 사용되므로 명확하고 간결하게 작성
3. 토큰 제한을 고려하여 최대한 압축하되 중요한 정보는 누락하지 않기
4. 마크다운 형식으로 작성

**원본 프로필:**
${profile}

위 프로필을 요약하여 질문 시 컨텍스트로 사용할 수 있는 요약본을 작성해주세요.`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-beta",
        messages: [
          {
            role: "system",
            content: "You are a project profile summarizer. Create concise summaries of project profiles for use as context in questions.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API 호출 실패: ${response.status} - ${errorText}`);
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

