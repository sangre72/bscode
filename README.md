# Code Assistant Frontend

AI 기반 코드 개발 보조 도구의 프론트엔드 애플리케이션입니다. Next.js와 React를 기반으로 구축된 웹 애플리케이션으로, 프로젝트 관리, 파일 편집, AI 채팅 기능을 제공합니다.

## 📋 목차

- [개념 및 개요](#개념-및-개요)
- [시작하기](#시작하기)
- [프로젝트 구조](#프로젝트-구조)
- [주요 기능](#주요-기능)
- [API 엔드포인트](#api-엔드포인트)
- [기술 스택](#기술-스택)
- [개발 가이드](#개발-가이드)

## 🎯 개념 및 개요

이 애플리케이션은 AI 기반 코드 개발 보조 도구로, 다음과 같은 핵심 개념을 기반으로 합니다:

### 주요 개념

1. **프로젝트 중심 작업**
   - 프로젝트 단위로 파일과 작업을 관리
   - 최근 프로젝트 목록을 통해 빠른 접근
   - 프로젝트별 프로필 및 메타데이터 관리

2. **멀티 파일 편집**
   - 여러 파일을 동시에 탭으로 열어 작업
   - 다양한 파일 타입 지원 (텍스트, 이미지, 비디오, 오디오, 폰트, 문서 등)
   - Diff 뷰어를 통한 변경사항 비교

3. **AI 통합 채팅**
   - 코드 컨텍스트를 포함한 AI 대화
   - 여러 LLM 모델 지원 (Grok, Ollama)
   - 스트리밍 응답 지원

4. **계획(Planning) 관리**
   - 프로젝트 계획 생성 및 저장
   - 계획 검토 및 실행

## 🚀 시작하기

### 사전 요구사항

- **Node.js**: 18.x 이상
- **npm** 또는 **pnpm**: 패키지 관리자
- **백엔드 서버**: API 서버가 실행 중이어야 합니다

### 설치

1. **의존성 설치**

```bash
cd frontend
npm install
# 또는
pnpm install
```

2. **환경 변수 설정**

프로젝트 루트에 `.env.local` 파일을 생성하고 필요한 환경 변수를 설정하세요:

```bash
# Grok API 설정 (선택사항)
GROK_API_KEY=your_grok_api_key_here

# Ollama 설정 (선택사항)
OLLAMA_BASE_URL=http://localhost:11434

# 백엔드 API URL (필요시)
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 개발 서버 실행

```bash
npm run dev
# 또는
pnpm dev
```

개발 서버가 시작되면 브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

### 프로덕션 빌드

```bash
# 빌드
npm run build

# 프로덕션 서버 실행
npm start
```

### 린트 실행

```bash
npm run lint
```

## 📁 프로젝트 구조

```
frontend/
├── app/                          # Next.js App Router
│   ├── api/                      # API 라우트
│   │   ├── chat/                 # AI 채팅 API
│   │   ├── commands/              # 명령 실행 API
│   │   ├── files/                # 파일 관리 API
│   │   │   ├── read/             # 파일 읽기
│   │   │   ├── write/            # 파일 쓰기
│   │   │   ├── tree/             # 파일 트리 조회
│   │   │   ├── search/           # 파일 검색
│   │   │   └── related/          # 관련 파일 찾기
│   │   ├── planning/             # 계획 관리 API
│   │   │   ├── list/             # 계획 목록
│   │   │   ├── read/             # 계획 읽기
│   │   │   ├── save/             # 계획 저장
│   │   │   └── delete/           # 계획 삭제
│   │   ├── projects/             # 프로젝트 관리 API
│   │   │   ├── current/          # 현재 프로젝트
│   │   │   ├── profile/          # 프로젝트 프로필
│   │   │   ├── structure/        # 프로젝트 구조
│   │   │   └── analyze/          # 프로젝트 분석
│   │   └── typescript/           # TypeScript 진단
│   ├── layout.tsx                # 루트 레이아웃
│   ├── page.tsx                  # 메인 페이지
│   └── globals.css               # 전역 스타일
├── components/                    # React 컴포넌트
│   ├── ProjectSidebar.tsx        # 좌측 프로젝트 사이드바
│   ├── ChatPanel.tsx             # 우측 AI 채팅 패널
│   ├── ResourceViewer.tsx        # 중앙 리소스 뷰어
│   ├── FileTree.tsx              # 파일 트리 컴포넌트
│   ├── CodeEditor.tsx            # 코드 에디터
│   ├── PlanningReview.tsx        # 계획 검토 컴포넌트
│   ├── TaskExecutor.tsx          # 작업 실행 컴포넌트
│   ├── WorkflowExecutor.tsx      # 워크플로우 실행 컴포넌트
│   └── viewers/                  # 파일 타입별 뷰어
│       ├── default/              # 기본 텍스트 뷰어
│       ├── image/                # 이미지 뷰어
│       ├── video/                # 비디오 뷰어
│       ├── audio/                # 오디오 뷰어
│       ├── font/                 # 폰트 뷰어
│       ├── document/             # 문서 뷰어
│       ├── diff/                 # Diff 뷰어
│       ├── planning/             # 계획 뷰어
│       ├── typescript/           # TypeScript 뷰어
│       ├── javascript/           # JavaScript 뷰어
│       └── python/               # Python 뷰어
├── utils/                         # 유틸리티 함수
│   ├── codeParser.ts             # 코드 파싱
│   ├── promptBuilder.ts          # 프롬프트 빌더
│   ├── taskParser.ts             # 작업 파싱
│   └── workflowEngine.ts         # 워크플로우 엔진
├── recent-projects/               # 최근 프로젝트 데이터
├── package.json                   # 프로젝트 설정
├── tsconfig.json                  # TypeScript 설정
├── next.config.ts                 # Next.js 설정
└── README.md                      # 이 파일
```

## ✨ 주요 기능

### 1. 프로젝트 관리

- **프로젝트 선택**: 최근 프로젝트 목록에서 프로젝트 선택
- **프로젝트 프로필**: 프로젝트 메타데이터 및 프로필 정보 조회
- **프로젝트 구조**: 프로젝트 파일 트리 구조 표시

### 2. 파일 관리

- **파일 트리**: 계층적 파일 구조 탐색
- **다중 파일 편집**: 여러 파일을 탭으로 열어 동시 편집
- **파일 검색**: 프로젝트 내 파일 검색
- **관련 파일 찾기**: 현재 파일과 관련된 파일 자동 탐색

### 3. 다양한 파일 타입 지원

- **텍스트 파일**: 코드 하이라이팅 지원 (TypeScript, JavaScript, Python 등)
- **이미지**: 이미지 미리보기 및 표시
- **비디오**: 비디오 재생
- **오디오**: 오디오 재생
- **폰트**: 폰트 미리보기
- **문서**: PDF, Word 등 문서 표시
- **Diff 뷰어**: 변경사항 비교 및 표시
- **계획 뷰어**: JSON 형식의 계획 데이터 표시

### 4. AI 채팅 기능

- **다중 모델 지원**: Grok, Ollama 등 여러 LLM 모델 선택
- **코드 컨텍스트**: 현재 편집 중인 코드를 컨텍스트로 전달
- **스트리밍 응답**: 실시간으로 응답 스트리밍
- **대화 히스토리**: 이전 대화 내용 유지
- **프롬프트 템플릿**: 자주 사용하는 프롬프트 템플릿 제공

### 5. 계획(Planning) 관리

- **계획 생성**: 프로젝트 계획 생성 및 저장
- **계획 목록**: 저장된 계획 목록 조회
- **계획 검토**: 계획 상세 내용 검토 및 실행

### 6. 코드 편집 기능

- **Monaco Editor**: VS Code와 동일한 코드 에디터
- **자동 완성**: 언어별 자동 완성 지원
- **구문 강조**: 다양한 언어 구문 강조
- **코드 변경 감지**: 코드 변경사항 자동 감지 및 Diff 표시

### 7. UI/UX 기능

- **다크 모드**: 다크 테마 지원
- **리사이징**: 패널 크기 조절 가능
- **탭 관리**: 여러 파일을 탭으로 관리
- **드래그 앤 드롭**: 파일 드래그 앤 드롭 지원

## 🔌 API 엔드포인트

### 채팅 API

- **POST `/api/chat`**: AI 채팅 요청
  - 요청 본문:
    ```json
    {
      "message": "사용자 메시지",
      "history": [대화 히스토리],
      "context": "현재 편집 중인 코드",
      "model": "grok-code-fast-1"
    }
    ```

### 파일 API

- **GET `/api/files/read`**: 파일 읽기
  - 쿼리 파라미터: `path`, `projectPath`
  
- **POST `/api/files/write`**: 파일 쓰기
  - 요청 본문: `{ path, content, projectPath }`
  
- **GET `/api/files/tree`**: 파일 트리 조회
  - 쿼리 파라미터: `projectPath`
  
- **GET `/api/files/search`**: 파일 검색
  - 쿼리 파라미터: `query`, `projectPath`
  
- **GET `/api/files/related`**: 관련 파일 찾기
  - 쿼리 파라미터: `path`, `projectPath`

### 프로젝트 API

- **GET `/api/projects/current`**: 현재 프로젝트 조회
- **GET `/api/projects/profile`**: 프로젝트 프로필 조회
  - 쿼리 파라미터: `projectPath`
- **GET `/api/projects/structure`**: 프로젝트 구조 조회
  - 쿼리 파라미터: `projectPath`
- **POST `/api/projects/analyze`**: 프로젝트 분석
  - 요청 본문: `{ projectPath }`

### 계획 API

- **GET `/api/planning/list`**: 계획 목록 조회
  - 쿼리 파라미터: `projectPath`
- **GET `/api/planning/read`**: 계획 읽기
  - 쿼리 파라미터: `filename`, `projectPath`
- **POST `/api/planning/save`**: 계획 저장
  - 요청 본문: `{ planningData, projectPath }`
- **DELETE `/api/planning/delete`**: 계획 삭제
  - 쿼리 파라미터: `filename`, `projectPath`

### 명령 실행 API

- **POST `/api/commands/execute`**: 명령 실행
  - 요청 본문: `{ command, projectPath }`

### TypeScript 진단 API

- **GET `/api/typescript/diagnostics`**: TypeScript 진단
  - 쿼리 파라미터: `filePath`, `projectPath`

## 🛠 기술 스택

### 핵심 프레임워크

- **Next.js 16**: React 기반 풀스택 프레임워크
- **React 19**: UI 라이브러리
- **TypeScript 5**: 타입 안정성

### 스타일링

- **Tailwind CSS 4**: 유틸리티 기반 CSS 프레임워크
- **PostCSS**: CSS 후처리

### 코드 에디터

- **Monaco Editor**: VS Code 에디터 엔진
- **@monaco-editor/react**: React용 Monaco Editor 래퍼

### UI 컴포넌트

- **Lucide React**: 아이콘 라이브러리
- **Sonner**: 토스트 알림 라이브러리

### 개발 도구

- **ESLint**: 코드 린팅
- **TypeScript**: 타입 체크

## 📖 개발 가이드

### 컴포넌트 개발

컴포넌트는 `components/` 디렉토리에 위치하며, 다음과 같은 구조를 따릅니다:

```typescript
"use client"; // 클라이언트 컴포넌트인 경우

interface ComponentProps {
  // Props 타입 정의
}

export default function Component({ props }: ComponentProps) {
  // 컴포넌트 로직
  return (
    // JSX
  );
}
```

### API 라우트 개발

API 라우트는 `app/api/` 디렉토리에 위치하며, Next.js App Router의 Route Handler를 사용합니다:

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // GET 요청 처리
  return NextResponse.json({ data: "response" });
}

export async function POST(request: NextRequest) {
  // POST 요청 처리
  const body = await request.json();
  return NextResponse.json({ success: true });
}
```

### 스타일링

Tailwind CSS를 사용하여 스타일링합니다:

```tsx
<div className="flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-800">
  <p className="text-lg font-semibold">Content</p>
</div>
```

### 상태 관리

React의 `useState`와 `useEffect` 훅을 사용하여 상태를 관리합니다. 복잡한 상태 관리가 필요한 경우 Context API를 사용할 수 있습니다.

### 파일 타입별 뷰어 추가

새로운 파일 타입 뷰어를 추가하려면:

1. `components/viewers/` 디렉토리에 새 뷰어 컴포넌트 생성
2. `ResourceViewer.tsx`에서 파일 타입에 따라 뷰어 선택 로직 추가
3. `page.tsx`의 `getFileType` 함수에 새 파일 타입 추가

## 🔧 문제 해결

### 포트 충돌

기본 포트 3000이 사용 중인 경우:

```bash
npm run dev -- -p 3001
```

### 빌드 오류

TypeScript 오류가 발생하는 경우:

```bash
npm run lint
```

의존성 문제가 있는 경우:

```bash
rm -rf node_modules package-lock.json
npm install
```

### API 연결 오류

백엔드 서버가 실행 중인지 확인하고, `.env.local` 파일의 API URL 설정을 확인하세요.

## 📝 라이선스

이 프로젝트의 라이선스는 프로젝트 루트의 LICENSE 파일을 참조하세요.

## 🤝 기여

버그 리포트나 기능 제안은 이슈로 등록해 주세요. Pull Request도 환영합니다.
