# React 프로젝트 설정 가이드

## ✅ 완료된 작업

React/Next.js 기반 대화 인터페이스가 구성되었습니다.

## 📁 프로젝트 구조

```
frontend/
├── app/
│   ├── layout.tsx          # 루트 레이아웃
│   ├── page.tsx            # 메인 페이지 (3섹션 레이아웃)
│   └── globals.css         # 전역 스타일
├── components/
│   ├── ProjectSidebar.tsx  # 좌측: 프로젝트 섹션
│   ├── CodeEditor.tsx      # 중앙: 소스 코드 에디터
│   └── ChatPanel.tsx       # 우측: LLM 대화 섹션
└── README.md
```

## 🎨 레이아웃 구성

### 좌측: 프로젝트 섹션 (`ProjectSidebar.tsx`)
- **상단**: 현재 진행중인 프로젝트 이름 표시
- **하단**: 최근 프로젝트 목록 (클릭으로 전환 가능)

### 중앙: 컨텐츠 섹션 (`CodeEditor.tsx`)
- Monaco Editor를 사용한 코드 편집 창
- 파일 선택 시 자동으로 언어 감지
- 다크 모드 지원

### 우측: LLM 대화 섹션 (`ChatPanel.tsx`)
- **상단**: 대화 결과창 (메시지 히스토리)
- **하단**: 대화 입력창 (Enter로 전송, Shift+Enter로 줄바꿈)

## 🚀 실행 방법

```bash
cd frontend
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속

## 🔧 다음 구현 단계

### 1. LLM API 연동

`components/ChatPanel.tsx`의 `handleSend` 함수를 수정:

```typescript
const handleSend = async () => {
  // ... 기존 코드 ...
  
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: input,
        history: messages,
        context: fileContent, // 현재 편집 중인 코드 컨텍스트
      }),
    });
    
    const data = await response.json();
    const assistantMessage: Message = {
      role: 'assistant',
      content: data.response,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMessage]);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    setIsLoading(false);
  }
};
```

### 2. API 라우트 생성

`app/api/chat/route.ts` 생성:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { message, history, context } = await request.json();
  
  // LLM API 호출 (OpenAI, Anthropic 등)
  // TODO: 실제 LLM API 연동
  
  return NextResponse.json({
    response: 'LLM 응답이 여기에 표시됩니다.',
  });
}
```

### 3. 파일 시스템 연동

프로젝트의 실제 파일 목록을 표시하고 로드하는 기능 추가:

```typescript
// 파일 목록 가져오기
const getProjectFiles = async (projectPath: string) => {
  // fs 또는 API를 통해 파일 목록 가져오기
};
```

### 4. 상태 관리 개선

필요시 Zustand 또는 Redux 추가:

```bash
npm install zustand
```

## 📝 주요 기능

- ✅ 3섹션 레이아웃 (프로젝트 / 컨텐츠 / 대화)
- ✅ Monaco Editor 통합
- ✅ 채팅 UI (메시지 히스토리)
- ✅ 다크 모드 지원
- ✅ 반응형 디자인

## 🎯 향후 개선 사항

1. **파일 트리**: 좌측에 실제 프로젝트 파일 트리 표시
2. **코드 하이라이팅**: 채팅 메시지 내 코드 블록 하이라이팅
3. **마크다운 렌더링**: AI 응답의 마크다운 지원
4. **코드 미리보기**: 생성된 코드를 바로 에디터에 적용
5. **프로젝트 전환**: 프로젝트 변경 시 상태 유지

