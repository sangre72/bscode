/**
 * 작업 워크플로우 엔진
 * 요청을 분석하고 단계별로 처리하는 시스템
 */

export enum WorkflowStage {
  ANALYSIS = "analysis",           // 요청 분석
  DESIGN = "design",              // 처리 방식 설계
  RESOURCE_GATHERING = "resource_gathering", // 리소스 수집
  EXECUTION_PLAN = "execution_plan", // 실행 계획 수립
  EXECUTION = "execution",        // 순차적 실행
  VALIDATION = "validation",      // 검증
  COMPLETION = "completion"       // 완료
}

export enum TaskType {
  INSTALL = "install",            // 라이브러리 설치
  FIND_FILES = "find_files",      // 대상 파일 찾기
  ANALYZE_SOURCE = "analyze_source", // 소스 분석
  MODIFY_SOURCE = "modify_source", // 소스 수정
  COMPARE = "compare",           // 기존 소스와 비교
  APPLY = "apply",               // 적용
  VERIFY = "verify"              // 검증
}

export interface WorkflowTask {
  id: string;
  type: TaskType;
  stage: WorkflowStage;
  description: string;
  dependencies: string[]; // 선행 작업 ID 목록
  target?: string; // 파일 경로 또는 패키지명
  content?: string; // 파일 내용
  command?: string; // 실행할 명령어
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  result?: {
    success: boolean;
    message: string;
    data?: unknown;
  };
  metadata?: Record<string, unknown>;
}

export interface WorkflowContext {
  request: string;
  projectPath: string;
  contextFiles: Array<{ path: string; name: string }>;
  projectType?: string;
  tasks: WorkflowTask[];
  currentStage: WorkflowStage;
  results: Map<string, unknown>;
}

/**
 * 요청 분석 단계
 */
export function analyzeRequest(
  request: string,
  _contextFiles: Array<{ path: string; name: string }>,
  _projectType?: string
): {
  intent: string;
  requiredResources: string[];
  estimatedTasks: TaskType[];
} {
  const intent = request.toLowerCase();
  const requiredResources: string[] = [];
  const estimatedTasks: TaskType[] = [];

  // 라이브러리 추가 요청 감지
  if (intent.includes("추가") || intent.includes("install") || intent.includes("설치")) {
    estimatedTasks.push(TaskType.INSTALL);
    estimatedTasks.push(TaskType.FIND_FILES);
    estimatedTasks.push(TaskType.ANALYZE_SOURCE);
    estimatedTasks.push(TaskType.MODIFY_SOURCE);
  }

  // 파일 수정 요청 감지
  if (intent.includes("수정") || intent.includes("변경") || intent.includes("modify")) {
    estimatedTasks.push(TaskType.FIND_FILES);
    estimatedTasks.push(TaskType.ANALYZE_SOURCE);
    estimatedTasks.push(TaskType.MODIFY_SOURCE);
    estimatedTasks.push(TaskType.COMPARE);
  }

  // 파일 생성 요청 감지
  if (intent.includes("생성") || intent.includes("만들") || intent.includes("create")) {
    estimatedTasks.push(TaskType.MODIFY_SOURCE);
  }

  // 항상 필요한 작업
  if (estimatedTasks.length > 0) {
    estimatedTasks.push(TaskType.VERIFY);
    estimatedTasks.push(TaskType.APPLY);
  }

  return {
    intent,
    requiredResources,
    estimatedTasks,
  };
}

/**
 * 처리 방식 설계 단계
 */
