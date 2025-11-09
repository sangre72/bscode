import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

export async function DELETE(request: NextRequest) {
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

    // 파일 삭제
    try {
      await fs.unlink(filePath);
      return NextResponse.json({
        success: true,
        message: "계획이 성공적으로 삭제되었습니다.",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json(
          { error: "파일을 찾을 수 없습니다." },
          { status: 404 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Error deleting planning file:", error);
    return NextResponse.json(
      { error: "계획 파일을 삭제할 수 없습니다.", details: String(error) },
      { status: 500 }
    );
  }
}

