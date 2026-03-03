# KB INGESTION PIPELINE — IMPLEMENTATION PLAN

**Date**: March 2, 2026  
**Complexity**: HIGH (Multiple interconnected systems)  
**Estimated Effort**: 4-6 weeks (full implementation of all critical + high items)

---

## PHASE 1: CRITICAL FIXES (Week 1-2)

### **1.1 Implement Bedrock Ingestion Job Tracking**

**Files to Modify:**
- [dynamo_service.py](backend/app/services/dynamo_service.py) — Add KB ingestion record functions
- [kb_sync.py](backend/worker/tasks/kb_sync.py) — Store ingestion job IDs
- [kb_service.py](backend/app/services/kb_service.py) — Query job status

**Database Schema Changes:**
```python
# Add to dynamo_service.py

def create_kb_ingestion_record(
    kb_doc_id: str,
    bedrock_ingestion_job_id: str,
    bedrock_data_source_id: str,
    sync_job_id: str,
) -> dict:
    """Track Bedrock ingestion job for a KB document."""
    table = get_dynamodb_table()
    record_id = _uuid()
    now = _now_iso()
    item = {
        "PK": "KB#INGESTION",
        "SK": f"INGESTION#{bedrock_ingestion_job_id}",
        "GSI1PK": f"KBDOC#{kb_doc_id}",
        "GSI1SK": f"INGESTION#{bedrock_ingestion_job_id}",
        "entity": "KB_INGESTION",
        "id": record_id,
        "kb_doc_id": kb_doc_id,
        "bedrock_ingestion_job_id": bedrock_ingestion_job_id,
        "bedrock_data_source_id": bedrock_data_source_id,
        "sync_job_id": sync_job_id,
        "status": "QUEUED",
        "started_at": now,
        "completed_at": None,
        "error_message": None,
        "documents_processed": 0,
        "documents_failed": 0,
    }
    table.put_item(Item=_prepare_item(item))
    logger.info("Created KB ingestion record for doc %s, job %s", kb_doc_id, bedrock_ingestion_job_id)
    return _clean_item(item)

def get_kb_ingestion_record(bedrock_ingestion_job_id: str) -> Optional[dict]:
    """Get ingestion record by Bedrock job ID."""
    table = get_dynamodb_table()
    resp = table.query(
        KeyConditionExpression=Key("PK").eq("KB#INGESTION") & Key("SK").eq(f"INGESTION#{bedrock_ingestion_job_id}"),
        Limit=1,
    )
    items = resp.get("Items", [])
    return _clean_item(items[0]) if items else None

def get_ingestion_records_for_kb_doc(kb_doc_id: str) -> list[dict]:
    """Get all ingestion records for a KB document."""
    table = get_dynamodb_table()
    resp = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"KBDOC#{kb_doc_id}") & Key("GSI1SK").begins_with("INGESTION#"),
    )
    return [_clean_item(i) for i in resp.get("Items", [])]

def update_kb_ingestion_record(bedrock_ingestion_job_id: str, updates: dict) -> Optional[dict]:
    """Update ingestion record status."""
    record = get_kb_ingestion_record(bedrock_ingestion_job_id)
    if not record:
        return None
    table = get_dynamodb_table()
    updates["updated_at"] = _now_iso()
    expr_parts = []
    expr_values = {}
    expr_names = {}
    for k, v in updates.items():
        safe_key = f"#{k}"
        expr_names[safe_key] = k
        expr_parts.append(f"{safe_key} = :{k}")
        expr_values[f":{k}"] = _prepare_value(v)
    table.update_item(
        Key={"PK": record["PK"], "SK": record["SK"]},
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeValues=expr_values,
        ExpressionAttributeNames=expr_names,
    )
    record.update(updates)
    return _clean_item(record)
```

