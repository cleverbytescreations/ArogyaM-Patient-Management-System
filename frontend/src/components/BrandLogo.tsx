import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

const WORDMARK_SRC = "/brand/arogyam-wordmark.png";
const MARK_SRC = "/brand/arogyam-mark.png";

interface BrandLogoProps {
  /** "wordmark" shows the ArogyaM text logo; "mark" shows the lotus mark. */
  variant?: "wordmark" | "mark";
  /** When true the image is hidden from assistive tech (use when a nearby heading already names the brand). */
  decorative?: boolean;
  className?: string;
}

/** Brand imagery derived from the ArogyaM logos. */
export function BrandLogo({
  variant = "wordmark",
  decorative = false,
  className,
}: BrandLogoProps) {
  const src = variant === "mark" ? MARK_SRC : WORDMARK_SRC;
  return (
    <img
      src={src}
      alt={decorative ? "" : `${APP_NAME} logo`}
      aria-hidden={decorative || undefined}
      className={cn("select-none", className)}
      draggable={false}
    />
  );
}
