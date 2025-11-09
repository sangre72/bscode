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
  "planning", // planning 디렉토리도 제외
];

function shouldIgnore(name: string): boolean {
  return IGNORE_PATTERNS.some((pattern) => name.includes(pattern));
}

async function buildFileTree(dirPath: string, basePath: string, maxDepth: number = 5, currentDepth: number = 0): Promise<FileNode[]> {
  if (currentDepth >= maxDepth) {
    return [];
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      if (shouldIgnore(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      if (entry.isDirectory()) {
        const children = await buildFileTree(fullPath, basePath, maxDepth, currentDepth + 1);
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

// 파일 트리를 텍스트 형식으로 변환
function treeToText(nodes: FileNode[], indent: string = ""): string {
  let result = "";
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const currentIndent = indent + (isLast ? "└── " : "├── ");
    const nextIndent = indent + (isLast ? "    " : "│   ");
    
    result += currentIndent + node.name;
    if (node.type === "directory") {
      result += "/";
    }
    result += "\n";
    
    if (node.children && node.children.length > 0) {
      result += treeToText(node.children, nextIndent);
    }
  }
  return result;
}

// 주요 설정 파일 읽기
async function readConfigFiles(projectPath: string): Promise<Record<string, string>> {
  const configFiles: Record<string, string> = {};
  const importantFiles = [
    "package.json",
    "tsconfig.json",
    "next.config.js",
    "next.config.ts",
    "tailwind.config.js",
    "tailwind.config.ts",
    "README.md",
  ];

  for (const fileName of importantFiles) {
    try {
      const filePath = path.join(projectPath, fileName);
      const content = await fs.readFile(filePath, "utf-8");
      configFiles[fileName] = content;
    } catch {
      // 파일이 없으면 무시
    }
  }

  return configFiles;
}

// 프로젝트 타입 감지
function detectProjectType(configFiles: Record<string, string>): string {
  if (configFiles["package.json"]) {
    try {
      const packageJson = JSON.parse(configFiles["package.json"]);
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      if (dependencies["next"]) {
        return "Next.js";
      } else if (dependencies["react"]) {
        return "React";
      } else if (dependencies["vue"]) {
        return "Vue";
      } else if (dependencies["angular"]) {
        return "Angular";
      } else if (dependencies["svelte"]) {
        return "Svelte";
      }
    } catch {
      // JSON 파싱 실패 시 무시
    }
  }
  return "Unknown";
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

    // 파일 트리 생성
    const tree = await buildFileTree(projectPath, projectPath);
    
    // 트리를 텍스트 형식으로 변환
    const treeText = treeToText(tree);
    
    // 주요 설정 파일 읽기
    const configFiles = await readConfigFiles(projectPath);
    
    // 프로젝트 타입 감지
    const projectType = detectProjectType(configFiles);

    return NextResponse.json({
      tree,
      treeText,
      configFiles,
      projectType,
    });
  } catch (error) {
    console.error("Error getting project structure:", error);
    return NextResponse.json(
      { error: "프로젝트 구조를 가져올 수 없습니다." },
      { status: 500 }
    );
  }
}

