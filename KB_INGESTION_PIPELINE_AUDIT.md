# NIX AI Knowledge Base Ingestion Pipeline — COMPREHENSIVE AUDIT

**Date**: March 2, 2026  
**Severity**: CRITICAL GAPS FOUND  
**Status**: Analysis Complete — Action Items Pending

---

## EXECUTIVE SUMMARY

Your KB ingestion pipeline has **fundamental gaps** that will cause **data consistency issues**, **incomplete Bedrock synchronization**, and **inability to track file changes**. The system currently:

✅ **WORKS** for initial uploads → Bedrock indexing  
❌ **FAILS** for file updates, deletions propagation, and change tracking  
❌ **MISSING** full end-to-end edit capabilities  
❌ **MISSING** change detection & versioning  
❌ **MISSING** category-specific sync strategies  

---

## CRITICAL ISSUES

### 1. **FILE UPDATE PROBLEM — NO RE-UPLOAD CAPABILITY**

**Current State:**
- Admins can **UPLOAD** new KB files → S3 bucket
- Admins can **DELETE** KB files from DynamoDB + S3
- But there is **NO ENDPOINT** to modify/update an existing KB file

**Impact:**
- If an ICH guideline document has a typo or outdated information, admins **cannot fix it**
- Must delete + re-upload (breaks references, loses metadata)
- Bedrock index becomes stale if file is updated externally (S3 only, no metadata sync)

**Affected Endpoints:**
- `POST /kb/documents` → Only for registration after presigned URL upload
- `GET /kb/documents/{id}` → Read only
- `DELETE /kb/documents/{id}` → Delete only
- **MISSING**: `PUT /kb/documents/{id}` → Update metadata
- **MISSING**: `POST /kb/documents/{id}/re-upload` → Replace file content

**Why It Matters:**
Regulatory files (FDA, EMA, ICH) require immediate updates if guidance changes. Current system forces full re-ingestion.

---

### 2. **FILE DELETION NOT SYNCED TO BEDROCK IMMEDIATELY**

**Current State:**
```python
# kb_service.py - delete_kb_document()
def delete_kb_document(kb_doc_id: str) -> dict:
    doc = dynamo_service.get_kb_document(kb_doc_id)
    if not doc:
        raise KBDocumentNotFoundError(kb_doc_id)
    
    # Delete from S3
    _delete_from_kb_bucket(s3_key)  # ✅ S3 deleted
    
    # Delete from DynamoDB
    dynamo_service.delete_kb_document(kb_doc_id)  # ✅ DynamoDB deleted
    
    # But:
    # ❌ NO automatic Bedrock re-sync triggered
    # ❌ Admin must manually call /kb/sync
```

**Impact:**
- Document is deleted from S3 and DynamoDB
- But **Bedrock still has it in the vector store** until next manual sync
- Users doing RAG searches will still retrieve deleted content for up to several hours
- Creates "zombie documents" in RAG results

**Bedrock Behavior:**
- Bedrock Knowledge Base maintains its own ingestion jobs
- Deleted files from source are NOT automatically removed
- Manual `start_ingestion_job()` required to re-process

---

### 3. **PARTIAL FILE UPDATES NOT TRACKED**

**Scenario:**
Admin notices FDA guidance file has 2 outdated sections out of 50. Currently must:
1. Download the file from S3
2. Edit locally
3. Re-upload via presigned URL
4. Delete old metadata
5. Register new document
6. Trigger sync

**Missing:**
- Version tracking (no way to see what changed)
- Change history (no audit log of updates)
- Partial sync capability (must re-index entire KB)
- Change detection (no diff between old/new file)

**Better Approach Needed:**
- Track `updated_at` and `version_number` in DynamoDB
- Maintain change log of what was updated
- Allow selective file replacement
- Only trigger Bedrock sync on changed files (not entire KB)

---

### 4. **CATEGORY STRATEGY NOT ALIGNED WITH SYNC STRATEGY**

**Current Categories (Frontend)**
```javascript
const CATEGORIES = [
  'regulatory',    // FDA, EMA, ICH — HIGH PRIORITY
  'guideline',     // Clinical guidelines
  'template',      // Protocol templates
  'reference',     // Reference materials
  'general',       // Misc
];
```

