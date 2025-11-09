import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const { fileName, projectPath, searchPattern, fileTypes } = await request.json();

    if (!projectPath) {
      return NextResponse.json(
        { error: "프로젝트 경로가 필요합니다." },
        { status: 400 }
      );
    }

    const foundFiles: Array<{ path: string; name: string; type: string }> = [];

    // 검색 함수
    async function searchDirectory(
      dir: string,
      maxDepth: number = 5,
      currentDepth: number = 0
    ): Promise<void> {
      if (currentDepth >= maxDepth) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          // 무시할 디렉토리
          if (
            entry.name === "node_modules" ||
            entry.name === ".next" ||
            entry.name === ".git" ||
            entry.name === "dist" ||
            entry.name === "build" ||
            entry.name === ".cache" ||
            entry.name.startsWith(".")
          ) {
            continue;
          }

          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(projectPath, fullPath);

          if (entry.isDirectory()) {
            await searchDirectory(fullPath, maxDepth, currentDepth + 1);
          } else if (entry.isFile()) {
            // 파일명 매칭
            if (fileName) {
              // 정확한 파일명 매칭
              if (entry.name === fileName || entry.name.toLowerCase() === fileName.toLowerCase()) {
                foundFiles.push({
                  path: relativePath,
                  name: entry.name,
                  type: "exact",
                });
              }
              // 부분 매칭 (예: "TiptapEditor" -> "TiptapEditor.tsx", "TiptapEditor.ts")
              else if (
                entry.name.toLowerCase().includes(fileName.toLowerCase()) ||
                fileName.toLowerCase().includes(entry.name.split(".")[0].toLowerCase())
              ) {
                foundFiles.push({
                  path: relativePath,
                  name: entry.name,
                  type: "partial",
                });
              }
            }

            // 패턴 매칭
            if (searchPattern) {
              const regex = new RegExp(searchPattern, "i");
              if (regex.test(entry.name) || regex.test(relativePath)) {
                foundFiles.push({
                  path: relativePath,
                  name: entry.name,
                  type: "pattern",
                });
              }
            }

            // 파일 타입 필터링
            if (fileTypes && fileTypes.length > 0) {
              const ext = path.extname(entry.name).toLowerCase();
              if (fileTypes.includes(ext)) {
                foundFiles.push({
                  path: relativePath,
                  name: entry.name,
                  type: "type",
                });
              }
            }
          }
        }
      } catch (error) {
        // 권한 오류 등은 무시
        console.error(`Error searching ${dir}:`, error);
      }
    }

    // 검색 실행
    await searchDirectory(projectPath);

    // 중복 제거 및 정렬 (정확한 매칭 우선)
    const uniqueFiles = Array.from(
      new Map(foundFiles.map((f) => [f.path, f])).values()
    ).sort((a, b) => {
      const typeOrder = { exact: 0, partial: 1, pattern: 2, type: 3 };
      return typeOrder[a.type as keyof typeof typeOrder] - typeOrder[b.type as keyof typeof typeOrder];
    });

    return NextResponse.json({
      files: uniqueFiles.slice(0, 20), // 최대 20개
      total: uniqueFiles.length,
    });
  } catch (error) {
    console.error("Error searching files:", error);
    return NextResponse.json(
      { error: "파일 검색 중 오류가 발생했습니다.", details: String(error) },
      { status: 500 }
    );
  }
}

