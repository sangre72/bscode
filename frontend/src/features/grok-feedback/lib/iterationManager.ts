/**
 * 반복 관리자
 * 피드백 기반 프롬프트 개선의 반복 프로세스를 관리합니다.
 */

import { GrokClient, GrokMessage } from './grokClient';
import { FeedbackEvaluator, EvaluationResult } from './feedbackEvaluator';
import { PromptEnhancer } from './promptEnhancer';
import { buildSystemPrompt } from '@/utils/promptBuilder';

export interface IterationOptions {
  maxIterations?: number;
  minScore?: number;
  verbose?: boolean;
}

export interface IterationResult {
  success: boolean;
  finalResponse: string;
  finalEvaluation: EvaluationResult;
  iterations: number;
  history: Array<{
    iteration: number;
    prompt: string;
    response: string;
    evaluation: EvaluationResult;
  }>;
}

export class IterationManager {
  private client: GrokClient;
  private evaluator: FeedbackEvaluator;
  private enhancer: PromptEnhancer;
  private systemPrompt: string;

  constructor(apiKey?: string) {
    this.client = new GrokClient(apiKey);
    this.evaluator = new FeedbackEvaluator();
    this.enhancer = new PromptEnhancer();
    this.systemPrompt = buildSystemPrompt();
  }

  /**
   * 반복적으로 프롬프트를 개선하며 사용 가능한 응답 획득
   */
  async iterate(
    userRequest: string,
    options: IterationOptions = {}
  ): Promise<IterationResult> {
    const {
      maxIterations = 5,
      minScore = 70,
      verbose = true,
    } = options;

    const history: IterationResult['history'] = [];
    let currentResponse = '';
    let currentEvaluation: EvaluationResult | null = null;

    // 1. 첫 번째 시도
    if (verbose) {
      console.log('\n🚀 반복 1: 초기 프롬프트 전송\n');
    }

    const { systemPrompt, userPrompt } = this.enhancer.buildInitialPrompt(
      userRequest,
      this.systemPrompt
    );

    try {
      currentResponse = await this.client.sendPrompt(userPrompt, systemPrompt);
    } catch (error) {
      throw new Error(`Grok API 호출 실패: ${error}`);
    }

    currentEvaluation = this.evaluator.evaluate(currentResponse);

    history.push({
      iteration: 1,
      prompt: userPrompt,
      response: currentResponse,
      evaluation: currentEvaluation,
    });

    if (verbose) {
      console.log(this.evaluator.formatEvaluation(currentEvaluation));
    }

    // 첫 시도에서 성공한 경우
    if (currentEvaluation.isUsable && currentEvaluation.score >= minScore) {
      if (verbose) {
        console.log('✅ 첫 시도에서 사용 가능한 응답을 받았습니다!\n');
      }

      return {
        success: true,
        finalResponse: currentResponse,
        finalEvaluation: currentEvaluation,
        iterations: 1,
        history,
      };
    }

    // 2. 반복 개선
    for (let i = 2; i <= maxIterations; i++) {
      if (verbose) {
        console.log(`\n🔄 반복 ${i}: 프롬프트 보강 및 재시도\n`);
      }

      // 프롬프트 보강
      const enhancedPrompt = currentEvaluation.score < 50
        ? this.enhancer.enhanceAggressively({
            originalPrompt: userRequest,
            systemPrompt: this.systemPrompt,
            previousResponse: currentResponse,
            evaluationResult: currentEvaluation,
            iteration: i,
          })
        : this.enhancer.enhance({
            originalPrompt: userRequest,
            systemPrompt: this.systemPrompt,
            previousResponse: currentResponse,
            evaluationResult: currentEvaluation,
            iteration: i,
          });

      if (verbose) {
        console.log('📝 보강된 프롬프트:');
        console.log(enhancedPrompt.substring(0, 500) + '...\n');
      }

      // 대화 히스토리 구성
      const messages: GrokMessage[] = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: currentResponse },
        { role: 'user', content: enhancedPrompt },
      ];

