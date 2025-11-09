import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const { filePath, projectPath, purpose } = await request.json();

    if (!filePath || !projectPath) {
      return NextResponse.json(
        { error: "파일 경로와 프로젝트 경로가 필요합니다." },
        { status: 400 }
      );
    }

    const fullPath = path.join(projectPath, filePath);
    const fileDir = path.dirname(fullPath);
    const fileName = path.basename(fullPath);
    const fileExt = path.extname(fileName).toLowerCase();

    // 파일 내용 읽기
    let fileContent = "";
    try {
      fileContent = await fs.readFile(fullPath, "utf-8");
    } catch {
      return NextResponse.json(
        { error: "파일을 읽을 수 없습니다." },
        { status: 404 }
      );
    }

    const relatedFiles: Array<{
      path: string;
      name: string;
      reason: string;
      projectPath: string;
      content?: string;
    }> = [];

    // TypeScript/JavaScript 파일의 경우 import 관계 분석
    if ([".ts", ".tsx", ".js", ".jsx"].includes(fileExt)) {
      // 1. 이 파일이 import하는 파일들 찾기 (의존성)
      const imports = extractImports(fileContent, fileDir, projectPath);
      for (const importPath of imports) {
        try {
          // 상대 경로를 절대 경로로 변환
          let importFullPath: string;
          if (path.isAbsolute(importPath)) {
            importFullPath = importPath;
          } else {
            // 상대 경로 처리 (./ 또는 ../)
            importFullPath = path.resolve(fileDir, importPath);
            
            // 확장자가 없으면 .ts, .tsx, .js, .jsx 시도
            if (!path.extname(importFullPath)) {
              const extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];
              let found = false;
              for (const ext of extensions) {
                const testPath = importFullPath + ext;
                try {
                  const stats = await fs.stat(testPath);
                  if (stats.isFile()) {
                    importFullPath = testPath;
                    found = true;
                    break;
                  }
                } catch {
                  // 계속 시도
                }
              }
              if (!found) {
                // 확장자 없이도 시도
                try {
                  await fs.stat(importFullPath);
                } catch {
                  continue; // 파일이 없으면 스킵
                }
              }
            }
          }
          
          if (importFullPath.startsWith(projectPath)) {
            const stats = await fs.stat(importFullPath);
            if (stats.isFile()) {
              const relativePath = path.relative(projectPath, importFullPath);
              try {
                const content = await fs.readFile(importFullPath, "utf-8");
                relatedFiles.push({
                  path: relativePath,
                  name: path.basename(relativePath),
                  reason: "이 파일이 import하는 파일",
                  projectPath: projectPath,
                  content,
                });
              } catch {
                // 읽을 수 없는 파일은 경로만 추가
                relatedFiles.push({
                  path: relativePath,
                  name: path.basename(relativePath),
                  reason: "이 파일이 import하는 파일 (읽기 실패)",
                  projectPath: projectPath,
                });
              }
            }
          }
        } catch {
          // 무시
        }
      }

      // 2. 이 파일을 import하는 파일들 찾기 (사용처)
      const filesUsingThis = await findFilesUsingThis(
        fullPath,
        projectPath,
        filePath
      );
      for (const usingFile of filesUsingThis.slice(0, 10)) {
        // 최대 10개만
        try {
          const content = await fs.readFile(usingFile, "utf-8");
          const relativePath = path.relative(projectPath, usingFile);
          relatedFiles.push({
            path: relativePath,
            name: path.basename(relativePath),
            reason: "이 파일을 import하는 파일",
            projectPath: projectPath,
            content,
          });
        } catch {
          // 무시
        }
      }
    }

    // 3. 설정 파일 찾기 (프로젝트 루트 기준)
    const configFiles = [
      "package.json",
      "tsconfig.json",
      "next.config.js",
      "next.config.ts",
      ".eslintrc.json",
      ".eslintrc.js",
      "tailwind.config.js",
      "tailwind.config.ts",
    ];

    for (const configFile of configFiles) {
      const configPath = path.join(projectPath, configFile);
      try {
        const stats = await fs.stat(configPath);
        if (stats.isFile()) {
          const content = await fs.readFile(configPath, "utf-8");
          relatedFiles.push({
            path: configFile,
            name: configFile,
            reason: "프로젝트 설정 파일",
            projectPath: projectPath,
            content,
          });
        }
      } catch {
        // 무시
      }
    }

    // 4. 같은 디렉토리의 관련 파일들 (예: 컴포넌트와 스타일 파일)
    if (purpose === "component" || purpose === "style") {
      const dirFiles = await fs.readdir(fileDir);
      const baseName = fileName.replace(/\.[^/.]+$/, "");
      
      for (const dirFile of dirFiles) {
        if (dirFile === fileName) continue;
        
        const dirFilePath = path.join(fileDir, dirFile);
        const stats = await fs.stat(dirFilePath);
        if (stats.isFile()) {
          const dirFileBaseName = dirFile.replace(/\.[^/.]+$/, "");
          if (dirFileBaseName === baseName) {
            // 같은 이름의 다른 확장자 파일 (예: Component.tsx와 Component.css)
            try {
              const content = await fs.readFile(dirFilePath, "utf-8");
              const relativePath = path.relative(projectPath, dirFilePath);
              relatedFiles.push({
                path: relativePath,
                name: dirFile,
                reason: "같은 이름의 관련 파일",
                projectPath: projectPath,
                content,
              });
            } catch {
              // 무시
            }
          }
        }
      }
    }

    return NextResponse.json({
      relatedFiles,
      total: relatedFiles.length,
    });
  } catch (error) {
    console.error("Error finding related files:", error);
    return NextResponse.json(
      { error: "연관 파일을 찾을 수 없습니다.", details: String(error) },
      { status: 500 }
    );
  }
}

