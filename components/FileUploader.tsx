import React from "react";
import { UploadcareUploader } from "@uploadcare/react-uploader";

export default function FileUploader({ onUpload }) {
  return (
    <div style={{ padding: "10px", border: "1px dashed #999", borderRadius: 10 }}>
      <UploadcareUploader
        pubkey={process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY}
        multiple={false}
        onChange={(file) => {
          if (file?.cdnUrl) {
            onUpload(file.cdnUrl);
          }
        }}
      />
    </div>
  );
}
