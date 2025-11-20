import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import { serverLogs } from "../logs/route";

// 실행 중인 서버 프로세스를 저장
const runningServers = new Map<string, any>();

// 로그를 추가하는 헬퍼 함수
function addLog(projectPath: string, message: string) {
  if (!serverLogs.has(projectPath)) {
    serverLogs.set(projectPath, []);
  }
  const logs = serverLogs.get(projectPath)!;
  const timestamp = new Date().toLocaleTimeString();
  logs.push(`[${timestamp}] ${message}`);
  // 최대 1000개까지만 저장
  if (logs.length > 1000) {
    logs.shift();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { projectPath } = await request.json();

    if (!projectPath) {
      return NextResponse.json(
        { error: "프로젝트 경로가 필요합니다." },
        { status: 400 }
      );
    }

    // 이미 실행 중인 서버가 있는지 확인
    if (runningServers.has(projectPath)) {
      return NextResponse.json(
        { error: "서버가 이미 실행 중입니다.", running: true },
        { status: 400 }
      );
    }

    // package.json에서 dev 스크립트 확인
    const packageJsonPath = path.join(projectPath, "package.json");
    let devCommand = "npm run dev";

    try {
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, "utf-8")
      );
      if (packageJson.scripts?.dev) {
        devCommand = "npm run dev";
      } else if (packageJson.scripts?.start) {
        devCommand = "npm start";
      }
    } catch (error) {
      console.warn("package.json을 읽을 수 없습니다:", error);
    }

    // 서버 시작
    const childProcess = spawn(devCommand, {
      cwd: projectPath,
      shell: true,
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // 프로세스 저장
    runningServers.set(projectPath, childProcess);

    // 로그 초기화
    addLog(projectPath, `서버 시작: ${devCommand}`);

    // stdout 수집
    childProcess.stdout?.on("data", (data) => {
      const message = data.toString().trim();
      if (message) {
        addLog(projectPath, message);
        console.log(`[${projectPath}] ${message}`);
      }
    });

    // stderr 수집
    childProcess.stderr?.on("data", (data) => {
      const message = data.toString().trim();
      if (message) {
        addLog(projectPath, `[ERROR] ${message}`);
        console.error(`[${projectPath}] ${message}`);
      }
    });

    // 프로세스 종료 처리
    childProcess.on("exit", (code) => {
      addLog(projectPath, `서버 종료 (코드: ${code})`);
      console.log(`서버 종료: ${projectPath}, 코드: ${code}`);
      runningServers.delete(projectPath);
    });

    // 프로세스 에러 처리
    childProcess.on("error", (error) => {
      addLog(projectPath, `[ERROR] ${error.message}`);
      console.error(`서버 에러: ${projectPath}`, error);
      runningServers.delete(projectPath);
    });

    return NextResponse.json({
      success: true,
      message: "개발 서버를 시작했습니다.",
      command: devCommand,
      pid: childProcess.pid,
    });
  } catch (error) {
    console.error("서버 시작 오류:", error);
    return NextResponse.json(
      { error: "서버를 시작할 수 없습니다.", details: String(error) },
      { status: 500 }
    );
  }
}