export function designSolution(
  analysis: ReturnType<typeof analyzeRequest>,
  _context: Partial<WorkflowContext>
): WorkflowTask[] {
  const tasks: WorkflowTask[] = [];
  let taskId = 0;

  // 1. 라이브러리 설치 작업
  if (analysis.estimatedTasks.includes(TaskType.INSTALL)) {
    // LLM 응답에서 패키지명 추출 (실제로는 LLM이 제공)
    // 여기서는 예시로 처리
    tasks.push({
      id: `task-${taskId++}`,
      type: TaskType.INSTALL,
      stage: WorkflowStage.EXECUTION,
      description: "필요한 라이브러리 설치",
      dependencies: [],
      status: "pending",
      metadata: { packages: [] }, // LLM이 채움
    });
  }

  // 2. 대상 파일 찾기
  if (analysis.estimatedTasks.includes(TaskType.FIND_FILES)) {
    tasks.push({
      id: `task-${taskId++}`,
      type: TaskType.FIND_FILES,
      stage: WorkflowStage.RESOURCE_GATHERING,
      description: "수정/생성할 대상 파일 찾기",
      dependencies: [],
      status: "pending",
    });
  }

  // 3. 소스 분석
  let analyzeSourceTaskId: string | null = null;
  if (analysis.estimatedTasks.includes(TaskType.ANALYZE_SOURCE)) {
    const findFilesTaskId = tasks[tasks.length - 1]?.id;
    analyzeSourceTaskId = `task-${taskId++}`;
    tasks.push({
      id: analyzeSourceTaskId,
      type: TaskType.ANALYZE_SOURCE,
      stage: WorkflowStage.RESOURCE_GATHERING,
      description: "기존 소스 코드 분석",
      dependencies: findFilesTaskId ? [findFilesTaskId] : [],
      status: "pending",
    });
  }

  // 4. 소스 수정
  let modifySourceTaskId: string | null = null;
  if (analysis.estimatedTasks.includes(TaskType.MODIFY_SOURCE)) {
    modifySourceTaskId = `task-${taskId++}`;
    tasks.push({
      id: modifySourceTaskId,
      type: TaskType.MODIFY_SOURCE,
      stage: WorkflowStage.EXECUTION,
      description: "소스 코드 수정/생성",
      dependencies: analyzeSourceTaskId ? [analyzeSourceTaskId] : [],
      status: "pending",
    });
  }

  // 5. 비교
  if (analysis.estimatedTasks.includes(TaskType.COMPARE)) {
    tasks.push({
      id: `task-${taskId++}`,
      type: TaskType.COMPARE,
      stage: WorkflowStage.VALIDATION,
      description: "기존 소스와 수정된 소스 비교",
      dependencies: modifySourceTaskId ? [modifySourceTaskId] : [],
      status: "pending",
    });
  }

  // 6. 검증
  let verifyTaskId: string | null = null;
  if (analysis.estimatedTasks.includes(TaskType.VERIFY)) {
    verifyTaskId = `task-${taskId++}`;
    const modifyTasks = tasks.filter(t => t.type === TaskType.MODIFY_SOURCE);
    tasks.push({
      id: verifyTaskId,
      type: TaskType.VERIFY,
      stage: WorkflowStage.VALIDATION,
      description: "변경사항 검증",
      dependencies: modifyTasks.length > 0 ? modifyTasks.map(t => t.id) : [],
      status: "pending",
    });
  }

  // 7. 적용
  if (analysis.estimatedTasks.includes(TaskType.APPLY)) {
    tasks.push({
      id: `task-${taskId++}`,
      type: TaskType.APPLY,
      stage: WorkflowStage.EXECUTION,
      description: "변경사항 적용",
      dependencies: verifyTaskId ? [verifyTaskId] : [],
      status: "pending",
    });
  }

  return tasks;
}

/**
 * 작업 실행 순서 결정 (의존성 기반)
 */
export function resolveExecutionOrder(tasks: WorkflowTask[]): WorkflowTask[] {
  const executed = new Set<string>();
  const visiting = new Set<string>(); // 순환 참조 감지용
  const ordered: WorkflowTask[] = [];

  function executeTask(task: WorkflowTask) {
    if (executed.has(task.id)) return;
    
    // 순환 참조 감지
    if (visiting.has(task.id)) {
      console.warn(`순환 참조 감지: ${task.id}`);
      ordered.push(task);
      executed.add(task.id);
      visiting.delete(task.id);
      return;
    }

    visiting.add(task.id);

    // 의존성 먼저 실행
    for (const depId of task.dependencies) {
      const depTask = tasks.find(t => t.id === depId);
      if (depTask && !executed.has(depId)) {
        executeTask(depTask);
      }
    }

    visiting.delete(task.id);
    ordered.push(task);
    executed.add(task.id);
  }

  // 모든 작업 실행
  for (const task of tasks) {
    if (!executed.has(task.id)) {
      executeTask(task);
    }
  }

  return ordered;
}

/**
 * 워크플로우 컨텍스트 생성
 */
export function createWorkflowContext(
  request: string,
  projectPath: string,
  contextFiles: Array<{ path: string; name: string }>,
  projectType?: string
): WorkflowContext {
  // 1. 요청 분석
  const analysis = analyzeRequest(request, contextFiles, projectType);

  // 2. 처리 방식 설계
  const tasks = designSolution(analysis, {
    request,
    projectPath,
    contextFiles,
    projectType,
  });

  // 3. 실행 순서 결정
  const orderedTasks = resolveExecutionOrder(tasks);

  return {
    request,
    projectPath,
    contextFiles,
    projectType,
    tasks: orderedTasks,
    currentStage: WorkflowStage.ANALYSIS,
    results: new Map(),
  };
}

