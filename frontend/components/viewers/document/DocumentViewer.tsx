"use client";

import { FileText, Download } from "lucide-react";

interface DocumentViewerProps {
  content: string;
  mimeType?: string;
  fileName: string;
  onDownload?: () => void;
}

export default function DocumentViewer({
  content,
  mimeType,
  fileName,
  onDownload,
}: DocumentViewerProps) {
  const docSrc = `data:${mimeType || "application/pdf"};base64,${content}`;
  const isPdf = mimeType === "application/pdf";
  const isHwp =
    mimeType === "application/x-hwp" || mimeType === "application/x-hwt";

  if (isPdf) {
    return (
      <div className="h-full flex flex-col bg-gray-100 dark:bg-gray-900">
        <iframe
          src={docSrc}
          className="w-full h-full border-0"
          title={fileName}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md">
        <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
          {fileName}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          {isHwp
            ? "한글 문서(.hwp)는 브라우저에서 직접 미리보기를 지원하지 않습니다."
            : "이 문서 형식은 브라우저에서 미리보기를 지원하지 않습니다."}
        </p>
        {isHwp && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            파일을 다운로드하여 한글과컴퓨터의 한글 프로그램으로 열어보세요.
          </p>
        )}
        {!isHwp && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            파일을 다운로드하여 해당 프로그램으로 열어보세요.
          </p>
        )}
        <button
          onClick={onDownload}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 mx-auto"
        >
          <Download className="w-4 h-4" />
          다운로드
        </button>
      </div>
    </div>
  );
}

