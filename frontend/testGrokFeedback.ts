#!/usr/bin/env ts-node
/**
 * Grok 피드백 시스템 테스트 스크립트
 *
 * 사용법:
 *   ts-node scripts/testGrokFeedback.ts
 *
 * 또는 환경 변수 지정:
 *   GROK_API_KEY=your_key ts-node scripts/testGrokFeedback.ts
 */

const path = require('path');
const fs = require('fs');

// 환경 변수 로드
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

// 상대 경로로 모듈 import
const { IterationManager } = require('./src/features/grok-feedback/lib/iterationManager');

async function main() {
  console.log('='.repeat(80));
  console.log('Grok 피드백 시스템 테스트');
  console.log('='.repeat(80));
  console.log();

  // API 키 확인
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    console.error('❌ GROK_API_KEY 환경 변수가 설정되지 않았습니다.');
    console.error('frontend/.env.local 파일에 GROK_API_KEY를 설정해주세요.');
    process.exit(1);
  }

  console.log('✅ Grok API 키가 설정되어 있습니다.');
  console.log(`   키 앞 10자: ${apiKey.substring(0, 10)}...`);
  console.log();

  // 테스트 케이스 정의
  const testCases = [
    {
      name: '테트리스 게임',
      request: '테트리스 게임을 만들어줘. Next.js와 TypeScript를 사용하고, 기본적인 블록 이동, 회전, 줄 제거 기능을 포함해야 해.',
    },
    {
      name: '간단한 Todo 앱',
      request: 'React와 TypeScript로 간단한 Todo 앱을 만들어줘. 추가, 삭제, 완료 표시 기능이 필요해.',
    },
    {
      name: '템플릿 관리 게시판',
      request: `Next.js와 TypeScript를 사용하여 템플릿 관리 게시판을 만들어줘.

데이터베이스 테이블 구조:
- templates_id: 템플릿 ID (PK)
- tmplt_se_vl: 템플릿 구분 값
- tmplt_se_nm: 템플릿 구분 이름
- tmplt_nm: 템플릿 이름
- tmplt_dc: 템플릿 설명
- thmb_cnnl_img_file_nm: 썸네일 파일명
- thmb_cnnl_img_blob: 썸네일 이미지 BLOB
- use_yn: 사용 여부 (Y/N)
- sort_ordr: 정렬 순서
- crt_dt, crt_id, crt_nm: 생성일시, 생성자ID, 생성자명
- upd_dt, upd_id, upd_nm: 수정일시, 수정자ID, 수정자명

필요한 기능:
1. 목록 조회 (페이징, 정렬, 검색)
2. 상세 조회
3. 등록 (썸네일 이미지 업로드 포함)
4. 수정
5. 삭제
6. 사용 여부 토글

Feature-Driven 아키텍처로 구성하고, API Routes는 Next.js App Router 방식으로 구현해줘.`,
    },
  ];

  // 사용자가 명령줄에서 테스트 케이스를 지정할 수 있도록
  const testIndex = process.argv[2] ? parseInt(process.argv[2]) : 0;
  const selectedTest = testCases[testIndex] || testCases[0];

  console.log(`📝 테스트 케이스: ${selectedTest.name}`);
  console.log(`📋 요청: ${selectedTest.request}`);
  console.log();

  // IterationManager 인스턴스 생성
  const manager = new IterationManager(apiKey);

  console.log('🚀 반복 프로세스 시작...');
  console.log();

  try {
    // 반복 실행
    const result = await manager.iterate(selectedTest.request, {
      maxIterations: 5,
      minScore: 70,
      verbose: true,
    });

    // 결과 출력
    console.log('='.repeat(80));
    console.log('최종 결과');
    console.log('='.repeat(80));
    console.log();

    if (result.success) {
      console.log('✅ 성공! 사용 가능한 응답을 받았습니다.');
    } else {
      console.log('❌ 실패. 사용 가능한 응답을 얻지 못했습니다.');
    }

    console.log();
    console.log(`반복 횟수: ${result.iterations}`);
    console.log(`최종 점수: ${result.finalEvaluation.score}/100`);
    console.log(`사용 가능: ${result.finalEvaluation.isUsable ? '예' : '아니오'}`);
    console.log();

    // 히스토리 요약
    console.log('📊 반복 히스토리 요약:');
    result.history.forEach((entry: any) => {
      console.log(`  반복 ${entry.iteration}: ${entry.evaluation.score}점 (${entry.evaluation.isUsable ? '✅' : '❌'})`);
    });
    console.log();

    // 결과 저장
    const outputDir = path.join(__dirname, 'test-results');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(
      outputDir,
      `grok-feedback-${selectedTest.name.replace(/\s+/g, '-')}-${timestamp}.md`
    );

    manager.saveResults(result, outputPath);

    console.log();
    console.log('='.repeat(80));
    console.log('테스트 완료');
    console.log('='.repeat(80));

    // 성공 여부에 따라 종료 코드 설정
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error();
    console.error('❌ 오류 발생:');
    console.error(error);
    console.error();
    process.exit(1);
  }
}

// 스크립트 실행
main().catch((error) => {
  console.error('치명적 오류:', error);
  process.exit(1);
});
