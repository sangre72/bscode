# Code Assistant Frontend

AI 기반 코드 개발 보조 도구의 프론트엔드 애플리케이션입니다.

## 🎨 레이아웃 구조

애플리케이션은 세 가지 주요 섹션으로 구성됩니다:

### 1. 좌측: 프로젝트 섹션
- **상단**: 현재 진행중인 프로젝트 이름
- **하단**: 최근 프로젝트 목록

### 2. 중앙: 컨텐츠 섹션
- **소스 코드 에디터**: Monaco Editor를 사용한 코드 편집 창

### 3. 우측: LLM 대화 섹션
- **상단**: 대화 결과창 (채팅 히스토리)
- **하단**: 대화 입력창

## 🚀 시작하기

### 환경 변수 설정

`.env.local` 파일을 생성하고 Grok API 키를 설정하세요:

```bash
GROK_API_KEY=your_grok_api_key_here
```

### 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

### 빌드

```bash
npm run build
npm start
```

## 📦 주요 기술 스택

- **Next.js 16**: React 프레임워크
- **TypeScript**: 타입 안정성
- **Tailwind CSS**: 스타일링
- **Monaco Editor**: 코드 에디터
- **Lucide React**: 아이콘
- **Grok API (xAI)**: LLM 통신

## 📁 프로젝트 구조

```
frontend/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts      # Grok API 연동 라우트
│   ├── layout.tsx             # 루트 레이아웃
│   ├── page.tsx               # 메인 페이지
│   └── globals.css            # 전역 스타일
├── components/
│   ├── ProjectSidebar.tsx     # 좌측 프로젝트 사이드바
│   ├── CodeEditor.tsx         # 중앙 코드 에디터
│   └── ChatPanel.tsx          # 우측 채팅 패널
└── README.md
```

## 🔧 Grok API 연동

Grok API가 연동되어 있습니다. `.env.local` 파일에 API 키를 설정하면 됩니다:

```bash
GROK_API_KEY=your_api_key
```

### API 엔드포인트

- **POST /api/chat**: Grok API를 통한 채팅 요청
  - 요청 본문:
    ```json
    {
      "message": "사용자 메시지",
      "history": [대화 히스토리],
      "context": "현재 편집 중인 코드"
    }
    ```
  - 응답:
    ```json
    {
      "response": "AI 응답"
    }
    ```

## ✅ 구현된 기능

- ✅ 3섹션 레이아웃 (프로젝트 / 컨텐츠 / 대화)
- ✅ Monaco Editor 통합
- ✅ Grok API 연동
- ✅ 채팅 UI (메시지 히스토리)
- ✅ 코드 컨텍스트 전달
- ✅ 다크 모드 지원
- ✅ 반응형 디자인

## 🎯 향후 개선 사항

1. **파일 트리**: 좌측에 실제 프로젝트 파일 트리 표시
2. **코드 하이라이팅**: 채팅 메시지 내 코드 블록 하이라이팅
3. **마크다운 렌더링**: AI 응답의 마크다운 지원
4. **코드 미리보기**: 생성된 코드를 바로 에디터에 적용
5. **프로젝트 전환**: 프로젝트 변경 시 상태 유지
6. **스트리밍 응답**: 실시간으로 응답 스트리밍
