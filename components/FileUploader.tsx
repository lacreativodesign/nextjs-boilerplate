'use client';
import React from 'react';
import { FileUploaderRegular } from '@uploadcare/react-uploader';

export default function FileUploader({ onUpload }: { onUpload: (url: string) => void }) {
  return (
    <div style={{ padding: 10, border: '1px dashed #999', borderRadius: 10 }}>
      <FileUploaderRegular
        pubkey={process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY ?? ''}
        multiple={false}
        onChange={(file: any) => {
          if (file?.cdnUrl) onUpload(file.cdnUrl);
        }}
      />
    </div>
  );
}