**Worker Update:**
```python
# kb_sync.py - process_kb_sync()

def process_kb_sync(payload: dict) -> None:
    job_id = payload["job_id"]
    settings = get_settings()

    dynamo_service.update_job(job_id, {"status": "IN_PROGRESS", "progress": 10})

    if not settings.BEDROCK_KB_ID:
        logger.warning("BEDROCK_KB_ID not set")
        dynamo_service.update_job(job_id, {"status": "COMPLETE", "progress": 100})
        return

    try:
        bedrock_agent = get_bedrock_agent_admin_client()
        ds_response = bedrock_agent.list_data_sources(
            knowledgeBaseId=settings.BEDROCK_KB_ID,
            maxResults=10,
        )
        data_sources = ds_response.get("dataSourceSummaries", [])

        if not data_sources:
            logger.warning("No data sources found")
            dynamo_service.update_job(job_id, {"status": "COMPLETE", "progress": 100})
            return

        synced = 0
        for ds in data_sources:
            ds_id = ds["dataSourceId"]
            logger.info("Starting ingestion for KB=%s, DS=%s", settings.BEDROCK_KB_ID, ds_id)

            # Start ingestion job
            ingestion_response = bedrock_agent.start_ingestion_job(
                knowledgeBaseId=settings.BEDROCK_KB_ID,
                dataSourceId=ds_id,
            )
            bedrock_ingestion_job_id = ingestion_response.get("ingestionJobId")
            
            # NEW: Store ingestion job ID for tracking
            if bedrock_ingestion_job_id:
                # Map documents to this ingestion job
                # (We'll do full mapping in next phase)
                logger.info("Bedrock ingestion job: %s", bedrock_ingestion_job_id)
            
            synced += 1

        dynamo_service.update_job(job_id, {
            "status": "COMPLETE",
            "progress": 100,
            "result": {"data_sources_synced": synced},
        })
        logger.info("KB sync complete: %d data sources synced", synced)

    except Exception as exc:
        logger.error("KB sync failed: %s", exc)
        dynamo_service.update_job(job_id, {
            "status": "FAILED",
            "error": str(exc),
        })
        raise
```

---

### **1.2 Add File Deletion Sync to Bedrock**

**Problem:** When file deleted from DynamoDB, still in Bedrock vector store

**Solution:** Create dedicated deletion sync job

**Code:**
```python
# kb_service.py

def delete_kb_document(kb_doc_id: str, user: CurrentUser) -> dict:
    """Delete KB document and trigger Bedrock sync."""
    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc:
        raise KBDocumentNotFoundError(kb_doc_id)

    s3_key = doc.get("s3_key", "")
    
    # Step 1: Delete from S3
    if s3_key:
        try:
            _delete_from_kb_bucket(s3_key)
        except Exception as exc:
            logger.warning("S3 delete failed for %s: %s", s3_key, exc)

    # Step 2: Mark as deleted in DynamoDB (soft delete)
    dynamo_service.update_kb_document(kb_doc_id, {
        "status": "deleted",
        "deleted_at": _now(),
        "deleted_by": user.user_id,
    })

    # Step 3: Create sync job to remove from Bedrock
    sync_job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="SYNC_KB_DELETE",
        params={"kb_doc_id": kb_doc_id},
    )

    # Step 4: Queue for worker
    sqs_service.send_kb_sync_task(
        job_id=sync_job["id"],
        user_id=user.user_id,
    )

    logger.info("KB document %s deleted, sync job %s created", kb_doc_id, sync_job["id"])
    
    return {
        "success": True,
        "id": kb_doc_id,
        "sync_job_id": sync_job["id"],
        "message": "Document deleted. Bedrock index will be updated shortly."
    }
```

