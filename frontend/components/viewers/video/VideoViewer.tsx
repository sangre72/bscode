"use client";

interface VideoViewerProps {
  content: string;
  mimeType?: string;
  fileName: string;
}

export default function VideoViewer({
  content,
  mimeType,
  fileName,
}: VideoViewerProps) {
  const videoSrc = `data:${mimeType || "video/mp4"};base64,${content}`;

  return (
    <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="max-w-full max-h-full">
        <video
          src={videoSrc}
          controls
          className="max-w-full max-h-full"
          style={{ maxHeight: "calc(100vh - 200px)" }}
        >
          브라우저가 비디오 태그를 지원하지 않습니다.
        </video>
      </div>
    </div>
  );
}

