import { useState } from 'react';
import { getBankBrandingMeta } from '../lib/realMedia';

export function BankLogoBadge({
  bankName,
  size = 'sm',
}: {
  bankName: string;
  size?: 'sm' | 'md';
}) {
  const meta = getBankBrandingMeta(bankName);
  const [imgFailed, setImgFailed] = useState(false);
  const boxCls = size === 'md' ? 'w-9 h-9 rounded-xl p-1.5' : 'w-7 h-7 rounded-lg p-1';

  return (
    <div
      className={`${boxCls} bg-white/95 shadow-2xs flex items-center justify-center shrink-0 overflow-hidden`}
      title={bankName}
    >
      {meta.logoUrl && !imgFailed ? (
        <img
          src={meta.logoUrl}
          alt={`${bankName} logo`}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-contain"
        />
      ) : (
        <span className="font-display font-black text-[10px] text-[#0F172A] leading-none">
          {meta.shortCode}
        </span>
      )}
    </div>
  );
}
