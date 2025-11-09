import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const CURRENT_PROJECT_FILE = path.join(
  process.cwd(),
  "recent-projects",
  ".current"
);

// 현재 프로젝트 조회
export async function GET() {
  try {
    try {
      const content = await fs.readFile(CURRENT_PROJECT_FILE, "utf-8");
      const projectInfo = JSON.parse(content);
      return NextResponse.json({ project: projectInfo });
    } catch {
      return NextResponse.json({ project: null });
    }
  } catch (error) {
    console.error("Error reading current project:", error);
    return NextResponse.json(
      { error: "현재 프로젝트를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

// 현재 프로젝트 설정
export async function POST(request: NextRequest) {
  try {
    const { name, projectPath } = await request.json();

    if (!name || !projectPath) {
      return NextResponse.json(
        { error: "프로젝트 이름과 경로가 필요합니다." },
        { status: 400 }
      );
    }

    const projectInfo = {
      name,
      path: projectPath,
      lastAccessed: new Date().toISOString(),
    };

    await fs.writeFile(
      CURRENT_PROJECT_FILE,
      JSON.stringify(projectInfo, null, 2)
    );

    return NextResponse.json({ success: true, project: projectInfo });
  } catch (error) {
    console.error("Error setting current project:", error);
    return NextResponse.json(
      { error: "현재 프로젝트를 설정할 수 없습니다." },
      { status: 500 }
    );
  }
}

