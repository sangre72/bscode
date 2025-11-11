import { exec, ExecOptions } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { command, projectPath } = await request.json();
    
    console.log("🔧 /api/commands/execute 호출:", { command, projectPath });

    if (!command || !projectPath) {
      console.error("❌ 필수 파라미터 누락:", { command: !!command, projectPath: !!projectPath });
      return NextResponse.json(
        { error: "명령어와 프로젝트 경로가 필요합니다.", success: false },
        { status: 400 }
      );
    }

    // 터미널 열기 명령어 처리 (OS별)
    if (command.trim().startsWith('open -a Terminal') || 
        command.trim().startsWith('open -a iTerm') ||
        command.trim().startsWith('start cmd') ||
        command.trim().startsWith('gnome-terminal') ||
        command.trim().startsWith('xterm') ||
        command.trim().startsWith('x-terminal-emulator')) {
      // 터미널 열기 명령어는 shell에서 실행
      const platform = process.platform;
      let terminalCommand = command;
      
      // macOS: open 명령어 사용
      if (platform === 'darwin') {
        // 이미 open 명령어가 포함되어 있으면 그대로 사용
        if (!command.includes('open')) {
          terminalCommand = `open -a Terminal "${projectPath}" || open -a iTerm "${projectPath}"`;
        }
      }
      // Windows: start 명령어 사용
      else if (platform === 'win32') {
        if (!command.includes('start')) {
          const windowsPath = projectPath.replace(/\//g, '\\');
          terminalCommand = `start cmd /k "cd /d "${windowsPath}""`;
        }
      }
      // Linux: 다양한 터미널 시도
      else {
        if (!command.includes('gnome-terminal') && !command.includes('xterm') && !command.includes('x-terminal-emulator')) {
          terminalCommand = `gnome-terminal --working-directory="${projectPath}" 2>/dev/null || xterm -e "cd '${projectPath}' && exec bash" 2>/dev/null || x-terminal-emulator -e "cd '${projectPath}' && exec bash" 2>/dev/null || echo "터미널을 열 수 없습니다. 수동으로 cd '${projectPath}'를 실행하세요."`;
        }
      }
      
      console.log("🔧 터미널 열기:", { platform, terminalCommand });
      
      try {
        // shell 옵션을 사용하여 실행 (터미널 앱 열기)
        // Windows는 shell 옵션이 필요하지만, Unix 계열은 기본적으로 shell 사용
        let execOptions: ExecOptions = {
          cwd: projectPath,
          maxBuffer: 1024 * 1024, // 1MB
        };
        
        if (platform === 'win32') {
          // Windows에서는 shell을 명시적으로 지정
          execOptions = {
            ...execOptions,
            shell: process.env.COMSPEC || 'cmd.exe',
          };
        }
        
        const { stdout, stderr } = await execAsync(terminalCommand, execOptions);
        
        return NextResponse.json({
          success: true,
          stdout: stdout || "",
          stderr: stderr || "",
          message: "터미널이 열렸습니다.",
        });
      } catch (error: unknown) {
        // 터미널 열기 실패는 경고로 처리 (항상 성공으로 반환)
        const errorObj = error as { stdout?: string; stderr?: string; message?: string };
        return NextResponse.json({
          success: false,
          stdout: errorObj.stdout || "",
          stderr: errorObj.stderr || errorObj.message || "터미널을 열 수 없습니다.",
          message: "터미널 열기 실패",
        });
      }
    }

    // 포트 프로세스 종료 명령어 처리 (OS별)
    if (command.trim().startsWith('kill-port-process')) {
      const portMatch = command.match(/kill-port-process\s+(\d+)/);
      const port = portMatch ? portMatch[1] : null;
      
      if (!port) {
        return NextResponse.json(
          { error: "포트 번호가 필요합니다.", success: false },
          { status: 400 }
        );
      }
      
      let killCommand = '';
      const platform = process.platform;
      
      if (platform === 'win32') {
        // Windows: netstat으로 PID 찾고 taskkill로 종료
        killCommand = `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /F /PID %a 2>nul || echo Port ${port} is not in use`;
      } else if (platform === 'darwin') {
        // macOS: lsof로 PID 찾고 kill로 종료
        killCommand = `lsof -ti:${port} | xargs kill -9 2>/dev/null || echo "Port ${port} is not in use"`;
      } else {
        // Linux: fuser 또는 lsof 사용
        killCommand = `(fuser -k ${port}/tcp 2>/dev/null || lsof -ti:${port} | xargs kill -9 2>/dev/null) || echo "Port ${port} is not in use"`;
      }
      
      console.log("🔧 포트 프로세스 종료:", { port, platform, killCommand });
      
      try {
        const { stdout, stderr } = await execAsync(killCommand, {
          cwd: projectPath,
          maxBuffer: 1024 * 1024, // 1MB
        });
        
        return NextResponse.json({
          success: true,
          stdout: stdout || "",
          stderr: stderr || "",
          message: `포트 ${port}의 프로세스 종료 완료`,
        });
      } catch (error: unknown) {
        // 프로세스가 없어도 성공으로 처리
        const errorObj = error as { stdout?: string; stderr?: string };
        return NextResponse.json({
          success: true,
          stdout: errorObj.stdout || "",
          stderr: errorObj.stderr || "",
          message: `포트 ${port} 처리 완료`,
        });
      }
    }

    // 안전한 명령어만 허용
    const allowedCommands = [
      // 패키지 관리자
      'npm', 'yarn', 'pnpm', 'node', 'next', 'npx',
      // 파일 시스템 명령어
      'ls', 'cat', 'grep', 'find', 'pwd', 'head', 'tail', 'wc', 'mkdir', 'touch', 'echo', 'cp', 'mv', 'rm',
      // Git 명령어
      'git',
      // Java
      'java', 'javac', 'javap', 'jar', 'mvn', 'gradle',
      // Python
      'python', 'python3', 'pip', 'pip3', 'py',
      // Go
      'go',
      // Rust
      'rustc', 'cargo',
      // C/C++
      'gcc', 'g++', 'clang', 'clang++', 'make', 'cmake',
      // 기타 개발 도구
      'which', 'whereis', 'type', 'env', 'printenv', 'curl', 'wget',
      // Windows 전용
      'netstat', 'taskkill', 'for',
      // Unix/Linux/macOS 전용
      'lsof', 'fuser', 'xargs', 'kill',
    ];
    const commandParts = command.trim().split(/\s+/);
    const baseCommand = commandParts[0];

    console.log("🔍 명령어 분석:", { baseCommand, allowedCommands, isAllowed: allowedCommands.includes(baseCommand) });

    if (!allowedCommands.includes(baseCommand)) {
      console.error("❌ 허용되지 않은 명령어:", baseCommand);
      return NextResponse.json(
        { error: `허용되지 않은 명령어입니다: ${baseCommand}. 허용된 명령어: ${allowedCommands.join(', ')}`, success: false },
        { status: 400 }
      );
    }

    // 프로젝트 경로에서 실행
    console.log("▶️ 명령어 실행 시작:", { command, cwd: projectPath });
    
    // ls 명령어에 컬러 옵션 추가 (macOS는 -G, Linux는 --color=always)
    let finalCommand = command;
    if (command.trim().startsWith('ls')) {
      const isMac = process.platform === 'darwin';
      if (isMac && !command.includes('-G') && !command.includes('--color')) {
        finalCommand = command.replace(/^ls\s/, 'ls -G ').replace(/^ls$/, 'ls -G');
      } else if (!isMac && !command.includes('--color')) {
        finalCommand = command.replace(/^ls\s/, 'ls --color=always ').replace(/^ls$/, 'ls --color=always');
      }
    }
    
    const { stdout, stderr } = await execAsync(finalCommand, {
      cwd: projectPath,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      env: {
        ...process.env,
        // 컬러 출력 강제 활성화
        FORCE_COLOR: '1',
        TERM: 'xterm-256color',
        CLICOLOR: '1',
        CLICOLOR_FORCE: '1',
      },
    });

    console.log("✅ 명령어 실행 완료:", { stdoutLength: stdout?.length, stderrLength: stderr?.length });

    return NextResponse.json({
      success: true,
      stdout: stdout || "",
      stderr: stderr || "",
      message: "명령어가 성공적으로 실행되었습니다.",
    });
  } catch (error: unknown) {
    console.error("❌ 명령어 실행 오류:", error);
    const errorObj = error as { message?: string; stdout?: string; stderr?: string };
    const errorMessage = errorObj.message || "알 수 없는 오류";
    const errorStdout = errorObj.stdout || "";
    const errorStderr = errorObj.stderr || "";
    
    return NextResponse.json(
      { 
        success: false,
        error: "명령어 실행 중 오류가 발생했습니다.", 
        details: errorMessage,
        stdout: errorStdout,
        stderr: errorStderr,
      },
      { status: 500 }
    );
  }
}

