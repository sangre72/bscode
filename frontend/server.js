const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const os = require('os');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// PTY 세션 저장소 (세션 ID -> pty 인스턴스)
const ptySessions = new Map();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // WebSocket 서버 생성
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws, req) => {
    console.log('🔌 WebSocket 연결됨:', req.url);

    // URL에서 프로젝트 경로 추출
    const url = parse(req.url, true);
    const projectPath = url.query.projectPath || process.cwd();
    const sessionId = url.query.sessionId || `session_${Date.now()}`;

    console.log('📂 터미널 세션 시작:', { sessionId, projectPath });

    // 기존 세션이 있으면 재사용, 없으면 새로 생성
    let ptyProcess = ptySessions.get(sessionId);

    if (!ptyProcess || ptyProcess.exitCode !== null) {
      // 플랫폼별 쉘 설정
      const shell = os.platform() === 'win32'
        ? 'powershell.exe'
        : process.env.SHELL || '/bin/bash';

      // PTY 프로세스 생성
      ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: projectPath,
        env: process.env,
      });

      ptySessions.set(sessionId, ptyProcess);

      console.log('✨ 새 PTY 세션 생성:', { sessionId, shell, cwd: projectPath });

      // PTY -> WebSocket (터미널 출력)
      ptyProcess.onData((data) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'data', data }));
        }
      });

      // PTY 종료 처리
      ptyProcess.onExit(({ exitCode, signal }) => {
        console.log('🛑 PTY 프로세스 종료:', { sessionId, exitCode, signal });
        ptySessions.delete(sessionId);
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'exit', exitCode, signal }));
        }
      });
    } else {
      console.log('♻️  기존 PTY 세션 재사용:', sessionId);
    }

    // WebSocket -> PTY (사용자 입력)
    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message.toString());

        if (msg.type === 'data') {
          // 사용자 입력을 PTY로 전송
          ptyProcess.write(msg.data);
        } else if (msg.type === 'resize') {
          // 터미널 크기 조정
          ptyProcess.resize(msg.cols, msg.rows);
          console.log('📐 터미널 크기 조정:', { cols: msg.cols, rows: msg.rows });
        }
      } catch (error) {
        console.error('❌ 메시지 처리 오류:', error);
      }
    });

    // WebSocket 연결 종료
    ws.on('close', () => {
      console.log('🔌 WebSocket 연결 종료:', sessionId);
      // PTY는 유지 (재연결 가능)
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket 오류:', error);
    });

    // 연결 성공 메시지
    ws.send(JSON.stringify({
      type: 'connected',
      sessionId,
      shell: ptyProcess.process,
      cwd: projectPath
    }));
  });

  // HTTP 업그레이드 처리 (WebSocket)
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url);

    if (pathname === '/terminal') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
    // Next.js HMR 및 기타 WebSocket은 무시 (자동 처리됨)
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server ready on ws://${hostname}:${port}/terminal`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    // 모든 PTY 세션 종료
    ptySessions.forEach((pty, sessionId) => {
      console.log('Closing PTY session:', sessionId);
      pty.kill();
    });
    ptySessions.clear();

    server.close(() => {
      console.log('HTTP server closed');
    });
  });
});