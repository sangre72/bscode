"use client";

import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { ChevronDown, ChevronUp, Copy, ExternalLink, Home, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface TerminalProps {
  projectPath?: string;
}

export default function Terminal({ projectPath }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

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
  const sessionIdRef = useRef<string>(`session_${Date.now()}`);

  useEffect(() => {
    if (!terminalRef.current) return;

    // XTerm 인스턴스 생성
    const xterm = new XTerm({
      cursorBlink: true,
      scrollback: 1000,
      fontSize: 12,
      fontFamily: "'Menlo', 'Monaco', 'Courier New', Courier, monospace",
      fontWeight: '400',
      fontWeightBold: '700',
      lineHeight: 1.4,
      letterSpacing: 0,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#aeafad',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        selectionForeground: '#d4d4d4',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.open(terminalRef.current);

    // 터미널 DOM이 완전히 렌더링된 후 fit 호출
    setTimeout(() => {
      fitAddon.fit();
    }, 100);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // WebSocket 연결
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/terminal?projectPath=${encodeURIComponent(projectPath || process.cwd())}&sessionId=${sessionIdRef.current}`;

    console.log('🔌 WebSocket 연결 시도:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ WebSocket 연결됨');
      setIsConnected(true);
      xterm.write('\x1b[32m터미널 연결됨\x1b[0m\r\n');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'data') {
          // PTY 출력을 터미널에 표시
          xterm.write(msg.data);
        } else if (msg.type === 'connected') {
          console.log('🎉 터미널 세션 시작:', msg);
        } else if (msg.type === 'exit') {
          console.log('🛑 터미널 세션 종료:', msg);
          xterm.write(`\r\n\x1b[33m프로세스 종료 (코드: ${msg.exitCode})\x1b[0m\r\n`);
        }
      } catch (error) {
        console.error('❌ WebSocket 메시지 파싱 오류:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket 오류:', error);
      setIsConnected(false);
      xterm.write('\r\n\x1b[31m터미널 연결 오류\x1b[0m\r\n');
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket 연결 종료');
      setIsConnected(false);
      xterm.write('\r\n\x1b[33m터미널 연결 종료\x1b[0m\r\n');
    };

    // xterm 입력 -> WebSocket (PTY로 전송)
    const disposable = xterm.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }));
      }
    });

    // xterm 크기 변경 -> WebSocket (PTY 크기 조정)
    const resizeDisposable = xterm.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
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
      disposable.dispose();
      resizeDisposable.dispose();
      ws.close();
      xterm.dispose();
    };
  }, [projectPath]);

  // 터미널 높이 변경 시 fit
  useEffect(() => {
    if (fitAddonRef.current && !isMinimized) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 100);
    }
  }, [height, isMinimized]);

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
            ? `start cmd /k "cd /d "${projectPath.replace(/\//g, "\\")}"`
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

  // 터미널 현재 경로 복사
  const copyCurrentPath = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("터미널이 연결되지 않았습니다.");
      return;
    }

    let output = '';
    let listener: ((event: MessageEvent) => void) | null = null;

    const cleanup = () => {
      if (listener && wsRef.current) {
        wsRef.current.removeEventListener('message', listener);
      }
    };

    listener = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data') {
          output += msg.data;

          // ANSI 색상 코드 제거
          const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');

          // 경로 패턴 찾기 (절대 경로)
          const pathMatch = cleanOutput.match(/\/[^\s\r\n]+/);

          if (pathMatch) {
            const path = pathMatch[0].trim();

            navigator.clipboard.writeText(path).then(() => {
              console.log('경로 복사 성공:', path);
              // 조용히 복사 (alert 제거)
            }).catch((err) => {
              console.error('클립보드 복사 실패:', err);
              alert(`클립보드 복사 실패: ${err.message}`);
            });

            cleanup();
          }
        }
      } catch (error) {
        console.error('경로 복사 오류:', error);
        cleanup();
      }
    };

    wsRef.current.addEventListener('message', listener);

    // pwd 명령 전송
    wsRef.current.send(JSON.stringify({ type: 'data', data: 'pwd\n' }));

    // 3초 후 타임아웃
    setTimeout(() => {
      cleanup();
    }, 3000);
  }, []);

  // 프로젝트 경로로 이동
  const goToProjectPath = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("터미널이 연결되지 않았습니다.");
      return;
    }

    if (!projectPath) {
      alert("프로젝트 경로가 없습니다.");
      return;
    }

    // cd 명령 전송
    wsRef.current.send(JSON.stringify({ type: 'data', data: `cd "${projectPath}"\n` }));
  }, [projectPath]);

  // 리사이징 핸들러
  useEffect(() => {
    if (!isResizing || !resizeStartRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;

      const deltaY = e.clientY - resizeStartRef.current.y;
      const newHeight = resizeStartRef.current.height - deltaY;

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
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">터미널</span>
            {isConnected && (
              <span className="w-2 h-2 bg-green-500 rounded-full" title="연결됨"></span>
            )}
          </div>
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
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">터미널</span>
          {isConnected && (
            <span className="w-2 h-2 bg-green-500 rounded-full" title="연결됨"></span>
          )}
        </div>
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
                onClick={goToProjectPath}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors flex items-center gap-1.5 text-xs"
                title="프로젝트로 이동"
              >
                <Home className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">프로젝트로</span>
              </button>
              <button
                onClick={copyCurrentPath}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors flex items-center gap-1.5 text-xs"
                title="현재 경로 복사"
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
        className="relative overflow-hidden flex-shrink-0 p-2"
      >
        <div ref={terminalRef} className="h-full w-full" />
      </div>
    </div>
  );
}
