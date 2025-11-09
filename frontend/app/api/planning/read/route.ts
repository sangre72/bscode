import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectPath = searchParams.get("projectPath");
    const filename = searchParams.get("filename");

    if (!projectPath || !filename) {
      return NextResponse.json(
        { error: "프로젝트 경로와 파일명이 필요합니다." },
        { status: 400 }
      );
    }

    // 파일 경로 생성
    const filePath = path.join(projectPath, "planning", filename);

    // 경로 검증 (보안)
    const planningDir = path.join(projectPath, "planning");
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(planningDir);
    
    if (!resolvedPath.startsWith(resolvedDir)) {
      return NextResponse.json(
        { error: "잘못된 파일 경로입니다." },
        { status: 400 }
      );
    }

    // 파일 읽기
    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content);

    return NextResponse.json({
      success: true,
      planning: data,
    });
  } catch (error) {
    console.error("Error reading planning file:", error);
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json(
        { error: "파일을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "계획 파일을 읽을 수 없습니다.", details: String(error) },
      { status: 500 }
    );
  }
}

