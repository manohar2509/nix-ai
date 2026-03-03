# KB INGESTION PIPELINE — QUICK REFERENCE & GAPS

**Last Updated**: March 2, 2026  
**Review This First**

---

## ⚠️ CRITICAL GAPS (Data Integrity Issues)

### 1. **NO FILE UPDATE CAPABILITY**
- Can upload ❌ cannot edit existing files
- Must delete + re-upload (loses history)
- **FIX**: Add `PUT /kb/documents/{id}` endpoint

### 2. **FILE DELETION NOT SYNCED TO BEDROCK**
- Delete from DynamoDB ✅
- Delete from S3 ✅
- BUT Bedrock still has it ❌
- Users get deleted files in RAG for hours
- **FIX**: Create SYNC_KB_DELETE job on deletion

### 3. **NO BEDROCK INGESTION JOB TRACKING**
- Send ingestion to Bedrock ✅
- Never check if it succeeded ❌
- No way to know if sync failed
- Documents marked "uploaded" even if Bedrock failed
- **FIX**: Store ingestion_job_id, poll status

### 4. **NO CHANGE DETECTION**
- File updated in S3 externally = no alert
- DynamoDB metadata becomes stale
- Users get old data
- **FIX**: Track file hashes, detect changes

### 5. **METADATA FIELDS NOT EDITABLE**
- Can't change name without delete+re-upload
- Can't change description without delete+re-upload
- Can't change category without delete+re-upload
- **FIX**: Add `PUT /kb/documents/{id}` for metadata

---

## 🟡 HIGH-PRIORITY GAPS (Operational Issues)

### 6. **NO CATEGORY-BASED SYNC STRATEGY**
- All categories synced together
- No priority for regulatory files
- Can't sync specific category
- **FIX**: Pass `category` param to `/kb/sync`

### 7. **NO VERSION HISTORY**
- When file updated, old version lost
- Can't rollback to previous version
- No audit trail of changes
- **FIX**: Store `versions[]` in DynamoDB

### 8. **NO AUDIT TRAIL**
- No log of who changed what, when
- Can't track regulatory document updates
- Compliance requirement not met
- **FIX**: Create KB_CHANGE records on every update

### 9. **SANITY CHECK INCOMPLETE**
- Doesn't check if files actually exist in S3
- Doesn't check Bedrock ingestion status
- Doesn't detect stale data
- **FIX**: Add S3 verification, Bedrock status check

### 10. **NO SYNC DEDUPLICATION BY DOCUMENT**
- Entire KB synced every time
- Can't selectively re-sync changed files
- **FIX**: Track which documents need sync

---

## 📋 CURRENT CAPABILITIES (WORKING)

✅ Upload new KB file (presigned URL)  
✅ Register in DynamoDB metadata  
✅ List KB documents  
✅ Delete KB document (from DynamoDB + S3)  
✅ Trigger Bedrock re-index  
✅ Unsync/resync status toggle  
✅ Bulk delete  
✅ Duplicate check  
✅ Basic sanity check  
✅ Statistics (doc count, categories)  

---

## 🔴 CURRENTLY BROKEN/MISSING

❌ Update KB file content  
❌ Update KB metadata (name, desc, category)  
❌ Verify Bedrock sync succeeded  
❌ Track ingestion job status  
❌ Delete from Bedrock when doc deleted  
❌ Version tracking  
❌ Audit trail  
❌ Detect file changes  
❌ Category-aware sync  
❌ File hash verification  

---

## 📁 KEY FILES TO MODIFY

| File | Changes | Priority |
|------|---------|----------|
| [kb_service.py](backend/app/services/kb_service.py) | Add update/reupload funcs, enhance sync | **P0** |
| [kb_sync.py](backend/worker/tasks/kb_sync.py) | Track ingestion jobs, handle deletion | **P0** |
| [dynamo_service.py](backend/app/services/dynamo_service.py) | Add KB_INGESTION table, KB_CHANGE records | **P0** |
| [kb.py](backend/app/api/routes/kb.py) | Add PUT, DELETE_SYNC endpoints | **P0** |
| [kb.py](backend/app/api/schemas/kb.py) | Add UpdateKBDocumentRequest | **P1** |
| [KnowledgeBaseView.jsx](frontend/src/components/KnowledgeBaseView.jsx) | Add edit/reupload/history UI | **P1** |

---

## 🎯 END-TO-END FLOW (DESIRED)

```
1. Admin uploads ICH_E6.pdf
   ├─ Presigned URL → S3
   ├─ Register in DynamoDB
   └─ Ready for sync

2. Admin triggers /kb/sync
   ├─ Calls Bedrock.start_ingestion_job()
   ├─ Stores ingestion_job_id in DynamoDB
   └─ Worker polls job status

3. Bedrock indexes file
   ├─ ~500 chunks created
   ├─ Vectors stored
   └─ Available for RAG

4. User queries RAG
   ├─ Vector search in Bedrock
   ├─ Gets answer + citation
   └─ Links to source KB doc

[LATER] File needs update
5. Admin edits ICH_E6.pdf locally

6. Admin calls PUT /kb/documents/{id}/reupload
   ├─ Upload new version to S3
   ├─ Update size, version number
   ├─ Mark "bedrock_sync_pending"
   └─ Trigger sync automatically

7. Bedrock re-indexes
   ├─ Replaces old chunks
   ├─ Updates vectors
   └─ Marks as "synced"

8. User queries RAG
   ├─ Gets answer from NEW version
   └─ All previous queries now use updated data

[LATER] File needs deletion
9. Admin calls DELETE /kb/documents/{id}
   ├─ Delete from S3
   ├─ Mark DynamoDB as "deleted"
   ├─ Create SYNC_KB_DELETE job
   └─ Trigger Bedrock re-sync

10. Bedrock removes from vector store
    ├─ File no longer in S3
    ├─ Old vectors pruned
    └─ No longer in RAG results

11. DynamoDB record hard-deleted
    ├─ Keep audit trail
    └─ Clean up orphaned metadata
```

