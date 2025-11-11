"use client";

import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { ChevronDown, ChevronUp, Copy, ExternalLink, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface TerminalProps {
  projectPath?: string;
  onCommand?: (command: string) => Promise<{ stdout: string; stderr: string; success: boolean }>;
}

export default function Terminal({ projectPath, onCommand }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  // localStorage에서 높이 복원 (초기값)
  const [height, setHeight] = useState(() => {
    if (typeof window !== "undefined") {
      const savedHeight = localStorage.getItem("terminalHeight");
      if (savedHeight) {
        const h = parseInt(savedHeight, 10);
        if (h >= 100 && h <= window.innerHeight - 200) {
          return h;
        }
      }
    }
    return 300; // 기본 높이
  });
  const [isResizing, setIsResizing] = useState(false);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null);
  const currentCommandRef = useRef<string>("");
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  useEffect(() => {
    if (!terminalRef.current || !onCommand) return;

    // XTerm 인스턴스 생성
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 11, // 작은 폰트 사이즈
      fontFamily: "'SF Mono', 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'Courier New', monospace",
      fontWeight: 300, // 얇은 폰트
      lineHeight: 0.9, // 줄간격 (폰트 크기보다 약간 작게)
      letterSpacing: 0, // 글자 간격
      convertEol: true, // 줄바꿈 변환 활성화
      disableStdin: false, // 입력 활성화
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#aeafad",
        black: "#000000",
        red: "#cd3131",
        green: "#0dbc79",
        yellow: "#e5e510",
        blue: "#2472c8",
        magenta: "#bc3fbc",
        cyan: "#11a8cd",
        white: "#e5e5e5",
        brightBlack: "#666666",
        brightRed: "#f14c4c",
        brightGreen: "#23d18b",
        brightYellow: "#f5f543",
        brightBlue: "#3b8eea",
        brightMagenta: "#d670d6",
        brightCyan: "#29b8db",
        brightWhite: "#e5e5e5",
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // 초기 프롬프트 표시
    const prompt = () => {
      if (projectPath) {
        const path = projectPath.split("/").pop() || projectPath;
        xterm.write(`\r\n\x1b[32m${path}\x1b[0m $ `);
      } else {
        xterm.write(`\r\n$ `);
      }
    };

    prompt();

    // 명령어 실행 함수 (로컬 스코프)
    const executeCommand = async (command: string) => {
      console.log("🔧 터미널 명령어 실행:", command);
      
      if (!onCommand) {
        const errorMsg = `\x1b[31m명령어 실행 핸들러가 없습니다.\x1b[0m\r\n`;
        xterm.write(errorMsg);
        console.error("❌ onCommand가 없습니다");
        prompt();
        return;
      }

      try {
        console.log("📤 onCommand 호출 중...");
        const result = await onCommand(command);
        console.log("📥 명령어 실행 결과:", result);
        
        if (result.stdout) {
          // ANSI 컬러 코드가 포함된 출력을 그대로 전달
          xterm.write(result.stdout);
          // stdout이 개행으로 끝나지 않으면 추가
          if (!result.stdout.endsWith('\n') && !result.stdout.endsWith('\r\n')) {
            xterm.write('\r\n');
          }
        }
        if (result.stderr) {
          // stderr도 ANSI 컬러 코드를 유지하면서 출력
          xterm.write(result.stderr);
          // stderr가 개행으로 끝나지 않으면 추가
          if (!result.stderr.endsWith('\n') && !result.stderr.endsWith('\r\n')) {
            xterm.write('\r\n');
          }
        }
        
        // 결과가 없어도 프롬프트 표시
        if (!result.stdout && !result.stderr) {
          xterm.write('\r\n');
        }
        
        prompt();
      } catch (error) {
        const errorMsg = `\x1b[31m오류: ${error instanceof Error ? error.message : String(error)}\x1b[0m\r\n`;
        xterm.write(errorMsg);
        console.error("❌ 명령어 실행 오류:", error);
        prompt();
      }
    };

    // 입력 처리
    let currentLine = "";
    xterm.onData((data) => {
      const code = data.charCodeAt(0);

      // Enter 키
      if (code === 13) {
        xterm.write("\r\n");
        if (currentLine.trim()) {
          executeCommand(currentLine.trim());
          commandHistoryRef.current.push(currentLine.trim());
          historyIndexRef.current = commandHistoryRef.current.length;
        } else {
          prompt();
        }
        currentLine = "";
        currentCommandRef.current = "";
      }
      // Backspace 키
      else if (code === 127) {
        if (currentLine.length > 0) {
          currentLine = currentLine.slice(0, -1);
          xterm.write("\b \b");
        }
      }
      // 화살표 키 (히스토리)
      else if (code === 27) {
        // ESC 시퀀스 처리
        const sequence = data.slice(1);
        if (sequence === "[A") {
          // 위 화살표
          if (historyIndexRef.current > 0) {
            historyIndexRef.current--;
            const historyCommand = commandHistoryRef.current[historyIndexRef.current];
            // 현재 라인 지우기
            xterm.write("\r");
            for (let i = 0; i < currentLine.length + 10; i++) {
              xterm.write(" ");
            }
            xterm.write("\r");
            currentLine = historyCommand;
            xterm.write(historyCommand);
          }
        } else if (sequence === "[B") {
          // 아래 화살표
          if (historyIndexRef.current < commandHistoryRef.current.length - 1) {
            historyIndexRef.current++;
            const historyCommand = commandHistoryRef.current[historyIndexRef.current];
            // 현재 라인 지우기
            xterm.write("\r");
            for (let i = 0; i < currentLine.length + 10; i++) {
              xterm.write(" ");
            }
            xterm.write("\r");
            currentLine = historyCommand;
            xterm.write(historyCommand);
          } else if (historyIndexRef.current === commandHistoryRef.current.length - 1) {
            historyIndexRef.current = commandHistoryRef.current.length;
            // 현재 라인 지우기
            xterm.write("\r");
            for (let i = 0; i < currentLine.length + 10; i++) {
              xterm.write(" ");
            }
            xterm.write("\r");
            currentLine = "";
          }
        }
      }
      // 일반 문자
      else if (code >= 32) {
        currentLine += data;
        xterm.write(data);
      }
    });

    // 윈도우 리사이즈 시 터미널 크기 조정
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      xterm.dispose();
    };
  }, [projectPath, onCommand]);

  // 터미널 높이 변경 시 fit
  useEffect(() => {
    if (fitAddonRef.current && !isMinimized) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 100);
    }
  }, [height, isMinimized]);


  // 외부에서 명령어 실행 결과를 터미널에 출력
  const writeOutput = useCallback((output: string, isError = false) => {
    if (xtermRef.current) {
      const color = isError ? "\x1b[31m" : "\x1b[0m";
      xtermRef.current.write(`\r\n${color}${output}\x1b[0m\r\n`);
      // 프롬프트 다시 표시
      if (projectPath) {
        const path = projectPath.split("/").pop() || projectPath;
        xtermRef.current.write(`\x1b[32m${path}\x1b[0m $ `);
      } else {
        xtermRef.current.write(`$ `);
      }
    }
  }, [projectPath]);

  // 외부에서 접근 가능하도록 window에 등록
  useEffect(() => {
    const windowWithTerminal = window as { terminalWriteOutput?: (output: string, isError?: boolean) => void };
    windowWithTerminal.terminalWriteOutput = writeOutput;
    return () => {
      delete windowWithTerminal.terminalWriteOutput;
    };
  }, [writeOutput]);

  // 로컬 터미널 열기
  const openLocalTerminal = useCallback(async () => {
    if (!projectPath) {
      alert("프로젝트 경로가 없습니다.");
      return;
    }

    try {
      // OS 감지
      const userAgent = navigator.userAgent.toLowerCase();
      const isMac = /mac|darwin/.test(userAgent);
      const isWindows = /win|windows/.test(userAgent);

      // 백엔드 API를 통해 터미널 열기 시도
      const response = await fetch("/api/commands/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: isMac 
            ? `open -a Terminal "${projectPath}" || open -a iTerm "${projectPath}"`
            : isWindows
            ? `start cmd /k "cd /d "${projectPath.replace(/\//g, "\\")}""`
            : `gnome-terminal --working-directory="${projectPath}" || xterm -e "cd '${projectPath}' && exec bash" || x-terminal-emulator -e "cd '${projectPath}' && exec bash"`,
          projectPath: projectPath,
        }),
      });

      if (!response.ok) {
        // 백엔드 실행 실패 시 클립보드에 경로 복사
        await navigator.clipboard.writeText(`cd "${projectPath}"`);
        alert(`터미널을 열 수 없습니다. 프로젝트 경로가 클립보드에 복사되었습니다:\n\ncd "${projectPath}"\n\n터미널에서 붙여넣기(Ctrl+V 또는 Cmd+V)하여 실행하세요.`);
      } else {
        alert("로컬 터미널이 열렸습니다.");
      }
    } catch {
      // 오류 발생 시 클립보드에 경로 복사
      try {
        await navigator.clipboard.writeText(`cd "${projectPath}"`);
        alert(`터미널을 열 수 없습니다. 프로젝트 경로가 클립보드에 복사되었습니다:\n\ncd "${projectPath}"\n\n터미널에서 붙여넣기(Ctrl+V 또는 Cmd+V)하여 실행하세요.`);
      } catch {
        alert(`터미널을 열 수 없습니다. 수동으로 다음 경로로 이동하세요:\n\n${projectPath}`);
      }
    }
  }, [projectPath]);

  // 현재 디렉토리 경로를 클립보드에 복사
  const copyPathToClipboard = useCallback(async () => {
    if (!projectPath) {
      alert("프로젝트 경로가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(`cd "${projectPath}"`);
      alert(`프로젝트 경로가 클립보드에 복사되었습니다:\n\ncd "${projectPath}"`);
    } catch (error) {
      alert(`클립보드 복사 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
  }, [projectPath]);

  // 리사이징 핸들러
  useEffect(() => {
    if (!isResizing || !resizeStartRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;
      
      const deltaY = e.clientY - resizeStartRef.current.y;
      const newHeight = resizeStartRef.current.height - deltaY; // 위로 드래그하면 높이 증가, 아래로 드래그하면 높이 감소
      
      // 최소 100px, 최대는 화면 높이의 70%
      const minHeight = 100;
      const maxHeight = window.innerHeight * 0.7;
      
      const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
      
      setHeight(clampedHeight);
      localStorage.setItem("terminalHeight", clampedHeight.toString());
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);


  if (isMinimized) {
    return (
      <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">터미널</span>
          <button
            onClick={() => setIsMinimized(false)}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="터미널 확장"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={terminalContainerRef}
      className="flex flex-col border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
    >
      {/* 리사이저 바 (상단) */}
      <div
        className={`h-1 bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 dark:hover:bg-blue-600 cursor-row-resize transition-colors relative select-none ${
          isResizing ? "bg-blue-500 dark:bg-blue-600" : ""
        }`}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // 리사이징 시작 위치와 현재 높이 저장
          resizeStartRef.current = {
            y: e.clientY,
            height: height,
          };
          setIsResizing(true);
        }}
        style={{ userSelect: "none" }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-0.5 bg-gray-400 dark:bg-gray-500 rounded"></div>
        </div>
      </div>

      {/* 터미널 헤더 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">터미널</span>
        <div className="flex items-center gap-2">
          {projectPath && (
            <>
              <button
                onClick={openLocalTerminal}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors flex items-center gap-1.5 text-xs"
                title="로컬 터미널 열기"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">로컬 터미널</span>
              </button>
              <button
                onClick={copyPathToClipboard}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors flex items-center gap-1.5 text-xs"
                title="경로 복사"
              >
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">경로 복사</span>
              </button>
            </>
          )}
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="터미널 최소화"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (xtermRef.current) {
                xtermRef.current.clear();
                if (projectPath) {
                  const path = projectPath.split("/").pop() || projectPath;
                  xtermRef.current.write(`\x1b[32m${path}\x1b[0m $ `);
                  } else {
                  xtermRef.current.write(`$ `);
                }
              }
            }}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="터미널 지우기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 터미널 컨텐츠 */}
      <div
        style={{ height: `${height}px`, minHeight: "100px" }}
        className="relative overflow-hidden flex-shrink-0"
      >
        <div ref={terminalRef} className="h-full w-full" />
      </div>
    </div>
  );
}

