"""
Migration script to populate customer_name field for existing orders.

This denormalizes customer names into orders to preserve them even if
the customer is deleted.

Run with: python -m migrations.populate_customer_names
"""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import Column, String, text
from sqlalchemy.exc import OperationalError
from app.database import SessionLocal, engine


def run_migration():
    """Populate customer_name for all existing orders."""
    db = SessionLocal()
    
    try:
        # First, check if the column exists by trying to add it
        try:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE orders ADD COLUMN customer_name VARCHAR"))
                conn.commit()
                print("Added customer_name column to orders table")
        except OperationalError as e:
            if "duplicate column name" in str(e).lower() or "already exists" in str(e).lower():
                print("Column customer_name already exists, skipping ALTER TABLE")
            else:
                raise
        
        # Get all orders with their customer data
        result = db.execute(text("""
            SELECT o.id, u.contact_name
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            WHERE o.customer_name IS NULL
        """))
        
        orders_to_update = result.fetchall()
        print(f"Found {len(orders_to_update)} orders to update")
        
        updated_count = 0
        for order_id, contact_name in orders_to_update:
            if contact_name:
                db.execute(
                    text("UPDATE orders SET customer_name = :name WHERE id = :order_id"),
                    {"name": contact_name, "order_id": order_id}
                )
                updated_count += 1
                print(f"  Order #{order_id}: set customer_name = '{contact_name}'")
            else:
                print(f"  Order #{order_id}: customer not found, skipping")
        
        db.commit()
        print(f"\nMigration complete. Updated {updated_count} orders.")
        
    except Exception as e:
        db.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 60)
    print("Starting customer_name migration for orders")
    print("=" * 60)
    run_migration()
