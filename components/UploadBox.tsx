import { Widget } from "@uploadcare/react-widget";
type Props = { onDone:(url:string)=>void };

export default function UploadBox({ onDone }:Props){
  return (
    <div style={{border:"2px dashed #93c5fd",borderRadius:12,padding:12}}>
      <Widget
        publicKey={process.env.NEXT_PUBLIC_UPLOADCARE_KEY!}
        onChange={(file:any)=> file?.cdnUrl && onDone(file.cdnUrl)}
      />
    </div>
  );
}