**DynamoDB Stores Category:**
```python
# kb_service.py - register_kb_document()
category: str = "general",  # ✅ Stored in metadata
```

**What's Missing:**
- No **category-aware sync logic**
- All categories synced together (all-or-nothing)
- Regulatory documents should sync more frequently
- No priority/SLA per category

**Better Approach:**
- `regulatory` files → Sync immediately on change
- `guideline` files → Sync on schedule or on-demand
- `template` files → Batch sync weekly
- `reference` files → Lower priority

---

### 5. **BEDROCK SYNC STATUS NOT TRACKED**

**Current Implementation:**
```python
# kb_service.py
def submit_kb_sync(user: CurrentUser) -> dict:
    # Creates a DynamoDB job
    job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="SYNC_KB",
        params={},
    )
    # Sends to SQS/executes inline
    
    # Returns job status as QUEUED or COMPLETE
```

**Issue:**
Document status field only has 3 values:
- `uploaded` → File in S3, registered in DynamoDB
- `unsynced` → Intentionally marked for exclusion
- `indexed` → Assumed indexed by Bedrock (NO VERIFICATION)

**Missing:**
- No verification that Bedrock actually indexed the file
- No tracking of which Bedrock ingestion job corresponds to which KB document
- No error handling for failed ingestions
- No retry logic if Bedrock sync fails

**Example Problem:**
```
1. Admin uploads "ich_guidelines.md" → status="uploaded"
2. Admin calls /kb/sync
3. Bedrock starts ingestion_job_123
4. Bedrock fails (corrupted file format)
5. No error propagated back
6. Document still marked as "uploaded" (not "indexed", not "error")
7. Admin doesn't know sync failed
8. Users get RAG results from old version
```

---

### 6. **NO CHANGE DETECTION OR DIFFING**

**Current Flow:**
```
File changed locally
    ↓
Admin deletes old → registers new
    ↓
Old metadata lost
    ↓
No audit trail
```

**Missing:**
- Version control (git-like history)
- Change log (what changed, when, by whom)
- Diff viewer (see changes before committing)
- Rollback capability (revert to previous version)
- Change impact analysis (which RAG queries will be affected?)

---

### 7. **BUILD SCRIPT DOESN'T DETECT CHANGES**

**Current:**
```python
# project/build_kb_content.py

def main():
    # Rebuilds ALL KB content files from JSON
    # No change detection
    # No incremental builds
    # Always re-generates 11 markdown files
    # No tracking of which files changed
```

**Issues:**
- If one JSON file changes, entire KB is rebuilt
- No way to know which source files were modified
- No diff between old and new markdown
- Upload always replaces all files in S3

**Better Approach:**
- Calculate hash of each JSON source
- Only rebuild markdown if source changed
- Track file versions in S3
- Incremental uploads to Bedrock

---

### 8. **METADATA FIELDS NOT EDITABLE**

**What Can Be Edited Currently:**
- ✅ Status (uploaded → unsynced → uploaded)
- ✅ Nothing else

**What Cannot Be Edited:**
- ❌ Name (must delete + re-upload)
- ❌ Description (must delete + re-upload)
- ❌ Category (must delete + re-upload)
- ❌ S3 key (immutable)

**Example Workflow Problem:**
Admin uploads "ICH_E6_V3_FINAL.pdf" but realizes it's "ICH_E6_R3_FINAL.pdf"
- Current: Must delete document, re-upload with correct name
- Better: PUT /kb/documents/{id} with `{"name": "ICH_E6_R3_FINAL.pdf"}`

---

### 9. **NO INGESTION JOB TRACKING**

**Current KB Sync Worker:**
```python
# worker/tasks/kb_sync.py

def process_kb_sync(payload: dict) -> None:
    # Lists all Bedrock data sources
    # Calls start_ingestion_job() for each
    # Updates DynamoDB job status
    # But doesn't track individual ingestion jobs
```

**Problem:**
```python
bedrock_agent.start_ingestion_job(
    knowledgeBaseId=settings.BEDROCK_KB_ID,
    dataSourceId=ds_id,
)
# Returns: ingestion_job_id (ignored!)
# Should: Store in DynamoDB for tracking
```

