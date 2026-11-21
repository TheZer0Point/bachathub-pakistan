import { BadgeCheck, Check } from 'lucide-react';
import { useState } from 'react';

interface BrandAvatarProps {
  initials: string;
  color: string;
  secondaryColor?: string;
  logoUrl?: string;
  name?: string;
  rank?: number;
  variant?: 'deal' | 'fake' | 'brand';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onClick?: () => void;
}

export function BrandAvatar({
  initials,
  color,
  secondaryColor,
  logoUrl,
  name,
  rank,
  variant = 'deal',
  size = 'md',
  onClick,
}: BrandAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const sizeMap = {
    sm: 'w-10 h-10 text-xs',
    md: 'w-12 h-12 text-[15px]',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-20 h-20 text-2xl',
  };

  const imgPadding = {
    sm: 'p-1.5',
    md: 'p-1.5',
    lg: 'p-2',
    xl: 'p-3',
  };

  const badgeBg =
    variant === 'fake'
      ? 'bg-[#E11D48] text-white'
      : rank === 1
      ? 'bg-[#FACC15] text-[#111827]'
      : 'bg-[#111827] text-white dark:bg-[#222E35]';

  const showLogo = Boolean(logoUrl && !imgFailed);

  return (
    <div
      onClick={onClick}
      className={`relative shrink-0 inline-flex items-center justify-center rounded-full font-display font-bold select-none ${sizeMap[size]} ${
        onClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''
      } ${
        showLogo
          ? 'bg-white dark:bg-[#1B262D] ring-2 ring-[#E9EDEF] dark:ring-[#26353F] shadow-xs'
          : 'text-white shadow-xs'
      }`}
      style={
        showLogo
          ? { boxShadow: `0 2px 8px -2px ${color}33` }
          : {
              background: secondaryColor
                ? `linear-gradient(135deg, ${color} 0%, ${secondaryColor} 100%)`
                : color,
            }
      }
    >
      {showLogo ? (
        <img
          src={logoUrl}
          alt={name ? `${name} official logo` : initials}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={`w-full h-full object-contain rounded-full ${imgPadding[size]}`}
        />
      ) : (
        <span className="tracking-tight drop-shadow-2xs">{initials}</span>
      )}

      {typeof rank === 'number' && (
        <span
          className={`absolute -bottom-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full text-[10px] font-bold font-mono-num flex items-center justify-center ring-2 ring-white dark:ring-[#131B21] ${badgeBg}`}
        >
          #{rank}
        </span>
      )}
    </div>
  );
}

export function VerificationTicks({ passed, total = 4, compact = false }: { passed: number; total?: number; compact?: boolean }) {
  const textTone =
    passed >= 3
      ? 'text-[#0E8A50] dark:text-[#25D366]'
      : 'text-[#EA580C] dark:text-[#FB923C]';

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center -space-x-1" aria-label={`${passed} of ${total} verification checks passed`}>
        {Array.from({ length: total }).map((_, i) => (
          <Check
            key={i}
            className={`w-3.5 h-3.5 stroke-[2.6] ${
              i < passed ? 'text-[#0EA5E9]' : 'text-slate-300 dark:text-slate-600'
            }`}
          />
        ))}
      </span>
      <span className={`text-[12px] font-medium whitespace-nowrap ${textTone}`}>
        {compact ? `${passed} of ${total} checks` : `${passed} of ${total} checks passed`}
      </span>
    </div>
  );
}

export function VerifiedBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <BadgeCheck
      className={`inline-block shrink-0 text-[#19A85B] fill-[#19A85B]/15 ${
        size === 'md' ? 'w-5 h-5' : 'w-4 h-4'
      }`}
      aria-label="Verified brand partner"
    />
  );
}
