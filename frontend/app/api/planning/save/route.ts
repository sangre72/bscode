import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const { projectPath, planningData, userRequest } = await request.json();

    if (!projectPath || !planningData) {
      return NextResponse.json(
        { error: "프로젝트 경로와 계획 데이터가 필요합니다." },
        { status: 400 }
      );
    }

    // planning 디렉토리 경로
    const planningDir = path.join(projectPath, "planning");
    
    // 디렉토리 생성
    try {
      await fs.mkdir(planningDir, { recursive: true });
    } catch (error) {
      // 디렉토리가 이미 존재할 수 있음
    }

    // 파일명 생성 (타임스탬프 기반)
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, -5); // YYYY-MM-DDTHH-MM-SS
    const filename = `planning-${timestamp}.json`;
    const filePath = path.join(planningDir, filename);

    // 계획 데이터에 메타데이터 추가
    const planningFile = {
      metadata: {
        createdAt: now.toISOString(),
        userRequest: userRequest || "",
        projectPath: projectPath,
      },
      planning: planningData,
    };

    // 파일 저장
    await fs.writeFile(filePath, JSON.stringify(planningFile, null, 2), "utf-8");

    return NextResponse.json({
      success: true,
      path: `planning/${filename}`,
      filename: filename,
      message: "계획이 성공적으로 저장되었습니다.",
    });
  } catch (error) {
    console.error("Error saving planning:", error);
    return NextResponse.json(
      { error: "계획을 저장할 수 없습니다.", details: String(error) },
      { status: 500 }
    );
  }
}

