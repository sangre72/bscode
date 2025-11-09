import { exec } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { command, projectPath } = await request.json();

    if (!command || !projectPath) {
      return NextResponse.json(
        { error: "명령어와 프로젝트 경로가 필요합니다." },
        { status: 400 }
      );
    }

    // 안전한 명령어만 허용
    const allowedCommands = ['npm', 'yarn', 'pnpm', 'node'];
    const commandParts = command.trim().split(/\s+/);
    const baseCommand = commandParts[0];

    if (!allowedCommands.includes(baseCommand)) {
      return NextResponse.json(
        { error: "허용되지 않은 명령어입니다." },
        { status: 400 }
      );
    }

    // 프로젝트 경로에서 실행
    const { stdout, stderr } = await execAsync(command, {
      cwd: projectPath,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    return NextResponse.json({
      success: true,
      stdout,
      stderr,
      message: "명령어가 성공적으로 실행되었습니다.",
    });
  } catch (error: any) {
    console.error("Error executing command:", error);
    return NextResponse.json(
      { 
        error: "명령어 실행 중 오류가 발생했습니다.", 
        details: error.message,
        stdout: error.stdout,
        stderr: error.stderr,
      },
      { status: 500 }
    );
  }
}

