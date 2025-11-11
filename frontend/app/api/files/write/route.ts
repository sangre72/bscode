import { createFileSystemErrorResponse } from "@/utils/apiHelpers";
import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

export async function POST(request: NextRequest) {
  let filePath: string | undefined;
  let projectPath: string | undefined;
  
  try {
    const body = await request.json();
    filePath = body.filePath;
    projectPath = body.projectPath;
    const content = body.content;

    if (!filePath || !projectPath || content === undefined) {
      return NextResponse.json(
        { error: "파일 경로, 프로젝트 경로, 내용이 필요합니다." },
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

    // 디렉토리 생성
    const dir = path.dirname(fullPath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      // 디렉토리가 이미 존재할 수 있음
    }

    // 개행을 LF로 정규화하고 UTF-8로 저장
    // CRLF (\r\n) 또는 CR (\r)을 LF (\n)로 변환
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // 파일 쓰기 (UTF-8, LF 개행)
    await fs.writeFile(fullPath, normalizedContent, { encoding: 'utf-8' });

    // 파일명 추출
    const fileName = path.basename(filePath);

    return NextResponse.json({
      success: true,
      path: filePath,
      fileName: fileName,
      message: `파일이 성공적으로 저장되었습니다.\n경로: ${filePath}\n파일명: ${fileName}`,
    });
  } catch (error) {
    return createFileSystemErrorResponse(error, filePath);
  }
}


