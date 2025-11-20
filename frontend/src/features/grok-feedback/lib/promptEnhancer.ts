/**
 * 프롬프트 보강기
 * 평가 결과를 기반으로 프롬프트를 개선합니다.
 */

import { EvaluationResult } from './feedbackEvaluator';

export interface EnhancementContext {
  originalPrompt: string;
  systemPrompt: string;
  previousResponse?: string;
  evaluationResult: EvaluationResult;
  iteration: number;
}

export class PromptEnhancer {
  /**
   * 평가 결과를 기반으로 프롬프트 보강
   */
  enhance(context: EnhancementContext): string {
    let enhanced = ``;

    // 1. 반복 횟수 표시
    enhanced += `## 반복 ${context.iteration}\n\n`;

    // 2. 이전 응답과 평가 결과 요약
    if (context.previousResponse && context.evaluationResult) {
      enhanced += `### 이전 응답 평가\n`;
      enhanced += `점수: ${context.evaluationResult.score}/100\n`;
      enhanced += `사용 가능: ${context.evaluationResult.isUsable ? '예' : '아니오'}\n\n`;

      if (context.evaluationResult.issues.length > 0) {
        enhanced += `**발견된 문제점:**\n`;
        context.evaluationResult.issues.forEach((issue, idx) => {
          enhanced += `${idx + 1}. ${issue}\n`;
        });
        enhanced += `\n`;
      }

      if (context.evaluationResult.missingElements.length > 0) {
        enhanced += `**누락된 요소:**\n`;
        context.evaluationResult.missingElements.forEach((elem, idx) => {
          enhanced += `${idx + 1}. ${elem}\n`;
        });
        enhanced += `\n`;
      }
    }

    // 3. 구체적인 개선 지시사항
    enhanced += `### 개선 요청\n\n`;
    enhanced += `이전 응답에서 발견된 문제를 해결하여 다시 작성해주세요.\n\n`;

    // 4. 누락된 요소에 대한 구체적인 지시
    if (context.evaluationResult.missingElements.length > 0) {
      enhanced += `**필수 포함 사항:**\n`;

      context.evaluationResult.missingElements.forEach(elem => {
        if (elem === 'JSON 응답 형식') {
          enhanced += `- 응답을 반드시 \`\`\`json ... \`\`\` 코드 블록으로 감싸주세요\n`;
        } else if (elem === 'phase 필드') {
          enhanced += `- "phase" 필드를 포함하고 "planning" 또는 "execution" 값을 지정해주세요\n`;
        } else if (elem === 'plan.architecture') {
          enhanced += `- plan.architecture에 프로젝트 아키텍처에 대한 상세한 설명을 포함해주세요 (최소 20자)\n`;
        } else if (elem === 'plan.filesToCreate 또는 plan.filesToModify') {
          enhanced += `- plan.filesToCreate 또는 plan.filesToModify에 생성/수정할 파일 목록을 명시해주세요\n`;
        } else if (elem === 'plan.executionOrder') {
          enhanced += `- plan.executionOrder에 작업 실행 순서를 단계별로 명시해주세요\n`;
        } else if (elem === 'codeBlocks') {
          enhanced += `- codeBlocks 배열에 각 파일의 완전한 코드를 포함해주세요 (플레이스홀더 없이)\n`;
        } else if (elem === 'tasks') {
          enhanced += `- tasks 배열에 실행할 작업 목록을 포함해주세요 (각 작업은 type과 description 필수)\n`;
        } else {
          enhanced += `- ${elem}을(를) 포함해주세요\n`;
        }
      });
      enhanced += `\n`;
    }

    // 5. 구체적인 개선 제안
    if (context.evaluationResult.suggestions.length > 0) {
      enhanced += `**개선 제안:**\n`;
      context.evaluationResult.suggestions.forEach((suggestion, idx) => {
        enhanced += `${idx + 1}. ${suggestion}\n`;
      });
      enhanced += `\n`;
    }

    // 6. 특정 문제에 대한 상세 지시
    const hasPlaceholders = context.evaluationResult.issues.some(issue =>
      issue.includes('플레이스홀더')
    );

    if (hasPlaceholders) {
      enhanced += `**중요: 플레이스홀더 제거**\n`;
      enhanced += `코드 블록에 다음과 같은 플레이스홀더를 사용하지 마세요:\n`;
      enhanced += `- // TODO\n`;
      enhanced += `- // ...\n`;
      enhanced += `- /* ... */\n`;
      enhanced += `- ...implementation...\n`;
      enhanced += `\n`;
      enhanced += `대신, 완전하고 실행 가능한 코드를 작성해주세요.\n\n`;
    }

    const hasEmptyBlocks = context.evaluationResult.issues.some(issue =>
      issue.includes('비어있거나 너무 짧습니다')
    );

    if (hasEmptyBlocks) {
      enhanced += `**중요: 완전한 코드 작성**\n`;
      enhanced += `각 코드 블록은 최소 50자 이상의 완전한 코드를 포함해야 합니다.\n`;
      enhanced += `빈 파일이나 스텁 코드가 아닌, 실제 동작하는 코드를 작성해주세요.\n\n`;
    }

    // 7. 원래 요청 다시 강조
    enhanced += `---\n\n`;
    enhanced += `### 원래 요청\n`;
    enhanced += `${context.originalPrompt}\n\n`;

    // 8. 최종 지시
    enhanced += `---\n\n`;
    enhanced += `위의 모든 개선 사항을 반영하여, 원래 요청에 대한 완전하고 사용 가능한 응답을 제공해주세요.\n`;
    enhanced += `시스템 프롬프트의 모든 규칙을 준수하고, JSON 형식으로 응답해주세요.\n`;

    return enhanced;
  }

