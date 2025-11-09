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

    // 파일 쓰기
    await fs.writeFile(fullPath, content, "utf-8");

    // 파일명 추출
    const fileName = path.basename(filePath);

    return NextResponse.json({
      success: true,
      path: filePath,
      fileName: fileName,
      message: `파일이 성공적으로 저장되었습니다.\n경로: ${filePath}\n파일명: ${fileName}`,
    });
  } catch (error) {
    console.error("Error writing file:", error);
    
    const errorMessage = String(error);
    let detailedError = "파일을 저장할 수 없습니다.";
    let errorType = "unknown";
    
    // 에러 타입별 상세 메시지
    if (errorMessage.includes("EACCES") || errorMessage.includes("permission denied")) {
      detailedError = "파일 쓰기 권한이 없습니다. 파일 또는 디렉토리의 권한을 확인하세요.";
      errorType = "permission";
    } else if (errorMessage.includes("ENOENT")) {
      detailedError = "디렉토리 또는 파일 경로를 찾을 수 없습니다. 경로를 확인하세요.";
      errorType = "not_found";
    } else if (errorMessage.includes("EISDIR")) {
      detailedError = "파일 경로가 디렉토리입니다. 파일 경로를 확인하세요.";
      errorType = "is_directory";
    } else if (errorMessage.includes("ENOSPC")) {
      detailedError = "디스크 공간이 부족합니다.";
      errorType = "no_space";
    } else if (errorMessage.includes("EMFILE") || errorMessage.includes("ENFILE")) {
      detailedError = "열 수 있는 파일 수가 초과되었습니다.";
      errorType = "too_many_files";
    } else if (errorMessage.includes("EBUSY")) {
      detailedError = "파일이 다른 프로세스에서 사용 중입니다. 파일을 닫고 다시 시도하세요.";
      errorType = "busy";
    }
    
    return NextResponse.json(
      { 
        error: detailedError, 
        details: errorMessage,
        errorType: errorType,
        filePath: filePath || "",
        suggestions: getErrorSuggestions(errorType, filePath || "")
      },
      { status: 500 }
    );
  }
}

/**
 * 에러 타입에 따른 대안 제안
 */
function getErrorSuggestions(errorType: string, filePath: string): string[] {
  const suggestions: string[] = [];
  
  switch (errorType) {
    case "permission":
      suggestions.push("파일 또는 디렉토리의 읽기/쓰기 권한을 확인하세요");
      suggestions.push("다른 경로를 사용하세요");
      suggestions.push("관리자 권한으로 실행하거나 sudo를 사용하세요");
      break;
    case "not_found":
      const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
      suggestions.push(`디렉토리를 먼저 생성하세요: ${dirPath}`);
      suggestions.push("파일 경로에 오타가 있는지 확인하세요");
      suggestions.push("다른 경로를 사용하세요");
      break;
    case "is_directory":
      suggestions.push("파일 경로가 디렉토리입니다. 파일명을 포함한 전체 경로를 확인하세요");
      break;
    case "no_space":
      suggestions.push("디스크 공간을 확보하세요");
      suggestions.push("불필요한 파일을 삭제하세요");
      break;
    case "too_many_files":
      suggestions.push("열려있는 파일을 닫으세요");
      suggestions.push("시스템을 재시작하세요");
      break;
    case "busy":
      suggestions.push("파일이 다른 프로그램에서 열려있는지 확인하세요");
      suggestions.push("파일을 닫고 다시 시도하세요");
      suggestions.push("다른 경로에 임시 파일로 생성한 후 나중에 이동하세요");
      break;
    default:
      suggestions.push("파일 경로를 확인하세요");
      suggestions.push("다른 경로를 사용하세요");
      suggestions.push("프로젝트 디렉토리 구조를 확인하세요");
  }
  
  return suggestions;
}

