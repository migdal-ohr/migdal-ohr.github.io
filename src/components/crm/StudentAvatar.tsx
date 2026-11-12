import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const urlCache = new Map<string, { url: string; at: number }>();

/** Shows a student's photo — legacy inline (photoUrl) or Storage path (photoPath, signed URL). */
export const StudentAvatar = ({
  photoUrl,
  photoPath,
  name,
  className,
  iconSize = 28,
}: {
  photoUrl?: string;
  photoPath?: string;
  name: string;
  className?: string;
  iconSize?: number;
}) => {
  const [src, setSrc] = useState<string | null>(photoUrl || null);

  useEffect(() => {
    let alive = true;
    if (photoPath) {
      const hit = urlCache.get(photoPath);
      if (hit && Date.now() - hit.at < 50 * 60 * 1000) {
        setSrc(hit.url);
      } else {
        api.photoUrl(photoPath).then((u) => {
          if (!alive || !u) return;
          urlCache.set(photoPath, { url: u, at: Date.now() });
          setSrc(u);
        });
      }
    } else {
      setSrc(photoUrl || null);
    }
    return () => {
      alive = false;
    };
  }, [photoPath, photoUrl]);

  return (
    <div className={cn("overflow-hidden flex items-center justify-center shrink-0", className)}>
      {src ? <img src={src} alt={name} className="w-full h-full object-cover" /> : <User size={iconSize} />}
    </div>
  );
};
