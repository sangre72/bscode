import { promises as fs, readFileSync, statSync } from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import * as ts from "typescript";

export async function POST(request: NextRequest) {
  try {
    const { filePath, projectPath, content } = await request.json();

    if (!filePath || !projectPath) {
      return NextResponse.json(
        { error: "파일 경로와 프로젝트 경로가 필요합니다." },
        { status: 400 }
      );
    }

    const fullPath = path.join(projectPath, filePath);

    // tsconfig.json 찾기
    let tsconfigPath = path.join(projectPath, "tsconfig.json");
    let configDir = projectPath;

    // 상위 디렉토리에서 tsconfig.json 찾기
    let currentDir = projectPath;
    while (currentDir !== path.dirname(currentDir)) {
      const candidate = path.join(currentDir, "tsconfig.json");
      try {
        await fs.access(candidate);
        tsconfigPath = candidate;
        configDir = currentDir;
        break;
      } catch {
        currentDir = path.dirname(currentDir);
      }
    }

    // tsconfig.json 읽기
    let compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    };

    try {
      const configFileContent = await fs.readFile(tsconfigPath, "utf-8");
      const configFile = ts.readConfigFile(tsconfigPath, () => configFileContent);
      const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        configDir
      );
      compilerOptions = parsed.options;
    } catch (error) {
      console.warn("tsconfig.json을 읽을 수 없습니다. 기본 설정을 사용합니다.", error);
    }

    // 파일 캐시
    const fileCache = new Map<string, string>();
    fileCache.set(fullPath, content || "");

    // Next.js 및 기타 프레임워크 타입 정의 추가
    const nextTypes = `
      declare module "next" {
        export type Metadata = {
          title?: string;
          description?: string;
          [key: string]: any;
        };
        export type { Metadata };
      }
      declare module "next/font/google" {
        export function Geist(options: { variable: string; subsets: string[] }): {
          variable: string;
          className: string;
        };
        export function Geist_Mono(options: { variable: string; subsets: string[] }): {
          variable: string;
          className: string;
        };
      }
      declare module "next/dynamic" {
        import { ComponentType } from "react";
        export default function dynamic<T extends ComponentType<any>>(
          loader: () => Promise<{ default: T }>,
          options?: { ssr?: boolean }
        ): T;
      }
      declare module "react" {
        export type ReactNode = any;
        export type Readonly<T> = T;
      }
    `;
    
    // 타입 정의 파일을 캐시에 추가
    // Next.js 타입 정의
    fileCache.set(path.join(configDir, "node_modules/@types/next.d.ts"), nextTypes);
    fileCache.set(path.join(configDir, "node_modules/next/index.d.ts"), nextTypes);
    
    // React 타입 정의
    const reactTypes = `
      declare module "react" {
        export type ReactNode = any;
        export type Readonly<T> = T;
        export type ComponentType<P = {}> = any;
        export default any;
      }
    `;
    fileCache.set(path.join(configDir, "node_modules/@types/react.d.ts"), reactTypes);
    
    // node_modules에서 타입 정의 파일 재귀적으로 찾기
    const nodeModulesPath = path.join(configDir, "node_modules");
    const findAllTypeFiles = async (dir: string, maxDepth: number = 3, currentDepth: number = 0): Promise<void> => {
      if (currentDepth >= maxDepth) return;
      
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            // 중요한 패키지 디렉토리만 탐색
            if (
              entry.name === "next" ||
              entry.name === "react" ||
              entry.name === "@types" ||
              entry.name.startsWith("@types/") ||
              entry.name === "@react" ||
              entry.name.startsWith("@react/")
            ) {
              await findAllTypeFiles(fullPath, maxDepth, currentDepth + 1);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (ext === ".d.ts" || ext === ".ts" || (ext === ".tsx" && entry.name.includes(".d."))) {
              try {
                const content = await fs.readFile(fullPath, "utf-8");
                fileCache.set(fullPath, content);
              } catch {
                // 무시
              }
            }
          }
        }
      } catch {
        // 무시
      }
    };

    // node_modules에서 타입 파일 수집
    try {
      await findAllTypeFiles(nodeModulesPath);
    } catch {
      // node_modules가 없을 수 있음
    }

    // 특정 경로에서 타입 파일 읽기 시도
    const tryReadTypes = async (filePath: string) => {
      try {
        const fullPath = path.join(nodeModulesPath, filePath);
        const content = await fs.readFile(fullPath, "utf-8");
        fileCache.set(fullPath, content);
        // 정규화된 경로로도 저장
        const normalized = path.normalize(fullPath);
        if (normalized !== fullPath) {
          fileCache.set(normalized, content);
        }
        return true;
      } catch {
        return false;
      }
    };
    
    // Next.js의 실제 타입 파일들 찾기 (더 깊이 탐색)
    const findNextTypes = async (dir: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && (entry.name === "types" || entry.name === "dist" || entry.name === "shared")) {
            await findAllTypeFiles(fullPath, 10, 0); // 더 깊이 탐색
          }
        }
      } catch {
        // 무시
      }
    };
    
    const nextPath = path.join(nodeModulesPath, "next");
    try {
      await findNextTypes(nextPath);
      // Next.js types 디렉토리 전체 탐색
      const nextTypesPath = path.join(nextPath, "types");
      await findAllTypeFiles(nextTypesPath, 10, 0);
      // Next.js dist 디렉토리 전체 탐색
      const nextDistPath = path.join(nextPath, "dist");
      await findAllTypeFiles(nextDistPath, 10, 0);
    } catch {
      // 무시
    }
    
    // 주요 타입 정의 파일 읽기 (여러 경로 시도)
    const typeFilePaths = [
      "next/types/index.d.ts",
      "next/types/global.d.ts",
      "next/types/compiled.d.ts",
      "next/index.d.ts",
      "next/app.d.ts",
      "next/server.d.ts",
      "next/font/index.d.ts",
      "next/font/google/index.d.ts",
      "next/font/local/index.d.ts",
      "next/dist/shared/lib/metadata.d.ts",
      "next/dist/shared/lib/metadata/types.d.ts",
      "next/dist/shared/lib/font/google/index.d.ts",
      "next/dist/shared/lib/font/index.d.ts",
      "next/dist/compiled/@next/font/dist/google/index.d.ts",
      "@types/react/index.d.ts",
      "@types/react/ts5.0/index.d.ts",
      "@types/react-dom/index.d.ts",
      "@types/node/index.d.ts",
    ];
    
    for (const typePath of typeFilePaths) {
      await tryReadTypes(typePath);
    }
    
    // Next.js font/google의 실제 타입 파일도 직접 읽기
    const fontGooglePath = path.join(nodeModulesPath, "next", "font", "google", "index.d.ts");
    try {
      const fontGoogleContent = await fs.readFile(fontGooglePath, "utf-8");
      fileCache.set(fontGooglePath, fontGoogleContent);
      // 모듈 이름으로도 매핑
      fileCache.set("next/font/google", fontGoogleContent);
      fileCache.set("next/font/google/index.d.ts", fontGoogleContent);
    } catch {
      // 무시
    }
    
    // Next.js 메인 타입 파일도 읽기
    const nextMainPath = path.join(nodeModulesPath, "next", "index.d.ts");
    try {
      const nextMainContent = await fs.readFile(nextMainPath, "utf-8");
      fileCache.set(nextMainPath, nextMainContent);
      fileCache.set("next", nextMainContent);
      fileCache.set("next/index.d.ts", nextMainContent);
    } catch {
      // 무시
    }
    
    // React 타입도 찾기
    const reactTypesPath = path.join(nodeModulesPath, "@types", "react");
    try {
      await findAllTypeFiles(reactTypesPath, 5, 0);
    } catch {
      // 무시
    }

    // 프로젝트의 TypeScript/JavaScript 파일들 찾기
    const findAllTsFiles = async (dir: string): Promise<string[]> => {
      const files: string[] = [];
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
            const subFiles = await findAllTsFiles(fullPath);
            files.push(...subFiles);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if ([".ts", ".tsx", ".js", ".jsx", ".d.ts"].includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch {
        // 무시
      }
      return files;
    };

    const projectFiles = await findAllTsFiles(configDir);
    
    // 파일들을 캐시에 로드 (더 많은 파일 로드)
    for (const file of projectFiles.slice(0, 500)) { // 최대 500개 파일 로드
      try {
        const fileContent = await fs.readFile(file, "utf-8");
        fileCache.set(file, fileContent);
      } catch {
        // 무시
      }
    }
    
    // next-env.d.ts 파일도 읽기
    const nextEnvPath = path.join(configDir, "next-env.d.ts");
    try {
      const nextEnvContent = await fs.readFile(nextEnvPath, "utf-8");
      fileCache.set(nextEnvPath, nextEnvContent);
    } catch {
      // 무시
    }

    // 컴파일러 호스트 생성
    const host: ts.CompilerHost = {
      getSourceFile: (fileName, languageVersion) => {
        // 정규화된 경로로 찾기
        const normalized = path.normalize(fileName);
        let cached = fileCache.get(normalized);
        
        if (!cached) {
          // 대소문자 무시 검색
          for (const [key, value] of fileCache.entries()) {
            if (key.toLowerCase() === normalized.toLowerCase()) {
              cached = value;
              break;
            }
          }
        }
        
        // 모듈 이름으로 검색 (예: "next/font/google" -> 실제 파일 경로)
        if (!cached && fileName.includes("/") && !path.isAbsolute(fileName)) {
          // 모듈 경로를 실제 파일 경로로 변환 시도
          const moduleParts = fileName.split("/");
          if (moduleParts[0] === "next" || moduleParts[0] === "react") {
            // 먼저 캐시에서 모듈 이름으로 직접 찾기
            const moduleKey = moduleParts.join("/");
            if (fileCache.has(moduleKey)) {
              cached = fileCache.get(moduleKey);
            }
            
            if (!cached) {
              const possiblePaths = [
                path.join(nodeModulesPath, ...moduleParts) + ".d.ts",
                path.join(nodeModulesPath, ...moduleParts) + ".ts",
                path.join(nodeModulesPath, ...moduleParts, "index.d.ts"),
                path.join(nodeModulesPath, moduleParts[0], ...moduleParts.slice(1)) + ".d.ts",
                path.join(nodeModulesPath, moduleParts[0], ...moduleParts.slice(1), "index.d.ts"),
                path.join(nodeModulesPath, moduleParts[0], "dist", ...moduleParts.slice(1)) + ".d.ts",
                path.join(nodeModulesPath, moduleParts[0], "dist", "compiled", "@next", "font", "dist", ...moduleParts.slice(1)) + ".d.ts",
              ];
              
              for (const possiblePath of possiblePaths) {
                const normalizedPath = path.normalize(possiblePath);
                if (fileCache.has(normalizedPath)) {
                  cached = fileCache.get(normalizedPath);
                  break;
                }
              }
            }
            
            // 부분 매칭으로도 찾기
            if (!cached) {
              const searchTerm = moduleParts.join("/");
              for (const [key, value] of fileCache.entries()) {
                if (key.includes(searchTerm) && (key.endsWith(".d.ts") || key.endsWith("/index.d.ts"))) {
                  cached = value;
                  break;
                }
              }
            }
          }
        }
        
        if (cached !== undefined) {
          return ts.createSourceFile(
            fileName,
            cached,
            languageVersion,
            true,
            fileName.endsWith(".tsx") || fileName.endsWith(".jsx")
              ? ts.ScriptKind.TSX
              : ts.ScriptKind.TS
          );
        }
        
        // 파일이 없으면 시도해서 읽기
        try {
          const content = readFileSync(fileName, "utf-8");
          fileCache.set(normalized, content);
          return ts.createSourceFile(
            fileName,
            content,
            languageVersion,
            true,
            fileName.endsWith(".tsx") || fileName.endsWith(".jsx")
              ? ts.ScriptKind.TSX
              : ts.ScriptKind.TS
          );
        } catch {
          return undefined;
        }
      },
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      writeFile: () => {},
      getCurrentDirectory: () => configDir,
      getDirectories: () => {
        return [];
      },
      fileExists: (fileName) => {
        const normalized = path.normalize(fileName);
        if (fileCache.has(normalized)) return true;
        
        // 대소문자 무시 검색
        for (const key of fileCache.keys()) {
          if (key.toLowerCase() === normalized.toLowerCase()) {
            return true;
          }
        }
        
        // 실제 파일 시스템 확인
        try {
          return statSync(fileName).isFile();
        } catch {
          return false;
        }
      },
      readFile: (fileName) => {
        const normalized = path.normalize(fileName);
        let cached = fileCache.get(normalized);
        
        if (!cached) {
          // 대소문자 무시 검색
          for (const [key, value] of fileCache.entries()) {
            if (key.toLowerCase() === normalized.toLowerCase()) {
              cached = value;
              break;
            }
          }
        }
        
        if (cached !== undefined) return cached;
        
        // 파일이 없으면 시도해서 읽기
        try {
          const content = readFileSync(fileName, "utf-8");
          fileCache.set(normalized, content);
          return content;
        } catch {
          return undefined;
        }
      },
      getCanonicalFileName: (fileName) => path.normalize(fileName),
      useCaseSensitiveFileNames: () => process.platform !== "win32",
      getNewLine: () => "\n",
    };
    
    // skipLibCheck를 활성화하여 라이브러리 타입 오류 무시
    compilerOptions.skipLibCheck = true;

    // 프로그램 생성 및 진단 수집
    const allFiles = Array.from(fileCache.keys());
    const program = ts.createProgram(allFiles.length > 0 ? allFiles : [fullPath], compilerOptions, host);
    
    // 현재 파일의 진단만 수집
    const currentSourceFile = program.getSourceFile(fullPath);
    if (!currentSourceFile) {
      return NextResponse.json({
        errors: [],
        hasErrors: false,
        hasWarnings: false,
      });
    }
    
    const diagnostics = [
      ...program.getSyntacticDiagnostics(currentSourceFile),
      ...program.getSemanticDiagnostics(currentSourceFile),
    ];

    // 진단 정보 변환 (현재 파일의 오류만)
    const errors = diagnostics
      .filter((diagnostic) => {
        // 현재 파일의 오류만 필터링
        return diagnostic.file?.fileName === fullPath || diagnostic.file?.fileName === currentSourceFile.fileName;
      })
      .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        "\n"
      );
      const file = diagnostic.file;
      let start = 0;
      let length = 0;
      let line = 0;
      let character = 0;

      if (file && diagnostic.start !== undefined) {
        start = diagnostic.start;
        length = diagnostic.length || 0;
        const { line: l, character: c } = file.getLineAndCharacterOfPosition(
          start
        );
        line = l;
        character = c;
      }

      return {
        message,
        start,
        length,
        line: line + 1, // Monaco Editor는 1-based
        character: character + 1,
        category: diagnostic.category,
        code: diagnostic.code,
        severity:
          diagnostic.category === ts.DiagnosticCategory.Error
            ? "error"
            : diagnostic.category === ts.DiagnosticCategory.Warning
            ? "warning"
            : "info",
      };
    });

    return NextResponse.json({
      errors,
      hasErrors: errors.some((e) => e.severity === "error"),
      hasWarnings: errors.some((e) => e.severity === "warning"),
    });
  } catch (error) {
    console.error("TypeScript diagnostics error:", error);
    return NextResponse.json(
      { error: "진단 정보를 가져올 수 없습니다.", details: String(error) },
      { status: 500 }
    );
  }
}

