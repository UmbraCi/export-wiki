"""Stream attachments to disk and resume only validated HTTP ranges."""

import hashlib
import json
import re
from pathlib import Path
from time import monotonic, sleep

from requests.exceptions import ChunkedEncodingError, ConnectionError, HTTPError, Timeout

from confluence_export_sidecar.checkpoint import write_json
from confluence_export_sidecar.log import get_logger

log = get_logger(__name__)


def download_attachment(client, attachment, directory: Path) -> bytes:
    version = getattr(getattr(attachment, "version", None), "number", None)
    key = hashlib.sha256(f"{attachment.id}:{version}:{attachment.download_link}".encode()).hexdigest()
    target = directory / f"{key}.bin"
    partial = directory / f"{key}.part"
    metadata = directory / f"{key}.json"
    if target.exists():
        log.info("using saved attachment: id=%s bytes=%d", attachment.id, target.stat().st_size)
        return target.read_bytes()
    for attempt in range(1, 4):
        response = None
        try:
            state = json.loads(metadata.read_text()) if metadata.exists() else {}
            offset = partial.stat().st_size if partial.exists() else 0
            validator = state.get("validator")
            headers = {"Accept-Encoding": "identity"}
            if offset and validator:
                headers.update({"Range": f"bytes={offset}-", "If-Range": validator})
            else:
                offset = 0
            response = client.session.get(
                client.url + attachment.download_link, headers=headers, stream=True,
                timeout=(15, 30), verify=client.verify_ssl,
                proxies=client.proxies, cert=client.cert,
            )
            if response.status_code == 416:
                partial.unlink(missing_ok=True)
                metadata.unlink(missing_ok=True)
                raise ConnectionError("saved range no longer available; restarting attachment")
            response.raise_for_status()
            if ("text/html" in response.headers.get("Content-Type", "").lower()
                    and getattr(attachment, "media_type", None) != "text/html"):
                raise ValueError(f"Attachment {attachment.id} returned a login/HTML page")
            if response.headers.get("Content-Encoding", "identity") != "identity":
                raise ValueError("attachment server ignored identity encoding")
            received_validator = response.headers.get("ETag")
            if received_validator and received_validator.startswith("W/"):
                received_validator = None
            received_validator = received_validator or response.headers.get("Last-Modified")
            if response.status_code == 206:
                match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", response.headers.get("Content-Range", ""))
                if (not match or not offset or int(match[1]) != offset
                        or int(match[2]) < offset or int(match[2]) >= int(match[3])
                        or (state.get("total") is not None and int(match[3]) != state["total"])
                        or (received_validator and received_validator != validator)):
                    partial.unlink(missing_ok=True)
                    metadata.unlink(missing_ok=True)
                    raise ConnectionError("attachment range changed; restarting attachment")
                total = int(match[3])
                received_validator = received_validator or validator
            elif response.status_code == 200:
                offset = 0
                length = response.headers.get("Content-Length")
                total = int(length) if length is not None else None
            else:
                raise ValueError(f"Unexpected attachment response: HTTP {response.status_code}")
            # Truncate before recording the new validator if the server rejected our range.
            with partial.open("ab" if offset else "wb", buffering=0) as file:
                write_json(metadata, {"validator": received_validator, "total": total})
                log.info("downloading attachment: id=%s attempt=%d/3 resume_bytes=%d total=%s",
                         attachment.id, attempt, offset, total)
                last_log = monotonic()
                for chunk in response.iter_content(chunk_size=64 * 1024):
                    file.write(chunk)
                    if monotonic() - last_log >= 5:
                        log.info("attachment progress: id=%s bytes=%d total=%s", attachment.id, file.tell(), total)
                        last_log = monotonic()
            size = partial.stat().st_size
            if total is not None and size != total:
                raise ChunkedEncodingError(f"incomplete attachment: {size}/{total} bytes")
            partial.replace(target)
            log.info("saved attachment: id=%s bytes=%d", attachment.id, size)
            return target.read_bytes()
        except HTTPError as exc:
            if response is None or response.status_code not in {408, 429, 500, 502, 503, 504}:
                raise
            log.warning("attachment server unavailable: id=%s attempt=%d/3 — %s", attachment.id, attempt, exc)
            if attempt == 3:
                raise
        except (ChunkedEncodingError, ConnectionError, Timeout) as exc:
            log.warning("attachment interrupted; bytes saved: id=%s attempt=%d/3 — %s", attachment.id, attempt, exc)
            if attempt == 3:
                raise
        finally:
            if response is not None:
                response.close()
        sleep(attempt)
    raise ValueError(f"Attachment {attachment.id} could not be downloaded")