**Missing:**
- No mapping: `KB_DOCUMENT` → `bedrock_ingestion_job_id`
- No way to query: "Which documents are currently being ingested?"
- No error handling if ingestion job fails
- No timeout/retry logic

---

### 10. **NO VALIDATION OF FILE CONTENTS BEFORE SYNC**

**Current Flow:**
```
Admin uploads PDF
    ↓
File stored in S3
    ↓
Registered in DynamoDB
    ↓
Triggers Bedrock sync
    ↓
Bedrock tries to parse
    ↓
??? If Bedrock fails, no error feedback
```

**Missing:**
- Virus scan check
- File integrity check (corrupt PDF?)
- Encoding validation
- Content preview (show what Bedrock will index)
- Size limits per category

---

### 11. **SANITY CHECK MISSES CRITICAL ISSUES**

**Current Sanity Check Results:**
```python
{
    "total_documents": 25,
    "duplicates": [...],
    "oversized_files": [...],
    "empty_files": [...],
    "unsupported_types": [...],
    "unsynced_documents": [...],
    "synced_documents": [...],
    "issues_count": 3,
    "health_score": 95.0,
    "recommendations": [...]
}
```

**Missing Checks:**
- ❌ File actually in S3? (metadata without actual file)
- ❌ Content matches S3 size? (metadata desynchronized)
- ❌ File properly indexed in Bedrock? (ingestion job status)
- ❌ File changed since last sync? (stale data detection)
- ❌ Citation references valid? (broken links)
- ❌ Bedrock ingestion errors? (sync failed silently)
- ❌ Category ratio balanced? (over-reliance on one category)

---

## DETAILED ARCHITECTURE REVIEW

### **Current Pipeline Flow**

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN UPLOADS FILE                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Frontend: Click "Upload KB Document"                     │
│  2. Call: GET /kb/upload-url?filename=...                    │
│     → Returns presigned S3 URL for KB bucket                │
│  3. Upload file directly to S3 via presigned URL            │
│  4. Call: POST /kb/documents                                │
│     └─→ DynamoDB create_kb_document()                       │
│         {                                                    │
│           id: uuid(),                                       │
│           name: filename,                                   │
│           s3_key: "documents/filename",                     │
│           size: file_size,                                  │
│           category: "general|regulatory|...",               │
│           status: "uploaded",                               │
│           created_at: now(),                                │
│         }                                                   │
│  5. Update DynamoDB + local state                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              ADMIN TRIGGERS KB SYNC                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Frontend: Click "Sync KB"                               │
│  2. Call: POST /kb/sync                                     │
│     → Create job: type="SYNC_KB", status="QUEUED"           │
│     → Send SQS message (Lambda) OR execute inline (dev)     │
│  3. Worker: process_kb_sync()                               │
│     a. Get KB ID from config (BEDROCK_KB_ID)                │
│     b. List data sources: bedrock.list_data_sources()       │
│     c. For each data source:                                │
│        └─→ bedrock.start_ingestion_job()                    │
│            └─→ Bedrock re-indexes S3 bucket                 │
│     d. Update job: status="COMPLETE"                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│            BEDROCK INGESTS KB FILES                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Bedrock Knowledge Base Data Source:                         │
│    - Type: S3                                               │
│    - Bucket: nixai-clinical-kb                             │
│    - Prefix: /documents/ and /reference/                    │
│                                                              │
│  Ingestion Process:                                          │
│    1. Scan S3 bucket for new/modified files                 │
│    2. Parse markdown files                                  │
│    3. Chunk text (default: ~200 tokens per chunk)           │
│    4. Generate embeddings (Nova-lite model)                 │
│    5. Store vectors in Bedrock vector store                 │
│    6. Available for RAG retrieval                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│           USERS QUERY VIA RAG                                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  User: "What are FDA endpoint requirements?"                │
│    ↓                                                         │
│  Chat: Bedrock Retrieve and Generate (RAG)                 │
│    ├─→ Retrieve: Vector search in Bedrock KB               │
│    ├─→ Generate: Nova model answers with citations         │
│    └─→ Citations: Link back to source KB documents         │
│    ↓                                                         │
│  Response: Answer + [FDA_Guidance.pdf, page 23]            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### **What's Missing in This Flow**

