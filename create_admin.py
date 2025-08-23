import argparse
from app.database import SessionLocal, engine
from app import models, schemas
from app.crud import create_user

def main():
    print("Creating database tables...")
    models.Base.metadata.create_all(bind=engine)
    parser = argparse.ArgumentParser(description="Create a new admin user.")
    parser.add_argument("username", type=str, help="The username for the admin.")
    parser.add_argument("password", type=str, help="The password for the admin.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        print(f"Creating user '{args.username}'...")
        user_in = schemas.UserCreate(
            username=args.username,
            password=args.password,
            role="admin",
            contact_name="Administrator" # Provide a default contact name
        )
        user = create_user(db, user=user_in)
        print(f"User '{user.username}' created successfully.")
    finally:
        db.close()

if __name__ == "__main__":
    main()