"use client";

import { useState } from "react";

interface FontViewerProps {
  content: string;
  mimeType?: string;
  fileName: string;
}

export default function FontViewer({
  content,
  mimeType,
  fileName,
}: FontViewerProps) {
  const [fontPreviewText, setFontPreviewText] = useState(
    "The quick brown fox jumps over the lazy dog"
  );
  const fontSrc = `data:${mimeType || "font/ttf"};base64,${content}`;
  const fontName = fileName.replace(/\.[^/.]+$/, "");

  return (
    <div className="h-full flex flex-col bg-gray-100 dark:bg-gray-900 p-4 overflow-y-auto">
      <style>{`
        @font-face {
          font-family: '${fontName}';
          src: url('${fontSrc}') format('truetype');
        }
        .font-preview {
          font-family: '${fontName}', sans-serif;
        }
      `}</style>
      <div className="max-w-4xl mx-auto w-full space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
            폰트 미리보기
          </h3>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              미리보기 텍스트:
            </label>
            <input
              type="text"
              value={fontPreviewText}
              onChange={(e) => setFontPreviewText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">12px</p>
              <p className="font-preview text-xs">{fontPreviewText}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">16px</p>
              <p className="font-preview text-base">{fontPreviewText}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">24px</p>
              <p className="font-preview text-2xl">{fontPreviewText}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">36px</p>
              <p className="font-preview text-4xl">{fontPreviewText}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">48px</p>
              <p className="font-preview text-5xl">{fontPreviewText}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