// import 문에서 경로 추출
function extractImports(
  content: string,
  fileDir: string,
  projectPath: string
): string[] {
  const imports: string[] = [];
  
  // ES6 import
  const es6ImportRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = es6ImportRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
      // node_modules 모듈은 제외
      continue;
    }
    imports.push(importPath);
  }

  // require
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
      continue;
    }
    imports.push(importPath);
  }

  return imports;
}

// 이 파일을 사용하는 파일들 찾기
async function findFilesUsingThis(
  targetFile: string,
  projectPath: string,
  targetRelativePath: string
): Promise<string[]> {
  const usingFiles: string[] = [];
  const targetFileName = path.basename(targetFile);
  const targetNameWithoutExt = targetFileName.replace(/\.[^/.]+$/, "");

  async function searchDirectory(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.name === "node_modules" ||
          entry.name === ".next" ||
          entry.name === ".git" ||
          entry.name === "dist" ||
          entry.name === "build"
        ) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await searchDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
            try {
              const content = await fs.readFile(fullPath, "utf-8");
              
              // 파일 경로나 이름으로 검색
              const relativePath = path.relative(projectPath, fullPath);
              const normalizedTarget = targetRelativePath.replace(/\\/g, "/");
              const normalizedRelative = relativePath.replace(/\\/g, "/");
              
              if (
                content.includes(targetFileName) ||
                content.includes(targetNameWithoutExt) ||
                content.includes(normalizedTarget) ||
                content.includes(`./${targetFileName}`) ||
                content.includes(`../${targetFileName}`)
              ) {
                // 실제로 import하는지 확인
                const importRegex = new RegExp(
                  `(?:import|require).*['"]\\.?/?[^'"]*${targetNameWithoutExt}[^'"]*['"]`,
                  "g"
                );
                if (importRegex.test(content)) {
                  usingFiles.push(fullPath);
                }
              }
            } catch {
              // 무시
            }
          }
        }
      }
    } catch {
      // 무시
    }
  }

  await searchDirectory(projectPath);
  return usingFiles;
}

