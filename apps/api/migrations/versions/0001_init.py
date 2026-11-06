"""Initial secure tenant-scoped lesson metadata, files, resumable uploads and courses.

Revision ID: 0001
Revises:
"""
from alembic import op
from edushare_api.db import Base
revision='0001'
down_revision=None
branch_labels=None
depends_on=None

def upgrade():
    # Metadata is the authoritative declaration for the initial baseline.
    # Subsequent schema changes require explicit new Alembic revisions.
    Base.metadata.create_all(bind=op.get_bind())

def downgrade():
    raise RuntimeError('Destructive downgrade disabled: restore from backup instead.')
