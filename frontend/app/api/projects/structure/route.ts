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
    "vite.config.js",
    "vite.config.ts",
    "webpack.config.js",
    "webpack.config.ts",
    "craco.config.js",
    "craco.config.ts",
    "tailwind.config.js",
    "tailwind.config.ts",
    "README.md",
    ".env",
    ".env.local",
    ".env.development",
    ".env.development.local",
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

// 환경 변수 파일에서 포트 추출
function extractPortFromEnv(envContent: string): number | null {
  // PORT=3001 형식
  const portMatch = envContent.match(/^PORT\s*=\s*(\d+)/m);
  if (portMatch) {
    return parseInt(portMatch[1]);
  }
  // NEXT_PUBLIC_PORT=3001 형식
  const nextPortMatch = envContent.match(/^NEXT_PUBLIC_PORT\s*=\s*(\d+)/m);
  if (nextPortMatch) {
    return parseInt(nextPortMatch[1]);
  }
  return null;
}

// Next.js config에서 포트 추출
function extractPortFromNextConfig(configContent: string): number | null {
  try {
    // next.config.js/ts에서 포트 설정 찾기
    // 예: port: 3001 또는 PORT: 3001
    const portMatch = configContent.match(/(?:port|PORT)\s*[:=]\s*(\d+)/);
    if (portMatch) {
      return parseInt(portMatch[1]);
    }
  } catch {
    // 파싱 실패 시 무시
  }
  return null;
}

// Vite config에서 포트 추출
function extractPortFromViteConfig(configContent: string): number | null {
  try {
    // vite.config.js/ts에서 포트 설정 찾기
    // 예: server: { port: 3001 } 또는 port: 3001
    const serverPortMatch = configContent.match(/server\s*:\s*\{[^}]*port\s*:\s*(\d+)/s);
    if (serverPortMatch) {
      return parseInt(serverPortMatch[1]);
    }
    // 단순 port 설정
    const portMatch = configContent.match(/port\s*:\s*(\d+)/);
    if (portMatch) {
      return parseInt(portMatch[1]);
    }
  } catch {
    // 파싱 실패 시 무시
  }
  return null;
}

// Webpack config에서 포트 추출
function extractPortFromWebpackConfig(configContent: string): number | null {
  try {
    // webpack.config.js/ts에서 devServer.port 설정 찾기
    // 예: devServer: { port: 3001 }
    const devServerPortMatch = configContent.match(/devServer\s*:\s*\{[^}]*port\s*:\s*(\d+)/s);
    if (devServerPortMatch) {
      return parseInt(devServerPortMatch[1]);
    }
  } catch {
    // 파싱 실패 시 무시
  }
  return null;
}

// Craco config에서 포트 추출
function extractPortFromCracoConfig(configContent: string): number | null {
  try {
    // craco.config.js/ts에서 devServer.port 설정 찾기
    const devServerPortMatch = configContent.match(/devServer\s*:\s*\{[^}]*port\s*:\s*(\d+)/s);
    if (devServerPortMatch) {
      return parseInt(devServerPortMatch[1]);
    }
  } catch {
    // 파싱 실패 시 무시
  }
  return null;
}

