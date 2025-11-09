import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

// 무시할 디렉토리/파일 목록
const IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".DS_Store",
  ".env",
  ".env.local",
  ".cache",
  "coverage",
  ".vscode",
  ".idea",
];

function shouldIgnore(name: string): boolean {
  return IGNORE_PATTERNS.some((pattern) => name.includes(pattern));
}

async function buildFileTree(dirPath: string, basePath: string): Promise<FileNode[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      if (shouldIgnore(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      if (entry.isDirectory()) {
        const children = await buildFileTree(fullPath, basePath);
        nodes.push({
          name: entry.name,
          path: relativePath,
          type: "directory",
          children: children.length > 0 ? children : undefined,
        });
      } else {
        nodes.push({
          name: entry.name,
          path: relativePath,
          type: "file",
        });
      }
    }

    // 디렉토리 먼저, 그 다음 파일 정렬
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
    return [];
  }
}

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

    // 경로 검증
    try {
      const stats = await fs.stat(projectPath);
      if (!stats.isDirectory()) {
        return NextResponse.json(
          { error: "유효한 디렉토리가 아닙니다." },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "디렉토리를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const tree = await buildFileTree(projectPath, projectPath);

    return NextResponse.json({ tree });
  } catch (error) {
    console.error("Error building file tree:", error);
    return NextResponse.json(
      { error: "파일 트리를 생성할 수 없습니다." },
      { status: 500 }
    );
  }
}

