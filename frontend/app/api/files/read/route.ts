import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get("path");
    const projectPath = searchParams.get("projectPath");

    if (!filePath || !projectPath) {
      return NextResponse.json(
        { error: "파일 경로와 프로젝트 경로가 필요합니다." },
        { status: 400 }
      );
    }

    const fullPath = path.join(projectPath, filePath);

    // 경로 검증 (보안)
    if (!fullPath.startsWith(projectPath)) {
      return NextResponse.json(
        { error: "잘못된 파일 경로입니다." },
        { status: 400 }
      );
    }

    try {
      const stats = await fs.stat(fullPath);
      if (!stats.isFile()) {
        return NextResponse.json(
          { error: "파일이 아닙니다." },
          { status: 400 }
        );
      }

      // 파일 크기 제한 (10MB)
      if (stats.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { error: "파일이 너무 큽니다 (최대 10MB)." },
          { status: 400 }
        );
      }

      const ext = path.extname(filePath).toLowerCase();
      
      // 파일 타입 분류
      const imageExtensions = [".ico", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".tiff", ".tif"];
      const videoExtensions = [".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm", ".mkv", ".m4v", ".3gp"];
      const audioExtensions = [".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma"];
      const fontExtensions = [".ttf", ".otf", ".woff", ".woff2", ".eot"];
      const documentExtensions = [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".odt", ".ods", ".odp", ".hwp", ".hwt"];
      
      const isImage = imageExtensions.includes(ext);
      const isVideo = videoExtensions.includes(ext);
      const isAudio = audioExtensions.includes(ext);
      const isFont = fontExtensions.includes(ext);
      const isDocument = documentExtensions.includes(ext);

      let content: string;
      let encoding: "text" | "base64" = "text";

      if (isImage || isVideo || isAudio || isFont || isDocument) {
        // 바이너리 파일은 base64로 인코딩
        const buffer = await fs.readFile(fullPath);
        content = buffer.toString("base64");
        encoding = "base64";
      } else {
        // 텍스트 파일은 UTF-8로 읽기
        try {
          content = await fs.readFile(fullPath, "utf-8");
        } catch (error) {
          // UTF-8로 읽을 수 없는 경우 바이너리로 처리
          const buffer = await fs.readFile(fullPath);
          content = buffer.toString("base64");
          encoding = "base64";
        }
      }

      return NextResponse.json({
        content,
        path: filePath,
        size: stats.size,
        extension: ext,
        encoding,
        isImage,
        isVideo,
        isAudio,
        isFont,
        isDocument,
      });
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return NextResponse.json(
          { error: "파일을 찾을 수 없습니다." },
          { status: 404 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Error reading file:", error);
    return NextResponse.json(
      { error: "파일을 읽을 수 없습니다." },
      { status: 500 }
    );
  }
}