**Worker Task:**
```python
# worker/tasks/kb_sync.py - Add new task

def process_kb_delete_sync(payload: dict) -> None:
    """Handle deletion sync (remove from Bedrock after file deleted)."""
    job_id = payload["job_id"]
    kb_doc_id = payload.get("kb_doc_id")
    
    if not kb_doc_id:
        logger.error("KB delete sync: missing kb_doc_id")
        return

    settings = get_settings()
    dynamo_service.update_job(job_id, {"status": "IN_PROGRESS", "progress": 50})

    if not settings.BEDROCK_KB_ID:
        logger.warning("BEDROCK_KB_ID not set")
        dynamo_service.update_job(job_id, {"status": "COMPLETE", "progress": 100})
        return

    try:
        bedrock_agent = get_bedrock_agent_admin_client()
        
        # Trigger re-ingestion to pick up deletions
        ds_response = bedrock_agent.list_data_sources(
            knowledgeBaseId=settings.BEDROCK_KB_ID,
            maxResults=10,
        )
        data_sources = ds_response.get("dataSourceSummaries", [])

        for ds in data_sources:
            bedrock_agent.start_ingestion_job(
                knowledgeBaseId=settings.BEDROCK_KB_ID,
                dataSourceId=ds["dataSourceId"],
            )

        dynamo_service.update_job(job_id, {
            "status": "COMPLETE",
            "progress": 100,
            "result": {"deleted_from_bedrock": True},
        })
        
        # NOW safe to hard-delete from DynamoDB
        dynamo_service.delete_kb_document(kb_doc_id)
        logger.info("KB document %s fully deleted after Bedrock sync", kb_doc_id)

    except Exception as exc:
        logger.error("KB delete sync failed: %s", exc)
        dynamo_service.update_job(job_id, {
            "status": "FAILED",
            "error": str(exc),
        })
        raise
```

---

### **1.3 Enhanced Sanity Check**

**File:** [kb_service.py](backend/app/services/kb_service.py)

```python
def run_enhanced_sanity_check() -> dict:
    """Comprehensive KB sanity check including Bedrock status."""
    from app.core.aws_clients import get_s3_client
    
    docs = dynamo_service.list_kb_documents()
    s3 = get_s3_client()
    settings = get_settings()
    
    checks = {
        "metadata_without_file": [],      # DynamoDB record but no S3 file
        "file_without_metadata": [],      # S3 file but no DynamoDB record
        "size_mismatch": [],              # DynamoDB size != S3 size
        "bedrock_sync_failed": [],        # Ingestion job failed
        "bedrock_sync_pending": [],       # Document modified but not synced
        "orphaned_ingestion_jobs": [],    # Job with no KB document
    }
    
    # Check 1: Metadata without file
    for doc in docs:
        if doc.get("status") == "deleted":
            continue  # Skip soft-deleted
        
        s3_key = doc.get("s3_key", "")
        if not s3_key:
            checks["metadata_without_file"].append({
                "id": doc.get("id"),
                "name": doc.get("name"),
                "reason": "s3_key missing",
            })
            continue
        
        try:
            s3.head_object(Bucket=settings.KB_BUCKET_NAME, Key=s3_key)
        except:
            checks["metadata_without_file"].append({
                "id": doc.get("id"),
                "name": doc.get("name"),
                "s3_key": s3_key,
                "reason": "File not found in S3",
            })
    
    # Check 2: Size mismatch
    for doc in docs:
        if doc.get("status") == "deleted":
            continue
        
        s3_key = doc.get("s3_key", "")
        if not s3_key:
            continue
        
        try:
            response = s3.head_object(Bucket=settings.KB_BUCKET_NAME, Key=s3_key)
            actual_size = response.get("ContentLength", 0)
            stored_size = doc.get("size", 0)
            
            if actual_size != stored_size:
                checks["size_mismatch"].append({
                    "id": doc.get("id"),
                    "name": doc.get("name"),
                    "stored_size": stored_size,
                    "actual_size": actual_size,
                    "difference": actual_size - stored_size,
                    "recommendation": "Run sync or re-upload",
                })
        except Exception as exc:
            logger.warning("Size check failed for %s: %s", s3_key, exc)
    
    # Check 3: Bedrock sync status
    ingestion_records = dynamo_service.scan_all_entities("KB_INGESTION")
    for record in ingestion_records:
        if record.get("status") == "FAILED":
            kb_doc = dynamo_service.get_kb_document(record.get("kb_doc_id"))
            if kb_doc:
                checks["bedrock_sync_failed"].append({
                    "kb_doc_id": kb_doc.get("id"),
                    "kb_doc_name": kb_doc.get("name"),
                    "ingestion_job_id": record.get("bedrock_ingestion_job_id"),
                    "error": record.get("error_message"),
                })
    
    # Check 4: Documents needing sync (modified since last sync)
    for doc in docs:
        if doc.get("status") == "unsynced":
            checks["bedrock_sync_pending"].append({
                "id": doc.get("id"),
                "name": doc.get("name"),
                "reason": "Intentionally marked unsynced",
            })
    
    # Calculate health
    total_issues = sum(len(v) for v in checks.values() if isinstance(v, list))
    health_score = max(0, 100 - (total_issues * 5))
    
    # Generate recommendations
    recommendations = []
    if checks["metadata_without_file"]:
        recommendations.append(
            f"{len(checks['metadata_without_file'])} document(s) have no file in S3. "
            "Delete metadata or re-upload files."
        )
    if checks["size_mismatch"]:
        recommendations.append(
            f"{len(checks['size_mismatch'])} document(s) have size mismatch. "
            "Run sync or verify S3 file integrity."
        )
    if checks["bedrock_sync_failed"]:
        recommendations.append(
            f"{len(checks['bedrock_sync_failed'])} document(s) failed Bedrock sync. "
            "Check error messages and retry."
        )
    if not recommendations:
        recommendations.append("Knowledge Base is healthy!")
    
    return {
        **run_sanity_check(),  # Include original checks
        "enhanced_checks": checks,
        "health_score": health_score,
        "recommendations": recommendations,
    }
```

