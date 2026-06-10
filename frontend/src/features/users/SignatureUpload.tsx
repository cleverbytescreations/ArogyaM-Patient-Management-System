import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  const signatureQuery = useQuery({
    queryKey: ["user-signature", user.id, user.version],
    queryFn: () => usersApi.getSignatureBlob(user.id),
    enabled: user.has_signature,
    staleTime: 0,
  });

  useEffect(() => {
    if (!signatureQuery.data) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(signatureQuery.data);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [signatureQuery.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["users"] });
    void queryClient.invalidateQueries({ queryKey: ["user-signature", user.id] });
  };

  const uploadMutation = useMutation({
    mutationFn: (file: File) => usersApi.uploadSignature(user.id, file),
    onSuccess: () => {
      toast.success("Signature uploaded.");
      invalidate();
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, "Failed to upload signature."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => usersApi.deleteSignature(user.id),
    onSuccess: () => {
      toast.success("Signature removed.");
      invalidate();
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, "Failed to remove signature."));
    },
  });

  const isPending = uploadMutation.isPending || deleteMutation.isPending;

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
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

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">Signature</p>
        <p className="text-sm text-muted-foreground">
          Scanned signature embedded into this doctor's printed reports.
        </p>
      </div>

      {user.has_signature && previewUrl && (
        <img
          src={previewUrl}
          alt="Doctor signature preview"
          className="max-h-20 max-w-[200px] rounded border bg-white object-contain p-1"
        />
      )}
      {user.has_signature && signatureQuery.isLoading && (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      )}
      {!user.has_signature && (
        <p className="text-sm text-muted-foreground">No signature uploaded yet.</p>
      )}

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
          {user.has_signature ? "Replace" : "Upload"}
        </Button>
        {user.has_signature && (
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
