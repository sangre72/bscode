import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const PROJECTS_DIR = path.join(process.cwd(), "recent-projects");

interface ProjectInfo {
  name: string;
  path: string;
  lastAccessed: string;
}

// 프로젝트 목록 조회
export async function GET() {
  try {
    // recent-projects 디렉토리가 없으면 생성
    try {
      await fs.access(PROJECTS_DIR);
    } catch {
      await fs.mkdir(PROJECTS_DIR, { recursive: true });
    }

    const files = await fs.readdir(PROJECTS_DIR);
    const projects: ProjectInfo[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(PROJECTS_DIR, file);
        const content = await fs.readFile(filePath, "utf-8");
        const projectInfo: ProjectInfo = JSON.parse(content);
        projects.push(projectInfo);
      }
    }

    // 최근 접근 순으로 정렬
    projects.sort(
      (a, b) =>
        new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
    );

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error reading projects:", error);
    return NextResponse.json(
      { error: "프로젝트 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

// 프로젝트 추가/업데이트
export async function POST(request: NextRequest) {
  try {
    const { name, projectPath } = await request.json();

    if (!name || !projectPath) {
      return NextResponse.json(
        { error: "프로젝트 이름과 경로가 필요합니다." },
        { status: 400 }
      );
    }

    // recent-projects 디렉토리가 없으면 생성
    try {
      await fs.access(PROJECTS_DIR);
    } catch {
      await fs.mkdir(PROJECTS_DIR, { recursive: true });
    }

    const projectInfo: ProjectInfo = {
      name,
      path: projectPath,
      lastAccessed: new Date().toISOString(),
    };

    // 파일명은 프로젝트 이름을 기반으로 (특수문자 제거)
    const fileName = name.replace(/[^a-zA-Z0-9-_]/g, "_") + ".json";
    const filePath = path.join(PROJECTS_DIR, fileName);

    await fs.writeFile(filePath, JSON.stringify(projectInfo, null, 2));

    return NextResponse.json({ success: true, project: projectInfo });
  } catch (error) {
    console.error("Error saving project:", error);
    return NextResponse.json(
      { error: "프로젝트를 저장할 수 없습니다." },
      { status: 500 }
    );
  }
}

// 프로젝트 접근 시간 업데이트
export async function PUT(request: NextRequest) {
  try {
    const { name } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: "프로젝트 이름이 필요합니다." },
        { status: 400 }
      );
    }

    const fileName = name.replace(/[^a-zA-Z0-9-_]/g, "_") + ".json";
    const filePath = path.join(PROJECTS_DIR, fileName);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const projectInfo: ProjectInfo = JSON.parse(content);
      projectInfo.lastAccessed = new Date().toISOString();

      await fs.writeFile(filePath, JSON.stringify(projectInfo, null, 2));

      return NextResponse.json({ success: true, project: projectInfo });
    } catch {
      return NextResponse.json(
        { error: "프로젝트를 찾을 수 없습니다." },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error("Error updating project:", error);
    return NextResponse.json(
      { error: "프로젝트를 업데이트할 수 없습니다." },
      { status: 500 }
    );
  }
}

