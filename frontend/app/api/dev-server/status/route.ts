import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { port } = await request.json();

    if (!port) {
      return NextResponse.json(
        { error: "포트 정보가 필요합니다." },
        { status: 400 }
      );
    }

    const platform = process.platform;
    let isRunning = false;

    try {
      if (platform === "darwin" || platform === "linux") {
        // macOS/Linux: lsof 사용
        const { stdout } = await execAsync(`lsof -ti:${port} || echo ""`);
        isRunning = stdout.trim().length > 0;
      } else if (platform === "win32") {
        // Windows: netstat 사용
        const { stdout } = await execAsync(
          `netstat -ano | findstr :${port} || echo ""`
        );
        isRunning = stdout.trim().length > 0;
      }
    } catch (error) {
      // 명령어 실행 실패 시 서버가 실행 중이지 않은 것으로 간주
      isRunning = false;
    }

    return NextResponse.json({
      running: isRunning,
      port: port,
    });
  } catch (error) {
    console.error("서버 상태 확인 오류:", error);
    return NextResponse.json(
      { error: "서버 상태를 확인할 수 없습니다.", details: String(error) },
      { status: 500 }
    );
  }
}
