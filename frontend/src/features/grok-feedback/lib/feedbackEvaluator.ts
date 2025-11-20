/**
 * 피드백 평가기
 * Grok API의 응답을 평가하여 실제로 사용 가능한지 확인합니다.
 */

import { StructuredResponse, parseStructuredResponse } from '@/utils/promptBuilder';

export interface EvaluationResult {
  isUsable: boolean;
  score: number; // 0-100 점수
  issues: string[];
  strengths: string[];
  missingElements: string[];
  suggestions: string[];
}

export class FeedbackEvaluator {
  /**
   * 응답 평가
   */
  evaluate(response: string): EvaluationResult {
    const result: EvaluationResult = {
      isUsable: false,
      score: 0,
      issues: [],
      strengths: [],
      missingElements: [],
      suggestions: [],
    };

    // 1. 구조화된 응답 파싱 시도
    const structured = parseStructuredResponse(response);

    if (!structured) {
      result.issues.push('구조화된 JSON 응답을 찾을 수 없습니다');
      result.missingElements.push('JSON 응답 형식');
      result.suggestions.push('응답을 ```json ... ``` 코드 블록으로 감싸주세요');
      result.score = 0;
      return result;
    }

    let score = 20; // 구조화된 응답이 있으면 기본 20점

    // 2. Phase 확인
    if (structured.phase) {
      score += 10;
      result.strengths.push(`Phase가 명시되어 있음: ${structured.phase}`);
    } else {
      result.issues.push('Phase가 명시되지 않았습니다');
      result.missingElements.push('phase 필드');
    }

    // 3. Analysis 확인
    if (structured.analysis && structured.analysis.length > 50) {
      score += 10;
      result.strengths.push('상세한 분석이 포함되어 있음');
    } else {
      result.issues.push('분석(analysis)이 부족하거나 없습니다');
      result.suggestions.push('요청에 대한 상세한 분석을 추가해주세요');
    }

    // 4. Plan 확인 (Planning 단계인 경우)
    if (structured.phase === 'planning') {
      if (structured.plan) {
        score += 20;
        result.strengths.push('계획(plan)이 포함되어 있음');

        // 4.1 Architecture 확인
        if (structured.plan.architecture && structured.plan.architecture.length > 20) {
          score += 10;
          result.strengths.push('아키텍처 설명이 포함되어 있음');
        } else {
          result.issues.push('아키텍처 설명이 부족합니다');
          result.missingElements.push('plan.architecture');
        }

        // 4.2 Files 확인
        const totalFiles =
          (structured.plan.filesToCreate?.length || 0) +
          (structured.plan.filesToModify?.length || 0);

        if (totalFiles > 0) {
          score += 10;
          result.strengths.push(`${totalFiles}개 파일에 대한 계획이 있음`);
        } else {
          result.issues.push('생성/수정할 파일이 명시되지 않았습니다');
          result.missingElements.push('plan.filesToCreate 또는 plan.filesToModify');
        }

        // 4.3 Execution Order 확인
        if (structured.plan.executionOrder && structured.plan.executionOrder.length > 0) {
          score += 10;
          result.strengths.push('실행 순서가 명시되어 있음');
        } else {
          result.issues.push('실행 순서가 명시되지 않았습니다');
          result.missingElements.push('plan.executionOrder');
        }
      } else {
        result.issues.push('Planning 단계임에도 불구하고 계획(plan)이 없습니다');
        result.missingElements.push('plan');
        result.suggestions.push('plan 객체에 architecture, filesToCreate, executionOrder 등을 포함해주세요');
      }
    }

    // 5. Code Blocks 확인
    if (structured.codeBlocks && structured.codeBlocks.length > 0) {
      score += 20;
      result.strengths.push(`${structured.codeBlocks.length}개 코드 블록이 포함되어 있음`);

      // 5.1 코드 블록 내용 확인
      const emptyBlocks = structured.codeBlocks.filter(
        cb => !cb.content || cb.content.trim().length < 50
      );

      if (emptyBlocks.length > 0) {
        result.issues.push(`${emptyBlocks.length}개 코드 블록이 비어있거나 너무 짧습니다`);
        result.suggestions.push('각 코드 블록에 완전한 코드를 포함해주세요');
        score -= 10;
      }

      // 5.2 플레이스홀더 확인
      const placeholderBlocks = structured.codeBlocks.filter(
        cb => cb.content && (
          cb.content.includes('// TODO') ||
          cb.content.includes('// ...') ||
          cb.content.includes('/* ... */') ||
          cb.content.includes('...implementation...')
        )
      );

      if (placeholderBlocks.length > 0) {
        result.issues.push(`${placeholderBlocks.length}개 코드 블록에 플레이스홀더가 있습니다`);
        result.suggestions.push('플레이스홀더를 실제 구현 코드로 교체해주세요');
        score -= 5;
      }
    } else {
      // Planning 단계에서도 코드 블록이 필요함
      if (structured.phase === 'planning' && structured.plan &&
          ((structured.plan.filesToCreate && structured.plan.filesToCreate.length > 0) ||
           (structured.plan.filesToModify && structured.plan.filesToModify.length > 0))) {
        result.issues.push('파일 생성/수정 계획이 있지만 코드 블록이 없습니다');
        result.missingElements.push('codeBlocks');
        result.suggestions.push('Planning 단계에서도 각 파일에 대한 코드 미리보기를 제공해주세요');
      }
    }

    // 6. Tasks 확인 (Execution 단계인 경우)
    if (structured.phase === 'execution') {
      if (structured.tasks && structured.tasks.length > 0) {
        score += 10;
        result.strengths.push(`${structured.tasks.length}개 작업이 정의되어 있음`);

        // 6.1 작업의 완전성 확인
        const incompleteTasks = structured.tasks.filter(
          t => !t.type || !t.description
        );

        if (incompleteTasks.length > 0) {
          result.issues.push(`${incompleteTasks.length}개 작업이 불완전합니다`);
          result.suggestions.push('모든 작업에 type과 description을 포함해주세요');
          score -= 5;
        }
      } else {
        result.issues.push('Execution 단계임에도 불구하고 작업(tasks)이 없습니다');
        result.missingElements.push('tasks');
        result.suggestions.push('실행할 작업 목록을 tasks 배열에 포함해주세요');
      }
    }

    // 7. Questions 확인
    if (structured.questions && structured.questions.length > 0) {
      result.strengths.push(`${structured.questions.length}개 질문이 포함되어 있음`);
      result.suggestions.push('질문에 대한 답변을 제공하면 더 나은 결과를 얻을 수 있습니다');
    }

    // 점수 범위 제한
    result.score = Math.max(0, Math.min(100, score));

    // 사용 가능 여부 판단
    // Planning 단계: 60점 이상이면 사용 가능
    // Execution 단계: 70점 이상이면 사용 가능
    const threshold = structured.phase === 'planning' ? 60 : 70;
    result.isUsable = result.score >= threshold && result.issues.length <= 3;

    if (!result.isUsable && result.score >= threshold) {
      result.suggestions.push('주요 이슈들을 해결하면 사용 가능할 것입니다');
    }

    return result;
  }

  /**
   * 평가 결과를 사람이 읽을 수 있는 형태로 포맷
   */
  formatEvaluation(result: EvaluationResult): string {
    let output = `\n=== 피드백 평가 결과 ===\n`;
    output += `점수: ${result.score}/100\n`;
    output += `사용 가능: ${result.isUsable ? '✅ 예' : '❌ 아니오'}\n\n`;

    if (result.strengths.length > 0) {
      output += `강점:\n`;
      result.strengths.forEach(s => output += `  ✓ ${s}\n`);
      output += `\n`;
    }

    if (result.issues.length > 0) {
      output += `문제점:\n`;
      result.issues.forEach(i => output += `  ✗ ${i}\n`);
      output += `\n`;
    }

    if (result.missingElements.length > 0) {
      output += `누락된 요소:\n`;
      result.missingElements.forEach(m => output += `  - ${m}\n`);
      output += `\n`;
    }

    if (result.suggestions.length > 0) {
      output += `개선 제안:\n`;
      result.suggestions.forEach(s => output += `  💡 ${s}\n`);
      output += `\n`;
    }

    return output;
  }
}