| Step | What Exists | What's Missing |
|------|------------|-----------------|
| **Upload** | Presigned URL → S3 | Re-upload/update existing file |
| **Register** | DynamoDB metadata | Update metadata (name, desc, category) |
| **Sync Trigger** | Job creation → SQS | Status checking, error handling |
| **Worker** | Bedrock sync call | Ingestion job tracking, retry logic |
| **Bedrock** | File indexing | Deletion handling, partial sync |
| **Tracking** | Job status | File-level sync status, ingestion errors |
| **RAG Query** | Works | No source data freshness guarantee |

---

## FILE CATEGORY STRATEGY

### **Current Categories**
```python
regulatory    → FDA, EMA, ICH (HIGH PRIORITY)
guideline     → Clinical guidelines
template      → Protocol templates  
reference     → Reference materials
general       → Miscellaneous
```

### **Recommended Sync Strategy by Category**

| Category | Priority | Sync Frequency | Validation | Retention |
|----------|----------|-----------------|------------|-----------|
| **regulatory** | CRITICAL | Immediate (on change) | Strict (virus, encoding) | Forever (audit trail) |
| **guideline** | HIGH | Daily or on-demand | Moderate | Forever |
| **template** | MEDIUM | Weekly | Basic | 2 years |
| **reference** | MEDIUM | Weekly or on-demand | Basic | 2 years |
| **general** | LOW | Monthly | Basic | 1 year |

### **Current Implementation**
```python
# All categories synced together
bedrock_agent.start_ingestion_job(
    knowledgeBaseId=BEDROCK_KB_ID,
    dataSourceId=ds_id,
)
# No category-aware logic
```

---

## DATA CONSISTENCY GAPS

### **Scenario 1: File Updated Externally**
```
Time T0: Admin uploads "ICH_E6.pdf" (100 pages)
         DynamoDB: { id: abc123, s3_key: "documents/ICH_E6.pdf", status: "uploaded", size: 5MB }
         S3: abc123/documents/ICH_E6.pdf (5MB)
         Bedrock: indexed, 500 chunks

Time T1: Someone updates S3 file directly (e.g., AWS CLI, script)
         S3: abc123/documents/ICH_E6.pdf (5.1MB)  ← CHANGED
         DynamoDB: { size: 5MB }  ← STALE
         Bedrock: Still using old version  ← STALE

Time T2: Admin views KB documents
         Shows: ICH_E6.pdf (5MB)  ← INCORRECT SIZE
         
Time T3: User queries "ICH E6 section 4.3"
         Gets: Old version from Bedrock  ← WRONG ANSWER

Time T4: Admin realizes size mismatch
         No way to know which version is correct
         No way to trigger targeted re-sync
         Must check manually, then hope S3 is correct
```

### **Scenario 2: File Deleted from S3, Metadata Remains**
```
Time T0: Bedrock synced with KB file
         S3: "documents/old_template.docx"
         DynamoDB: { id: xyz789, s3_key: "documents/old_template.docx", status: "indexed" }
         Bedrock: Has file in vector store

Time T1: Someone deletes from S3 (cleaning up)
         S3: ❌ DELETED
         DynamoDB: Still exists  ← ORPHANED REFERENCE
         Bedrock: Still has vectors  ← STALE

Time T2: Admin calls /kb/sync again
         Bedrock can't find file in S3
         Ingestion job succeeds (no new files)
         But old vectors still in store

Time T3: User queries KB
         Gets results from deleted file
         Tries to access source → 404 Not Found
```

### **Scenario 3: Partial Update Not Tracked**
```
Time T0: FDA guidance file uploaded (v1.0)
         50 sections, 200 pages

Time T1: FDA publishes guidance update
         Only sections 3, 15, 42 changed

Time T2: Admin manually edits local copy
         Re-uploads entire file as "new document"
         DynamoDB: Creates NEW record (old one still exists)
         Now have duplicates with subtle differences

Time T3: Admin realizes mistake, deletes new one
         But which one should have been deleted?
         No version history to compare

Time T4: Run sanity check
         Finds "duplicate filename" but can't tell which is current
```

---

## IMPLEMENTATION GAPS - DETAILED

### **Gap #1: No Update/Re-upload Endpoint**

