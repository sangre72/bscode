import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { projectPath, port } = await request.json();

    if (!projectPath) {
      return NextResponse.json(
        { error: "프로젝트 경로가 필요합니다." },
        { status: 400 }
      );
    }

    // 포트 기반으로 프로세스 종료
    if (port) {
      try {
        // macOS/Linux: lsof로 포트 사용 중인 프로세스 찾아서 종료
        const platform = process.platform;

        if (platform === "darwin" || platform === "linux") {
          // 포트를 사용 중인 프로세스 PID 찾기
          const { stdout } = await execAsync(
            `lsof -ti:${port} || echo ""`
          );
          const pids = stdout.trim().split("\n").filter((pid) => pid);

          if (pids.length > 0) {
            // 프로세스 종료
            for (const pid of pids) {
              try {
                await execAsync(`kill -9 ${pid}`);
                console.log(`프로세스 종료: PID ${pid}, 포트 ${port}`);
              } catch (error) {
                console.warn(`프로세스 종료 실패: PID ${pid}`, error);
              }
            }

            return NextResponse.json({
              success: true,
              message: `포트 ${port}의 서버를 종료했습니다.`,
              killedPids: pids,
            });
          } else {
            return NextResponse.json(
              { error: `포트 ${port}에서 실행 중인 서버를 찾을 수 없습니다.` },
              { status: 404 }
            );
          }
        } else if (platform === "win32") {
          // Windows: netstat과 taskkill 사용
          const { stdout } = await execAsync(
            `netstat -ano | findstr :${port}`
          );
          const lines = stdout.trim().split("\n");
          const pids = new Set<string>();

          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== "0") {
              pids.add(pid);
            }
          }

          if (pids.size > 0) {
            for (const pid of pids) {
              try {
                await execAsync(`taskkill /F /PID ${pid}`);
                console.log(`프로세스 종료: PID ${pid}, 포트 ${port}`);
              } catch (error) {
                console.warn(`프로세스 종료 실패: PID ${pid}`, error);
              }
            }

            return NextResponse.json({
              success: true,
              message: `포트 ${port}의 서버를 종료했습니다.`,
              killedPids: Array.from(pids),
            });
          } else {
            return NextResponse.json(
              { error: `포트 ${port}에서 실행 중인 서버를 찾을 수 없습니다.` },
              { status: 404 }
            );
          }
        }
      } catch (error) {
        console.error("서버 종료 오류:", error);
        return NextResponse.json(
          { error: "서버를 종료할 수 없습니다.", details: String(error) },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: "포트 정보가 필요합니다." },
      { status: 400 }
    );
  } catch (error) {
    console.error("서버 종료 오류:", error);
    return NextResponse.json(
      { error: "서버를 종료할 수 없습니다.", details: String(error) },
      { status: 500 }
    );
  }
}
