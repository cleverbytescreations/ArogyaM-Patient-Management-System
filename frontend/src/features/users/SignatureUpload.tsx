import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usersApi } from "./usersApi";
import { getApiErrorMessage } from "@/api/errors";
import type { User } from "@/types/users";

const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
const MAX_BYTES = 2 * 1024 * 1024;

interface SignatureUploadProps {
  user: User;
}

/**
 * Admin-only management of a doctor's scanned signature image. The signature is
 * embedded into the case sheet, prescription, and discharge summary PDFs.
 */
export function SignatureUpload({ user }: SignatureUploadProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // The `user` prop is a snapshot from the list query and is not refreshed
  // while the dialog stays open, so we track signature presence locally and
  // bump a key to force a fresh blob fetch after each mutation.
  const [hasSignature, setHasSignature] = useState(user.has_signature);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setHasSignature(user.has_signature);
  }, [user.id, user.has_signature]);

  const signatureQuery = useQuery({
    queryKey: ["user-signature", user.id, refreshKey],
    queryFn: () => usersApi.getSignatureBlob(user.id),
    enabled: hasSignature,
    staleTime: 0,
  });

  useEffect(() => {
    if (!hasSignature || !signatureQuery.data) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(signatureQuery.data);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [hasSignature, signatureQuery.data]);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => usersApi.uploadSignature(user.id, file),
    onSuccess: () => {
      toast.success("Signature uploaded.");
      setHasSignature(true);
      setRefreshKey((key) => key + 1);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, "Failed to upload signature."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => usersApi.deleteSignature(user.id),
    onSuccess: () => {
      toast.success("Signature removed.");
      setHasSignature(false);
      setPreviewUrl(null);
      queryClient.removeQueries({ queryKey: ["user-signature", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, "Failed to remove signature."));
    },
  });

  const isPending = uploadMutation.isPending || deleteMutation.isPending;

  const validateAndUpload = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Signature must be a PNG or JPEG image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Signature image must be 2 MB or smaller.");
      return;
    }
    uploadMutation.mutate(file);
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    validateAndUpload(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isPending) setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (isPending) return;
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    validateAndUpload(file);
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">Signature</p>
        <p className="text-sm text-muted-foreground">
          Scanned signature embedded into this doctor's printed reports.
        </p>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center gap-2 rounded-md border-2 border-dashed p-3 text-center transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        )}
      >
        {hasSignature && previewUrl && (
          <img
            src={previewUrl}
            alt="Doctor signature preview"
            className="max-h-20 max-w-[200px] rounded border bg-white object-contain p-1"
          />
        )}
        {hasSignature && signatureQuery.isLoading && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {!hasSignature && (
          <p className="text-sm text-muted-foreground">No signature uploaded yet.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Drag and drop a PNG or JPEG here, or use the button below.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={handleFile}
        aria-label="Signature image file"
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => inputRef.current?.click()}
        >
          {uploadMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {hasSignature ? "Replace" : "Upload"}
        </Button>
        {hasSignature && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
