"""
Migration script to populate flower_name in existing order_items.

This script fills in the flower_name field for existing order items by:
1. Looking up the flower name from flower_batches table if the flower still exists
2. Setting a placeholder "Удалённый товар" if the flower has been deleted

Run this script once after adding the flower_name column to the database.

Usage:
    python -m migrations.populate_flower_names
"""

import sys
import os

# Add the parent directory to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import SessionLocal, engine


def run_migration():
    """Populate flower_name for all existing order_items."""
    db = SessionLocal()
    
    try:
        # First, add the column if it doesn't exist (SQLite doesn't support IF NOT EXISTS for columns)
        # This is safe to run multiple times on SQLite
        try:
            db.execute(text("ALTER TABLE order_items ADD COLUMN flower_name VARCHAR"))
            db.commit()
            print("Added flower_name column to order_items table")
        except Exception as e:
            db.rollback()
            # Column likely already exists
            print(f"Column flower_name may already exist: {e}")
        
        # Update order_items where flower still exists in flower_batches
        result = db.execute(text("""
            UPDATE order_items 
            SET flower_name = (
                SELECT name FROM flower_batches 
                WHERE flower_batches.id = order_items.flower_batch_id
            )
            WHERE flower_name IS NULL 
            AND flower_batch_id IN (SELECT id FROM flower_batches)
        """))
        db.commit()
        print(f"Updated {result.rowcount} order items with existing flower names")
        
        # Update order_items where flower has been deleted
        result = db.execute(text("""
            UPDATE order_items 
            SET flower_name = 'Удалённый товар'
            WHERE flower_name IS NULL 
            AND flower_batch_id NOT IN (SELECT id FROM flower_batches)
        """))
        db.commit()
        print(f"Updated {result.rowcount} order items with deleted flower placeholder")
        
        # Count remaining nulls (should be 0)
        result = db.execute(text("SELECT COUNT(*) FROM order_items WHERE flower_name IS NULL"))
        remaining = result.scalar()
        
        if remaining > 0:
            print(f"Warning: {remaining} order items still have NULL flower_name")
        else:
            print("Migration completed successfully! All order items have flower_name populated.")
            
    except Exception as e:
        db.rollback()
        print(f"Error during migration: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("Starting migration: populate_flower_names")
    print("-" * 50)
    run_migration()
    print("-" * 50)
    print("Migration finished")