---

## PHASE 2: HIGH-PRIORITY FEATURES (Week 3-4)

### **2.1 Add Metadata Update Endpoint**

**API Routes:**
```python
# kb.py

@router.put("/documents/{kb_doc_id}", response_model=KBDocumentItem)
async def update_kb_document_metadata(
    kb_doc_id: str,
    body: UpdateKBDocumentRequest,  # NEW schema
    user: CurrentUser = Depends(require_admin),
):
    """Update KB document metadata (name, description, category)."""
    return kb_service.update_kb_document_metadata(kb_doc_id, body)
```

**Schema:**
```python
# schemas/kb.py

class UpdateKBDocumentRequest(BaseModel):
    """Update KB document metadata."""
    name: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=2000)
    category: Optional[str] = Field(
        None,
        pattern="^(regulatory|template|guideline|reference|general)$",
    )
```

**Service:**
```python
# kb_service.py

def update_kb_document_metadata(kb_doc_id: str, body: UpdateKBDocumentRequest) -> dict:
    """Update KB document metadata fields."""
    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc:
        raise KBDocumentNotFoundError(kb_doc_id)
    
    updates = {}
    if body.name is not None:
        # Check for name conflicts
        conflict = check_duplicate(body.name)
        if conflict["is_duplicate"] and conflict["existing_document"]["id"] != kb_doc_id:
            raise NixAIException(f"Document name '{body.name}' already exists", status_code=409)
        updates["name"] = body.name
    
    if body.description is not None:
        updates["description"] = body.description
    
    if body.category is not None:
        updates["category"] = body.category
    
    if not updates:
        return _format_kb_document(doc)
    
    updated = dynamo_service.update_kb_document(kb_doc_id, updates)
    logger.info("Updated KB document %s: %s", kb_doc_id, list(updates.keys()))
    return _format_kb_document(updated)
```

---

### **2.2 Add File Re-upload Endpoint**

**API Routes:**
```python
# kb.py

@router.post("/documents/{kb_doc_id}/reupload")
async def reupload_kb_document(
    kb_doc_id: str,
    file: UploadFile = File(...),
    description: str = Form(""),
    user: CurrentUser = Depends(require_admin),
):
    """Replace the content of an existing KB document."""
    return kb_service.reupload_kb_document(kb_doc_id, file, description, user)
```