**Needed:**
```python
# kb_service.py
def update_kb_document_metadata(
    kb_doc_id: str,
    updates: dict,  # name, description, category
) -> dict:
    """Update KB document metadata without re-uploading file."""
    # Validate inputs
    # Check for name conflicts (new name already exists?)
    # Update DynamoDB
    # Return updated doc
    
def reupload_kb_document(
    kb_doc_id: str,
    file: UploadFile,
    user: CurrentUser,
) -> dict:
    """Replace the content of an existing KB document."""
    # Validate new file
    # Upload to same S3 key (versioning friendly)
    # Update size, updated_at
    # Mark as "needs_resync"
    # Return updated doc
```

**Frontend Needed:**
```jsx
// In KnowledgeBaseView.jsx
<button onClick={() => openEditDialog(doc)}>Edit Metadata</button>
<button onClick={() => openReuploadDialog(doc)}>Replace File</button>
```

---

### **Gap #2: No Bedrock Ingestion Job Tracking**

**Needed:**
```python
# dynamo_service.py
def create_kb_ingestion_record(
    kb_doc_id: str,
    bedrock_ingestion_job_id: str,
    sync_job_id: str,
) -> dict:
    """Track which Bedrock ingestion job processes which KB document."""
    # PK: KB#INGESTION
    # SK: INGESTION#{ingestion_job_id}
    # GSI: KB#DOCS → INGESTION records

def get_ingestion_status(ingestion_job_id: str) -> dict:
    """Query Bedrock for ingestion status, update DynamoDB."""
    # Poll bedrock_agent.get_ingestion_job(job_id)
    # Update status: QUEUED → IN_PROGRESS → SUCCESS/FAILED
    # Store error messages if failed
    # Update corresponding KB_DOCUMENT status
```

**Worker Update:**
```python
# worker/tasks/kb_sync.py
for ds in data_sources:
    ingestion_response = bedrock_agent.start_ingestion_job(...)
    ingestion_job_id = ingestion_response['ingestionJobId']
    
    # NEW: Track this ingestion
    dynamo_service.create_kb_ingestion_record(
        kb_doc_id=doc_id,
        bedrock_ingestion_job_id=ingestion_job_id,
        sync_job_id=job_id,
    )
```

---

### **Gap #3: No Change Detection or Versioning**

**Needed:**
```python
# dynamo_service.py KB_DOCUMENT schema update:
{
    "id": "abc123",
    "name": "ICH_E6.pdf",
    "s3_key": "documents/ICH_E6.pdf",
    "category": "regulatory",
    
    # Current fields
    "status": "uploaded",
    "created_at": "2026-03-02T...",
    "updated_at": "2026-03-02T...",
    
    # NEW: Versioning
    "current_version": 2,
    "versions": [
        {
            "version_number": 1,
            "s3_key": "documents/ICH_E6_v1.pdf",
            "size": 5242880,
            "created_at": "2026-03-01T...",
            "created_by": "admin@example.com",
            "change_description": "Initial upload",
            "bedrock_ingestion_job_id": "job_123",
            "bedrock_status": "SUCCESS",
        },
        {
            "version_number": 2,
            "s3_key": "documents/ICH_E6_v2.pdf",
            "size": 5242900,  # 20 bytes different
            "created_at": "2026-03-02T...",
            "created_by": "admin@example.com",
            "change_description": "Updated section 4.3 per FDA guidance",
            "bedrock_ingestion_job_id": "job_456",
            "bedrock_status": "IN_PROGRESS",
        }
    ],
}
```

---

### **Gap #4: No Bedrock Deletion Handling**

**Current Problem:**
```python
def delete_kb_document(kb_doc_id: str) -> dict:
    # Delete from S3 ✅
    _delete_from_kb_bucket(s3_key)
    
    # Delete from DynamoDB ✅
    dynamo_service.delete_kb_document(kb_doc_id)
    
    # ❌ MISSING: Bedrock doesn't know file is deleted
    # Next sync might fail or do nothing
    # File remains in vector store
```

