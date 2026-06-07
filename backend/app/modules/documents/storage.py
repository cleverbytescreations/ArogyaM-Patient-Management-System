"""S3/MinIO storage adapter for uploaded document binaries."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

from app.core.config import settings
from app.core.errors import ServiceUnavailableError


@dataclass(frozen=True)
class StoredObject:
    key: str
    bucket: str


@dataclass(frozen=True)
class DownloadStream:
    body: Iterator[bytes]
    content_type: str | None = None
    content_length: int | None = None


class DocumentStorage:
    """Small S3-compatible adapter; imports boto3 lazily for testability."""

    def __init__(self) -> None:
        self.bucket = settings.s3_bucket
        self._client = None

    @property
    def client(self):
        if self._client is None:
            try:
                import boto3
                from botocore.config import Config
            except ModuleNotFoundError as exc:
                raise ServiceUnavailableError("Object storage client is unavailable") from exc
            self._client = boto3.client(
                "s3",
                endpoint_url=settings.s3_endpoint_url,
                aws_access_key_id=settings.s3_access_key,
                aws_secret_access_key=settings.s3_secret_key,
                use_ssl=settings.s3_use_ssl,
                config=Config(signature_version="s3v4"),
            )
        return self._client

    def ensure_bucket(self) -> None:
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ServiceUnavailableError:
            raise
        except Exception:
            try:
                self.client.create_bucket(Bucket=self.bucket)
            except Exception as exc:
                raise ServiceUnavailableError("Document bucket is unavailable") from exc

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> StoredObject:
        self.ensure_bucket()
        kwargs: dict = {
            "Bucket": self.bucket,
            "Key": key,
            "Body": data,
            "ContentType": content_type,
        }
        if settings.s3_sse:
            kwargs["ServerSideEncryption"] = "AES256"
        try:
            self.client.put_object(**kwargs)
        except Exception as exc:
            raise ServiceUnavailableError("Unable to store document") from exc
        return StoredObject(key=key, bucket=self.bucket)

    def stream(self, key: str) -> DownloadStream:
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
        except Exception as exc:
            raise ServiceUnavailableError("Unable to fetch document") from exc
        body = response["Body"]
        return DownloadStream(
            body=body.iter_chunks(chunk_size=1024 * 1024),
            content_type=response.get("ContentType"),
            content_length=response.get("ContentLength"),
        )

    def presigned_url(self, key: str, expires_in_seconds: int) -> str:
        try:
            return self.client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=expires_in_seconds,
            )
        except Exception as exc:
            raise ServiceUnavailableError("Unable to create download URL") from exc


storage = DocumentStorage()
