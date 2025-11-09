import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const PROJECTS_DIR = path.join(process.cwd(), "recent-projects");

// 프로젝트 프로필 저장
export async function POST(request: NextRequest) {
  try {
    const { projectPath, profile, summary } = await request.json();

    if (!projectPath || !profile) {
      return NextResponse.json(
        { error: "프로젝트 경로와 프로필이 필요합니다." },
        { status: 400 }
      );
    }

    // recent-projects 디렉토리가 없으면 생성
    try {
      await fs.access(PROJECTS_DIR);
    } catch {
      await fs.mkdir(PROJECTS_DIR, { recursive: true });
    }

    // 프로젝트 경로를 기반으로 파일명 생성
    const projectName = path.basename(projectPath);
    const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "_");
    const profileFileName = `${safeName}_profile.md`;
    const summaryFileName = summary ? `${safeName}_summary.md` : null;
    const profilePath = path.join(PROJECTS_DIR, profileFileName);
    const summaryPath = summaryFileName ? path.join(PROJECTS_DIR, summaryFileName) : null;

    // 프로필 저장
    await fs.writeFile(profilePath, profile, "utf-8");

    // 요약본이 있으면 저장
    if (summary && summaryPath) {
      await fs.writeFile(summaryPath, summary, "utf-8");
    }

    // 메타데이터 저장
    const metadata = {
      projectPath,
      profileFile: profileFileName,
      summaryFile: summaryFileName,
      updatedAt: new Date().toISOString(),
    };
    const metadataFileName = `${safeName}_profile_meta.json`;
    const metadataPath = path.join(PROJECTS_DIR, metadataFileName);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");

    return NextResponse.json({
      success: true,
      profileFile: profileFileName,
      summaryFile: summaryFileName,
      message: "프로젝트 프로필이 저장되었습니다.",
    });
  } catch (error) {
    console.error("Error saving project profile:", error);
    return NextResponse.json(
      { error: "프로젝트 프로필을 저장할 수 없습니다." },
      { status: 500 }
    );
  }
}

// 프로젝트 프로필 조회
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectPath = searchParams.get("path");

    if (!projectPath) {
      return NextResponse.json(
        { error: "프로젝트 경로가 필요합니다." },
        { status: 400 }
      );
    }

    // recent-projects 디렉토리 확인
    try {
      await fs.access(PROJECTS_DIR);
    } catch {
      return NextResponse.json({ profile: null, summary: null });
    }

    // 프로젝트 경로를 기반으로 파일명 생성
    const projectName = path.basename(projectPath);
    const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "_");
    const metadataFileName = `${safeName}_profile_meta.json`;
    const metadataPath = path.join(PROJECTS_DIR, metadataFileName);

    try {
      const metadataContent = await fs.readFile(metadataPath, "utf-8");
      const metadata = JSON.parse(metadataContent);

      const profilePath = path.join(PROJECTS_DIR, metadata.profileFile);
      const summaryPath = metadata.summaryFile 
        ? path.join(PROJECTS_DIR, metadata.summaryFile)
        : null;

      const profile = await fs.readFile(profilePath, "utf-8");
      const summary = summaryPath ? await fs.readFile(summaryPath, "utf-8") : null;

      return NextResponse.json({
        profile,
        summary,
        metadata,
      });
    } catch {
      return NextResponse.json({ profile: null, summary: null });
    }
  } catch (error) {
    console.error("Error reading project profile:", error);
    return NextResponse.json(
      { error: "프로젝트 프로필을 읽을 수 없습니다." },
      { status: 500 }
    );
  }
}

