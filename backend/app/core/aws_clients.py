"""
NIX AI — Shared AWS Service Clients

Creates boto3 clients once and reuses them across Lambda invocations
(connection reuse is critical for Lambda performance).

All clients use `settings.boto3_credentials` which:
  • In Lambda → returns only region (IAM role provides creds automatically).
  • Locally  → returns region + access key + secret from .env.
"""

from __future__ import annotations

import boto3
from functools import lru_cache

from app.core.config import get_settings


@lru_cache(maxsize=1)
def get_s3_client():
    return boto3.client("s3", **get_settings().boto3_credentials)


@lru_cache(maxsize=1)
def get_sqs_client():
    return boto3.client("sqs", **get_settings().boto3_credentials)


@lru_cache(maxsize=1)
def get_dynamodb_resource():
    return boto3.resource("dynamodb", **get_settings().boto3_credentials)


@lru_cache(maxsize=1)
def get_dynamodb_table():
    resource = get_dynamodb_resource()
    return resource.Table(get_settings().DYNAMODB_TABLE)


@lru_cache(maxsize=1)
def get_bedrock_runtime_client():
    """For Converse / ConverseStream / InvokeModel APIs."""
    return boto3.client("bedrock-runtime", **get_settings().boto3_credentials)


@lru_cache(maxsize=1)
def get_bedrock_agent_client():
    """For Knowledge Base Retrieve & Generate."""
    return boto3.client("bedrock-agent-runtime", **get_settings().boto3_credentials)


@lru_cache(maxsize=1)
def get_bedrock_agent_admin_client():
    """For Knowledge Base management (start ingestion, list data sources)."""
    return boto3.client("bedrock-agent", **get_settings().boto3_credentials)
