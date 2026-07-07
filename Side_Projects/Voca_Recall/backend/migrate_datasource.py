from app import create_app, db
from sqlalchemy import text
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = create_app()

def migrate():
    with app.app_context():
        logger.info("Starting migration to add data_source_id...")
        with db.engine.connect() as conn:
            try:
                logger.info("Attempting to add data_source_id column to notion_databases...")
                conn.execute(text("ALTER TABLE notion_databases ADD COLUMN data_source_id VARCHAR(255)"))
                logger.info("Added column data_source_id")
            except Exception as e:
                logger.warning(f"Could not add data_source_id (might already exist): {e}")

            # Make database_id nullable if using MySQL, for SQLite this is a bit more complex,
            # but existing fields don't strictly need their NOT NULL removed if we provide default values or if they aren't enforced by the ORM during inserts of new records (which they usually are).
            # We will just handle it in the application layer by inserting empty strings if needed.

            conn.commit()
            logger.info("Migration completed.")

if __name__ == "__main__":
    migrate()