**Better Approach:**
```python
def delete_kb_document(kb_doc_id: str) -> dict:
    doc = dynamo_service.get_kb_document(kb_doc_id)
    
    # 1. Delete from S3
    _delete_from_kb_bucket(doc['s3_key'])
    
    # 2. Mark for deletion in DynamoDB
    dynamo_service.update_kb_document(kb_doc_id, {
        "status": "deleted",  # NEW status
        "deleted_at": now(),
        "deleted_by": user.user_id,
        "bedrock_sync_pending": True,
    })
    
    # 3. Queue Bedrock re-sync (high priority)
    # Don't delete from DynamoDB yet — keep for audit trail
    job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="SYNC_KB_DELETE",
        params={"kb_doc_id": kb_doc_id},
    )
    sqs_service.send_kb_sync_task(job_id=job["id"])
    
    return {"success": True, "sync_job_id": job["id"]}
```

---

### **Gap #5: No Category-Aware Sync**

**Current:**
```python
def submit_kb_sync(user: CurrentUser) -> dict:
    # Syncs all documents at once
    job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="SYNC_KB",
        params={},  # No category filtering
    )
```

**Needed:**
```python
def submit_kb_sync(
    user: CurrentUser,
    category: str = "all",  # NEW
    only_changed: bool = False,  # NEW
) -> dict:
    """Sync KB with optional filtering by category or change status."""
    job = dynamo_service.create_job(
        user_id=user.user_id,
        job_type="SYNC_KB",
        params={
            "category": category,
            "only_changed": only_changed,
        },
    )
    # Worker will filter which documents to include
    
# In worker:
def process_kb_sync(payload: dict) -> None:
    category = payload.get("category", "all")
    only_changed = payload.get("only_changed", False)
    
    docs = dynamo_service.list_kb_documents()
    
    if category != "all":
        docs = [d for d in docs if d.get("category") == category]
    
    if only_changed:
        docs = [d for d in docs if d.get("bedrock_sync_pending")]
```

---

## RECOMMENDED ACTIONS (PRIORITIZED)

### **CRITICAL (Do First — Blocking Data Integrity)**

1. **Add Update Endpoints**
   - `PUT /kb/documents/{id}` → Update metadata
   - `POST /kb/documents/{id}/reupload` → Replace file
   - Track changes in DynamoDB

2. **Implement Bedrock Ingestion Tracking**
   - Store `ingestion_job_id` in DynamoDB
   - Poll Bedrock job status
   - Update document status based on Bedrock result