**Service:**
```python
# kb_service.py

async def reupload_kb_document(
    kb_doc_id: str,
    file: UploadFile,
    description: str,
    user: CurrentUser,
) -> dict:
    """Replace KB document file content."""
    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc:
        raise KBDocumentNotFoundError(kb_doc_id)
    
    # Validate file
    if file.size > 50 * 1024 * 1024:
        raise NixAIException("File exceeds 50MB limit", status_code=413)
    
    settings = get_settings()
    s3 = get_s3_client()
    
    try:
        # Upload new version to S3 (versioning friendly)
        new_key = f"documents/{doc['id']}/{doc['name']}"
        
        content = await file.read()
        s3.put_object(
            Bucket=settings.KB_BUCKET_NAME,
            Key=new_key,
            Body=content,
            ContentType=file.content_type or "application/octet-stream",
        )
        
        # Update DynamoDB
        updates = {
            "size": len(content),
            "updated_at": _now(),
            "last_reuploaded_by": user.user_id,
        }
        
        if description:
            updates["description"] = description
        
        updated = dynamo_service.update_kb_document(kb_doc_id, updates)
        
        # Mark as needing Bedrock sync
        dynamo_service.update_kb_document(kb_doc_id, {
            "bedrock_sync_pending": True,
        })
        
        logger.info("Reuploaded KB document %s by %s", kb_doc_id, user.user_id)
        
        return {
            **_format_kb_document(updated),
            "message": "File updated. Remember to sync Bedrock to apply changes.",
        }
        
    except Exception as exc:
        logger.error("KB reupload failed: %s", exc)
        raise StorageError(f"Failed to reupload KB document: {exc}")
```

---

### **2.3 Implement Versioning**

**DynamoDB Schema Update:**
```python
# Modify KB_DOCUMENT to include versions

def reupload_kb_document_with_versioning(
    kb_doc_id: str,
    file: UploadFile,
    change_description: str,
    user: CurrentUser,
) -> dict:
    """Reupload with version tracking."""
    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc:
        raise KBDocumentNotFoundError(kb_doc_id)
    
    settings = get_settings()
    s3 = get_s3_client()
    current_version = doc.get("current_version", 1)
    new_version = current_version + 1
    
    content = await file.read()
    file_hash = hashlib.sha256(content).hexdigest()
    
    # Upload with version in path
    versioned_key = f"documents/{doc['id']}/v{new_version}/{doc['name']}"
    
    s3.put_object(
        Bucket=settings.KB_BUCKET_NAME,
        Key=versioned_key,
        Body=content,
        ContentType=file.content_type,
    )
    
    # Create version record
    version_record = {
        "version_number": new_version,
        "s3_key": versioned_key,
        "size": len(content),
        "file_hash": file_hash,
        "created_at": _now(),
        "created_by": user.user_id,
        "change_description": change_description,
        "bedrock_ingestion_job_id": None,
        "bedrock_status": "PENDING",
    }
    
    # Update KB document
    versions = doc.get("versions", [])
    versions.append(version_record)
    
    dynamo_service.update_kb_document(kb_doc_id, {
        "current_version": new_version,
        "versions": versions,
        "s3_key": versioned_key,  # Point to latest
        "size": len(content),
        "bedrock_sync_pending": True,
    })
    
    logger.info("KB document %s reuploaded to version %d", kb_doc_id, new_version)
    
    return _format_kb_document(dynamo_service.get_kb_document(kb_doc_id))
```

---

## PHASE 3: MEDIUM-PRIORITY FEATURES (Week 5-6)

### **3.1 Category-Based Sync Strategy**

```python
# kb_service.py

def submit_kb_sync(
    user: CurrentUser,
    category: Optional[str] = None,  # NEW param
) -> dict:
    """Sync KB with optional category filter."""
    settings = get_settings()
    
    existing = _find_active_sync_job(user.user_id)
    if existing:
        logger.info("Active sync job exists, returning it")
        return {...}
    
    job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="SYNC_KB",
        params={"category": category} if category else {},
    )
    
    if settings.is_lambda:
        sqs_service.send_kb_sync_task(job["id"], user.user_id)
    else:
        return _execute_kb_sync_inline(job)
    
    return {
        "jobId": job["id"],
        "status": "QUEUED",
        "category": category or "all",
    }
```

### **3.2 Change Detection & Audit Trail**