      // API 호출
      try {
        currentResponse = await this.client.sendWithHistory(messages);
      } catch (error) {
        console.error(`❌ 반복 ${i}에서 API 호출 실패:`, error);
        break;
      }

      // 평가
      currentEvaluation = this.evaluator.evaluate(currentResponse);

      history.push({
        iteration: i,
        prompt: enhancedPrompt,
        response: currentResponse,
        evaluation: currentEvaluation,
      });

      if (verbose) {
        console.log(this.evaluator.formatEvaluation(currentEvaluation));
      }

      // 성공 조건 확인
      if (currentEvaluation.isUsable && currentEvaluation.score >= minScore) {
        if (verbose) {
          console.log(`✅ 반복 ${i}에서 사용 가능한 응답을 받았습니다!\n`);
        }

        return {
          success: true,
          finalResponse: currentResponse,
          finalEvaluation: currentEvaluation,
          iterations: i,
          history,
        };
      }

      // 점수가 계속 낮은 경우 조기 종료
      if (i >= 3 && currentEvaluation.score < 40) {
        if (verbose) {
          console.log(`⚠️  반복 ${i}까지 점수가 40점 미만입니다. 조기 종료합니다.\n`);
        }
        break;
      }
    }

    // 최대 반복 횟수 도달 또는 조기 종료
    if (verbose) {
      console.log('❌ 사용 가능한 응답을 얻지 못했습니다.\n');
      console.log(`최종 점수: ${currentEvaluation.score}/100\n`);
    }

    return {
      success: false,
      finalResponse: currentResponse,
      finalEvaluation: currentEvaluation,
      iterations: history.length,
      history,
    };
  }

  /**
   * 반복 결과를 파일로 저장
   */
  saveResults(result: IterationResult, outputPath: string): void {
    const fs = require('fs');
    const report = this.generateReport(result);
    fs.writeFileSync(outputPath, report, 'utf-8');
    console.log(`📄 결과를 ${outputPath}에 저장했습니다.`);
  }

  /**
   * 반복 결과 리포트 생성
   */
  private generateReport(result: IterationResult): string {
    let report = `# Grok 피드백 반복 테스트 결과\n\n`;
    report += `## 요약\n\n`;
    report += `- **성공 여부**: ${result.success ? '✅ 성공' : '❌ 실패'}\n`;
    report += `- **반복 횟수**: ${result.iterations}\n`;
    report += `- **최종 점수**: ${result.finalEvaluation.score}/100\n`;
    report += `- **사용 가능**: ${result.finalEvaluation.isUsable ? '예' : '아니오'}\n\n`;

    report += `## 최종 평가\n\n`;
    report += this.evaluator.formatEvaluation(result.finalEvaluation);

    report += `\n## 반복 히스토리\n\n`;

    result.history.forEach((entry) => {
      report += `### 반복 ${entry.iteration}\n\n`;
      report += `**점수**: ${entry.evaluation.score}/100\n\n`;

      if (entry.evaluation.strengths.length > 0) {
        report += `**강점**:\n`;
        entry.evaluation.strengths.forEach(s => report += `- ${s}\n`);
        report += `\n`;
      }

      if (entry.evaluation.issues.length > 0) {
        report += `**문제점**:\n`;
        entry.evaluation.issues.forEach(i => report += `- ${i}\n`);
        report += `\n`;
      }

      report += `**프롬프트 (처음 500자)**:\n\`\`\`\n${entry.prompt.substring(0, 500)}...\n\`\`\`\n\n`;
      report += `**응답 (처음 1000자)**:\n\`\`\`\n${entry.response.substring(0, 1000)}...\n\`\`\`\n\n`;
      report += `---\n\n`;
    });

    report += `## 최종 응답 (전체)\n\n`;
    report += `\`\`\`json\n${result.finalResponse}\n\`\`\`\n`;

    return report;
  }
}