3. **Add Deletion Sync**
   - Mark deleted documents (don't delete immediately)
   - Create dedicated SYNC_KB_DELETE job
   - Ensure Bedrock removes old vectors

4. **Enhanced Sanity Check**
   - Verify file exists in S3 (metadata matches reality)
   - Check Bedrock ingestion status (not just DynamoDB status)
   - Detect stale data (file changed but not synced)

### **HIGH (Do Next — Operational Improvement)**

5. **Add Versioning System**
   - Store version history in DynamoDB
   - Keep `versions[]` array with each change
   - Allow rollback to previous version
   - Track who changed what, when

6. **Implement Change Detection**
   - Calculate file hash on upload
   - Compare against previous version
   - Only re-sync if changed
   - Log changes for audit trail

7. **Category-Based Sync Strategy**
   - Priority-based syncing (regulatory first)
   - Scheduled syncs per category
   - Batch operations for efficiency

### **MEDIUM (Nice to Have — UX/Admin Convenience)**

8. **Add Content Preview**
   - Show markdown preview before upload
   - Display what Bedrock will index
   - Detect encoding issues early

9. **Implement Change History UI**
   - Show version timeline
   - Diff viewer (old vs new)
   - Rollback interface

10. **Bedrock Ingestion Monitor**
    - Real-time ingestion job status
    - Alert on failures
    - Retry failed ingestions

---

## SQL-LIKE SCHEMA FOR MISSING TABLES

### **KB_INGESTION_RECORD (Track Bedrock jobs)**
```
PK: KB#INGESTION
SK: INGESTION#{bedrock_job_id}
GSI1PK: KBDOC#{kb_doc_id}
GSI1SK: INGESTION#{bedrock_job_id}

Fields:
- id (PK+SK)
- kb_doc_id (GSI1PK)
- bedrock_ingestion_job_id (unique)
- bedrock_data_source_id
- kb_sync_job_id (ties to SYNC_KB job)
- status (QUEUED, IN_PROGRESS, SUCCESS, FAILED)
- started_at
- completed_at
- error_message (if failed)
- documents_processed
- documents_failed
```

### **KB_CHANGE_LOG (Audit trail)**
```
PK: KBDOC#{kb_doc_id}
SK: CHANGE#{timestamp}#{change_id}

Fields:
- id (PK+SK)
- kb_doc_id (PK)
- change_type (CREATED, UPDATED, DELETED, REUPLOADED)
- changed_by (user_id)
- changed_at
- old_value (metadata change details)
- new_value (metadata change details)
- reason (why changed)
- file_hash (if file content changed)
- previous_version_id
```

---

## TESTING SCENARIOS TO VALIDATE

### **Test 1: File Update Propagation**
1. Upload ICH_E6.pdf → Sync → Bedrock indexes
2. Update ICH_E6.pdf (small change)
3. Call reupload endpoint
4. Verify: DynamoDB updated, version incremented
5. Trigger sync
6. Verify: Bedrock ingestion job created
7. Verify: User queries get new version

### **Test 2: Deletion Propagation**
1. Upload file → Sync
2. Delete document (API call)
3. Verify: S3 file deleted, DynamoDB marked "deleted"
4. Verify: Sync job created automatically
5. Verify: After sync, old data not in RAG results

### **Test 3: Metadata Edit Without File Change**
1. Upload "ICH_E6.pdf" in category "general"
2. Change category to "regulatory" (metadata only)
3. Verify: S3 unchanged, no Bedrock sync triggered
4. Verify: Description/name editable

### **Test 4: Stale Data Detection**
1. Upload file → Sync
2. Manually modify S3 file (simulate external change)
3. Run sanity check
4. Verify: Detected size mismatch
5. Verify: Recommended re-sync

### **Test 5: Category-Based Sync**
1. Upload 5 regulatory files
2. Upload 10 general files
3. Call sync with category="regulatory"
4. Verify: Only regulatory files synced
5. Verify: General files untouched

---

## SUMMARY TABLE: CURRENT VS. NEEDED

| Capability | Current | Needed | Priority |
|------------|---------|--------|----------|
| Upload new file | ✅ YES | ✅ YES | |
| Update file content | ❌ NO | ✅ YES | **CRITICAL** |
| Update metadata | ❌ NO | ✅ YES | **HIGH** |
| Delete file | ✅ YES | ✅ YES → **Improved** | **CRITICAL** |
| Delete sync to Bedrock | ❌ NO | ✅ YES | **CRITICAL** |
| Track Bedrock job | ❌ NO | ✅ YES | **CRITICAL** |
| Version history | ❌ NO | ✅ YES | **HIGH** |
| Change tracking | ❌ NO | ✅ YES | **HIGH** |
| Stale data detection | ❌ NO | ✅ YES | **HIGH** |
| Category-based sync | ❌ NO | ✅ YES | **MEDIUM** |
| Rollback capability | ❌ NO | ✅ YES | **MEDIUM** |
| Audit trail | ⚠️ PARTIAL | ✅ YES | **MEDIUM** |
| Content preview | ❌ NO | ✅ YES | **MEDIUM** |
| Diff viewer | ❌ NO | ✅ YES | **LOW** |

---

## RISK ASSESSMENT

### **If NOT Fixed:**
- 🔴 **HIGH RISK**: Users get stale/incorrect data from RAG
- 🔴 **HIGH RISK**: Deleted files still searchable for hours
- 🔴 **HIGH RISK**: No audit trail for regulatory changes
- 🟡 **MEDIUM RISK**: Cannot efficiently update regulatory docs
- 🟡 **MEDIUM RISK**: Duplicate files cause confusion

### **If Fixed:**
- ✅ Real-time data freshness
- ✅ Complete audit trail for compliance
- ✅ Efficient updates without re-ingestion
- ✅ Category-based SLAs (regulatory = immediate)
- ✅ Troubleshooting capability (track ingestion failures)

---

## NEXT STEPS

1. **Review this audit** with team
2. **Prioritize fixes** based on your release schedule
3. **Implement CRITICAL items first** (next sprint)
4. **Add tests** for each scenario
5. **Update documentation** with new endpoints

---

**End of Audit**
