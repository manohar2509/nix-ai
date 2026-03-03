#!/usr/bin/env python3
"""One-shot script: reconcile S3 files with DynamoDB KB_DOCUMENT records."""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from app.core.auth import CurrentUser
from app.services import kb_service

system_user = CurrentUser(
    user_id="system-reconcile",
    email="system@nixai.internal",
    name="System Reconcile",
    groups=["Admin"],
)

result = kb_service.reconcile_s3_documents(system_user)

print("=== Reconciliation Results ===")
print(f"Total S3 objects scanned: {result['total_s3_objects']}")
print(f"Imported: {result['imported_count']}")
print(f"Skipped (already registered): {result['skipped_count']}")
print(f"Errors: {result['error_count']}")
print()
if result["imported"]:
    print("--- Imported Documents ---")
    for doc in result["imported"]:
        print(f"  OK  {doc['name']}  ->  {doc['category']}  (id={doc['id']})")
if result["skipped"]:
    print("--- Skipped ---")
    for s in result["skipped"]:
        print(f"  SKIP  {s['s3_key']}  ({s['reason']})")
if result["errors"]:
    print("--- Errors ---")
    for e in result["errors"]:
        print(f"  ERR  {e['s3_key']}: {e['error']}")