// 프로젝트 타입 감지
// 개발 서버 정보 추출
function extractServerInfo(configFiles: Record<string, string>): {
  command: string;
  port: number;
  url: string;
} | null {
  if (configFiles["package.json"]) {
    try {
      const packageJson = JSON.parse(configFiles["package.json"]);
      const scripts = packageJson.scripts || {};
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      // 개발 서버 명령어 찾기
      let devCommand = scripts.dev || scripts.start || scripts.serve;
      let defaultPort = 3000;
      let projectType = "Unknown";
      
      if (dependencies["next"]) {
        projectType = "Next.js";
        devCommand = devCommand || "next dev";
        defaultPort = 3000;
      } else if (dependencies["react"] && dependencies["react-scripts"]) {
        projectType = "React (CRA)";
        devCommand = devCommand || "react-scripts start";
        defaultPort = 3000;
      } else if (dependencies["vite"]) {
        projectType = "Vite";
        devCommand = devCommand || "vite";
        defaultPort = 5173;
      } else if (dependencies["vue"]) {
        projectType = "Vue";
        devCommand = devCommand || "vue-cli-service serve";
        defaultPort = 8080;
      } else if (dependencies["@angular/core"]) {
        projectType = "Angular";
        devCommand = devCommand || "ng serve";
        defaultPort = 4200;
      } else if (dependencies["svelte"]) {
        projectType = "Svelte";
        devCommand = devCommand || "svelte-kit dev";
        defaultPort = 5173;
      }
      
      // 1. package.json scripts에서 포트 추출 (최우선)
      // 예: "dev": "next dev -p 3001"
      // 예: "dev": "next dev --port 3001"
      // 예: "dev": "PORT=3001 next dev"
      // 예: "dev": "next dev -p 3001"
      if (devCommand) {
        // 다양한 포트 지정 패턴 매칭
        const portPatterns = [
          /-p\s+(\d+)/,                    // -p 3001
          /--port\s+(\d+)/,                // --port 3001
          /PORT\s*=\s*(\d+)/,             // PORT=3001
          /port\s*[:=]\s*(\d+)/i,          // port: 3001 또는 port=3001
        ];
        
        for (const pattern of portPatterns) {
          const match = devCommand.match(pattern);
          if (match && match[1]) {
            defaultPort = parseInt(match[1]);
            break; // 첫 번째 매칭된 포트 사용
          }
        }
      }
      
      // 2. .env 파일에서 포트 추출
      const envFiles = [".env.local", ".env.development.local", ".env.development", ".env"];
      for (const envFile of envFiles) {
        if (configFiles[envFile]) {
          const envPort = extractPortFromEnv(configFiles[envFile]);
          if (envPort) {
            defaultPort = envPort;
            break;
          }
        }
      }
      
      // 3. 프로젝트 타입별 설정 파일에서 포트 추출
      if (projectType === "Next.js") {
        // Next.js: next.config.js/ts
        const nextConfigFiles = ["next.config.ts", "next.config.js"];
        for (const configFile of nextConfigFiles) {
          if (configFiles[configFile]) {
            const configPort = extractPortFromNextConfig(configFiles[configFile]);
            if (configPort) {
              defaultPort = configPort;
              break;
            }
          }
        }
      } else if (projectType === "Vite") {
        // Vite: vite.config.js/ts
        const viteConfigFiles = ["vite.config.ts", "vite.config.js"];
        for (const configFile of viteConfigFiles) {
          if (configFiles[configFile]) {
            const configPort = extractPortFromViteConfig(configFiles[configFile]);
            if (configPort) {
              defaultPort = configPort;
              break;
            }
          }
        }
        // Vite는 .env에서 VITE_PORT도 확인
        for (const envFile of envFiles) {
          if (configFiles[envFile]) {
            const vitePortMatch = configFiles[envFile].match(/^VITE_PORT\s*=\s*(\d+)/m);
            if (vitePortMatch) {
              defaultPort = parseInt(vitePortMatch[1]);
              break;
            }
          }
        }
      } else if (projectType === "React (CRA)") {
        // Create React App: craco.config.js/ts 또는 webpack.config.js
        const cracoConfigFiles = ["craco.config.ts", "craco.config.js"];
        for (const configFile of cracoConfigFiles) {
          if (configFiles[configFile]) {
            const configPort = extractPortFromCracoConfig(configFiles[configFile]);
            if (configPort) {
              defaultPort = configPort;
              break;
            }
          }
        }
        // webpack.config.js도 확인
        const webpackConfigFiles = ["webpack.config.ts", "webpack.config.js"];
        for (const configFile of webpackConfigFiles) {
          if (configFiles[configFile]) {
            const configPort = extractPortFromWebpackConfig(configFiles[configFile]);
            if (configPort) {
              defaultPort = configPort;
              break;
            }
          }
        }
      } else {
        // 기타 React 프로젝트: webpack.config.js
        const webpackConfigFiles = ["webpack.config.ts", "webpack.config.js"];
        for (const configFile of webpackConfigFiles) {
          if (configFiles[configFile]) {
            const configPort = extractPortFromWebpackConfig(configFiles[configFile]);
            if (configPort) {
              defaultPort = configPort;
              break;
            }
          }
        }
      }
      
      if (devCommand) {
        return {
          command: devCommand,
          port: defaultPort,
          url: `http://localhost:${defaultPort}`,
        };
      }
    } catch {
      // JSON 파싱 실패 시 무시
    }
  }
  return null;
}

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
    
    // 개발 서버 정보 추출
    const serverInfo = extractServerInfo(configFiles);

    return NextResponse.json({
      tree,
      treeText,
      configFiles,
      projectType,
      serverInfo, // 개발 서버 정보 추가
    });
  } catch (error) {
    console.error("Error getting project structure:", error);
    return NextResponse.json(
      { error: "프로젝트 구조를 가져올 수 없습니다." },
      { status: 500 }
    );
  }
}

