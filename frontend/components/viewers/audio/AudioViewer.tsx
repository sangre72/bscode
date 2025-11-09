"use client";

import { Music } from "lucide-react";

interface AudioViewerProps {
  content: string;
  mimeType?: string;
  fileName: string;
}

export default function AudioViewer({
  content,
  mimeType,
  fileName,
}: AudioViewerProps) {
  const audioSrc = `data:${mimeType || "audio/mpeg"};base64,${content}`;

  return (
    <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="w-full max-w-2xl">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
          <div className="text-center mb-4">
            <Music className="w-16 h-16 text-blue-500 mx-auto mb-2" />
            <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
              {fileName}
            </p>
          </div>
          <audio src={audioSrc} controls className="w-full" />
        </div>
      </div>
    </div>
  );
}