```python
# Add to dynamo_service.py

def create_kb_change_record(
    kb_doc_id: str,
    change_type: str,  # CREATED, UPDATED, DELETED, REUPLOADED
    changed_by: str,
    old_value: dict = None,
    new_value: dict = None,
    reason: str = "",
) -> dict:
    """Create audit trail record for KB changes."""
    table = get_dynamodb_table()
    record_id = _uuid()
    ts = int(time.time() * 1000)
    now = _now_iso()
    
    item = {
        "PK": f"KBDOC#{kb_doc_id}",
        "SK": f"CHANGE#{ts}#{record_id}",
        "GSI1PK": f"KBCHANGE#{kb_doc_id}",
        "GSI1SK": f"TS#{ts}",
        "entity": "KB_CHANGE",
        "id": record_id,
        "kb_doc_id": kb_doc_id,
        "change_type": change_type,
        "changed_by": changed_by,
        "changed_at": now,
        "old_value": old_value or {},
        "new_value": new_value or {},
        "reason": reason,
    }
    
    table.put_item(Item=_prepare_item(item))
    return _clean_item(item)

def get_kb_change_history(kb_doc_id: str) -> list[dict]:
    """Get full audit trail for a KB document."""
    table = get_dynamodb_table()
    resp = table.query(
        KeyConditionExpression=Key("PK").eq(f"KBDOC#{kb_doc_id}") & Key("SK").begins_with("CHANGE#"),
        ScanIndexForward=False,  # Newest first
    )
    return [_clean_item(i) for i in resp.get("Items", [])]
```

---

## TESTING CHECKLIST

### **Unit Tests**
- [ ] Metadata update validation
- [ ] File reupload with versioning
- [ ] Ingestion job tracking
- [ ] Size mismatch detection
- [ ] Orphaned file detection

### **Integration Tests**
- [ ] Full upload → sync → Bedrock flow
- [ ] File deletion sync
- [ ] Metadata update without file change
- [ ] Category-based sync filtering
- [ ] Version rollback

### **End-to-End Tests**
- [ ] Admin uploads → modifies → syncs
- [ ] Stale data detection and resolution
- [ ] Concurrent syncs handling
- [ ] Error recovery and retries

---

## DATABASE MIGRATIONS

```python
# migration_kb_enhancements.py

def migrate_kb_documents():
    """Add new fields to existing KB documents."""
    table = get_dynamodb_table()
    docs = list_kb_documents()
    
    for doc in docs:
        updates = {
            "current_version": 1,
            "versions": [{
                "version_number": 1,
                "s3_key": doc.get("s3_key"),
                "size": doc.get("size"),
                "file_hash": "",  # Will need to calculate
                "created_at": doc.get("created_at"),
                "created_by": doc.get("uploaded_by"),
                "change_description": "Initial upload",
            }],
            "bedrock_sync_pending": False,
        }
        dynamo_service.update_kb_document(doc["id"], updates)
```

---

## FRONTEND UPDATES NEEDED

### **KnowledgeBaseView.jsx**
```jsx
// Add buttons
<button onClick={() => openEditMetadataDialog(doc)}>
  <PenTool size={16} /> Edit Metadata
</button>

<button onClick={() => openReuploadDialog(doc)}>
  <Upload size={16} /> Replace File
</button>

<button onClick={() => openChangeHistoryDrawer(doc)}>
  <History size={16} /> View History
</button>

// Add dialogs
{drawer.type === 'editMetadata' && (
  <EditMetadataDialog
    doc={drawer.context}
    onSave={handleMetadataUpdate}
  />
)}

{drawer.type === 'reupload' && (
  <ReuploadFileDialog
    doc={drawer.context}
    onSuccess={handleReuploadSuccess}
  />
)}

{drawer.type === 'changeHistory' && (
  <ChangeHistoryDrawer
    doc={drawer.context}
  />
)}
```

---

## DEPLOYMENT CHECKLIST

- [ ] Code review
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] Performance testing (sync speed)
- [ ] Documentation updated
- [ ] Admin training completed
- [ ] Staging deployment
- [ ] Smoke tests on staging
- [ ] Production deployment (scheduled)
- [ ] Monitoring and alerting verified
- [ ] Runbook updated

---

## SUCCESS CRITERIA

✅ All file updates propagate to Bedrock within 5 minutes  
✅ All file deletions removed from RAG within 10 minutes  
✅ Full audit trail for all KB changes  
✅ Version history accessible and complete  
✅ Sanity check detects all inconsistencies  
✅ Category-based sync working  
✅ No more "zombie documents" in RAG  
✅ Admin can confidently update KB without manual process

---

**End of Implementation Plan**
