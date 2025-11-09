# 구현 방법론: 대화 인터페이스

이 디렉토리는 대화 인터페이스 구현에 대한 상세한 방법론과 가이드를 포함합니다.

## 📋 구현 가이드

### CLI 버전 구현
- [CLI 기본 구조](./cli-basic-structure.md)
- [LLM API 연동](./llm-api-integration.md)
- [대화 히스토리 관리](./conversation-history.md)
- [코드 컨텍스트 처리](./code-context-handling.md)

### React 앱 버전 구현
- [React 프로젝트 설정](./react-project-setup.md)
- [Electron/Tauri 설정](./electron-tauri-setup.md)
- [채팅 UI 컴포넌트](./chat-ui-components.md)
- [상태 관리](./state-management.md)

## 🔧 기술 스택별 가이드

### Python 기반
- Typer CLI 프레임워크
- Rich 터미널 UI
- OpenAI/Anthropic API 클라이언트

### Node.js 기반
- Commander CLI 프레임워크
- Inquirer 대화형 프롬프트
- OpenAI/Anthropic API 클라이언트

### React 기반
- Vite + React
- Electron 또는 Tauri
- Monaco Editor
- Tailwind CSS

## 📝 구현 체크리스트

각 구현 방법론 문서에는 다음이 포함됩니다:
- 단계별 구현 가이드
- 코드 예제
- 일반적인 문제 해결
- 최적화 팁