---

## 🛠️ QUICK IMPLEMENTATION PRIORITIES

### **Week 1: CRITICAL (Blocking)**
- [ ] Implement Bedrock ingestion tracking
- [ ] Add file deletion sync
- [ ] Enhance sanity check

### **Week 2: CRITICAL (Blocking)**
- [ ] Add metadata update endpoint
- [ ] Add file re-upload endpoint
- [ ] Update schemas & routes

### **Week 3: HIGH (Operational)**
- [ ] Implement versioning
- [ ] Add change history
- [ ] Category-based sync

### **Week 4+: MEDIUM (Nice-to-have)**
- [ ] Frontend improvements
- [ ] Change diff viewer
- [ ] Rollback UI

---

## ⚡ SCHEMA CHANGES NEEDED

### **KB_DOCUMENT (Add Fields)**
```javascript
{
  // Existing
  id, name, s3_key, size, category, status,
  created_at, updated_at,
  
  // NEW
  current_version: number,
  versions: [
    {
      version_number,
      s3_key,
      size,
      file_hash,
      created_at,
      created_by,
      change_description,
      bedrock_ingestion_job_id,
      bedrock_status
    }
  ],
  bedrock_sync_pending: boolean,
  deleted_at: string (for soft deletes),
}
```

### **NEW: KB_INGESTION Table**
```javascript
{
  PK: "KB#INGESTION",
  SK: "INGESTION#{bedrock_job_id}",
  
  kb_doc_id,
  bedrock_ingestion_job_id,
  bedrock_data_source_id,
  sync_job_id,
  status: "QUEUED|IN_PROGRESS|SUCCESS|FAILED",
  started_at,
  completed_at,
  error_message,
}
```

### **NEW: KB_CHANGE Table**
```javascript
{
  PK: "KBDOC#{kb_doc_id}",
  SK: "CHANGE#{timestamp}#{change_id}",
  
  change_type: "CREATED|UPDATED|DELETED|REUPLOADED",
  changed_by: user_id,
  changed_at,
  old_value,
  new_value,
  reason,
}
```

---

## 📊 COVERAGE TABLE

| Category | Coverage | Status |
|----------|----------|--------|
| **Regulatory** (FDA, EMA, ICH) | Complete JSON source data | ✅ Good |
| **Guideline** (Clinical) | Complete JSON source data | ✅ Good |
| **Template** | Complete JSON source data | ✅ Good |
| **Reference** | Complete JSON source data | ✅ Good |
| **Build to Markdown** | Fully implemented | ✅ Good |
| **Upload to S3** | Working | ✅ Good |
| **DynamoDB Registration** | Working | ✅ Good |
| **Bedrock Sync Trigger** | Working | ✅ Good |
| **File Updates** | **MISSING** | ❌ **CRITICAL** |
| **Deletion Sync** | **MISSING** | ❌ **CRITICAL** |
| **Ingestion Tracking** | **MISSING** | ❌ **CRITICAL** |
| **Version History** | **MISSING** | ❌ **HIGH** |
| **Audit Trail** | **MISSING** | ❌ **HIGH** |
| **Metadata Editing** | **MISSING** | ❌ **HIGH** |
| **Category-Based Sync** | **MISSING** | ❌ **MEDIUM** |

---

## 🚨 RISK IF NOT FIXED

| Risk | Impact | Likelihood |
|------|--------|-----------|
| Users get deleted files in RAG | Data integrity | **HIGH** |
| Stale regulatory data served | Compliance | **HIGH** |
| No way to track changes | Audit failure | **HIGH** |
| Updates require full re-ingestion | Operational burden | **HIGH** |
| Bedrock sync failures silent | Data freshness | **MEDIUM** |
| Orphaned files accumulate | Storage waste | **MEDIUM** |

---

## ✅ SUCCESS METRICS

Once fixed, you'll have:
- ✅ Real-time file update capability
- ✅ Data freshness guarantee (< 5 min)
- ✅ Complete deletion handling
- ✅ Full audit trail for compliance
- ✅ Version history and rollback
- ✅ Stale data detection
- ✅ Zero "zombie documents" in RAG
- ✅ Category-aware sync SLAs

---

## 📞 QUESTIONS TO ANSWER

1. **Which documents are modified most frequently?**  
   → Should guide versioning/sync strategy

2. **What's your SLA for regulatory updates?**  
   → Should guide category-based priorities

3. **Do you need rollback capability?**  
   → Affects versioning storage decisions

4. **Is audit trail required for compliance?**  
   → Needed for regulatory documents

5. **How often do you re-sync Bedrock?**  
   → Manual, scheduled, or automated?

---

**See KB_INGESTION_PIPELINE_AUDIT.md for full analysis**  
**See KB_IMPLEMENTATION_PLAN.md for detailed implementation steps**
