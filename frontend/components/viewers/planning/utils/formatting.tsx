import React from "react";

// ANSI 색상 코드 제거 함수
export const stripAnsiCodes = (text: string): string => {
  // ANSI 이스케이프 시퀀스 제거 (ESC[ ... m 형태)
  return text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
};

// 마크다운 텍스트 포맷팅 (간단한 버전)
export const formatMarkdownText = (text: string): React.ReactNode => {
  const parts: Array<{ type: string; content: string; language?: string }> = [];
  let lastIndex = 0;

  // 코드 블록 처리
  const codeBlockPattern = /```(\w+)?\n?([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: text.substring(lastIndex, match.index),
      });
    }
    parts.push({
      type: "codeBlock",
      content: match[2],
      language: match[1] || "",
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: "text",
      content: text.substring(lastIndex),
    });
  }

  return (
    <div className="space-y-2">
      {parts.map((part, idx) => {
        if (part.type === "codeBlock") {
          return (
            <div key={idx} className="my-2 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
              {part.language && (
                <div className="bg-gray-200 dark:bg-gray-700 px-3 py-1 text-xs text-gray-600 dark:text-gray-400">
                  {part.language}
                </div>
              )}
              <pre className="bg-gray-50 dark:bg-gray-800 p-3 overflow-x-auto">
                <code className="text-xs font-mono whitespace-pre">{part.content}</code>
              </pre>
            </div>
          );
        }

        // 텍스트 처리: 마크다운 헤더, 리스트, 강조 등
        const lines = part.content.split('\n');
        return (
          <div key={idx} className="space-y-1 whitespace-pre-wrap">
            {lines.map((line, lineIdx) => {
              // 헤더 처리
              if (line.match(/^###\s+/)) {
                return (
                  <h3 key={lineIdx} className="text-base font-semibold text-gray-900 dark:text-gray-100 mt-3 mb-2">
                    {line.replace(/^###\s+/, '')}
                  </h3>
                );
              }
              if (line.match(/^##\s+/)) {
                return (
                  <h2 key={lineIdx} className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-4 mb-2">
                    {line.replace(/^##\s+/, '')}
                  </h2>
                );
              }
              if (line.match(/^#\s+/)) {
                return (
                  <h1 key={lineIdx} className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-4 mb-2">
                    {line.replace(/^#\s+/, '')}
                  </h1>
                );
              }
              // 리스트 처리
              if (line.match(/^[-*]\s+/)) {
                return (
                  <div key={lineIdx} className="ml-4">
                    <span className="text-gray-700 dark:text-gray-300">• {line.replace(/^[-*]\s+/, '')}</span>
                  </div>
                );
              }
              if (line.match(/^\d+\.\s+/)) {
                return (
                  <div key={lineIdx} className="ml-4">
                    <span className="text-gray-700 dark:text-gray-300">{line}</span>
                  </div>
                );
              }
              // 강조 처리
              let formattedLine = line;
              formattedLine = formattedLine.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');
              formattedLine = formattedLine.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
              formattedLine = formattedLine.replace(/`(.*?)`/g, '<code class="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>');

              if (line.trim() === '') {
                return <br key={lineIdx} />;
              }

              return (
                <p key={lineIdx} className="text-gray-700 dark:text-gray-300" dangerouslySetInnerHTML={{ __html: formattedLine }} />
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

// 분석 결과 포맷팅 함수
export const formatAnalysisResult = (content: string): React.ReactNode => {
  // JSON 코드 블록 추출 시도
  const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      const jsonData = JSON.parse(jsonBlockMatch[1]);
      
      return (
        <div className="space-y-4">
          {/* Analysis 섹션 */}
          {jsonData.analysis && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                분석 내용
              </h4>
              <div className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                {formatMarkdownText(jsonData.analysis)}
              </div>
            </div>
          )}

          {/* Plan 섹션 */}
          {jsonData.plan && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                계획
              </h4>
              <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 space-y-3">
                {jsonData.plan.architecture && (
                  <div>
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      아키텍처:
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {jsonData.plan.architecture}
                    </div>
                  </div>
                )}
                
                {jsonData.plan.subTasks && jsonData.plan.subTasks.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      세부 작업:
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {jsonData.plan.subTasks.map((task: { name?: string; description?: string }, taskIdx: number) => (
                        <li key={taskIdx}>
                          <span className="font-medium">{task.name}:</span> {task.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Questions가 있으면 표시 */}
          {jsonData.questions && jsonData.questions.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                질문
              </h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded border border-yellow-200 dark:border-yellow-800">
                {jsonData.questions.map((q: string, qIdx: number) => (
                  <li key={qIdx}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    } catch (error) {
      // JSON 파싱 실패 시 원본 텍스트 반환
      console.error("JSON 파싱 실패:", error);
    }
  }

  // JSON 블록이 없으면 일반 텍스트로 처리
  return formatMarkdownText(content);
};

