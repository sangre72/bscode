import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectPath = searchParams.get("projectPath");

    if (!projectPath) {
      return NextResponse.json(
        { error: "프로젝트 경로가 필요합니다." },
        { status: 400 }
      );
    }

    // planning 디렉토리 경로
    const planningDir = path.join(projectPath, "planning");

    // 디렉토리가 없으면 빈 배열 반환
    try {
      await fs.access(planningDir);
    } catch (error) {
      return NextResponse.json({
        success: true,
        plans: [],
      });
    }

    // 파일 목록 읽기
    const files = await fs.readdir(planningDir);
    const planningFiles = files.filter((file) => file.endsWith(".json") && file.startsWith("planning-"));

    // 각 파일의 메타데이터 읽기
    const plans = await Promise.all(
      planningFiles.map(async (filename) => {
        try {
          const filePath = path.join(planningDir, filename);
          const content = await fs.readFile(filePath, "utf-8");
          const data = JSON.parse(content);
          
          return {
            filename: filename,
            path: `planning/${filename}`,
            createdAt: data.metadata?.createdAt || null,
            userRequest: data.metadata?.userRequest || "",
            isClear: data.planning?.isClear || false,
            readyToExecute: data.planning?.readyToExecute || false,
            packages: data.planning?.plan?.packages || [],
            filesToModify: data.planning?.plan?.filesToModify?.length || 0,
            filesToCreate: data.planning?.plan?.filesToCreate?.length || 0,
          };
        } catch (error) {
          console.error(`Error reading planning file ${filename}:`, error);
          return null;
        }
      })
    );

    // null 제거 및 생성일 기준 정렬 (최신순)
    const validPlans = plans
      .filter((plan) => plan !== null)
      .sort((a, b) => {
        if (!a || !b) return 0;
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA; // 최신순
      });

    return NextResponse.json({
      success: true,
      plans: validPlans,
      count: validPlans.length,
    });
  } catch (error) {
    console.error("Error listing planning files:", error);
    return NextResponse.json(
      { error: "계획 목록을 불러올 수 없습니다.", details: String(error) },
      { status: 500 }
    );
  }
}

