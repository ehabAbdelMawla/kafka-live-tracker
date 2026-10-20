import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// QR of the share link: the one-tap way to test on a real phone (phone GPS is
// metre-accurate; laptop browsers mostly are not). Rendered locally, no
// external QR service.
export function ShareQr({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 148, margin: 1, errorCorrectionLevel: 'L' })
      .then((code) => {
        if (!cancelled) setDataUrl(code);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed) return null;

  return (
    <div className="qr-box" title="Scan with your phone">
      {dataUrl ? (
        <img src={dataUrl} alt="QR code of the share link" />
      ) : (
        <span className="spinner" />
      )}
    </div>
  );
}
