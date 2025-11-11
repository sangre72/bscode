export interface PlanningViewerProps {
  content: string;
  projectPath?: string | null;
}

export interface ExecutionLog {
  timestamp: Date;
  type: "command" | "file" | "info" | "error" | "success" | "warning";
  message: string;
  details?: string;
  command?: string;
  filePath?: string;
}

export interface PlanningData {
  metadata?: { userRequest?: string };
  planning?: {
    analysis?: string;
    questions?: string[];
    isClear?: boolean;
    readyToExecute?: boolean;
    plan?: {
      actionType?: string;
      packages?: string[];
      filesToModify?: Array<{ path: string; reason?: string; changes?: string; fileExists?: boolean }>;
      filesToCreate?: Array<{ path: string; reason?: string; purpose?: string; fileExists?: boolean }>;
      executionOrder?: string[];
      serverStatus?: string;
      needsVerification?: string[];
    };
    tasks?: Array<{ type: string; description?: string; target?: string; command?: string; content?: string }>;
    codeBlocks?: Array<{ filePath: string; language?: string; content?: string }>;
  };
}

export interface StepResult {
  success: boolean;
  message: string;
}

