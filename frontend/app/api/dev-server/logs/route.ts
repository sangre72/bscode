import { NextRequest, NextResponse } from "next/server";

// 서버 로그를 저장하는 맵
export const serverLogs = new Map<string, string[]>();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectPath = searchParams.get("projectPath");

    if (!projectPath) {
      return NextResponse.json(
        { error: "프로젝트 경로가 필요합니다." },
        { status: 400 }
      );
    }

    const logs = serverLogs.get(projectPath) || [];

    return NextResponse.json({
      logs: logs.slice(-100), // 최근 100개만 반환
    });
  } catch (error) {
    console.error("로그 가져오기 오류:", error);
    return NextResponse.json(
      { error: "로그를 가져올 수 없습니다.", details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { projectPath } = await request.json();

    if (!projectPath) {
      return NextResponse.json(
        { error: "프로젝트 경로가 필요합니다." },
        { status: 400 }
      );
    }

    serverLogs.delete(projectPath);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("로그 삭제 오류:", error);
    return NextResponse.json(
      { error: "로그를 삭제할 수 없습니다.", details: String(error) },
      { status: 500 }
    );
  }
}
