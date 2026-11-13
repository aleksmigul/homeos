#!/usr/bin/python3
"""Postfix pipe delivery: archive MIME and atomically queue it for HomeOS."""
import datetime
import email.policy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
from email.parser import BytesParser


def atomic_write(destination, content):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as output:
            temporary = output.name
            os.fchmod(output.fileno(), 0o660)
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, destination)
        temporary = None
        descriptor = os.open(destination.parent, os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        if temporary is not None:
            os.unlink(temporary)


def receive(directory, recipient, stream):
    raw = stream.read(25 * 1024 * 1024 + 1)
    if len(raw) > 25 * 1024 * 1024:
        raise ValueError("Message exceeds 25 MiB")
    message = BytesParser(policy=email.policy.default).parsebytes(raw)
    recipient = recipient.lower()
    identifier = hashlib.sha256(recipient.encode() + b"\0" + raw).hexdigest()
    text, html, attachments = [], [], []
    for index, part in enumerate(message.walk()):
        if part.is_multipart():
            continue
        kind = part.get_content_type()
        if part.get_content_disposition() == "attachment" or part.get_filename() or kind not in ("text/plain", "text/html"):
            attachments.append({
                "id": f"{identifier}:{index}",
                "filename": part.get_filename() or "Attachment",
                "contentType": kind,
                "size": len(part.get_payload(decode=True) or b""),
            })
        else:
            content = part.get_payload(decode=True) or b""
            try:
                body = content.decode(part.get_content_charset() or "utf-8", errors="replace")
            except LookupError:
                body = content.decode("utf-8", errors="replace")
            (text if kind == "text/plain" else html).append(body)
    record = {
        "providerId": "smtp:" + identifier,
        "sender": str(message.get("From", "Unknown sender")),
        "recipients": [recipient],
        "subject": str(message.get("Subject", "(No subject)")),
        "text": "\n".join(text) or None,
        "html": "\n".join(html) or None,
        "receivedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "attachments": attachments,
    }
    root = Path(directory)
    atomic_write(root / "raw" / (identifier + ".eml"), raw)
    atomic_write(root / "new" / (identifier + ".json"), json.dumps(record).encode())


if __name__ == "__main__":
    try:
        receive(sys.argv[1], sys.argv[2], sys.stdin.buffer)
    except Exception as error:
        print(f"Travel mail delivery deferred: {error}", file=sys.stderr)
        sys.exit(75)  # EX_TEMPFAIL: Postfix retains the message and retries.
