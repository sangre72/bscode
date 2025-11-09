"use client";

import { CheckCircle, Clock, FileEdit, FilePlus, FileText, Package, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface PlanningInfo {
  filename: string;
  path: string;
  createdAt: string | null;
  userRequest: string;
  isClear: boolean;
  readyToExecute: boolean;
  packages: string[];
  filesToModify: number;
  filesToCreate: number;
}

interface PlanningData {
  phase?: string;
  analysis?: string;
  isClear?: boolean;
  questions?: string[];
  plan?: {
    packages?: string[];
    filesToModify?: Array<{ path: string; reason: string; changes: string }>;
    filesToCreate?: Array<{ path: string; reason: string; purpose: string }>;
    executionOrder?: string[];
  };
  readyToExecute?: boolean;
  metadata?: {
    userRequest?: string;
  };
}

interface PlanningReviewProps {
  projectPath: string | null;
  onPlanningSelect?: (planningData: PlanningData) => void;
}

export default function PlanningReview({ projectPath, onPlanningSelect }: PlanningReviewProps) {
  const [plans, setPlans] = useState<PlanningInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const loadPlans = async () => {
    if (!projectPath) {
      console.log("⚠️ PlanningReview: projectPath is null");
      return;
    }
    
    console.log("📋 Loading plans for project:", projectPath);
    setIsLoading(true);
    try {
      const url = `/api/planning/list?projectPath=${encodeURIComponent(projectPath)}`;
      console.log("📋 Fetching:", url);
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        console.log("✅ Plans loaded:", data);
        setPlans(data.plans || []);
      } else {
        const errorData = await response.json();
        console.error("❌ Failed to load plans:", errorData);
      }
    } catch (error) {
      console.error("❌ Error loading plans:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (projectPath) {
      loadPlans();
    } else {
      setPlans([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  // 계획 저장 이벤트 리스너
  useEffect(() => {
    const handlePlanningSaved = () => {
      console.log("📋 Planning saved event received, reloading plans...");
      if (projectPath) {
        loadPlans();
      }
    };

    window.addEventListener("planningSaved", handlePlanningSaved);
    return () => {
      window.removeEventListener("planningSaved", handlePlanningSaved);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  const handlePlanClick = async (filename: string) => {
    if (!projectPath) {
      console.log("⚠️ handlePlanClick: projectPath is null");
      return;
    }
    
    console.log("📋 Loading plan details:", filename);
    setSelectedPlan(filename); // 먼저 선택 상태 업데이트
    
    try {
      const url = `/api/planning/read?projectPath=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(filename)}`;
      console.log("📋 Fetching plan:", url);
      
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        console.log("✅ Plan loaded:", data);
        
        // 중앙 컨텐츠 영역에 계획 상세 표시를 위한 이벤트 발생
        window.dispatchEvent(
          new CustomEvent("planningSelected", {
            detail: {
              planningData: data.planning,
              filename: filename,
            },
          })
        );
        
        if (onPlanningSelect) {
          onPlanningSelect(data.planning);
        }
      } else {
        const errorData = await response.json();
        console.error("❌ Failed to load plan:", errorData);
        setSelectedPlan(null);
      }
    } catch (error) {
      console.error("❌ Error loading plan:", error);
      setSelectedPlan(null);
    }
  };

  const handleDeletePlan = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 클릭 이벤트 전파 방지
    
    if (!projectPath) return;
    
    // 삭제 확인
    if (!confirm("이 계획을 삭제하시겠습니까?")) {
      return;
    }
    
    try {
      const url = `/api/planning/delete?projectPath=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(filename)}`;
      console.log("🗑️ Deleting plan:", url);
      
      const response = await fetch(url, {
        method: "DELETE",
      });
      
      if (response.ok) {
        console.log("✅ Plan deleted:", filename);
        // 목록 새로고침
        loadPlans();
        // 선택된 계획이 삭제된 것이면 선택 해제
        if (selectedPlan === filename) {
          setSelectedPlan(null);
        }
      } else {
        const errorData = await response.json();
        console.error("❌ Failed to delete plan:", errorData);
        alert(`계획 삭제 실패: ${errorData.error || "알 수 없는 오류"}`);
      }
    } catch (error) {
      console.error("❌ Error deleting plan:", error);
      alert("계획 삭제 중 오류가 발생했습니다.");
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "알 수 없음";
    try {
      const date = new Date(dateString);
      return date.toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  if (!projectPath) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
        프로젝트를 선택하세요
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">계획 검토</h3>
        </div>
        <button
          onClick={loadPlans}
          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          disabled={isLoading}
        >
          {isLoading ? "로딩..." : "새로고침"}
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            로딩 중...
          </div>
        ) : plans.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            <div>저장된 계획이 없습니다</div>
            <div className="text-xs mt-2 text-gray-400">
              프로젝트: {projectPath?.split("/").pop() || "알 수 없음"}
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {plans.map((plan) => (
              <div
                key={plan.filename}
                className={`p-3 rounded-lg border transition-colors ${
                  selectedPlan === plan.filename
                    ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700"
                    : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div 
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => handlePlanClick(plan.filename)}
                  >
                    <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate mb-1">
                      {plan.userRequest || "계획"}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(plan.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <div className="flex items-center gap-1">
                      {plan.isClear ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-yellow-500" />
                      )}
                      {plan.readyToExecute && (
                        <Clock className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                    <button
                      onClick={(e) => handleDeletePlan(plan.filename, e)}
                      className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors text-red-600 dark:text-red-400"
                      title="계획 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                
                <div 
                  className="flex items-center gap-3 mt-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer"
                  onClick={() => handlePlanClick(plan.filename)}
                >
                  {plan.packages.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      <span>{plan.packages.length}개 패키지</span>
                    </div>
                  )}
                  {plan.filesToModify > 0 && (
                    <div className="flex items-center gap-1">
                      <FileEdit className="w-3 h-3" />
                      <span>{plan.filesToModify}개 수정</span>
                    </div>
                  )}
                  {plan.filesToCreate > 0 && (
                    <div className="flex items-center gap-1">
                      <FilePlus className="w-3 h-3" />
                      <span>{plan.filesToCreate}개 생성</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

