import { useState } from 'react';

export const APP_LOGO_URL = `${import.meta.env.BASE_URL}src/assets/images/bachathub_app_logo_1795254020441.jpg`;
export const DEVELOPER_NAME = 'Sanwal Rizwan Dastgeer';
export const DEVELOPER_FACEBOOK_URL = 'https://www.facebook.com/MRSanwalRizwan';

type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<LogoSize, string> = {
  xs: 'w-6 h-6 rounded-md',
  sm: 'w-8 h-8 rounded-[10px]',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-14 h-14 rounded-2xl',
  xl: 'w-16 h-16 rounded-[18px]',
};

export function AppLogo({
  size = 'sm',
  className = '',
}: {
  size?: LogoSize;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`${SIZE_MAP[size]} overflow-hidden shrink-0 bg-[#008069] shadow-2xs ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center ${className}`}
    >
      {!failed ? (
        <img
          src={APP_LOGO_URL}
          alt="BachatHub Pakistan Logo"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="font-display font-black text-white text-xs tracking-tight">BH</span>
      )}
    </div>
  );
}
