"""
Test Configuration — Shared fixtures for all tests.

Uses moto to mock AWS services and creates an in-memory test environment.
"""

import os
import json
import pytest
from unittest.mock import patch

# Set test environment BEFORE any app imports
os.environ.update({
    "ENV": "development",
    "DEBUG": "true",
    "AWS_REGION": "us-east-1",
    "AWS_DEFAULT_REGION": "us-east-1",
    "AWS_ACCESS_KEY_ID": "testing",
    "AWS_SECRET_ACCESS_KEY": "testing",
    "AWS_SECURITY_TOKEN": "testing",
    "AWS_SESSION_TOKEN": "testing",
    "BUCKET_NAME": "test-bucket",
    "SQS_URL": "",
    "DYNAMODB_TABLE": "test-table",
    "COGNITO_USER_POOL_ID": "us-east-1_test",
    "COGNITO_APP_CLIENT_ID": "test-client-id",
    "BEDROCK_KB_ID": "",
    "CORS_ORIGINS": "http://localhost:5173",
})


@pytest.fixture
def mock_dynamodb():
    """Create a mocked DynamoDB table."""
    try:
        from moto import mock_aws
        import boto3

        with mock_aws():
            dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
            table = dynamodb.create_table(
                TableName="test-table",
                KeySchema=[
                    {"AttributeName": "PK", "KeyType": "HASH"},
                    {"AttributeName": "SK", "KeyType": "RANGE"},
                ],
                AttributeDefinitions=[
                    {"AttributeName": "PK", "AttributeType": "S"},
                    {"AttributeName": "SK", "AttributeType": "S"},
                    {"AttributeName": "GSI1PK", "AttributeType": "S"},
                    {"AttributeName": "GSI1SK", "AttributeType": "S"},
                ],
                GlobalSecondaryIndexes=[
                    {
                        "IndexName": "GSI1",
                        "KeySchema": [
                            {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                            {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                    }
                ],
                BillingMode="PAY_PER_REQUEST",
            )
            table.meta.client.get_waiter("table_exists").wait(TableName="test-table")
            yield table
    except ImportError:
        pytest.skip("moto not installed — run: pip install moto[dynamodb]")


@pytest.fixture
def mock_s3():
    """Create a mocked S3 bucket."""
    try:
        from moto import mock_aws
        import boto3

        with mock_aws():
            s3 = boto3.client("s3", region_name="us-east-1")
            s3.create_bucket(Bucket="test-bucket")
            yield s3
    except ImportError:
        pytest.skip("moto not installed — run: pip install moto[s3]")


@pytest.fixture
def test_client():
    """Create a FastAPI test client."""
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


@pytest.fixture
def mock_user():
    """A test user for authenticated requests."""
    from app.core.auth import CurrentUser
    return CurrentUser(
        user_id="test-user-001",
        email="test@nixai.com",
        name="Test User",
        organization="Test Org",
        job_title="Tester",
        groups=["Admin", "Clinical"],
    )
