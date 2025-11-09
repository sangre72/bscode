"use client";

import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { forwardRef, useImperativeHandle, useState } from "react";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

interface FileTreeProps {
  tree: FileNode[];
  projectPath: string;
  onFileSelect: (filePath: string) => void;
  onFileDrag: (filePath: string, fileName: string) => void;
}

export interface FileTreeRef {
  expandPath: (targetPath: string) => { found: boolean; expandedPath: string | null };
}

function FileTreeNode({
  node,
  projectPath,
  onFileSelect,
  onFileDrag,
  level = 0,
  expandedPaths,
  onExpandedChange,
}: {
  node: FileNode;
  projectPath: string;
  onFileSelect: (filePath: string) => void;
  onFileDrag: (filePath: string, fileName: string) => void;
  level?: number;
  expandedPaths: Set<string>;
  onExpandedChange: (path: string, expanded: boolean) => void;
}) {
  const isExpanded = expandedPaths.has(node.path);

  const handleClick = () => {
    if (node.type === "directory") {
      onExpandedChange(node.path, !isExpanded);
    } else {
      onFileSelect(node.path);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (node.type === "file") {
      e.dataTransfer.setData("text/plain", JSON.stringify({
        path: node.path,
        name: node.name,
        projectPath: projectPath,
      }));
      onFileDrag(node.path, node.name);
    }
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded ${
          node.type === "directory" ? "font-medium" : ""
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        draggable={node.type === "file"}
        onDragStart={handleDragStart}
      >
        {node.type === "directory" ? (
          <>
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-gray-500" />
            ) : (
              <ChevronRight className="w-3 h-3 text-gray-500" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-blue-500" />
            ) : (
              <Folder className="w-4 h-4 text-blue-500" />
            )}
          </>
        ) : (
          <>
            <div className="w-3 h-3" /> {/* 공간 맞추기 */}
            <File className="w-4 h-4 text-gray-400" />
          </>
        )}
        <span className="truncate text-gray-700 dark:text-gray-300">
          {node.name}
        </span>
      </div>
      {node.type === "directory" && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              projectPath={projectPath}
              onFileSelect={onFileSelect}
              onFileDrag={onFileDrag}
              level={level + 1}
              expandedPaths={expandedPaths}
              onExpandedChange={onExpandedChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 트리에서 경로 찾기 (재귀)
function findPathInTree(nodes: FileNode[], targetPath: string, projectPath: string): FileNode | null {
  // 경로 정규화
  const normalizePath = (path: string) => {
    let normalized = path;
    if (normalized.startsWith("./")) normalized = normalized.substring(2);
    if (normalized.startsWith("/")) normalized = normalized.substring(1);
    normalized = normalized.replace(/\\/g, "/");
    return normalized;
  };

  const normalizedTarget = normalizePath(targetPath);
  
  for (const node of nodes) {
    const normalizedNodePath = normalizePath(node.path);
    
    // 정확히 일치하는 경우
    if (normalizedNodePath === normalizedTarget) {
      return node;
    }
    
    // 디렉토리이고 하위 경로인 경우
    if (node.type === "directory" && node.children) {
      // 현재 경로가 타겟 경로의 부모인지 확인
      if (normalizedTarget.startsWith(normalizedNodePath + "/")) {
        const found = findPathInTree(node.children, targetPath, projectPath);
        if (found) return found;
      }
    }
  }
  
  return null;
}

// 경로의 모든 부모 디렉토리 경로 추출
function getParentPaths(targetPath: string): string[] {
  const paths: string[] = [];
  let currentPath = targetPath;
  
  // 경로 정규화
  if (currentPath.startsWith("./")) currentPath = currentPath.substring(2);
  if (currentPath.startsWith("/")) currentPath = currentPath.substring(1);
  currentPath = currentPath.replace(/\\/g, "/");
  
  const parts = currentPath.split("/").filter(Boolean);
  
  for (let i = 1; i <= parts.length; i++) {
    paths.push(parts.slice(0, i).join("/"));
  }
  
  return paths;
}

const FileTree = forwardRef<FileTreeRef, FileTreeProps>(({
  tree,
  projectPath,
  onFileSelect,
  onFileDrag,
}, ref) => {
  // localStorage 키 생성 (프로젝트 경로 기반)
  const storageKey = `fileTreeExpanded_${projectPath}`;
  
  // 확장된 경로들을 Set으로 관리
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const paths = JSON.parse(saved) as string[];
        return new Set(paths);
      }
    } catch (error) {
      console.error("Error loading expanded paths:", error);
    }
    return new Set();
  });

  // 확장 상태 변경 핸들러
  const handleExpandedChange = (path: string, expanded: boolean) => {
    setExpandedPaths((prev) => {
      const newSet = new Set(prev);
      if (expanded) {
        newSet.add(path);
      } else {
        newSet.delete(path);
      }
      
      // localStorage에 저장
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(newSet)));
      } catch (error) {
        console.error("Error saving expanded paths:", error);
      }
      
      return newSet;
    });
  };

  // 경로 확장 함수
  const expandPath = (targetPath: string): { found: boolean; expandedPath: string | null } => {
    // 경로 정규화
    const normalizePath = (path: string) => {
      let normalized = path;
      if (normalized.startsWith("./")) normalized = normalized.substring(2);
      if (normalized.startsWith("/")) normalized = normalized.substring(1);
      normalized = normalized.replace(/\\/g, "/");
      return normalized;
    };

    const normalizedTarget = normalizePath(targetPath);
    
    // 1. 정확한 경로 찾기
    const foundNode = findPathInTree(tree, targetPath, projectPath);
    
    if (foundNode) {
      // 경로를 찾았으면 모든 부모 디렉토리 확장
      const parentPaths = getParentPaths(targetPath);
      setExpandedPaths((prev) => {
        const newSet = new Set(prev);
        parentPaths.forEach((path) => {
          // 파일이 아닌 디렉토리 경로만 확장
          if (path !== normalizedTarget || foundNode.type === "directory") {
            newSet.add(path);
          }
        });
        
        // localStorage에 저장
        try {
          localStorage.setItem(storageKey, JSON.stringify(Array.from(newSet)));
        } catch (error) {
          console.error("Error saving expanded paths:", error);
        }
        
        return newSet;
      });
      
      return { found: true, expandedPath: normalizedTarget };
    }
    
    // 2. 경로가 없으면 상위 경로 찾기
    const parentPaths = getParentPaths(targetPath);
    let lastFoundPath: string | null = null;
    
    // 상위 경로부터 역순으로 찾기
    for (let i = parentPaths.length - 1; i >= 0; i--) {
      const parentPath = parentPaths[i];
      const foundParent = findPathInTree(tree, parentPath, projectPath);
      
      if (foundParent && foundParent.type === "directory") {
        lastFoundPath = parentPath;
        break;
      }
    }
    
    if (lastFoundPath) {
      // 찾은 상위 경로까지 확장
      const pathsToExpand = getParentPaths(lastFoundPath);
      setExpandedPaths((prev) => {
        const newSet = new Set(prev);
        pathsToExpand.forEach((path) => {
          newSet.add(path);
        });
        
        // localStorage에 저장
        try {
          localStorage.setItem(storageKey, JSON.stringify(Array.from(newSet)));
        } catch (error) {
          console.error("Error saving expanded paths:", error);
        }
        
        return newSet;
      });
      
      return { found: false, expandedPath: lastFoundPath };
    }
    
    return { found: false, expandedPath: null };
  };

  // ref를 통한 외부 접근
  useImperativeHandle(ref, () => ({
    expandPath,
  }));

  if (tree.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
        파일이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {tree.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          projectPath={projectPath}
          onFileSelect={onFileSelect}
          onFileDrag={onFileDrag}
          expandedPaths={expandedPaths}
          onExpandedChange={handleExpandedChange}
        />
      ))}
    </div>
  );
});

FileTree.displayName = "FileTree";

export default FileTree;

