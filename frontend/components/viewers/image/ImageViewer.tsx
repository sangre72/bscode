"use client";

interface ImageViewerProps {
  content: string;
  mimeType?: string;
  fileName: string;
}

export default function ImageViewer({
  content,
  mimeType,
  fileName,
}: ImageViewerProps) {
  const imageSrc = `data:${mimeType || "image/png"};base64,${content}`;

  return (
    <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="max-w-full max-h-full flex items-center justify-center">
        <img
          src={imageSrc}
          alt={fileName}
          className="max-w-full max-h-full object-contain"
        />
      </div>
    </div>
  );
}