  /**
   * 첫 시도를 위한 초기 프롬프트 생성
   */
  buildInitialPrompt(userRequest: string, systemPrompt: string): {
    systemPrompt: string;
    userPrompt: string;
  } {
    // 시스템 프롬프트는 그대로 사용
    const enhancedSystemPrompt = systemPrompt;

    // 사용자 프롬프트에 명확한 지시 추가
    const enhancedUserPrompt = `${userRequest}\n\n` +
      `**중요 지시사항:**\n` +
      `1. 반드시 \`\`\`json ... \`\`\` 코드 블록 형식으로 응답해주세요\n` +
      `2. phase, analysis, plan 등 모든 필수 필드를 포함해주세요\n` +
      `3. codeBlocks에 완전한 코드를 포함해주세요 (플레이스홀더 사용 금지)\n` +
      `4. 각 파일에 대한 상세한 구현을 제공해주세요\n`;

    return {
      systemPrompt: enhancedSystemPrompt,
      userPrompt: enhancedUserPrompt,
    };
  }

  /**
   * 점수가 낮은 경우 더 강력한 보강
   */
  enhanceAggressively(context: EnhancementContext): string {
    let enhanced = this.enhance(context);

    // 점수가 50점 미만인 경우 추가 지시
    if (context.evaluationResult.score < 50) {
      enhanced += `\n\n**긴급: 심각한 문제 발견**\n`;
      enhanced += `현재 응답의 품질이 매우 낮습니다 (${context.evaluationResult.score}/100).\n`;
      enhanced += `다음 사항을 반드시 준수해주세요:\n\n`;

      enhanced += `1. **JSON 형식**: 응답 전체를 \`\`\`json ... \`\`\` 블록으로 감싸야 합니다\n`;
      enhanced += `2. **구조 준수**: phase, analysis, plan, codeBlocks 등 필수 필드를 모두 포함해야 합니다\n`;
      enhanced += `3. **완전한 코드**: 각 코드 블록은 실제 실행 가능한 완전한 코드여야 합니다\n`;
      enhanced += `4. **플레이스홀더 금지**: // TODO, ... 등의 플레이스홀더를 사용하지 마세요\n`;
      enhanced += `5. **상세한 설명**: analysis는 최소 50자, architecture는 최소 20자 이상이어야 합니다\n\n`;

      enhanced += `시스템 프롬프트를 다시 한 번 주의깊게 읽고, 모든 규칙을 준수해주세요.\n`;
    }

    return enhanced;
  }
}