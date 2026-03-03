"""
Top-level API Router — aggregates all sub-routers.
"""

from fastapi import APIRouter

from app.api.routes import analysis, analytics, chat, documents, health, jobs, kb, regulatory

api_router = APIRouter()

# Health check at root
api_router.include_router(health.router)

# Feature routes
api_router.include_router(chat.router)
api_router.include_router(documents.router)
api_router.include_router(analysis.router)
api_router.include_router(jobs.router)

# Analytics: Dashboard + Past Analysis
api_router.include_router(analytics.router)

# Admin: Knowledge Base management (separate from user documents)
api_router.include_router(kb.router)

# Regulatory Intelligence: All REQ-1 through REQ-10 endpoints
api_router.include_router(regulatory.router)
